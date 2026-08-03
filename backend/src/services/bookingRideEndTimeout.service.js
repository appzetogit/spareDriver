import Booking from '../models/booking.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  PAYMENT_MODE,
  PAYMENT_POLICY,
} from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToDriver,
  emitToBooking,
  emitToAdmins,
} from '../utils/socketEmitters.js';
import {
  settleWaitingBuffer,
  clearPendingExtensionsOnTerminate,
  settleDriverEarning,
} from './bookingExtension.service.js';
import { recordCompletedTripPlatformRevenue } from './platformRevenue.service.js';
import { incrementCouponUsageService } from './coupon.service.js';
import {
  notifyUserTripCompleted,
  notifyDriverEarningsCredited,
} from '../utils/notificationDispatch.js';

/**
 * Hourly / scheduled-hourly ride-end auto-complete.
 *
 * After `startedAt + (durationHours + accepted extensions)` the
 * customer gets `RIDE_END_EXTENSION_GRACE_SECONDS` (default 5 min) to
 * extend. If they don't, the ride auto-completes — same settlement
 * path as a normal driver complete.
 *
 * In-process timers (same trade-off as no-show / payment timeout):
 * a restart drops them; `resumeRideEndScheduleIfNeeded` re-attaches
 * from booking fetch paths.
 */

/** bookingId → { handle, autoCompleteAt } */
const rideEndTimers = new Map();

function key(id) {
  return String(id);
}

const graceMs = () =>
  Math.max(0, Number(PAYMENT_POLICY.RIDE_END_EXTENSION_GRACE_SECONDS) || 0) *
  1000;

/** Booked length in ms (base hours + accepted extensions). */
export function bookedRideDurationMs(booking) {
  const base = Number(booking?.hourly?.durationHours) || 0;
  if (base <= 0) return 0;
  const extra = (booking?.extensions || []).reduce(
    (sum, ext) =>
      sum + (ext?.status === 'accepted' ? Number(ext.additionalHours) || 0 : 0),
    0,
  );
  return (base + extra) * 3_600_000;
}

/** Wall-clock booked-end instant (before grace), or null. */
export function rideEndsAtMs(booking) {
  if (!booking) return null;
  if (booking.serviceType && booking.serviceType !== SERVICE_TYPES.HOURLY) {
    return null;
  }
  const startedAtMs = booking.timeline?.startedAt
    ? new Date(booking.timeline.startedAt).getTime()
    : NaN;
  const durationMs = bookedRideDurationMs(booking);
  if (!Number.isFinite(startedAtMs) || durationMs <= 0) return null;
  return startedAtMs + durationMs;
}

/** When auto-complete fires = booked end + extension grace. */
export function rideAutoCompleteAtMs(booking) {
  const endsAt = rideEndsAtMs(booking);
  if (endsAt == null) return null;
  return endsAt + graceMs();
}

export function cancelRideEndSchedule(bookingId) {
  const k = key(bookingId);
  const entry = rideEndTimers.get(k);
  if (entry?.handle) clearTimeout(entry.handle);
  rideEndTimers.delete(k);
}

/**
 * Schedule (or replace) the auto-complete timer for a STARTED hourly
 * booking. Fires after booked end + grace. Safe to call after start
 * and after every accepted extension.
 */
export function scheduleRideEndTimer(booking) {
  if (!booking?._id) return;
  if (booking.status !== BOOKING_STATUS.STARTED) return;

  const autoCompleteAt = rideAutoCompleteAtMs(booking);
  if (autoCompleteAt == null) return;

  cancelRideEndSchedule(booking._id);

  const delay = Math.max(0, autoCompleteAt - Date.now());
  const bookingId = booking._id;
  const handle = setTimeout(
    () =>
      autoCompleteExpiredRide(bookingId).catch((err) =>
        console.warn('[rideEnd] auto-complete failed:', err?.message),
      ),
    delay,
  );
  rideEndTimers.set(key(bookingId), { handle, autoCompleteAt });
}

/**
 * Cold-start / fetch-path resume. Re-attaches the timer when the
 * in-process Map was cleared by a restart.
 */
export function resumeRideEndScheduleIfNeeded(booking) {
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.STARTED) return;
  if (rideEndTimers.has(key(booking._id))) return;
  if (rideAutoCompleteAtMs(booking) == null) return;
  scheduleRideEndTimer(booking);
}

/**
 * Complete a STARTED hourly ride once booked end + grace have elapsed
 * without a further extension. Mirrors `completeTripService`
 * side-effects without the driver auth gate.
 */
async function autoCompleteExpiredRide(bookingId) {
  rideEndTimers.delete(key(bookingId));

  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.STARTED) return;
  if (booking.serviceType !== SERVICE_TYPES.HOURLY) return;

  const autoCompleteAt = rideAutoCompleteAtMs(booking);
  if (autoCompleteAt == null) return;
  // Extension accepted (or clock skew) after we were scheduled —
  // push the timer out.
  if (autoCompleteAt > Date.now() + 1_000) {
    scheduleRideEndTimer(booking);
    return;
  }

  booking.status = BOOKING_STATUS.COMPLETED;
  booking.timeline.completedAt = new Date();

  if (
    booking.paymentMode === PAYMENT_MODE.POST_RIDE &&
    booking.paymentStatus === BOOKING_PAYMENT_STATUS.NOT_DUE_YET
  ) {
    booking.paymentStatus = BOOKING_PAYMENT_STATUS.PENDING;
  }

  await settleWaitingBuffer(booking);
  await clearPendingExtensionsOnTerminate(booking, 'ride_end_auto_complete');
  await booking.save();

  if (booking.driverId) {
    Driver.updateOne({ _id: booking.driverId }, { $set: { isOnTrip: false } }).catch(
      (err) =>
        console.warn(
          '[rideEnd] failed to clear driver.isOnTrip:',
          err?.message,
        ),
    );
  }

  recordCompletedTripPlatformRevenue(booking).catch((err) =>
    console.warn('[rideEnd] revenue write failed:', err?.message),
  );

  const snap = booking.fareSnapshot || {};
  if (snap.couponId) {
    incrementCouponUsageService(snap.couponId).catch((err) =>
      console.warn('[rideEnd] coupon usage increment failed:', err?.message),
    );
  }

  await settleDriverEarning(booking).catch((err) =>
    console.warn('[rideEnd] driver earning settle failed:', err?.message),
  );

  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    reason: 'ride_end_auto_complete',
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);
  if (booking.driverId) {
    emitToDriver(booking.driverId, S2C_EVENTS.BOOKING_UPDATED, payload);
  }

  notifyUserTripCompleted(booking.userId, booking).catch(() => null);

  if (booking.driverId) {
    const earning =
      Number(booking.fareSnapshot?.breakdown?.driverEarning) || 0;
    if (earning > 0) {
      notifyDriverEarningsCredited(booking.driverId, {
        amountRupees: earning,
        bookingId: booking._id,
      }).catch(() => null);
    }
  }
}
