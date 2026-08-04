import mongoose from 'mongoose';
import Booking from '../models/booking.model.js';
import ServicePricing from '../models/servicePricing.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  BOOKING_TYPE,
  DISPATCH_RESPONSE,
  SCHEDULED_BOOKING,
} from '../constants/bookingStatus.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToBooking,
  emitToAdmins,
  emitToDriver,
} from '../utils/socketEmitters.js';
import { dispatchNextDriverService } from './bookingDispatch.service.js';
import {
  notifyUserBookingReminder,
  notifyDriverBookingReminder,
  notifyDriverOrderAssigned,
} from '../utils/notificationDispatch.js';
import {
  enqueueScheduledBookingJobs,
  enqueueReminderJobsForBooking,
  removeScheduledBookingJobs,
} from '../queues/scheduledBooking.queue.js';
import { hasOperationalStaffAccess } from '../constants/staffPermissions.js';
import {
  INBOX_BOOKING_TYPES,
  isInboxBookingType,
  resolveBookingSearchStartAt,
} from '../utils/bookingInbox.js';
import {
  outstationAssignAt,
  outstationEscalateAt,
} from '../utils/outstationDispatch.js';

export {
  INBOX_BOOKING_TYPES,
  isInboxBookingType,
  resolveBookingSearchStartAt,
};

/** Statuses where staff can still manually assign a scheduled ride. */
export const SCHEDULED_MANUAL_ASSIGN_STATUSES = Object.freeze([
  BOOKING_STATUS.SEARCHING,
  BOOKING_STATUS.PENDING_ASSIGNMENT,
  BOOKING_STATUS.IN_EMERGENCY_POOL,
  BOOKING_STATUS.NO_DRIVERS_FOUND,
]);

function zoneScopeForStaff(staff) {
  if (!staff) return [];
  if (hasOperationalStaffAccess(staff)) return null;
  const ids = (staff.assignedZones || [])
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return ids;
}

function assertStaffCanAccessBookingZones(staff, booking) {
  const scope = zoneScopeForStaff(staff);
  if (scope === null) return; // admin / sub_admin
  if (!scope.length) {
    throw new ApiError(403, 'No zones assigned — cannot assign drivers');
  }
  const bookingZones = (booking.zoneIds || []).map(String);
  const allowed = new Set(scope.map(String));
  const overlap = bookingZones.some((z) => allowed.has(z));
  if (!overlap) {
    throw new ApiError(403, 'This booking is outside your assigned zones');
  }
}

