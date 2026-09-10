import Booking from '../models/booking.model.js';
import {
  BOOKING_STATUS,
  BOOKING_TYPE,
  STUCK_RECOVERY,
} from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { resolveBookingSearchStartAt } from '../utils/bookingInbox.js';
import { decideRecoveryStages, minutesPast } from '../utils/stuckRecovery.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import { emitToAdmins, emitToBooking, emitToUser } from '../utils/socketEmitters.js';
import {
  notifyDriverArrivalReminder,
  notifyAdminBookingStuckEnRoute,
} from '../utils/notificationDispatch.js';

/**
 * Recovery for outstation bookings wedged at EN_ROUTE past their pickup.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 * `markDriverArrivedService` gates the EN_ROUTE → ARRIVED transition on a
 * GPS proximity check (`ARRIVAL_PROXIMITY_METERS`, widened by the fix's
 * own accuracy). That guard is correct — it stops a driver flipping to
 * ARRIVED from across town — but it means a driver who taps "Start to
 * pickup" and then never physically reaches the pickup can NEVER reach
 * ARRIVED. And because the ride-start OTP is minted by that same
 * transition, no OTP is ever generated, so the trip cannot start either.
 *
 * The booking then sits at EN_ROUTE indefinitely, and since EN_ROUTE is
 * one of `ON_TRIP_LOCK_STATUSES`, the driver keeps `isOnTrip: true` and
 * the dispatcher skips them for every new wave. Both the booking and the
 * driver stay blocked.
 *
 * `selfHealDriverLockState` (bookingDispatch.service.js) already walks
 * back the *opposite* wedge — an hourly SCHEDULED booking flipped to
 * EN_ROUTE while pickup is still in the future — but its filter is
 * `bookingType: SCHEDULED` on `hourly.scheduledStartAt: { $gt: … }`.
 * Outstation is excluded by type, and "pickup already passed" is excluded
 * by direction, so this case had no recovery path at all.
 *
 * ── What this does ─────────────────────────────────────────────────────
 * Two escalating, idempotent stages keyed off minutes past pickup:
 *
 *   NUDGE_MINUTES     Push the driver a "mark your arrival" reminder.
 *                     Most wedges are just a driver who forgot to tap, and
 *                     this clears them without any operator involvement.
 *                     No customer push — the customer is not the one who
 *                     can act, and "your driver still hasn't arrived" is
 *                     alarming rather than useful. Open customer/admin
 *                     screens still resync over the socket broadcast.
 *   ESCALATE_MINUTES  Stamp the booking for admin review and raise a
 *                     persisted + FCM admin alert so a human resolves it
 *                     through the existing booking-ops paths
 *                     (`adminUpdateBookingStatusService` force-arrive
 *                     mints the OTP; assign/reassign swaps the driver;
 *                     `adminSettleOutstationArrivedService` settles).
 *
 * Deliberately NOT automatic: cancelling, completing, moving money, or
 * clearing the driver's `isOnTrip` flag. An outstation booking is prepaid
 * and multi-day, and a driver at minute 121 may genuinely still be
 * driving — releasing them would let the dispatcher double-book a driver
 * who is mid-journey. Escalating to a human matches how the sibling
 * "outstation stuck at ARRIVED, no OTP" case is already handled.
 */

/**
 * The two ways a booking stalls with a driver attached, and the stamp each
 * one writes. Both are measured from the booked pickup time and both run the
 * same nudge → escalate ladder; only the wording the driver sees differs.
 *
 *   driver_assigned  accepted, but never tapped "On the way". Nothing watched
 *                    this state at all — no timeout, no retry, no escalation.
 *   en_route         tapped "On the way", never reached the pickup, so the
 *                    GPS-gated arrival (and its OTP) can never fire.
 */
const WEDGE_KIND_BY_STATUS = Object.freeze({
  [BOOKING_STATUS.DRIVER_ASSIGNED]: 'assigned_past_pickup',
  [BOOKING_STATUS.EN_ROUTE]: 'en_route_past_pickup',
});

const WEDGED_STATUSES = Object.freeze(Object.keys(WEDGE_KIND_BY_STATUS));

/** Statuses that mean the wedge resolved itself — clear any stale stamp. */
const RECOVERED_STATUSES = Object.freeze([
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
]);

