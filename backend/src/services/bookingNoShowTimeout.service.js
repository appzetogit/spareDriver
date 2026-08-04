import Booking from '../models/booking.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import ServicePricing from '../models/servicePricing.model.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToDriver,
  emitToBooking,
} from '../utils/socketEmitters.js';
import {
  settleWaitingBuffer,
  clearPendingExtensionsOnTerminate,
  settleDriverEarning,
} from './bookingExtension.service.js';
import { recordCompletedTripPlatformRevenue } from './platformRevenue.service.js';
import { incrementCouponUsageService } from './coupon.service.js';

function isOutstationBooking(booking) {
  return (
    booking?.serviceType === SERVICE_TYPES.OUTSTATION
    || booking?.serviceType === 'outstation'
  );
}

/**
 * No-show timer service.
 *
 * Two-phase in-process scheduler:
 *
 *   PHASE A — "are you coming?" prompt
 *     Scheduled when the driver hits ARRIVED. Fires after
 *     `waitingCharge.noShowPromptMinutes` (default 30 min). On fire it
 *     stamps `booking.noShow.promptSentAt` and emits
 *     `BOOKING_NOSHOW_PROMPT` to the user. Same call schedules PHASE B.
 *
 *   PHASE B — auto-complete (no response)
 *     Scheduled when PHASE A fires. After
 *     `waitingCharge.noShowGraceMinutes` (default 5 min) without a
 *     "yes/no" from the customer (or after an explicit "not coming"),
 *     the ride is auto-completed: the driver gets paid in full + the
 *     full waiting charge accrued since arrival, and the booking
 *     transitions to COMPLETED with `waiting.noShow = true`.
 *
 * If the customer responds:
 *   - "on_my_way"  → cancel PHASE B and reschedule PHASE A from now
 *                    for another grace cycle.
 *   - "not_coming" → fire PHASE B immediately.
 *
 * Server restart drops timers — bookings stuck mid-prompt will resume
 * on the next request that touches them via `resumeNoShowSchedule()`
 * (called from the booking fetch helpers). This is the same
 * trade-off the payment-timeout service makes.
 */

/** bookingId → { phase, handle } */
const noShowTimers = new Map();

function key(id) {
  return String(id);
}

/** Stop any pending no-show timer for this booking. Safe to call twice. */
export function cancelNoShowSchedule(bookingId) {
  const k = key(bookingId);
  const entry = noShowTimers.get(k);
  if (entry?.handle) clearTimeout(entry.handle);
  noShowTimers.delete(k);
}

/**
 * Schedule PHASE A (the "are you coming?" prompt) for a booking that
 * just hit ARRIVED. Idempotent — replaces any pending timer.
 *
 * `arrivedAt` lets the caller pass the timestamp the booking actually
 * arrived (in case the schedule is being resumed mid-cycle), so we
 * fire at the right wall-clock instant rather than always 30 min
 * from "now".
 */
export async function schedulePromptTimer(bookingId, arrivedAt = new Date()) {
  cancelNoShowSchedule(bookingId);

  const booking = await Booking.findById(bookingId)
    .select('serviceType status noShow')
    .lean();
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;
  // Outstation: no prompt / auto-complete — admin settles stuck arrivals.
  if (isOutstationBooking(booking)) return;

  const policy = await loadWaitingPolicy(booking.serviceType);
  const firedFor = Number(booking.noShow?.firedFor || 0);
  // First prompt fires AFTER the free-wait window expires +
  // `noShowPromptMinutes` of accrual buffer. Subsequent prompts (after
  // the user said "on my way") use just `noShowPromptMinutes` so the
  // cadence feels consistent.
  const baseMinutes =
    firedFor === 0
      ? policy.freeWaitingMinutes + policy.noShowPromptMinutes
      : policy.noShowPromptMinutes;
  const promptMs = Math.max(0, baseMinutes) * 60_000;
  const fireAt = new Date(arrivedAt).getTime() + promptMs;
  const delay = Math.max(0, fireAt - Date.now());

  const handle = setTimeout(
    () => firePrompt(bookingId).catch((err) =>
      console.warn('[noShow] prompt fire failed:', err?.message),
    ),
    delay,
  );
  noShowTimers.set(key(bookingId), { phase: 'prompt', handle });
}