/**
 * Scheduled-booking lifecycle service.
 *
 *   ┌─ createBookingService (booking.service.js) ──┐
 *   │  instant   → wave dispatch immediately       │
 *   │  scheduled → decideScheduleTier              │
 *   │              ├─ morning       → inbox now    │
 *   │              ├─ short_window  → inbox now    │
 *   │              ├─ morning_lead  → PENDING_ASSIGNMENT
 *   │              └─ long_lead     → PENDING_ASSIGNMENT
 *   │                                + enqueue assign job.
 *   │                                Reminder jobs are NOT enqueued at
 *   │                                this point — they're queued only
 *   │                                AFTER a driver is assigned.       │
 *   └──────────────────────────────────────────────┘
 *
 *   ┌─ Worker (queues/scheduledBooking.worker.js) ─┐
 *   │  assign         → kickoffScheduledAssignment │
 *   │  reminder       → sendScheduledReminder      │
 *   │  escalate-batch → runEmergencyPoolBatchEscalate (every ~45m)
 *   │  escalate/retry → legacy no-ops / drain      │
 *   └──────────────────────────────────────────────┘
 *
 * Scheduled assignment is a single non-expiring inbox broadcast to all
 * matching drivers. Empty candidate sets stay SEARCHING until the batch
 * escalate cron moves them past `scheduled.escalateAt` into the
 * emergency pool (worst-case lag ≈ EMERGENCY_POOL_BATCH_INTERVAL_MINUTES).
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
 * Pure decision for scheduled rides — driven by admin
 * `ServicePricing.scheduledDispatch` (merged onto SCHEDULED_BOOKING).
 *
 *   morning        → search now (pickup today/tomorrow in morning window)
 *   morning_lead   → search at LEAD_SCHEDULE_HOUR the evening before pickup
 *   short_window   → search now (within SHORT_WINDOW_HOURS of pickup)
 *   long_lead      → search at scheduledStartAt − LONG_LEAD_HOURS
 *
 * If the computed assignAt is already past, search immediately.
 * `escalateAt` (= start − EMERGENCY_POOL_MINUTES) drives the emergency pool.
 *
 * Returns `{ tier, immediate, assignAt, escalateAt }`.
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

  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const nowMidnight = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const daysAhead = Math.round((startMidnight - nowMidnight) / 86_400_000);

  const isMorning =
    startHour >= cfg.MORNING_START_HOUR && startHour < cfg.MORNING_END_HOUR;

  let tier = 'long_lead';
  if (isMorning) {
    tier = daysAhead <= 1 ? 'morning' : 'morning_lead';
  } else if (hoursUntilStart <= cfg.SHORT_WINDOW_HOURS) {
    tier = 'short_window';
  }

  if (tier === 'morning' || tier === 'short_window') {
    return { tier, immediate: true, assignAt: null, escalateAt };
  }

  let assignAt;
  if (tier === 'morning_lead') {
    // Evening before pickup at LEAD_SCHEDULE_HOUR (default 18:00).
    assignAt = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() - 1,
      Number(cfg.LEAD_SCHEDULE_HOUR) || 18,
      0,
      0,
      0,
    );
  } else {
    assignAt = new Date(
      startMs - (Number(cfg.LONG_LEAD_HOURS) || 0) * 3_600_000,
    );
  }

  if (assignAt.getTime() <= nowMs) {
    return { tier, immediate: true, assignAt, escalateAt };
  }
  return { tier, immediate: false, assignAt, escalateAt };
}

/**
 * Outstation-only schedule decision — calendar days, no morning/short/
 * long hour tiers. Driven by:
 *   DRIVER_VISIBILITY_DAYS → assignAt (inbox opens)
 *   EMERGENCY_POOL_DAYS    → escalateAt (emergency pool)
 *
 * Returns `{ tier: 'outstation_days', immediate, assignAt, escalateAt }`.
 */
export function decideOutstationScheduleTiers(pickupAt, now, config) {
  const cfg = { ...SCHEDULED_BOOKING, ...(config || {}) };
  const visibilityDays =
    cfg.DRIVER_VISIBILITY_DAYS ?? SCHEDULED_BOOKING.DRIVER_VISIBILITY_DAYS;
  const emergencyDays =
    cfg.EMERGENCY_POOL_DAYS ?? SCHEDULED_BOOKING.EMERGENCY_POOL_DAYS;

  const assignAt = outstationAssignAt(pickupAt, visibilityDays);
  const escalateAt = outstationEscalateAt(pickupAt, emergencyDays);
  const nowDate = now instanceof Date ? now : new Date(Number(now) || Date.now());
  const nowMs = nowDate.getTime();

  if (!assignAt || !Number.isFinite(assignAt.getTime())) {
    return {
      tier: 'outstation_days',
      immediate: true,
      assignAt: null,
      escalateAt,
    };
  }

  if (assignAt.getTime() <= nowMs) {
    return {
      tier: 'outstation_days',
      immediate: true,
      assignAt,
      escalateAt,
    };
  }
  return {
    tier: 'outstation_days',
    immediate: false,
    assignAt,
    escalateAt,
  };
}

/**
 * Called from `createBookingService` once the booking row exists.
 *
 *   - Persists the decision (`scheduled.tier`, `assignAt`, `escalateAt`).
 *   - Enqueues the assign job (best-effort). Reminder jobs are NOT
 *     pushed here — they're queued only after a driver has been
 *     assigned (via `enqueueReminderJobsForBooking`).
 *   - Emergency-pool escalation is handled by the recurring batch cron,
 *     not a per-booking delayed job.
 *   - If we're inside the "search now" tier, the caller still kicks off
 *     dispatch directly — this helper does NOT call the dispatcher.
 */
