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
  notifyUserRideEndingSoon,
  notifyDriverEarningsCredited,
} from '../utils/notificationDispatch.js';

/**
 * Hourly / scheduled-hourly ride-end auto-complete + extend nudge.
 *
 * After `startedAt + (durationHours + accepted extensions)` the
 * customer gets `RIDE_END_EXTENSION_GRACE_SECONDS` (default 10 min) to
 * extend. If they don't, the ride auto-completes — same settlement
 * path as a normal driver complete.
 *
 * `EXTENSION_PROMPT_LEAD_SECONDS` before booked end we also push
 * "Ride ending soon — do you want to extend?" so backgrounded clients
 * still get a chance to open the extend flow.
 *
 * In-process timers (same trade-off as no-show / payment timeout):
 * a restart drops them; `resumeRideEndScheduleIfNeeded` re-attaches
 * from booking fetch paths.
 */

/** bookingId → { handle, autoCompleteAt, promptHandle, endsAt } */
const rideEndTimers = new Map();

/**
 * Ends-at timestamps we already nudged for (avoids duplicate FCM when
 * scheduleRideEndTimer is re-entered for the same booked window).
 * Cleared when the booked end moves (accepted extension) or the trip ends.
 */
const promptSentForEndsAt = new Map();

function key(id) {
  return String(id);
}

const graceMs = () =>
  Math.max(0, Number(PAYMENT_POLICY.RIDE_END_EXTENSION_GRACE_SECONDS) || 0) *
  1000;

const promptLeadMs = () =>
  Math.max(0, Number(PAYMENT_POLICY.EXTENSION_PROMPT_LEAD_SECONDS) || 0) *
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

/** When the extend push should fire = booked end − lead time. */
export function rideExtensionPromptAtMs(booking) {
  const endsAt = rideEndsAtMs(booking);
  if (endsAt == null) return null;
  return endsAt - promptLeadMs();
}

/** When auto-complete fires = booked end + extension grace. */
export function rideAutoCompleteAtMs(booking) {
  const endsAt = rideEndsAtMs(booking);
  if (endsAt == null) return null;
  return endsAt + graceMs();
}

function clearPromptHandle(entry) {
  if (entry?.promptHandle) clearTimeout(entry.promptHandle);
  if (entry) entry.promptHandle = null;
}

export function cancelRideEndSchedule(bookingId) {
  const k = key(bookingId);
  const entry = rideEndTimers.get(k);
  if (entry?.handle) clearTimeout(entry.handle);
  clearPromptHandle(entry);
  rideEndTimers.delete(k);
  promptSentForEndsAt.delete(k);
}

function scheduleExtensionPrompt(booking, entry) {
  const endsAt = rideEndsAtMs(booking);
  const promptAt = rideExtensionPromptAtMs(booking);
  if (endsAt == null || promptAt == null) return;

  clearPromptHandle(entry);

  // Booked window moved (extension paid) — allow a fresh nudge.
  const sentFor = promptSentForEndsAt.get(key(booking._id));
  if (sentFor != null && sentFor !== endsAt) {
    promptSentForEndsAt.delete(key(booking._id));
  }

  // Past auto-complete — nothing useful to nudge about.
  const autoCompleteAt = rideAutoCompleteAtMs(booking);
  if (autoCompleteAt != null && autoCompleteAt <= Date.now()) return;

  const delay = Math.max(0, promptAt - Date.now());
  const bookingId = booking._id;
  entry.promptHandle = setTimeout(
    () =>
      sendRideEndingSoonPrompt(bookingId).catch((err) =>
        console.warn('[rideEnd] extension prompt failed:', err?.message),
      ),
    delay,
  );
  entry.endsAt = endsAt;
}

/**
 * Push + socket nudge so the customer can open the extend flow even
 * when the app is backgrounded (or the local timer was missed).
 */
async function sendRideEndingSoonPrompt(bookingId) {
  const k = key(bookingId);
  const entry = rideEndTimers.get(k);
  if (entry) entry.promptHandle = null;

  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.STARTED) return;
  if (booking.serviceType !== SERVICE_TYPES.HOURLY) return;

  const endsAt = rideEndsAtMs(booking);
  const promptAt = rideExtensionPromptAtMs(booking);
  if (endsAt == null || promptAt == null) return;

  // Extension accepted after we were scheduled — push the nudge out.
  if (promptAt > Date.now() + 1_000) {
    if (entry) scheduleExtensionPrompt(booking, entry);
    else scheduleRideEndTimer(booking);
    return;
  }

  const autoCompleteAt = rideAutoCompleteAtMs(booking);
  if (autoCompleteAt != null && autoCompleteAt <= Date.now()) return;

  if (promptSentForEndsAt.get(k) === endsAt) return;
  promptSentForEndsAt.set(k, endsAt);

  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    endsAt: new Date(endsAt).toISOString(),
    graceSeconds: Number(PAYMENT_POLICY.RIDE_END_EXTENSION_GRACE_SECONDS) || 0,
  };

  notifyUserRideEndingSoon(booking.userId, booking).catch(() => null);
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_EXTENSION_OFFERED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_EXTENSION_OFFERED, payload);
}

/**
 * Schedule (or replace) the auto-complete timer for a STARTED hourly
 * booking. Fires after booked end + grace. Also arms the extend push
 * at lead-time before booked end. Safe to call after start and after
 * every accepted extension.
 */
export function scheduleRideEndTimer(booking) {
  if (!booking?._id) return;
  if (booking.status !== BOOKING_STATUS.STARTED) return;

  const autoCompleteAt = rideAutoCompleteAtMs(booking);
  if (autoCompleteAt == null) return;

  const k = key(booking._id);
  const prev = rideEndTimers.get(k);
  if (prev?.handle) clearTimeout(prev.handle);
  clearPromptHandle(prev);

  const delay = Math.max(0, autoCompleteAt - Date.now());
  const bookingId = booking._id;
  const handle = setTimeout(
    () =>
      autoCompleteExpiredRide(bookingId).catch((err) =>
        console.warn('[rideEnd] auto-complete failed:', err?.message),
      ),
    delay,
  );
  const entry = { handle, autoCompleteAt, promptHandle: null, endsAt: null };
  rideEndTimers.set(k, entry);
  scheduleExtensionPrompt(booking, entry);
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
  const k = key(bookingId);
  const entry = rideEndTimers.get(k);
  clearPromptHandle(entry);
  rideEndTimers.delete(k);
  promptSentForEndsAt.delete(k);

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
