import Booking from '../models/booking.model.js';
import ServicePricing from '../models/servicePricing.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  BOOKING_STATUS,
  DISPATCH,
  SCHEDULED_BOOKING,
} from '../constants/bookingStatus.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToBooking,
  emitToAdmins,
} from '../utils/socketEmitters.js';
import { dispatchNextDriverService } from './bookingDispatch.service.js';
import {
  notifyUserBookingReminder,
  notifyDriverBookingReminder,
} from '../utils/notificationDispatch.js';
import {
  enqueueScheduledBookingJobs,
  enqueueAssignmentRetry,
  enqueueReminderJobsForBooking,
  removeScheduledBookingJobs,
} from '../queues/scheduledBooking.queue.js';

/**
 * Scheduled-booking lifecycle service.
 *
 *   ┌─ createBookingService (booking.service.js) ──┐
 *   │  instant   → dispatch immediately            │
 *   │  scheduled → decideScheduleTier              │
 *   │              ├─ morning       → search now   │
 *   │              ├─ short_window  → search now   │
 *   │              ├─ morning_lead  → PENDING_ASSIGNMENT
 *   │              └─ long_lead     → PENDING_ASSIGNMENT
 *   │                                + enqueue assign + escalate jobs.
 *   │                                Reminder jobs are NOT enqueued at
 *   │                                this point — they're queued only
 *   │                                AFTER a driver is assigned.       │
 *   └──────────────────────────────────────────────┘
 *
 *   ┌─ Worker (queues/scheduledBooking.worker.js) ─┐
 *   │  assign    → kickoffScheduledAssignment      │
 *   │  retry     → runScheduledRetry               │
 *   │  reminder  → sendScheduledReminder           │
 *   │  escalate  → escalateToEmergencyPool         │
 *   └──────────────────────────────────────────────┘
 *
 * When the wave dispatcher comes back empty (no candidates / every
 * driver let the offer time out), `bookingDispatch.service.js →
 * failBookingNoDrivers` calls `scheduleAssignmentRetryOrEscalate`
 * here. That helper either re-queues another retry RETRY_DELAY_MINUTES
 * later (if there's still runway before `escalateAt`) or hands the
 * booking straight to the emergency pool.
 *
 * All public helpers are best-effort: they log and resolve on failure so
 * a stuck queue never crashes the booking pipeline.
 */

/**
 * Merge the admin-tunable `ServicePricing.scheduledDispatch` overrides
 * onto the hard-coded defaults. Returns the same shape regardless of
 * whether pricing exists for the service yet.
 */
export async function loadScheduledDispatchConfig(serviceType) {
  if (!serviceType) return { ...SCHEDULED_BOOKING };
  try {
    const pricing = await ServicePricing.findOne({ serviceType })
      .select('scheduledDispatch')
      .lean();
    return { ...SCHEDULED_BOOKING, ...(pricing?.scheduledDispatch || {}) };
  } catch (err) {
    console.warn(
      '[bookingScheduled] failed to load pricing for',
      serviceType,
      err?.message,
    );
    return { ...SCHEDULED_BOOKING };
  }
}

/**
 * Pure decision: should this scheduled ride search for a driver
 * immediately, or sit in PENDING_ASSIGNMENT until the assign-job fires?
 *
 *   morning           → start hour ∈ [MORNING_START_HOUR, MORNING_END_HOUR)
 *                       AND pickup is TODAY/TOMORROW (calendar-day
 *                       diff ≤ 1)
 *                       → search immediately so drivers can plan their day.
 *   morning_lead      → morning ride scheduled for the day-after-tomorrow
 *                       or later → defer to LEAD_SCHEDULE_HOUR (default
 *                       6 PM) the EVENING BEFORE pickup so drivers see
 *                       morning gigs the night before.
 *   short_window      → hoursUntilStart ≤ SHORT_WINDOW_HOURS
 *                       → search immediately.
 *   long_lead         → otherwise; defer to (start − LONG_LEAD_HOURS).
 *
 * Returns `{ tier, immediate, assignAt, escalateAt }`.
 *
 * `assignAt` is `null` when `immediate` is true (the dispatcher runs at
 * booking-creation time). `escalateAt` is always populated so the
 * emergency-pool safety net runs even when the initial search fails.
 */