export async function setupScheduledBooking(booking) {
  const startAt = resolveBookingSearchStartAt(booking);
  if (!startAt) {
    throw new ApiError(
      400,
      booking?.serviceType === 'outstation' || booking?.bookingType === BOOKING_TYPE.OUTSTATION
        ? 'Outstation booking requires outstation.pickupAt'
        : 'Scheduled booking requires hourly.scheduledStartAt',
    );
  }
  const config = await loadScheduledDispatchConfig(booking.serviceType);
  const isOutstation =
    booking?.serviceType === 'outstation'
    || booking?.bookingType === BOOKING_TYPE.OUTSTATION;
  const decision = isOutstation
    ? decideOutstationScheduleTiers(startAt, new Date(), config)
    : decideScheduleTier(startAt, new Date(), config);

  booking.scheduled = {
    ...(booking.scheduled?.toObject?.() || booking.scheduled || {}),
    tier: decision.tier,
    assignAt: decision.assignAt,
    escalateAt: decision.escalateAt,
    assignmentStartedAt: decision.immediate ? new Date() : null,
  };
  // Immediate tiers → SEARCHING (controller dispatches inbox now).
  // Deferred tiers → PENDING_ASSIGNMENT until the delayed `assign` job.
  booking.status = decision.immediate
    ? BOOKING_STATUS.SEARCHING
    : BOOKING_STATUS.PENDING_ASSIGNMENT;
  await booking.save();

  // Fire-and-forget — queue may be a no-op when Redis isn't configured.
  // Reminder jobs still wait until a driver accepts.
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
 * SEARCHING and broadcasts the open inbox to matching drivers.
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
 * Legacy retry job handler. Scheduled dispatch no longer retries empty
 * rounds — drain any leftover BullMQ retry jobs into a no-op (or a
 * one-shot inbox kickoff if still PENDING_ASSIGNMENT).
 */
export async function runScheduledRetry(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status === BOOKING_STATUS.PENDING_ASSIGNMENT) {
    return kickoffScheduledAssignment(bookingId);
  }
  if (booking.status === BOOKING_STATUS.SEARCHING && !booking.driverId) {
    try {
      await dispatchNextDriverService(booking._id);
    } catch (err) {
      console.warn(
        '[bookingScheduled] legacy retry drain failed for',
        String(booking._id),
        err?.message,
      );
    }
    return { ok: true, drained: true };
  }
  return { ok: false, reason: 'not_retryable', status: booking.status };
}

/**
 * @deprecated Scheduled empty rounds no longer enqueue retries. Kept so
 * any leftover callers resolve safely — parks the booking for the batch
 * escalate cron instead of spawning retry jobs.
 */
export async function scheduleAssignmentRetryOrEscalate(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { retried: false, escalated: false, reason: 'not_found' };

  booking.dispatch = booking.dispatch || {};
  booking.dispatch.pendingOfferIds = booking.dispatch.pendingOfferIds || [];
  booking.dispatch.currentExpiresAt = null;
  if (booking.status === BOOKING_STATUS.SEARCHING) {
    await booking.save();
    return { retried: false, escalated: false, awaitingBatch: true };
  }

  // If somehow not searching yet, move to SEARCHING so the batch cron
  // and inbox semantics still apply.
  if (booking.status === BOOKING_STATUS.PENDING_ASSIGNMENT) {
    booking.status = BOOKING_STATUS.SEARCHING;
    booking.scheduled = {
      ...(booking.scheduled?.toObject?.() || booking.scheduled || {}),
      assignmentStartedAt: booking.scheduled?.assignmentStartedAt || new Date(),
    };
    await booking.save();
  }
  return { retried: false, escalated: false, awaitingBatch: true };
}

/**
 * Recurring 45-min batch for open scheduled bookings:
 *   0. Auto-cancel + full refund unassigned bookings past ride time
 *   1. Rebroadcast inbox to newly-matching drivers (came online, etc.)
 *   2. Escalate past escalateAt into the emergency pool
 *
 * Workers call this from the escalate-batch (scheduled-batch) job.
 */
export async function runScheduledInboxBatchJob() {
  const expired = await expirePastUnassignedScheduledBookings();
  const rebroadcast = await rebroadcastOpenScheduledInboxes();
  const escalate = await runEmergencyPoolBatchEscalate();
  let subscription = { ok: true, skipped: true };
  try {
    const {
      rebroadcastOpenSubscriptionInboxes,
      runSubscriptionEscalateBatch,
    } = await import('./subscriptionDispatch.service.js');
    const subRebroadcast = await rebroadcastOpenSubscriptionInboxes();
    const subEscalate = await runSubscriptionEscalateBatch();
    subscription = { rebroadcast: subRebroadcast, escalate: subEscalate };
  } catch (err) {
    console.warn('[bookingScheduled] subscription batch failed:', err?.message);
  }
  return { ok: true, expired, rebroadcast, escalate, subscription };
}

