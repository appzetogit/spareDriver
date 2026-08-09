import Booking, { BOOKING_PAYMENT_METHOD } from '../models/booking.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import ServicePricing from '../models/servicePricing.model.js';
import { BOOKING_STATUS, BOOKING_PAYMENT_STATUS } from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToDriver,
  emitToBooking,
  emitToAdmins,
} from '../utils/socketEmitters.js';
import { notifyUserNoShowPrompt } from '../utils/notificationDispatch.js';
import {
  releaseBookingBufferHold,
  clearPendingExtensionsOnTerminate,
} from './bookingExtension.service.js';
import {
  loadCancellationPolicy,
  splitCancellationFee,
} from './bookingCancellation.service.js';
import {
  issueBookingRefundService,
  REFUND_INITIATED_BY,
  REFUND_PAYOUT_METHOD,
} from './refund.service.js';
import { creditWalletService } from './wallet.service.js';
import { WALLET_TXN_SOURCE } from '../models/walletTransaction.model.js';
import {
  recordPlatformRevenue,
  PLATFORM_REVENUE_SOURCE,
} from './platformRevenue.service.js';
import { releaseDriverFromBooking } from './bookingPaymentTimeout.service.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const clampPct = (n) => Math.max(0, Math.min(100, Number(n) || 0));
const DEFAULT_NOSHOW_FEE_PERCENT = 20;

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
 *     free-wait + `noShowPromptMinutes`. Emits socket + FCM.
 *
 *   PHASE B — close as no-show (no response / "not coming")
 *     Charges the admin-configured flat/% no-show fee (default 20%
 *     of paid), refunds the rest, splits the fee via cancellation
 *     `driverSharePercent`, releases the waiting buffer unused, and
 *     marks the booking CANCELLED with reason `customer_no_show`.
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
 */