export function decideScheduleTier(scheduledStartAt, now, config) {
  const start = new Date(scheduledStartAt);
  const startMs = start.getTime();
  const nowDate = now instanceof Date ? now : new Date(Number(now) || Date.now());
  const nowMs = nowDate.getTime();
  const hoursUntilStart = (startMs - nowMs) / 3_600_000;
  const startHour = start.getHours();

  const cfg = { ...SCHEDULED_BOOKING, ...(config || {}) };
  const escalateAt = new Date(startMs - cfg.EMERGENCY_POOL_MINUTES * 60_000);

  // Whole-day diff between today and pickup day (local midnight buckets).
  // Same day = 0, tomorrow = 1, day-after-tomorrow = 2 …
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const nowMidnight = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const daysAhead = Math.round((startMidnight - nowMidnight) / 86_400_000);

  const isMorning =
    startHour >= cfg.MORNING_START_HOUR && startHour < cfg.MORNING_END_HOUR;

  if (isMorning) {
    // Morning ride for today or tomorrow → search now.
    if (daysAhead <= 1) {
      return { tier: 'morning', immediate: true, assignAt: null, escalateAt };
    }
    // Morning ride further out → fire the assign job at LEAD_SCHEDULE_HOUR
    // (e.g. 6 PM) on the calendar day BEFORE pickup. Clamp into the
    // future so a booking made past the deadline still gets a job.
    const dayBefore = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() - 1,
      cfg.LEAD_SCHEDULE_HOUR,
      0,
      0,
      0,
    );
    let assignAt = dayBefore;
    if (assignAt.getTime() <= nowMs) {
      // The configured lead-hour has already passed today (e.g. user
      // booked at 11 PM for a 7 AM pickup tomorrow morning, but
      // somehow daysAhead > 1 ⇒ rare clock skew). Fall back to
      // LONG_LEAD_HOURS as a safety net.
      assignAt = new Date(startMs - cfg.LONG_LEAD_HOURS * 3_600_000);
    }
    return { tier: 'morning_lead', immediate: false, assignAt, escalateAt };
  }

  if (hoursUntilStart <= cfg.SHORT_WINDOW_HOURS) {
    return { tier: 'short_window', immediate: true, assignAt: null, escalateAt };
  }
  const assignAt = new Date(startMs - cfg.LONG_LEAD_HOURS * 3_600_000);
  return { tier: 'long_lead', immediate: false, assignAt, escalateAt };
}

/**
 * Called from `createBookingService` once the booking row exists.
 *
 *   - Persists the decision (`scheduled.tier`, `assignAt`, `escalateAt`).
 *   - Enqueues the assign + escalate jobs (best-effort). Reminder jobs
 *     are NOT pushed here — they're queued only after a driver has been
 *     assigned (via `enqueueReminderJobsForBooking`).
 *   - If we're inside the "search now" tier, the caller still kicks off
 *     dispatch directly — this helper does NOT call the dispatcher.
 *     That keeps the create flow consistent across instant + scheduled.
 *
 * Returns the merged `decision` object so the caller can react.
 */
export async function setupScheduledBooking(booking) {
  if (!booking?.hourly?.scheduledStartAt) {
    throw new ApiError(400, 'Scheduled booking requires hourly.scheduledStartAt');
  }
  const config = await loadScheduledDispatchConfig(booking.serviceType);
  const decision = decideScheduleTier(
    booking.hourly.scheduledStartAt,
    new Date(),
    config,
  );

  booking.scheduled = {
    ...(booking.scheduled?.toObject?.() || booking.scheduled || {}),
    tier: decision.tier,
    assignAt: decision.assignAt,
    escalateAt: decision.escalateAt,
  };
  if (!decision.immediate) {
    booking.status = BOOKING_STATUS.PENDING_ASSIGNMENT;
  }
  await booking.save();

  // Fire-and-forget — queue may be a no-op when Redis isn't configured.
  enqueueScheduledBookingJobs(booking).catch((err) => {
    console.warn(
      '[bookingScheduled] enqueue failed for',
      String(booking._id),
      err?.message,
    );
  });

  return decision;
}