const UNASSIGNED_EXPIRE_STATUSES = Object.freeze([
  BOOKING_STATUS.PENDING_ASSIGNMENT,
  BOOKING_STATUS.SEARCHING,
  BOOKING_STATUS.IN_EMERGENCY_POOL,
  BOOKING_STATUS.NO_DRIVERS_FOUND,
]);

/**
 * Cancel + full-refund a scheduled/outstation booking that still has no
 * driver at (or past) pickup time. Idempotent for assigned/terminal rows.
 */
export async function expireUnassignedScheduledBooking(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.driverId) return { ok: false, reason: 'already_assigned' };
  if (!UNASSIGNED_EXPIRE_STATUSES.includes(booking.status)) {
    return { ok: false, reason: 'not_unassigned', status: booking.status };
  }
  if (
    booking.bookingType !== BOOKING_TYPE.SCHEDULED
    && booking.bookingType !== BOOKING_TYPE.OUTSTATION
  ) {
    return { ok: false, reason: 'not_scheduled' };
  }

  const startAt = resolveBookingSearchStartAt(booking);
  if (!startAt) return { ok: false, reason: 'no_start_at' };
  if (startAt.getTime() > Date.now()) {
    return { ok: false, reason: 'not_yet_due' };
  }

  try {
    const { withdrawCurrentOfferService } = await import(
      './bookingDispatch.service.js'
    );
    await withdrawCurrentOfferService(booking._id, 'ride_time_passed');
  } catch (err) {
    console.warn(
      '[bookingScheduled] withdraw before expire failed for',
      String(booking._id),
      err?.message,
    );
  }

  const { cancelBookingByUserService } = await import('./booking.service.js');
  await cancelBookingByUserService(
    booking.userId,
    booking._id,
    'no_driver_by_ride_time',
    { cancelledBy: 'system', waiveCancellationFee: true },
  );

  return { ok: true, bookingId: String(booking._id) };
}

/**
 * Safety-net sweep: any unmatched scheduled/outstation booking whose
 * pickup time has already passed gets auto-cancelled with a full refund.
 * Called from escalate-batch; per-booking `expire-unassigned` jobs are
 * the primary path for on-time refunds.
 */
export async function expirePastUnassignedScheduledBookings() {
  const now = new Date();
  const candidates = await Booking.find({
    isDeleted: false,
    bookingType: { $in: [BOOKING_TYPE.SCHEDULED, BOOKING_TYPE.OUTSTATION] },
    driverId: null,
    status: { $in: [...UNASSIGNED_EXPIRE_STATUSES] },
    $or: [
      { 'hourly.scheduledStartAt': { $lte: now } },
      { 'outstation.pickupAt': { $lte: now } },
      { 'outstation.startDate': { $lte: now } },
    ],
  })
    .select('_id')
    .lean();

  if (!candidates.length) {
    return { ok: true, scanned: 0, expired: 0, failed: 0 };
  }

  let expired = 0;
  let failed = 0;
  for (const row of candidates) {
    try {
      const result = await expireUnassignedScheduledBooking(row._id);
      if (result?.ok) expired += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        '[bookingScheduled] expire failed for',
        String(row._id),
        err?.message || err,
      );
    }
  }

  console.log(
    `[bookingScheduled] expire-past-unassigned scanned=${candidates.length} expired=${expired} failed=${failed}`,
  );
  return {
    ok: true,
    scanned: candidates.length,
    expired,
    failed,
  };
}

/**
 * Find SEARCHING scheduled bookings still open (before escalate cutoff)
 * and offer them to any newly matching drivers not already pending /
 * rejected.
 */
