import Booking from '../models/booking.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  createRazorpayOrder,
  getRazorpayKeyId,
  verifyRazorpayPaymentSignature,
} from '../utils/razorpay.js';
import {
  BOOKING_STATUS,
  PAYMENT_MODE,
  PAYMENT_POLICY,
  BOOKING_PAYMENT_STATUS,
} from '../constants/bookingStatus.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToDriver,
  emitToBooking,
  emitToAdmins,
} from '../utils/socketEmitters.js';
import {
  effectiveTotalForBooking,
  amountDueForBooking,
} from './bookingExtension.service.js';
import {
  cancelPaymentTimeout,
  schedulePaymentTimeout,
} from './bookingPaymentTimeout.service.js';

/**
 * Razorpay integration for bookings.
 *
 * The pre-pay flow happens AFTER the driver accepts (state: AWAITING_PAYMENT).
 * The post-pay flow happens AFTER the trip completes (Phase 5 calls these
 * same helpers). The service stays mode-agnostic — whoever calls it is
 * responsible for the surrounding state machine.
 *
 * Two ways to enter:
 *   1. user taps "Pay now" → controller calls `createBookingPaymentOrderService`
 *   2. checkout completes → controller calls `verifyBookingPaymentService`
 */

const toPaise = (rupees) => Math.round(rupees * 100);

/**
 * Create (or re-use) a Razorpay order for the booking. Idempotent on the
 * Razorpay side too: if we already have an open order we just return the
 * existing handle so the user can retry checkout without billing chaos.
 *
 * The charged amount is `amountDueForBooking(booking)` — i.e.
 *   effectiveTotal (base + extensions) − alreadyPaid
 *
 * Composes correctly across the upfront-pay → extend → settle lifecycle:
 * every order charges only what's still outstanding.
 */
export async function createBookingPaymentOrderService(userId, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, userId, isDeleted: false });
  if (!booking) throw new ApiError(404, 'Booking not found');

  // Valid windows to charge:
  //   1. Pre-pay during AWAITING_PAYMENT (initial Pay Now flow).
  //   2. Post-pay after COMPLETED (settle the bill).
  //   3. Mid-ride extension delta if the user has already pre-paid the base.
  const isPrePayWindow =
    booking.paymentMode === PAYMENT_MODE.PRE_RIDE &&
    booking.status === BOOKING_STATUS.AWAITING_PAYMENT;
  const isPostPayWindow = booking.status === BOOKING_STATUS.COMPLETED;
  if (!isPrePayWindow && !isPostPayWindow) {
    throw new ApiError(400, 'Payment is not due at this stage');
  }

  const chargeable = amountDueForBooking(booking);
  if (chargeable <= 0) {
    // Nothing to collect — make sure paymentStatus reflects that and bail.
    if (booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID) {
      booking.paymentStatus = BOOKING_PAYMENT_STATUS.PAID;
      await booking.save();
    }
    throw new ApiError(400, 'Nothing left to pay for this booking');
  }
  const amountPaise = toPaise(chargeable);
  let orderId = booking.razorpay?.orderId;

  if (!orderId || booking.razorpay?.amountPaise !== amountPaise) {
    const order = await createRazorpayOrder({
      amountPaise,
      receipt: `bk_${booking._id.toString().slice(-12)}_${Date.now().toString(36).slice(-4)}`,
      notes: { bookingId: String(booking._id), bookingNumber: booking.bookingNumber },
    });
    orderId = order.id;
    booking.razorpay = {
      ...(booking.razorpay?.toObject?.() || booking.razorpay || {}),
      orderId,
      amountPaise,
      paymentId: null,
      signature: null,
    };
    booking.paymentStatus = BOOKING_PAYMENT_STATUS.PENDING;
  }

  // Bump the attempt counter + reset the pay-first deadline on every Pay
  // Now click. If the customer is mid-payment when the original deadline
  // expires (e.g. first attempt failed and they retry with 3s left), we
  // give them a fresh PAYMENT_DEADLINE_SECONDS so they can finish.
  // Post-COMPLETED post-pay attempts don't have a hard deadline so we
  // only refresh it inside the pre-pay window.
  if (isPrePayWindow) {
    const ledger = booking.payment?.toObject?.() || booking.payment || {};
    booking.payment = {
      ...ledger,
      attempts: (ledger.attempts || 0) + 1,
    };
    const refreshedDeadline = new Date(
      Date.now() + PAYMENT_POLICY.PAYMENT_DEADLINE_SECONDS * 1000,
    );
    booking.timeline.paymentDeadlineAt = refreshedDeadline;
    await booking.save();
    schedulePaymentTimeout(booking._id);

    emitPaymentDeadlineRefreshed(booking);
  } else {
    await booking.save();
  }

  return {
    keyId: getRazorpayKeyId(),
    orderId,
    amount: amountPaise,
    currency: 'INR',
    name: 'SpareDriver',
    description: `Booking ${booking.bookingNumber}`,
    bookingId: String(booking._id),
    effectiveTotal: effectiveTotalForBooking(booking),
    paymentDeadlineAt: booking.timeline?.paymentDeadlineAt || null,
  };
}