/**
 * PHASE A fire — flag the booking and ping the customer.
 *
 * Cadence: the first N = `maxNoShowPrompts` prompts are non-terminal —
 * if the customer doesn't answer within `noShowPromptMinutes` we just
 * fire the next prompt. The (N+1)-th prompt is *terminal*: a missed
 * response within `noShowGraceMinutes` auto-completes the ride.
 *
 * `firedFor` records the running prompt number so the FE can show
 * "Reminder 2 of 3" and the cadence survives restarts.
 */
async function firePrompt(bookingId) {
  noShowTimers.delete(key(bookingId));

  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;
  if (isOutstationBooking(booking)) return;
  // NOTE: we deliberately do NOT short-circuit here on
  // `customerResponse === 'on_my_way'`. After the user says yes,
  // `recordCustomerOnMyWay` reschedules a fresh prompt — this fire IS
  // that fresh prompt and must go through. The previous response is
  // overwritten by the new prompt state below, which is the audit-safe
  // way to keep the cadence going. Race protection against double-fires
  // is handled by `noShowTimers` (Map-keyed by bookingId).

  const policy = await loadWaitingPolicy(booking.serviceType);
  const firedFor = Number(booking.noShow?.firedFor || 0) + 1;
  const maxPrompts = policy.maxNoShowPrompts;
  // Final prompt = (maxNoShowPrompts + 1)-th. Before that, a missed
  // response just queues the next prompt; on the final one, it
  // auto-completes.
  const isFinalPrompt = firedFor > maxPrompts;
  const now = new Date();
  const windowMinutes = isFinalPrompt
    ? policy.noShowGraceMinutes
    : policy.noShowPromptMinutes;
  const deadline = new Date(now.getTime() + windowMinutes * 60_000);

  booking.noShow = {
    promptSentAt: now,
    promptDeadlineAt: deadline,
    customerResponse: '',
    respondedAt: null,
    firedFor,
  };
  await booking.save();

  const payload = {
    bookingId: String(booking._id),
    promptSentAt: now,
    promptDeadlineAt: deadline,
    graceMinutes: windowMinutes,
    promptIndex: firedFor,
    maxPrompts,
    isFinal: isFinalPrompt,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_NOSHOW_PROMPT, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_NOSHOW_PROMPT, payload);

  // Final prompt → auto-complete on grace expiry.
  // Non-final → fire the next prompt at the window.
  const nextHandler = isFinalPrompt
    ? () =>
        autoCompleteForNoShow(bookingId).catch((err) =>
          console.warn('[noShow] auto-complete failed:', err?.message),
        )
    : () =>
        firePrompt(bookingId).catch((err) =>
          console.warn('[noShow] reprompt failed:', err?.message),
        );
  const handle = setTimeout(
    nextHandler,
    Math.max(0, deadline.getTime() - Date.now()),
  );
  noShowTimers.set(key(bookingId), {
    phase: isFinalPrompt ? 'autoComplete' : 'reprompt',
    handle,
  });
}

/**
 * Customer responded "Yes, on my way".
 *
 * On a non-final prompt: cancel the current timer, mark the response,
 * and reschedule the next prompt for `noShowPromptMinutes` from now —
 * the cap (`maxNoShowPrompts`) is preserved through `firedFor` so the
 * cycle still terminates after N "yes" responses.
 *
 * On a FINAL prompt (already past the cap): the response is recorded
 * for audit but does NOT reset the grace timer — auto-complete still
 * fires when the grace window elapses. This is how we stop the cycle
 * from being extended indefinitely.
 */
export async function recordCustomerOnMyWay(bookingId) {
  const booking = await Booking.findById(bookingId).select(
    'serviceType noShow status',
  );
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;
  if (isOutstationBooking(booking)) return;

  const policy = await loadWaitingPolicy(booking.serviceType);
  const firedFor = Number(booking.noShow?.firedFor || 0);
  const isPastCap = firedFor > policy.maxNoShowPrompts;

  await Booking.updateOne(
    { _id: bookingId },
    {
      $set: {
        'noShow.customerResponse': 'on_my_way',
        'noShow.respondedAt': new Date(),
        ...(isPastCap ? {} : { 'noShow.promptDeadlineAt': null }),
      },
    },
  );

  if (isPastCap) {
    // Don't reschedule — the existing auto-complete timer must be
    // allowed to fire so we never end up in a "yes I'm coming"
    // infinite-loop after the cap.
    return;
  }
  cancelNoShowSchedule(bookingId);
  await schedulePromptTimer(bookingId, new Date());
}