export async function rebroadcastOpenScheduledInboxes() {
  const now = new Date();
  const rows = await Booking.find({
    isDeleted: false,
    bookingType: { $in: [BOOKING_TYPE.SCHEDULED, BOOKING_TYPE.OUTSTATION] },
    driverId: null,
    status: {
      $in: [BOOKING_STATUS.SEARCHING, BOOKING_STATUS.PENDING_ASSIGNMENT],
    },
    $and: [
      {
        $or: [
          { 'scheduled.escalateAt': { $gt: now } },
          { 'scheduled.escalateAt': { $exists: false } },
          { 'scheduled.escalateAt': null },
        ],
      },
      // Never rebroadcast after pickup time — those are expired/refunded.
      {
        $or: [
          { 'hourly.scheduledStartAt': { $gt: now } },
          {
            'hourly.scheduledStartAt': { $exists: false },
            'outstation.pickupAt': { $gt: now },
          },
          {
            'hourly.scheduledStartAt': { $exists: false },
            'outstation.pickupAt': { $exists: false },
            'outstation.startDate': { $gt: now },
          },
        ],
      },
    ],
  })
    .select('_id')
    .lean();

  if (!rows.length) {
    return { ok: true, scanned: 0, touched: 0, newDrivers: 0 };
  }

  const { broadcastScheduledInboxService } = await import(
    './bookingDispatch.service.js'
  );

  let updated = 0;
  let newDrivers = 0;
  for (const row of rows) {
    try {
      // Kick PENDING leftovers into SEARCHING only once assignAt has
      // arrived (or was never set). Early kickoff would ignore admin
      // LONG_LEAD / LEAD_SCHEDULE_HOUR deferral.
      const booking = await Booking.findById(row._id).select(
        'status scheduled.assignAt',
      );
      if (booking?.status === BOOKING_STATUS.PENDING_ASSIGNMENT) {
        const assignAtMs = booking.scheduled?.assignAt
          ? new Date(booking.scheduled.assignAt).getTime()
          : 0;
        if (assignAtMs && assignAtMs > Date.now()) {
          continue;
        }
        await kickoffScheduledAssignment(row._id);
        updated += 1;
        continue;
      }
      const result = await broadcastScheduledInboxService(row._id, {
        rebroadcast: true,
      });
      if (result?.ok && (result.newDriverCount || 0) > 0) {
        updated += 1;
        newDrivers += result.newDriverCount;
      }
    } catch (err) {
      console.warn(
        '[bookingScheduled] inbox rebroadcast failed for',
        String(row._id),
        err?.message || err,
      );
    }
  }

  console.log(
    `[bookingScheduled] inbox-rebroadcast scanned=${rows.length} updated=${updated} newDrivers=${newDrivers}`,
  );
  return { ok: true, scanned: rows.length, updated, newDrivers };
}

/**
 * Recurring batch escalate — finds unmatched scheduled / outstation
 * bookings past `scheduled.escalateAt`. Hourly scheduled → emergency
 * pool; outstation → PENDING_ASSIGNMENT (existing admin outstation queue).
 */
export async function runEmergencyPoolBatchEscalate() {
  const now = new Date();
  const cutoffFallback = new Date(
    now.getTime() + SCHEDULED_BOOKING.EMERGENCY_POOL_MINUTES * 60_000,
  );
  const filter = {
    isDeleted: false,
    bookingType: { $in: [BOOKING_TYPE.SCHEDULED, BOOKING_TYPE.OUTSTATION] },
    driverId: null,
    status: {
      $in: [
        BOOKING_STATUS.PENDING_ASSIGNMENT,
        BOOKING_STATUS.SEARCHING,
        BOOKING_STATUS.NO_DRIVERS_FOUND,
      ],
    },
    // Only escalate still-future pickups — past-start rows are expired
    // + refunded by expirePastUnassignedScheduledBookings instead.
    $and: [
      {
        $or: [
          { 'hourly.scheduledStartAt': { $gt: now } },
          {
            'hourly.scheduledStartAt': { $exists: false },
            'outstation.pickupAt': { $gt: now },
          },
          {
            'hourly.scheduledStartAt': { $exists: false },
            'outstation.pickupAt': { $exists: false },
            'outstation.startDate': { $gt: now },
          },
        ],
      },
      {
        $or: [
          { 'scheduled.escalateAt': { $lte: now } },
          {
            'scheduled.escalateAt': { $exists: false },
            $or: [
              { 'hourly.scheduledStartAt': { $lte: cutoffFallback } },
              { 'outstation.pickupAt': { $lte: cutoffFallback } },
              { 'outstation.startDate': { $lte: cutoffFallback } },
            ],
          },
          {
            'scheduled.escalateAt': null,
            $or: [
              { 'hourly.scheduledStartAt': { $lte: cutoffFallback } },
              { 'outstation.pickupAt': { $lte: cutoffFallback } },
              { 'outstation.startDate': { $lte: cutoffFallback } },
            ],
          },
        ],
      },
    ],
  };

  const candidates = await Booking.find(filter)
    .select('_id bookingNumber bookingType status scheduled.assignAt')
    .lean();
  if (!candidates.length) {
    return { ok: true, scanned: 0, escalated: 0, failed: 0 };
  }

  const { escalateToEmergencyPool } = await import(
    './bookingEmergencyPool.service.js'
  );

  let escalated = 0;
  let failed = 0;
  const nowMs = now.getTime();
  for (const row of candidates) {
    try {
      // Don't escalate deferred bookings that haven't opened search yet
      // (e.g. LONG_LEAD_HOURS < EMERGENCY_POOL_MINUTES misconfig, or
      // morning_lead still waiting for LEAD_SCHEDULE_HOUR).
      if (row.status === BOOKING_STATUS.PENDING_ASSIGNMENT) {
        const assignAtMs = row.scheduled?.assignAt
          ? new Date(row.scheduled.assignAt).getTime()
          : 0;
        if (assignAtMs && assignAtMs > nowMs) {
          continue;
        }
      }
      // Scheduled hourly + outstation both land in the shared emergency
      // pool when auto-search misses the escalateAt cutoff.
      const result = await escalateToEmergencyPool(row._id);
      if (result?.ok) escalated += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        '[bookingScheduled] batch escalate failed for',
        String(row._id),
        err?.message || err,
      );
    }
  }

  console.log(
    `[bookingScheduled] escalate-batch scanned=${candidates.length} escalated=${escalated} failed=${failed}`,
  );
  return {
    ok: true,
    scanned: candidates.length,
    escalated,
    failed,
  };
}