function broadcast(booking, extra = {}) {
  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    ...extra,
  };
  try {
    emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
    if (booking.userId) emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
    emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);
  } catch (err) {
    console.warn(
      '[stuckRecovery] broadcast failed for',
      String(booking._id),
      err?.message,
    );
  }
}

/**
 * Nudge stage — remind the driver to mark arrival. Claimed atomically on
 * `stuckRecovery.nudgedAt` so a second worker (or the next sweep) cannot
 * re-notify the same wedge.
 *
 * @returns {Promise<boolean>} true if this call sent the nudge
 */
async function nudgeDriver(booking, minutesLate, kind) {
  const claimed = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      // Re-assert the status we decided on: if the driver acted between the
      // scan and this write, the wedge is gone and the nudge is noise.
      status: booking.status,
      'stuckRecovery.nudgedAt': null,
    },
    {
      $set: {
        'stuckRecovery.kind': kind,
        'stuckRecovery.nudgedAt': new Date(),
        'stuckRecovery.minutesLate': minutesLate,
      },
    },
    { new: true },
  )
    .select('_id bookingNumber status userId driverId zoneIds')
    .lean();

  if (!claimed) return false;

  if (claimed.driverId) {
    await notifyDriverArrivalReminder(claimed.driverId, claimed, {
      minutesLate,
      kind,
    }).catch((err) =>
      console.warn('[stuckRecovery] driver nudge failed:', err?.message),
    );
  }

  broadcast(claimed, { stuckRecovery: 'nudged', minutesLate });
  console.log(
    `[stuckRecovery] nudged driver on ${claimed.bookingNumber || claimed._id}`
      + ` [${kind}] (${minutesLate}m past pickup)`,
  );
  return true;
}

/**
 * Escalate stage — flag for admin review and alert staff. Claimed
 * atomically on `stuckRecovery.escalatedAt` so the alert fires once per
 * wedge, not once per sweep.
 *
 * @returns {Promise<boolean>} true if this call escalated
 */
async function escalateToAdmin(booking, minutesLate, kind) {
  const claimed = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      status: booking.status,
      'stuckRecovery.escalatedAt': null,
    },
    {
      $set: {
        'stuckRecovery.kind': kind,
        'stuckRecovery.escalatedAt': new Date(),
        'stuckRecovery.minutesLate': minutesLate,
      },
    },
    { new: true },
  )
    .select('_id bookingNumber status userId driverId zoneIds')
    .lean();

  if (!claimed) return false;

  await notifyAdminBookingStuckEnRoute(claimed, { minutesLate, kind }).catch((err) =>
    console.warn('[stuckRecovery] admin alert failed:', err?.message),
  );

  broadcast(claimed, { stuckRecovery: 'escalated', minutesLate });
  console.warn(
    `[stuckRecovery] escalated ${claimed.bookingNumber || claimed._id} to admin`
      + ` [${kind}] (${minutesLate}m past pickup)`,
  );
  return true;
}

/**
 * Drop recovery stamps from a single booking, so a later wedge on the
 * same booking is treated as a fresh one. Call from any transition that
 * legitimately moves a booking out of EN_ROUTE.
 */
export async function clearStuckRecoveryState(bookingId) {
  await Booking.updateOne(
    { _id: bookingId, 'stuckRecovery.kind': { $ne: '' } },
    {
      $set: {
        'stuckRecovery.kind': '',
        'stuckRecovery.nudgedAt': null,
        'stuckRecovery.escalatedAt': null,
        'stuckRecovery.minutesLate': 0,
      },
    },
  ).catch((err) => console.warn('[stuckRecovery] clear failed:', err?.message));
}

/**
 * Sweep bookings stalled with a driver attached past their pickup time and
 * run the nudge / escalate ladder over them. Safe to call repeatedly — both
 * stages are claim-guarded.
 *
 * Covers both wedge kinds and every booking type. `DRIVER_ASSIGNED` had no
 * watcher of any sort before this: a driver could accept and then do nothing,
 * and the booking sat there with the customer waiting and no timeout, retry or
 * escalation anywhere in the system.
 *
 * This is a backstop, not a stopwatch. It rides the existing recurring
 * escalate-batch job (default every 45 min) rather than adding a fourth timer
 * system, so worst-case detection lag is one batch interval on top of the
 * threshold. That is a large improvement on "never", and still slower than an
 * instant booking deserves — a per-booking BullMQ job at accept time would
 * give minutes-level response, with this sweep remaining the safety net (the
 * same primary/backstop split `expire-unassigned` already uses).
 */
