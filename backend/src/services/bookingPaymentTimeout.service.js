import Booking from '../models/booking.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  PAYMENT_POLICY,
} from '../constants/bookingStatus.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToDriver,
  emitToBooking,
  emitToAdmins,
} from '../utils/socketEmitters.js';

/**
 * Payment auto-cancel timer.
 *
 * After a driver accepts an offer the booking is parked in `awaiting_payment`
 * and the customer has `PAYMENT_POLICY.PAYMENT_DEADLINE_SECONDS` to settle the
 * fare. If that window elapses without a successful Razorpay verification we:
 *
 *   1. Flip the booking to `cancelled` with `reason = 'payment_timeout'`.
 *   2. Reset the assigned driver's `isOnTrip` flag so the dispatcher can
 *      hand them their next offer.
 *   3. Broadcast `BOOKING_UPDATED` so both the user (toast + redirect) and
 *      the driver (toast + redirect) can react.
 *
 * The timer lives in-process in `paymentTimers` (Map). A server restart
 * drops outstanding timers; the next request that touches an
 * `awaiting_payment` booking will trip the deadline check below and clean
 * up. This is the same trade-off the dispatcher's wave timer makes.
 */

/** bookingId → setTimeout handle. */
const paymentTimers = new Map();

function key(bookingId) {
  return String(bookingId);
}

/**
 * Cancel any timer registered against `bookingId`. No-op if none exists.
 * Safe to call from every cancel / verify / cleanup path.
 */
export function cancelPaymentTimeout(bookingId) {
  const handle = paymentTimers.get(key(bookingId));
  if (handle) {
    clearTimeout(handle);
    paymentTimers.delete(key(bookingId));
  }
}

/**
 * Register a `PAYMENT_DEADLINE_SECONDS` timer for the booking. Replaces any
 * pre-existing timer for the same booking so calling this multiple times
 * is safe (idempotent semantics).
 */
export function schedulePaymentTimeout(bookingId) {
  schedulePaymentTimeoutForMs(bookingId, PAYMENT_POLICY.PAYMENT_DEADLINE_SECONDS * 1000);
}

/**
 * Lower-level variant that accepts a custom duration. Used internally when
 * a retry has pushed the on-booking deadline forward — we re-arm a timer
 * with the remaining milliseconds rather than the static
 * `PAYMENT_DEADLINE_SECONDS` constant.
 */
export function schedulePaymentTimeoutForMs(bookingId, durationMs) {
  cancelPaymentTimeout(bookingId);
  const ms = Math.max(1000, durationMs);
  const handle = setTimeout(() => {
    handlePaymentTimeoutService(bookingId).catch((err) => {
      console.warn(
        '[bookingPaymentTimeout] handler failed for',
        String(bookingId),
        '-',
        err?.message,
      );
    });
  }, ms);
  paymentTimers.set(key(bookingId), handle);
}

/**
 * Free the driver assigned to this booking. Defensive — failure is logged
 * but never thrown so the cancel/timeout path keeps unwinding.
 */
async function releaseDriverFromBooking(driverId) {
  if (!driverId) return;
  try {
    await Driver.updateOne({ _id: driverId }, { $set: { isOnTrip: false } });
  } catch (err) {
    console.warn(
      '[bookingPaymentTimeout] failed to clear driver.isOnTrip:',
      err?.message,
    );
  }
}

/**
 * Auto-cancel handler. Called by the timer above (and reusable from any
 * route that wants to force the cancel synchronously — e.g. an admin hook).
 *
 * Idempotent: it bails out cleanly if the booking has already moved off
 * `awaiting_payment` (paid, cancelled by another path, etc.).
 */
export async function handlePaymentTimeoutService(bookingId) {
  cancelPaymentTimeout(bookingId);
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) return null;
  if (booking.status !== BOOKING_STATUS.AWAITING_PAYMENT) {
    return booking.toObject();
  }
  if (booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID) {
    // Edge case: payment landed at the same tick as the timer. Nothing to do.
    return booking.toObject();
  }

  // The deadline may have been pushed forward by a recent Pay Now retry
  // (createBookingPaymentOrderService refreshes it). Honour the latest
  // deadline rather than blindly cancelling — if there's still time left
  // we re-arm the timer and bail.
  const deadline = booking.timeline?.paymentDeadlineAt;
  if (deadline) {
    const msUntilDeadline = new Date(deadline).getTime() - Date.now();
    if (msUntilDeadline > 1000) {
      schedulePaymentTimeoutForMs(bookingId, msUntilDeadline);
      return booking.toObject();
    }
  }

  const driverId = booking.driverId;

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.paymentStatus = BOOKING_PAYMENT_STATUS.FAILED;
  booking.cancellation = {
    reason: 'payment_timeout',
    cancelledBy: 'system',
    feeCharged: 0,
    refundAmount: 0,
  };
  booking.timeline.cancelledAt = new Date();
  booking.driverId = null;
  // Clear out any half-created Razorpay order so we don't try to reuse it.
  if (booking.razorpay) {
    booking.razorpay = {
      orderId: null,
      paymentId: null,
      signature: null,
      amountPaise: null,
    };
  }
  await booking.save();

  await releaseDriverFromBooking(driverId);

  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    cancellation: booking.cancellation,
    timeline: booking.timeline?.toObject?.() || booking.timeline,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
  if (driverId) {
    emitToDriver(driverId, S2C_EVENTS.BOOKING_UPDATED, payload);
  }
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);

  return booking.toObject();
}

/**
 * Re-export so cancel paths (user/driver/admin) can share the same driver-
 * release helper without forcing every caller to import the Driver model.
 */
export { releaseDriverFromBooking };