/**
 * @deprecated Outstation unmatched rows now escalate via
 * `escalateToEmergencyPool` (same as scheduled). Kept as a thin alias
 * for any callers still importing the old name.
 */
export async function escalateOutstationToManualQueue(bookingId) {
  const { escalateToEmergencyPool } = await import(
    './bookingEmergencyPool.service.js'
  );
  return escalateToEmergencyPool(bookingId);
}

/**
 * Admin "Scheduled Bookings" page — Mongo scheduled rides with filters:
 * status, search (booking # / customer), dateFrom / dateTo (pickup),
 * driverAssigned (yes|no). Team members only see bookings in their zones.
 */
export async function listScheduledBookingsForAdminService({ staff, query = {} } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 30));
  const skip = (page - 1) * limit;
  const status = query.status ? String(query.status) : null;
  const search = query.search ? String(query.search).trim() : '';
  const driverAssigned = query.driverAssigned
    ? String(query.driverAssigned).toLowerCase()
    : '';

  const filter = {
    isDeleted: false,
    bookingType: BOOKING_TYPE.SCHEDULED,
  };
  if (status) filter.status = status;

  const scope = zoneScopeForStaff(staff);
  if (scope !== null) {
    if (!scope.length) {
      return { bookings: [], total: 0, page, pages: 0, limit };
    }
    filter.zoneIds = { $in: scope };
  }

  if (query.zoneId) {
    try {
      const zoneObj = new mongoose.Types.ObjectId(String(query.zoneId));
      if (filter.zoneIds?.$in) {
        const allowed = filter.zoneIds.$in.map(String);
        if (!allowed.includes(String(zoneObj))) {
          return { bookings: [], total: 0, page, pages: 0, limit };
        }
      }
      filter.zoneIds = { $in: [zoneObj] };
    } catch {
      /* ignore bad id */
    }
  }

  if (driverAssigned === 'yes' || driverAssigned === 'true') {
    filter.driverId = { $ne: null };
  } else if (driverAssigned === 'no' || driverAssigned === 'false') {
    filter.driverId = null;
  }

  if (query.dateFrom || query.dateTo) {
    filter['hourly.scheduledStartAt'] = {};
    if (query.dateFrom) {
      const from = new Date(query.dateFrom);
      if (!Number.isNaN(from.getTime())) {
        filter['hourly.scheduledStartAt'].$gte = from;
      }
    }
    if (query.dateTo) {
      const to = new Date(query.dateTo);
      if (!Number.isNaN(to.getTime())) {
        if (String(query.dateTo).length <= 10) {
          to.setHours(23, 59, 59, 999);
        }
        filter['hourly.scheduledStartAt'].$lte = to;
      }
    }
    if (!Object.keys(filter['hourly.scheduledStartAt']).length) {
      delete filter['hourly.scheduledStartAt'];
    }
  }

  if (search) {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(search);
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const or = [{ bookingNumber: { $regex: escaped, $options: 'i' } }];
    if (isObjectId) or.push({ _id: search });
    try {
      const User = (await import('../models/user.model.js')).default;
      const users = await User.find({
        $or: [
          { name: { $regex: escaped, $options: 'i' } },
          { phone_no: { $regex: escaped, $options: 'i' } },
        ],
      })
        .select('_id')
        .limit(50)
        .lean();
      if (users.length) {
        or.push({ userId: { $in: users.map((u) => u._id) } });
      }
    } catch {
      // ignore
    }
    filter.$or = or;
  }

  const [total, bookings] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(filter)
      .sort({ 'hourly.scheduledStartAt': 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone_no')
      .populate('zoneIds', 'name code city')
      .populate({
        path: 'carId',
        select: 'vehicleNumber transmission image carTypeId brandId modelId fuelTypeId',
        populate: [
          { path: 'carTypeId', select: 'name' },
          { path: 'brandId', select: 'name' },
          { path: 'modelId', select: 'name' },
          { path: 'fuelTypeId', select: 'name' },
        ],
      })
      .lean(),
  ]);

  return {
    bookings,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    limit,
  };
}