/**
 * Worker handler for the `assign` job. Flips PENDING_ASSIGNMENT →
 * SEARCHING and hands the booking to the standard wave dispatcher.
 *
 * Idempotent — re-running for a booking that has already moved past
 * PENDING_ASSIGNMENT is a no-op (so duplicate job firings are safe).
 */
export async function kickoffScheduledAssignment(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status !== BOOKING_STATUS.PENDING_ASSIGNMENT) {
    return { ok: false, reason: 'not_pending_assignment', status: booking.status };
  }

  booking.status = BOOKING_STATUS.SEARCHING;
  booking.scheduled = {
    ...(booking.scheduled?.toObject?.() || booking.scheduled || {}),
    assignmentStartedAt: new Date(),
  };
  await booking.save();

  const updatePayload = {
    bookingId: String(booking._id),
    status: booking.status,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, updatePayload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, updatePayload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, updatePayload);

  try {
    await dispatchNextDriverService(booking._id);
  } catch (err) {
    console.warn(
      '[bookingScheduled] initial dispatch failed for',
      String(booking._id),
      err?.message,
    );
  }
  return { ok: true };
}

/**
 * Worker handler for the `reminder-{m}` jobs. Pushes an in-app toast to
 * the user (and, once a driver is on the booking, to the driver too).
 *
 * Reminders are skipped silently for bookings that have already
 * terminated (cancelled / completed / no-drivers-found).
 */
export async function sendScheduledReminder(bookingId, minutesAhead) {
  const booking = await Booking.findById(bookingId).select(
    'status userId driverId hourly bookingNumber',
  );
  if (!booking) return { ok: false, reason: 'not_found' };
  if (
    [
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.COMPLETED,
      BOOKING_STATUS.NO_DRIVERS_FOUND,
    ].includes(booking.status)
  ) {
    return { ok: false, reason: 'terminal_status' };
  }

  const minutes = Number(minutesAhead) || 0;
  await notifyUserBookingReminder(booking.userId, booking, minutes);
  if (booking.driverId) {
    await notifyDriverBookingReminder(booking.driverId, booking, minutes);
  }
  return { ok: true };
}

/**
 * Worker handler for `retry` jobs. Wakes a PENDING_ASSIGNMENT booking
 * back into SEARCHING and re-runs the wave dispatcher. The dispatcher
 * either:
 *
 *   - finds a driver  → `acceptBookingService` later flips status and
 *                       (separately) queues reminders.
 *   - comes back empty → `failBookingNoDrivers` re-enters this loop by
 *                       calling `scheduleAssignmentRetryOrEscalate`.
 *
 * Idempotent — re-runs for an already-assigned / cancelled booking are
 * silently dropped.
 */
export async function runScheduledRetry(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status !== BOOKING_STATUS.PENDING_ASSIGNMENT) {
    return { ok: false, reason: 'not_pending_assignment', status: booking.status };
  }

  booking.status = BOOKING_STATUS.SEARCHING;
  booking.scheduled = {
    ...(booking.scheduled?.toObject?.() || booking.scheduled || {}),
    lastRetryAt: new Date(),
  };
  // Reset the wave dispatcher's per-attempt cursor so the next round
  // starts from a fresh small radius instead of continuing from where
  // the previous round gave up.
  booking.dispatch = booking.dispatch || {};
  booking.dispatch.attemptsCount = 0;
  booking.dispatch.currentRadiusMeters = DISPATCH.SEARCH_RADIUS_START_METERS;
  booking.dispatch.pendingOfferIds = [];
  booking.dispatch.currentExpiresAt = null;
  await booking.save();

  const updatePayload = {
    bookingId: String(booking._id),
    status: booking.status,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, updatePayload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, updatePayload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, updatePayload);

  try {
    await dispatchNextDriverService(booking._id);
  } catch (err) {
    console.warn(
      '[bookingScheduled] retry dispatch failed for',
      String(booking._id),
      err?.message,
    );
  }
  return { ok: true, retryAttempts: booking.scheduled?.retryAttempts || 0 };
}

/**
 * Called from `bookingDispatch.service.js → failBookingNoDrivers` when
 * a scheduled-booking wave dispatcher comes back empty. We either:
 *
 *   1. Park the booking back in PENDING_ASSIGNMENT and queue another
 *      `retry` job RETRY_DELAY_MINUTES later (the common case).
 *   2. Hand it straight to the emergency pool if we'd otherwise retry
 *      past the `escalateAt` cutoff (i.e. ≤ EMERGENCY_POOL_MINUTES
 *      before pickup) — no point pinging drivers when ops will pick
 *      one manually any minute.
 *
 * Returns `{ retried: bool, escalated: bool }` so the caller can craft
 * the right socket alert.
 */