/**
 * Customer responded "No, not coming" — auto-complete immediately so
 * the driver doesn't sit there for the grace window.
 */
export async function recordCustomerNotComing(bookingId) {
  const preview = await Booking.findById(bookingId).select('serviceType').lean();
  if (isOutstationBooking(preview)) {
    cancelNoShowSchedule(bookingId);
    return;
  }
  cancelNoShowSchedule(bookingId);
  await Booking.updateOne(
    { _id: bookingId },
    {
      $set: {
        'noShow.customerResponse': 'not_coming',
        'noShow.respondedAt': new Date(),
      },
    },
  );
  await autoCompleteForNoShow(bookingId);
}

/**
 * PHASE B fire — close the booking out as a no-show completion. The
 * driver gets paid in full (per the original fare snapshot) plus any
 * waiting charge accrued since arrival.
 *
 * We mirror `completeTripService`'s side-effects: free the driver's
 * `isOnTrip`, record platform commission, broadcast the update.
 * Imports are local to avoid the cyclic init between
 * bookingTrip.service and this file.
 */
async function autoCompleteForNoShow(bookingId) {
  noShowTimers.delete(key(bookingId));

  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  // Race: if the trip already started (driver entered the OTP), let
  // the normal flow take over.
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;
  if (isOutstationBooking(booking)) return;

  // IMPORTANT: we deliberately do NOT short-circuit on
  // `customerResponse === 'on_my_way'` here. The auto-complete timer
  // is only ever scheduled by the FINAL prompt (the (N+1)-th fire),
  // and per the cadence contract a "yes" past the cap is recorded for
  // audit only — it must NOT reset the grace window or we end up in
  // an infinite prompt → "yes" → reschedule → prompt → "yes" loop
  // (the previous defensive check was exactly that bug; the timer Map
  // already serialises against double-fires for the legitimate race).

  const now = new Date();
  const arrivedAt = booking.timeline?.arrivedAt
    ? new Date(booking.timeline.arrivedAt)
    : now;

  // Stamp the waiting charge based on the full wait window, capped by
  // the booking's snapshotted `maxBillableMinutes` (which the pricing
  // validator guarantees can be fully covered by the pre-collected
  // buffer). Fall back to the live policy for fields the booking
  // snapshot may be missing (legacy bookings created before the buffer
  // landed).
  const policy = await loadWaitingPolicy(booking.serviceType);
  const snapshot = booking.waiting || {};
  const freeMinutes = Number(snapshot.freeMinutes) || policy.freeWaitingMinutes;
  const perMinute = Number(snapshot.perMinuteRupees) || policy.chargePerMinute;
  const maxBillable = Number(snapshot.maxBillableMinutes) || 0;
  const waitedMs = Math.max(0, now.getTime() - arrivedAt.getTime());
  const waitedMinutes = Math.ceil(waitedMs / 60_000);
  let billable = Math.max(0, waitedMinutes - freeMinutes);
  if (maxBillable > 0) billable = Math.min(billable, maxBillable);
  const charge = Math.round(billable * perMinute * 100) / 100;
  booking.waiting = booking.waiting || {};
  Object.assign(booking.waiting, {
    waitedMinutes,
    billableMinutes: billable,
    chargeRupees: charge,
    freeMinutes,
    perMinuteRupees: perMinute,
    noShow: true,
  });

  booking.status = BOOKING_STATUS.COMPLETED;
  booking.timeline.completedAt = now;
  booking.timeline.startedAt = booking.timeline.startedAt || arrivedAt;

  // Settle the pre-collected buffer. Caps `chargeRupees` at
  // `bufferRupees` (belt-and-braces — the per-minute math above is
  // already bounded by maxBillableMinutes) and credits the unused
  // portion back to the user's wallet.
  await settleWaitingBuffer(booking);

  // Defensive: a no-show can't have an in-flight extension (extensions
  // require STARTED), but sweep anyway so any future flow change
  // can't leak a stale pending row.
  await clearPendingExtensionsOnTerminate(booking, 'no_show_auto_complete');

  await booking.save();

  // Free the driver for new dispatches.
  if (booking.driverId) {
    Driver.updateOne({ _id: booking.driverId }, { $set: { isOnTrip: false } }).catch(
      (err) =>
        console.warn(
          '[noShow] failed to clear driver.isOnTrip on auto-complete:',
          err?.message,
        ),
    );
  }

  // Mirror normal trip-complete revenue: commission + platform fee +
  // admin-absorbed coupon. Previously only commission was booked here,
  // which overstated platform revenue whenever a coupon was applied.
  await recordCompletedTripPlatformRevenue(booking, {
    noShowAutoComplete: true,
  }).catch((err) =>
    console.warn('[noShow] revenue write failed:', err?.message),
  );

  const snap = booking.fareSnapshot || {};
  if (snap.couponId) {
    incrementCouponUsageService(snap.couponId).catch((err) =>
      console.warn('[noShow] failed to increment coupon usage:', err?.message),
    );
  }

  // Mirror normal trip-complete: settle the driver's earning into their
  // wallet (fare share + allowance share). Without this the no-show
  // auto-complete left the driver unpaid for the daily rate — only the
  // platform commission was being booked. Best-effort so the auto-
  // complete transition never wedges on a wallet write; admins can
  // reconcile from the booking later if it fails.
  await settleDriverEarning(booking).catch((err) =>
    console.warn('[noShow] failed to settle driver earning:', err?.message),
  );

  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    waiting: booking.waiting,
    reason: 'no_show_auto_complete',
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
  if (booking.driverId) {
    emitToDriver(booking.driverId, S2C_EVENTS.BOOKING_UPDATED, payload);
  }
}