/**
 * Drivers picker for scheduled manual assign — same geo ranking as the
 * emergency pool, but gated by staff zone scope.
 */
export async function listAvailableDriversForScheduledBookingService(
  bookingId,
  { staff, page, limit, carTypeId } = {},
) {
  const booking = await Booking.findOne({
    _id: bookingId,
    isDeleted: false,
  })
    .select('pickup bookingType zoneIds driverId status carId')
    .lean();
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.bookingType !== BOOKING_TYPE.SCHEDULED) {
    throw new ApiError(409, 'Only scheduled bookings are supported here');
  }
  assertStaffCanAccessBookingZones(staff, booking);

  const { listAvailableDriversForAssignmentService, getBookingCarTypeIdService } =
    await import('./bookingEmergencyPool.service.js');

  const resolvedCarTypeId =
    carTypeId || (await getBookingCarTypeIdService(bookingId)) || null;
  const coords = booking?.pickup?.location?.coordinates;
  const pickupCoords =
    Array.isArray(coords) && coords.length === 2
      ? { lng: coords[0], lat: coords[1] }
      : null;

  return listAvailableDriversForAssignmentService({
    carTypeId: resolvedCarTypeId,
    pickupCoords,
    page,
    limit,
  });
}

/**
 * Manual assign for an open scheduled booking (inbox / pending / emergency
 * pool / no-drivers). Admin & sub_admin: any zone. Team members: only
 * bookings whose zoneIds overlap their assignedZones.
 */