export async function runStuckBookingRecoverySweep() {
  const now = Date.now();
  const nudgeAfterMs =
    Math.max(1, Number(STUCK_RECOVERY.NUDGE_MINUTES) || 30) * 60_000;
  const cutoff = new Date(now - nudgeAfterMs);

  let candidates = [];
  try {
    candidates = await Booking.find({
      isDeleted: false,
      status: { $in: [...WEDGED_STATUSES] },
      driverId: { $ne: null },
      // Pickup already passed by at least the nudge threshold. Mirrors what
      // `resolveBookingSearchStartAt` reads, so the query and the per-booking
      // reference time below can never disagree: `hourly.scheduledStartAt`
      // for hourly (instant included — its +15m seed is the only time
      // reference an instant booking has), then the outstation pair, where
      // `pickupAt` is authoritative and `startDate` the back-compat fallback.
      $or: [
        { 'hourly.scheduledStartAt': { $lte: cutoff } },
        { 'outstation.pickupAt': { $lte: cutoff } },
        {
          'outstation.pickupAt': null,
          'outstation.startDate': { $lte: cutoff },
        },
      ],
    })
      .select(
        '_id bookingNumber status bookingType serviceType userId driverId zoneIds '
          + 'outstation.pickupAt outstation.startDate hourly.scheduledStartAt '
          + 'stuckRecovery timeline.enRouteAt timeline.driverAssignedAt',
      )
      .lean();
  } catch (err) {
    console.warn('[stuckRecovery] candidate scan failed:', err?.message || err);
    return { ok: false, scanned: 0, nudged: 0, escalated: 0, failed: 1 };
  }

  if (!candidates.length) {
    return { ok: true, scanned: 0, nudged: 0, escalated: 0, failed: 0 };
  }

  let nudged = 0;
  let escalated = 0;
  let failed = 0;

  for (const booking of candidates) {
    try {
      const kind = WEDGE_KIND_BY_STATUS[booking.status];
      if (!kind) continue;

      const pickupAt = resolveBookingSearchStartAt(booking);
      if (!pickupAt) continue;
      const minutesLate = minutesPast(pickupAt, now);
      const stages = decideRecoveryStages(minutesLate, booking.stuckRecovery);

      if (stages.nudge && (await nudgeDriver(booking, minutesLate, kind))) {
        nudged += 1;
      }
      if (stages.escalate && (await escalateToAdmin(booking, minutesLate, kind))) {
        escalated += 1;
      }
    } catch (err) {
      failed += 1;
      console.warn(
        '[stuckRecovery] recovery failed for',
        String(booking._id),
        err?.message || err,
      );
    }
  }

  console.log(
    `[stuckRecovery] sweep scanned=${candidates.length} nudged=${nudged} escalated=${escalated} failed=${failed}`,
  );
  return {
    ok: true,
    scanned: candidates.length,
    nudged,
    escalated,
    failed,
  };
}

/**
 * Housekeeping companion to the sweep: drop recovery stamps from bookings
 * that have since arrived / started / completed / cancelled. Keeps the
 * admin "needs attention" view honest without every transition having to
 * know about recovery state.
 */
export async function clearResolvedStuckRecoveryStamps() {
  try {
    const res = await Booking.updateMany(
      {
        'stuckRecovery.kind': { $ne: '' },
        status: { $in: [...RECOVERED_STATUSES] },
      },
      {
        $set: {
          'stuckRecovery.kind': '',
          'stuckRecovery.nudgedAt': null,
          'stuckRecovery.escalatedAt': null,
          'stuckRecovery.minutesLate': 0,
        },
      },
    );
    return { ok: true, cleared: res?.modifiedCount || 0 };
  } catch (err) {
    console.warn('[stuckRecovery] resolved-stamp cleanup failed:', err?.message);
    return { ok: false, cleared: 0 };
  }
}