/**
 * Broadcast a minimal `BOOKING_UPDATED` patch carrying the new deadline.
 * The user UI and the driver overlay both key their countdown off
 * `timeline.paymentDeadlineAt`, so a refresh on retry has to be advertised
 * over the wire — otherwise the countdown would freeze at the original
 * deadline even though the server has extended the clock.
 */
function emitPaymentDeadlineRefreshed(booking) {
  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    timeline: booking.timeline?.toObject?.() || booking.timeline,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
  if (booking.driverId) {
    emitToDriver(booking.driverId, S2C_EVENTS.BOOKING_UPDATED, payload);
  }
}

/**
 * Verify the Razorpay signature returned by the checkout modal. On success
 * we credit the booking's payment ledger and flip the booking into the
 * appropriate next state.
 *
 * The ledger update is what makes the prepay-discount-then-extend flow
 * compose: the first successful pre-pay locks in the discount; later
 * extension payments charge only the delta the ledger says is outstanding.
 */
export async function verifyBookingPaymentService(userId, bookingId, { orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'orderId, paymentId and signature are required');
  }

  const booking = await Booking.findOne({ _id: bookingId, userId, isDeleted: false });
  if (!booking) throw new ApiError(404, 'Booking not found');

  if (booking.razorpay?.orderId !== orderId) {
    throw new ApiError(400, 'Order ID mismatch');
  }

  const ok = verifyRazorpayPaymentSignature({ orderId, paymentId, signature });
  if (!ok) {
    booking.paymentStatus = BOOKING_PAYMENT_STATUS.FAILED;
    await booking.save();
    throw new ApiError(400, 'Payment signature verification failed');
  }

  const chargedRupees = (booking.razorpay?.amountPaise || 0) / 100;
  const wasPrePay =
    booking.paymentMode === PAYMENT_MODE.PRE_RIDE &&
    booking.status === BOOKING_STATUS.AWAITING_PAYMENT;

  booking.razorpay.paymentId = paymentId;
  booking.razorpay.signature = signature;
  booking.timeline.paymentReceivedAt = new Date();

  // Credit the ledger before recomputing dueness.
  const ledger = booking.payment?.toObject?.() || booking.payment || {};
  booking.payment = {
    ...ledger,
    amountPaidRupees: Number(((ledger.amountPaidRupees || 0) + chargedRupees).toFixed(2)),
  };

  // Did this payment clear the booking?
  const remaining = amountDueForBooking(booking);
  booking.paymentStatus =
    remaining <= 0 ? BOOKING_PAYMENT_STATUS.PAID : BOOKING_PAYMENT_STATUS.PENDING;

  // Pre-pay window → unlock the ride for the driver only once fully cleared.
  if (wasPrePay && remaining <= 0) {
    booking.status = BOOKING_STATUS.DRIVER_ASSIGNED;
    // Settled within the deadline — kill the auto-cancel timer so the
    // booking can proceed to the trip flow without interruption.
    cancelPaymentTimeout(booking._id);
  }

  await booking.save();

  try {
    const { upsertRazorpayPaymentRecord } = await import('./onlineTransaction.service.js');
    const { PAYMENT_PURPOSE } = await import('../constants/kitStatus.js');
    await upsertRazorpayPaymentRecord({
      purpose: PAYMENT_PURPOSE.BOOKING,
      referenceId: booking._id,
      referenceModel: 'Booking',
      userId: booking.userId,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      amountRupees: chargedRupees,
      status: 'captured',
      meta: {
        bookingNumber: booking.bookingNumber || '',
        amountPaise: booking.razorpay?.amountPaise || 0,
      },
      matchBy: 'paymentId',
    });
  } catch {
    /* ledger write is best-effort — booking payment already succeeded */
  }

  const userPayload = {
    bookingId: String(booking._id),
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    paymentMode: booking.paymentMode,
  };
  const roomPayload = {
    bookingId: String(booking._id),
    status: booking.status,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, userPayload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, roomPayload);
  if (booking.driverId) {
    emitToDriver(booking.driverId, S2C_EVENTS.BOOKING_UPDATED, roomPayload);
  }
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, userPayload);

  return booking.toObject();
}