export async function adminAssignDriverToScheduledBookingService(
  bookingId,
  driverId,
  { staff, notes = '' } = {},
) {
  if (!bookingId || !driverId) {
    throw new ApiError(400, 'bookingId and driverId are required');
  }

  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.bookingType !== BOOKING_TYPE.SCHEDULED) {
    throw new ApiError(409, 'Only scheduled bookings can be assigned here');
  }
  if (booking.serviceType === 'outstation') {
    throw new ApiError(
      409,
      'Outstation bookings must be assigned from the Outstation Pool',
    );
  }
  if (booking.driverId) {
    throw new ApiError(409, 'Booking already has a driver');
  }
  if (!SCHEDULED_MANUAL_ASSIGN_STATUSES.includes(booking.status)) {
    throw new ApiError(
      409,
      `Cannot assign driver for status: ${booking.status}`,
    );
  }

  const startAt = resolveBookingSearchStartAt(booking);
  if (startAt && startAt.getTime() <= Date.now()) {
    throw new ApiError(
      409,
      'Ride time has passed — this booking will be auto-refunded',
    );
  }

  assertStaffCanAccessBookingZones(staff, booking);

  const driver = await Driver.findOne({
    _id: driverId,
    isDeleted: { $ne: true },
    approvalStatus: 'approved',
  });
  if (!driver) throw new ApiError(404, 'Driver not found or not approved');
  if (driver.isOnTrip) {
    throw new ApiError(409, 'Driver is already on another trip');
  }

  try {
    const { withdrawCurrentOfferService } = await import(
      './bookingDispatch.service.js'
    );
    await withdrawCurrentOfferService(booking._id, 'admin_manual_assign');
  } catch (err) {
    console.warn(
      '[bookingScheduled] failed to withdraw inbox offers for',
      String(booking._id),
      err?.message,
    );
  }

  removeScheduledBookingJobs(booking._id).catch(() => {});

  const now = new Date();
  // Reload after withdraw so we don't overwrite cleared dispatch fields badly.
  const fresh = await Booking.findById(bookingId);
  if (!fresh || fresh.driverId) {
    throw new ApiError(409, 'Booking was assigned by someone else');
  }

  fresh.driverId = driver._id;
  fresh.timeline = fresh.timeline || {};
  fresh.timeline.driverAssignedAt = now;
  fresh.status = BOOKING_STATUS.DRIVER_ASSIGNED;
  fresh.scheduled = {
    ...(fresh.scheduled?.toObject?.() || fresh.scheduled || {}),
    manualAssign: {
      assignedBy: staff?._id || null,
      assignedAt: now,
      notes: notes || '',
    },
  };

  if (fresh.dispatch) {
    fresh.dispatch.offers = fresh.dispatch.offers || [];
    fresh.dispatch.offers.push({
      driverId: driver._id,
      offeredAt: now,
      respondedAt: now,
      response: DISPATCH_RESPONSE.ACCEPTED,
      distanceMeters: null,
    });
    fresh.dispatch.pendingOfferIds = [];
    fresh.dispatch.currentExpiresAt = null;
  }

  await fresh.save();

  // Lock only if pickup is soon (same rule as dispatcher accept).
  try {
    const bufferMinutes = Number(
      (await loadScheduledDispatchConfig(fresh.serviceType))?.RIDE_BUFFER_MINUTES,
    );
    const startMs = fresh.hourly?.scheduledStartAt
      ? new Date(fresh.hourly.scheduledStartAt).getTime()
      : 0;
    const lockLeadMs = Math.max(0, Number.isFinite(bufferMinutes) ? bufferMinutes : SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES) * 60_000;
    if (!startMs || startMs - Date.now() <= lockLeadMs) {
      await Driver.updateOne({ _id: driver._id }, { $set: { isOnTrip: true } });
    }
  } catch {
    await Driver.updateOne({ _id: driver._id }, { $set: { isOnTrip: true } });
  }

  enqueueRemindersAfterAssignment(fresh).catch((err) =>
    console.warn(
      '[bookingScheduled] reminder enqueue failed for',
      String(fresh._id),
      err?.message,
    ),
  );

  const userPayload = {
    bookingId: String(fresh._id),
    status: fresh.status,
    paymentMode: fresh.paymentMode,
    paymentStatus: fresh.paymentStatus,
    driverId: String(driver._id),
    timeline: fresh.timeline?.toObject?.() || fresh.timeline,
  };
  const driverPayload = {
    bookingId: String(fresh._id),
    status: fresh.status,
    driverId: String(driver._id),
    timeline: fresh.timeline?.toObject?.() || fresh.timeline,
  };

  emitToUser(fresh.userId, S2C_EVENTS.BOOKING_UPDATED, userPayload);
  emitToBooking(fresh._id, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToDriver(driver._id, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, userPayload);

  notifyDriverOrderAssigned(driver._id, fresh).catch(() => null);

  return {
    booking: await Booking.findById(fresh._id)
      .populate('driverId', 'name phone_no')
      .populate('userId', 'name phone_no')
      .lean(),
    paid: fresh.paymentStatus === BOOKING_PAYMENT_STATUS.PAID,
  };
}

/**
 * Called from any code path that successfully pairs a driver with a
 * scheduled booking. Idempotent — a booking whose reminders have already
 * been queued is left alone.
 */
export async function enqueueRemindersAfterAssignment(booking) {
  if (!booking?._id) return false;
  if (booking?.bookingType && booking.bookingType !== 'scheduled') return false;
  if (booking?.scheduled?.remindersEnqueuedAt) return false;

  const queued = await enqueueReminderJobsForBooking(booking);
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