/**
 * Cold-start helper. Re-attach a timer for any ARRIVED booking that
 * had its in-process timer dropped by a restart. Called opportunistically
 * from booking fetch paths so we never need a cron.
 */
export async function resumeNoShowScheduleIfNeeded(booking) {
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;
  if (isOutstationBooking(booking)) return;
  if (noShowTimers.has(key(booking._id))) return;
  // If we already prompted and have a live deadline, resume the right
  // phase for the current prompt index. The (maxNoShowPrompts+1)-th
  // prompt's deadline drives auto-complete; earlier prompts' deadlines
  // drive the next reprompt.
  const deadline = booking.noShow?.promptDeadlineAt;
  if (deadline) {
    const policy = await loadWaitingPolicy(booking.serviceType);
    const firedFor = Number(booking.noShow?.firedFor || 0);
    const isFinalPrompt = firedFor > policy.maxNoShowPrompts;
    const remaining = Math.max(0, new Date(deadline).getTime() - Date.now());
    const handler = isFinalPrompt
      ? () =>
          autoCompleteForNoShow(booking._id).catch((err) =>
            console.warn('[noShow] resumed auto-complete failed:', err?.message),
          )
      : () =>
          firePrompt(booking._id).catch((err) =>
            console.warn('[noShow] resumed reprompt failed:', err?.message),
          );
    const handle = setTimeout(handler, remaining);
    noShowTimers.set(key(booking._id), {
      phase: isFinalPrompt ? 'autoComplete' : 'reprompt',
      handle,
    });
    return;
  }
  // Otherwise, resume PHASE A using the original arrivedAt anchor.
  await schedulePromptTimer(
    booking._id,
    booking.timeline?.arrivedAt || new Date(),
  );
}

/**
 * Pull the waiting-charge policy for a service, falling back to safe
 * defaults if no pricing doc exists.
 */
async function loadWaitingPolicy(serviceType) {
  const pricing = await ServicePricing.findOne({
    serviceType,
    isActive: true,
  })
    .select('waitingCharge')
    .lean();
  const w = pricing?.waitingCharge || {};
  return {
    freeWaitingMinutes: Math.max(0, Number(w.freeWaitingMinutes ?? 15)),
    chargePerMinute: Math.max(0, Number(w.chargePerMinute ?? 2)),
    noShowPromptMinutes: Math.max(1, Number(w.noShowPromptMinutes ?? 15)),
    noShowGraceMinutes: Math.max(1, Number(w.noShowGraceMinutes ?? 5)),
    maxNoShowPrompts: Math.max(0, Math.min(5, Number(w.maxNoShowPrompts ?? 2))),
    maxBillableMinutes: Math.max(0, Number(w.maxBillableMinutes ?? 45)),
  };
}