export async function scheduleAssignmentRetryOrEscalate(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { retried: false, escalated: false, reason: 'not_found' };

  const config = await loadScheduledDispatchConfig(booking.serviceType);
  const retryDelayMs =
    Math.max(1, Number(config.RETRY_DELAY_MINUTES) || SCHEDULED_BOOKING.RETRY_DELAY_MINUTES) *
    60_000;
  const start = booking?.hourly?.scheduledStartAt
    ? new Date(booking.hourly.scheduledStartAt).getTime()
    : 0;
  const escalateCutoff = start
    ? start - (Number(config.EMERGENCY_POOL_MINUTES) || SCHEDULED_BOOKING.EMERGENCY_POOL_MINUTES) *
      60_000
    : 0;
  const nextRunAt = Date.now() + retryDelayMs;

  // No runway left → escalate to the emergency pool right away rather
  // than queue a retry the escalate job would invalidate seconds later.
  if (!start || nextRunAt >= escalateCutoff) {
    const { escalateToEmergencyPool } = await import(
      './bookingEmergencyPool.service.js'
    );
    await escalateToEmergencyPool(booking._id);
    return { retried: false, escalated: true };
  }

  const nextAttempt = (booking.scheduled?.retryAttempts || 0) + 1;
  booking.status = BOOKING_STATUS.PENDING_ASSIGNMENT;
  booking.scheduled = {
    ...(booking.scheduled?.toObject?.() || booking.scheduled || {}),
    retryAttempts: nextAttempt,
  };
  // Clear any leftover in-flight wave so the booking detail page
  // doesn't keep showing "offer pending" while we sit between retries.
  booking.dispatch = booking.dispatch || {};
  booking.dispatch.pendingOfferIds = [];
  booking.dispatch.currentExpiresAt = null;
  await booking.save();

  const queued = await enqueueAssignmentRetry(booking._id, {
    delayMs: retryDelayMs,
    attemptNumber: nextAttempt,
    scheduledStartAt: booking.hourly?.scheduledStartAt || null,
  });

  if (!queued) {
    // Queue is down (likely Redis unavailable). Fall back to escalating
    // so a human can take over instead of leaving the booking stuck.
    const { escalateToEmergencyPool } = await import(
      './bookingEmergencyPool.service.js'
    );
    await escalateToEmergencyPool(booking._id);
    return { retried: false, escalated: true, reason: 'retry_enqueue_failed' };
  }

  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    scheduled: {
      retryAttempts: nextAttempt,
      nextRetryAt: new Date(nextRunAt).toISOString(),
    },
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);

  return { retried: true, escalated: false, attempt: nextAttempt };
}

/**
 * Called from any code path that successfully pairs a driver with a
 * scheduled booking (`acceptBookingService` /
 * `adminAssignDriverToEmergencyPoolService`). Idempotent — a booking
 * whose reminders have already been queued is left alone.
 */
export async function enqueueRemindersAfterAssignment(booking) {
  if (!booking?._id) return false;
  if (booking?.bookingType && booking.bookingType !== 'scheduled') return false;
  if (booking?.scheduled?.remindersEnqueuedAt) return false;

  const queued = await enqueueReminderJobsForBooking(booking);
  // Mark the booking even when `queued === false` (e.g. all offsets are
  // already past-due) so we don't keep retrying enqueue on every save.
  try {
    await Booking.updateOne(
      { _id: booking._id },
      { $set: { 'scheduled.remindersEnqueuedAt': new Date() } },
    );
  } catch (err) {
    console.warn(
      '[bookingScheduled] failed to stamp remindersEnqueuedAt for',
      String(booking._id),
      err?.message,
    );
  }
  return queued;
}

/**
 * Cancel every queued job for a booking. Re-exported here so callers
 * outside the queue module don't need to know about BullMQ.
 */
export async function cancelScheduledBookingJobs(bookingId) {
  if (!bookingId) return false;
  return removeScheduledBookingJobs(bookingId);
}