export async function schedulePromptTimer(bookingId, arrivedAt = new Date()) {
  cancelNoShowSchedule(bookingId);

  const booking = await Booking.findById(bookingId)
    .select('serviceType status noShow')
    .lean();
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;
  if (isOutstationBooking(booking)) return;

  const policy = await loadWaitingPolicy(booking.serviceType);
  const firedFor = Number(booking.noShow?.firedFor || 0);
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

async function firePrompt(bookingId) {
  noShowTimers.delete(key(bookingId));

  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;
  if (isOutstationBooking(booking)) return;

  const policy = await loadWaitingPolicy(booking.serviceType);
  const firedFor = Number(booking.noShow?.firedFor || 0) + 1;
  const maxPrompts = policy.maxNoShowPrompts;
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
  notifyUserNoShowPrompt(booking.userId, booking, { isFinal: isFinalPrompt }).catch(
    (err) => console.warn('[noShow] prompt push failed:', err?.message),
  );

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

  if (isPastCap) return;
  cancelNoShowSchedule(bookingId);
  await schedulePromptTimer(bookingId, new Date());
}

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
 * Compute the customer no-show fee from waitingCharge knobs.
 * Unset / zero amount → default 20% of paid.
 */
export function computeNoShowFee(paidRupees, waitingPolicy) {
  const paid = round2(Math.max(0, Number(paidRupees) || 0));
  if (paid <= 0) return 0;

  const type =
    waitingPolicy?.noShowFeeType === 'flat' ? 'flat' : 'percentage';
  const configured = Number(waitingPolicy?.noShowFeeAmount);
  const amountSet = Number.isFinite(configured) && configured > 0;

  let raw;
  if (!amountSet) {
    raw = (paid * DEFAULT_NOSHOW_FEE_PERCENT) / 100;
  } else if (type === 'flat') {
    raw = configured;
  } else {
    raw = (paid * clampPct(configured)) / 100;
  }
  return round2(Math.min(round2(raw), paid));
}

/**
 * Close an ARRIVED booking as a customer no-show.
 * Charges configured fee (not full fare), refunds the rest, releases
 * waiting buffer, pays driver their share of the fee only.
 */
async function autoCompleteForNoShow(bookingId) {
  noShowTimers.delete(key(bookingId));

  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;
  if (isOutstationBooking(booking)) return;

  const now = new Date();
  const waitingPolicy = await loadWaitingPolicy(booking.serviceType);
  const cancelPolicy = await loadCancellationPolicy(booking.serviceType);

  const paid = round2(Number(booking?.payment?.amountPaidRupees) || 0);
  const feeCharged = computeNoShowFee(paid, waitingPolicy);
  const refundAmount = round2(Math.max(0, paid - feeCharged));
  const { driverShare, companyShare } = splitCancellationFee(
    feeCharged,
    cancelPolicy,
  );

  const previouslyAssignedDriver = booking.driverId;
  const wasPaid = booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID;
  const paidViaWallet = booking.paymentMethod === BOOKING_PAYMENT_METHOD.WALLET;

  booking.waiting = booking.waiting || {};
  Object.assign(booking.waiting, {
    waitedMinutes: Number(booking.waiting.waitedMinutes) || 0,
    billableMinutes: 0,
    chargeRupees: 0,
    noShow: true,
  });

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancellation = {
    reason: 'customer_no_show',
    cancelledBy: 'system',
    feeCharged,
    refundAmount,
    driverShare,
    companyShare,
    tier: 'hourly_noshow',
    hoursUntilPickup: null,
  };
  booking.timeline = booking.timeline || {};
  booking.timeline.cancelledAt = now;
  if (booking.noShow) {
    booking.noShow.promptDeadlineAt = null;
  }
  booking.dispatch = booking.dispatch || {};
  booking.dispatch.pendingOfferIds = [];
  booking.dispatch.currentExpiresAt = null;
  booking.driverId = null;

  if (wasPaid && paidViaWallet && refundAmount > 0) {
    booking.paymentStatus = BOOKING_PAYMENT_STATUS.REFUNDED;
  } else if (wasPaid && feeCharged >= paid && paid > 0) {
    // Full fee retained — nothing to refund, but fare was paid.
    booking.paymentStatus = BOOKING_PAYMENT_STATUS.PAID;
  }

  await releaseBookingBufferHold(booking);
  await clearPendingExtensionsOnTerminate(booking, 'no_show_auto_complete');
  await booking.save();

  await releaseDriverFromBooking(previouslyAssignedDriver).catch((err) =>
    console.warn('[noShow] release driver failed:', err?.message),
  );
  if (previouslyAssignedDriver) {
    Driver.updateOne(
      { _id: previouslyAssignedDriver },
      { $set: { isOnTrip: false } },
    ).catch((err) =>
      console.warn('[noShow] clear isOnTrip failed:', err?.message),
    );
  }

  let refundRecord = null;
  if (wasPaid && refundAmount > 0) {
    const refundMeta = {
      initiatedBy: REFUND_INITIATED_BY.SYSTEM,
      reason: 'customer_no_show',
      breakdown: {
        amountRupees: refundAmount,
        cancellationFeeRupees: feeCharged,
        grossPaidRupees: paid,
      },
    };
    if (paidViaWallet) {
      try {
        const walletTx = await creditWalletService({
          userId: booking.userId,
          amount: refundAmount,
          source: WALLET_TXN_SOURCE.BOOKING_REFUND,
          description: `Refund — no-show fee ₹${feeCharged} on ${booking.bookingNumber || ''}`.trim(),
          refType: 'Booking',
          refId: String(booking._id),
        });
        refundRecord = await issueBookingRefundService(booking, {
          ...refundMeta,
          autoProcessed: true,
          payoutMethod: REFUND_PAYOUT_METHOD.WALLET,
          walletTxId: walletTx?._id,
        });
      } catch (err) {
        console.warn('[noShow] wallet refund failed:', err?.message);
        refundRecord = await issueBookingRefundService(booking, refundMeta).catch(
          () => null,
        );
      }
    } else {
      refundRecord = await issueBookingRefundService(booking, refundMeta).catch(
        (err) => {
          console.warn('[noShow] refund ledger failed:', err?.message);
          return null;
        },
      );
    }
  } else if (wasPaid && feeCharged > 0) {
    // Fee kept in full — still log a zero-refund audit row.
    refundRecord = await issueBookingRefundService(booking, {
      initiatedBy: REFUND_INITIATED_BY.SYSTEM,
      reason: 'customer_no_show',
      breakdown: {
        amountRupees: 0,
        cancellationFeeRupees: feeCharged,
        grossPaidRupees: paid,
      },
      autoProcessed: true,
    }).catch(() => null);
  }

  if (feeCharged > 0) {
    if (previouslyAssignedDriver && driverShare > 0) {
      try {
        await Driver.updateOne(
          { _id: previouslyAssignedDriver },
          {
            $inc: {
              'wallet.balance': driverShare,
              'wallet.totalEarnings': driverShare,
            },
          },
        );
      } catch (err) {
        console.warn('[noShow] driver fee share credit failed:', err?.message);
      }
    }
    if (companyShare > 0) {
      recordPlatformRevenue({
        source: PLATFORM_REVENUE_SOURCE.CANCELLATION_FEE,
        amountRupees: companyShare,
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber || '',
        serviceType: booking.serviceType || '',
        userId: booking.userId,
        driverId: previouslyAssignedDriver || null,
        meta: {
          feeCharged,
          driverShare,
          companyShare,
          noShow: true,
          noShowFeeType: waitingPolicy.noShowFeeType,
          noShowFeeAmount: waitingPolicy.noShowFeeAmount,
          driverSharePercent: cancelPolicy?.driverSharePercent || 0,
        },
      }).catch((err) =>
        console.warn('[noShow] platform revenue failed:', err?.message),
      );
    }
  }

  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    waiting: booking.waiting,
    cancellation: booking.cancellation,
    timeline: booking.timeline,
    reason: 'customer_no_show',
    refund: refundRecord
      ? {
          status: refundRecord.status,
          amountRupees: refundRecord.amountRupees,
          cancellationFeeRupees: refundRecord.cancellationFeeRupees,
        }
      : {
          amountRupees: refundAmount,
          cancellationFeeRupees: feeCharged,
        },
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);
  if (previouslyAssignedDriver) {
    emitToDriver(previouslyAssignedDriver, S2C_EVENTS.BOOKING_UPDATED, payload);
  }
}

export async function resumeNoShowScheduleIfNeeded(booking) {
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.ARRIVED) return;
  if (isOutstationBooking(booking)) return;
  if (noShowTimers.has(key(booking._id))) return;

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
  await schedulePromptTimer(
    booking._id,
    booking.timeline?.arrivedAt || new Date(),
  );
}

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
    noShowFeeType: w.noShowFeeType === 'flat' ? 'flat' : 'percentage',
    noShowFeeAmount: Math.max(0, Number(w.noShowFeeAmount ?? DEFAULT_NOSHOW_FEE_PERCENT)),
  };
}
