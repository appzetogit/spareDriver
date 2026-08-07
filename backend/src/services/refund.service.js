import Refund, {
  REFUND_STATUS,
  REFUND_INITIATED_BY,
  REFUND_KIND,
  REFUND_SUBJECT_TYPE,
  REFUND_PAYOUT_METHOD,
} from '../models/refund.model.js';
import Booking from '../models/booking.model.js';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  notifyUserRefundInitiated,
  notifyUserRefundApproved,
  notifyUserRefundProcessed,
  notifyUserRefundRejected,
  notifyAdminRefundRequest,
} from '../utils/notificationDispatch.js';
import { BOOKING_PAYMENT_STATUS } from '../constants/bookingStatus.js';
import { creditWalletService, getWalletService } from './wallet.service.js';
import { WALLET_TXN_SOURCE } from '../models/walletTransaction.model.js';
import {
  creditDriverWalletService,
  getDriverWalletService,
} from './driverWallet.service.js';
import { recordPlatformRevenueDebit } from './platformRevenue.service.js';

/**
 * Booking refund pipeline.
 *
 * Wallet-paid cancellations credit the customer immediately and write a
 * Refund row marked `processed` (automatic). Legacy Razorpay-paid
 * cancellations write a `pending` row; an admin moves the money on the
 * Razorpay dashboard and marks it `processed` / `failed` from Account →
 * Refunds. Admin-created manual refunds also land here.
 *
 *   1. `computeRefundAmount(booking, policy)` — pure helper returning
 *      `{ amountRupees, cancellationFeeRupees, grossPaidRupees }` using
 *
 *        refund = paid − (paid × userCancellationFeePercent / 100)
 *
 *      The retained portion (the cancellation fee) stays with the
 *      platform.
 *
 *   2. `issueBookingRefundService(booking, options)` — creates the
 *      Refund ledger entry. Pass `autoProcessed: true` after a wallet
 *      credit so the admin history shows automatic refunds. Idempotent:
 *      returns the existing pending / processed refund if one already
 *      exists for the booking.
 *
 *   3. `listRefundsService(query)` — paginated admin list with filters.
 *
 *   4. `updateRefundStatusService(refundId, payload, admin)` — admin
 *      marks a refund as `processed` (with an optional Razorpay refund
 *      id captured from the dashboard) or `failed` (with an error note).
 *      Flips `booking.paymentStatus → REFUNDED` only when transitioning
 *      to `processed`.
 *
 * For wallet auto-refunds, `paymentStatus` is flipped by the cancel
 * service itself; for Razorpay it waits until step 4.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Compute the rupee breakdown for refunding a booking. Pure — does not
 * touch the DB or Razorpay. Returns zeros for unpaid bookings.
 *
 * The deduction is the admin-configured user cancellation fee
 * (`policy.userCancellationFeePercent`), applied to the paid amount.
 * The same percentage is used whether the booking was cancelled before
 * or after the trip started — admin tweaks the value in the pricing
 * editor.
 */
export function computeRefundAmount(booking, policy = {}) {
  const paid = round2(Number(booking?.payment?.amountPaidRupees) || 0);
  if (paid <= 0) {
    return {
      grossPaidRupees: 0,
      cancellationFeeRupees: 0,
      amountRupees: 0,
    };
  }
  const feePercent = Math.max(
    0,
    Math.min(100, Number(policy?.userCancellationFeePercent) || 0),
  );
  const rawFee = (paid * feePercent) / 100;
  const fee = Math.min(round2(rawFee), paid);
  const refund = Math.max(0, round2(paid - fee));
  return {
    grossPaidRupees: paid,
    cancellationFeeRupees: round2(fee),
    amountRupees: refund,
  };
}

/**
 * Persist a Refund document — used internally by the cancellation
 * services. Exported for admin tooling that wants to materialise a
 * record without going through a booking cancellation.
 *
 * `meta.autoProcessed` — wallet refunds that already credited the
 * customer. Written as `processed` so admin history shows both
 * automatic and manual refunds in one ledger.
 */
async function createRefundRecord(booking, breakdown, meta) {
  const autoProcessed = !!meta?.autoProcessed;
  const payoutMethod =
    meta?.payoutMethod ||
    (autoProcessed
      ? REFUND_PAYOUT_METHOD.WALLET
      : REFUND_PAYOUT_METHOD.BANK_ACCOUNT);
  const walletTxId = meta?.walletTxId ? String(meta.walletTxId) : '';

  return Refund.create({
    kind: REFUND_KIND.BOOKING_CANCELLATION,
    bookingId: booking._id,
    bookingNumber: booking.bookingNumber || '',
    userId: booking.userId,
    amountRupees: breakdown.amountRupees,
    cancellationFeeRupees: breakdown.cancellationFeeRupees,
    grossPaidRupees: breakdown.grossPaidRupees,
    razorpayPaymentId: booking.razorpay?.paymentId || '',
    payoutMethod,
    status: autoProcessed ? REFUND_STATUS.PROCESSED : REFUND_STATUS.PENDING,
    initiatedBy: meta?.initiatedBy || REFUND_INITIATED_BY.SYSTEM,
    reason: meta?.reason || '',
    processedAt: autoProcessed ? new Date() : null,
    transactionDetails: autoProcessed
      ? {
          mode: 'wallet',
          transactionId: walletTxId,
          notes: 'Automatic wallet credit',
        }
      : {},
  });
}

/**
 * Find an in-flight or successful refund for this booking. We guard
 * against double-recording by treating any non-failed record as the
 * "active" one — the admin can manually create a follow-up only by
 * marking the existing one as failed first.
 */
async function findActiveRefund(bookingId) {
  return Refund.findOne({
    bookingId,
    status: { $in: [REFUND_STATUS.PENDING, REFUND_STATUS.APPROVED, REFUND_STATUS.PROCESSED] },
  }).sort({ createdAt: -1 });
}

/**
 * Record a refund request for a cancelled booking.
 *
 *   @param {object} booking            Mongoose doc / POJO
 *   @param {object} options
 *   @param {string} options.initiatedBy  one of REFUND_INITIATED_BY
 *   @param {string} options.reason       free-form reason
 *   @param {object} [options.policy]     cancellation policy snapshot;
 *                                        admin-configured fee % is read
 *                                        from here. If omitted, the
 *                                        cancellation breakdown already
 *                                        computed by the caller can be
 *                                        passed via `options.breakdown`.
 *   @param {object} [options.breakdown]  pre-computed
 *                                        `{ amountRupees, cancellationFeeRupees, grossPaidRupees }`.
 *                                        Wins over `options.policy` when
 *                                        present.
 *   @param {boolean} [options.autoProcessed]  true when money was already
 *                                        credited (wallet). Ledger entry
 *                                        is written as `processed`.
 *   @param {string} [options.payoutMethod]   wallet | bank_account
 *   @param {string} [options.walletTxId]  wallet txn id for audit
 *
 * Returns the persisted Refund document. Idempotent: returns an
 * existing non-failed Refund for the same booking instead of creating
 * a duplicate.
 */
export async function issueBookingRefundService(booking, options = {}) {
  if (!booking?._id) throw new ApiError(400, 'Booking is required');

  const breakdown =
    options.breakdown ||
    computeRefundAmount(booking, options.policy || {});
  const autoProcessed = !!options.autoProcessed;

  // Zero-refund: still log a record so the admin audit shows the
  // cancellation was considered, but mark it processed immediately —
  // there's no money to move.
  if (breakdown.amountRupees <= 0) {
    return Refund.create({
      kind: REFUND_KIND.BOOKING_CANCELLATION,
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber || '',
      userId: booking.userId,
      amountRupees: 0,
      cancellationFeeRupees: breakdown.cancellationFeeRupees,
      grossPaidRupees: breakdown.grossPaidRupees,
      razorpayPaymentId: booking.razorpay?.paymentId || '',
      payoutMethod: options.payoutMethod || REFUND_PAYOUT_METHOD.WALLET,
      status: REFUND_STATUS.PROCESSED,
      initiatedBy: options.initiatedBy || REFUND_INITIATED_BY.SYSTEM,
      reason: options.reason || 'no_refund_due',
      processedAt: new Date(),
    });
  }

  const existing = await findActiveRefund(booking._id);
  if (existing) return existing.toObject();

  const refund = await createRefundRecord(booking, breakdown, options);
  if (!autoProcessed) {
    // Manual / Razorpay path — notify pending review. Auto wallet
    // refunds already moved money; skip the pending-admin fan-out.
    notifyUserRefundInitiated(booking.userId, refund).catch(() => null);
    notifyAdminRefundRequest(refund).catch(() => null);
  }
  return refund;
}

/**
 * Admin → update a refund's status manually after they've handled the
 * refund on the Razorpay dashboard (or after they confirm the Razorpay
 * attempt failed).
 *
 *   `processed` — admin moved the money. Optionally captures the
 *                 Razorpay refund id from the dashboard so the audit
 *                 line points back to the gateway transaction. Flips
 *                 `booking.paymentStatus → REFUNDED`.
 *   `failed`    — admin couldn't process the refund (closed account,
 *                 dispute, etc.). Captures an error note.
 *
 * Both transitions are idempotent — repeated PATCHes with the same
 * status replace the metadata but never duplicate the record.
 */
export async function updateRefundStatusService(refundId, payload = {}, admin = null) {
  const refund = await Refund.findById(refundId);
  if (!refund) throw new ApiError(404, 'Refund not found');

  const nextStatus = payload?.status;
  const allowed = [
    REFUND_STATUS.APPROVED,
    REFUND_STATUS.REJECTED,
    REFUND_STATUS.PROCESSED,
    REFUND_STATUS.FAILED,
  ];
  if (!allowed.includes(nextStatus)) {
    throw new ApiError(400, 'status must be "approved", "rejected", "processed", or "failed"');
  }

  const now = new Date();
  refund.status = nextStatus;
  refund.error = [REFUND_STATUS.FAILED, REFUND_STATUS.REJECTED].includes(nextStatus)
    ? String(payload.error || payload.reason || '').slice(0, 500)
    : '';

  if (nextStatus === REFUND_STATUS.APPROVED) {
    refund.approvedAt = now;
    notifyUserRefundApproved(refund.userId, refund).catch(() => null);
  } else if (nextStatus === REFUND_STATUS.REJECTED) {
    refund.rejectedAt = now;
    if (payload.reason) refund.reason = String(payload.reason).slice(0, 500);
    notifyUserRefundRejected(refund.userId, refund).catch(() => null);
  } else if (nextStatus === REFUND_STATUS.PROCESSED) {
    refund.processedAt = now;
    refund.failedAt = null;
    if (payload.razorpayRefundId) {
      refund.razorpayRefundId = String(payload.razorpayRefundId).slice(0, 80);
    }
    // Stash a tiny audit trail of who processed the refund. Optional —
    // the Refund.timestamps already capture `updatedAt`.
    if (admin?._id) {
      refund.reason = refund.reason
        ? `${refund.reason} · processed by ${admin?.name || admin?._id}`
        : `processed by ${admin?.name || admin?._id}`;
    }
    notifyUserRefundProcessed(refund.userId, refund).catch(() => null);
  } else if (nextStatus === REFUND_STATUS.FAILED) {
    refund.failedAt = now;
    refund.processedAt = null;
  }
  await refund.save();

  // Flip the booking's `paymentStatus` only when the money actually moved.
  // Failed refunds keep the booking marked PAID so the admin can retry.
  if (nextStatus === REFUND_STATUS.PROCESSED) {
    await Booking.updateOne(
      { _id: refund.bookingId },
      {
        $set: {
          paymentStatus: BOOKING_PAYMENT_STATUS.REFUNDED,
          ...(refund.razorpayRefundId
            ? { 'razorpay.refundId': refund.razorpayRefundId }
            : {}),
        },
      },
    );
  } else if (refund.bookingId) {
    // Failed → ensure paymentStatus is still PAID (admin may have flipped
    // it earlier accidentally). Safe no-op if it's already PAID.
    await Booking.updateOne(
      { _id: refund.bookingId, paymentStatus: BOOKING_PAYMENT_STATUS.REFUNDED },
      { $set: { paymentStatus: BOOKING_PAYMENT_STATUS.PAID } },
    );
  }

  return refund.toObject();
}

/**
 * Admin list endpoint. Returns `{ refunds, total, page, limit, totals }`
 * where `totals` is a small aggregate summary the admin header card
 * uses for at-a-glance numbers.
 */
export async function listRefundsService({
  page = 1,
  limit = 20,
  status,
  search,
  from,
  to,
} = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);

  const filter = {};
  if (status && Object.values(REFUND_STATUS).includes(status)) {
    filter.status = status;
  }
  if (search) {
    const q = new RegExp(String(search).trim(), 'i');
    filter.$or = [{ bookingNumber: q }, { reason: q }, { 'transactionDetails.transactionId': q }, { 'transactionDetails.utr': q }];
  }
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const [refunds, total, aggregates] = await Promise.all([
    Refund.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate('userId', 'name phone')
      .populate('driverId', 'name phone_no')
      .lean(),
    Refund.countDocuments(filter),
    Refund.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$amountRupees' },
        },
      },
    ]),
  ]);

  const totals = aggregates.reduce(
    (acc, row) => {
      acc.byStatus[row._id] = { count: row.count, amount: row.amount };
      acc.totalAmount += row.amount;
      acc.totalCount += row.count;
      return acc;
    },
    { byStatus: {}, totalAmount: 0, totalCount: 0 },
  );

  return {
    refunds,
    total,
    page: safePage,
    limit: safeLimit,
    totals,
  };
}

/**
 * Fetch wallet snapshot for an admin refund subject (user or driver).
 */
export async function getRefundSubjectWalletService(subjectType, subjectId) {
  if (!Object.values(REFUND_SUBJECT_TYPE).includes(subjectType)) {
    throw new ApiError(400, 'subjectType must be "user" or "driver"');
  }
  if (!subjectId) throw new ApiError(400, 'subjectId is required');

  if (subjectType === REFUND_SUBJECT_TYPE.USER) {
    const user = await User.findById(subjectId).select('name phone_no isDeleted').lean();
    if (!user || user.isDeleted) throw new ApiError(404, 'User not found');
    const wallet = await getWalletService(subjectId);
    return {
      subjectType,
      subjectId,
      name: user.name || '',
      phone: user.phone_no || '',
      wallet,
    };
  }

  const wallet = await getDriverWalletService(subjectId);
  return {
    subjectType,
    subjectId,
    name: wallet.name,
    phone: wallet.phone,
    wallet: {
      balance: wallet.balance,
      totalEarnings: wallet.totalEarnings,
      totalWithdrawn: wallet.totalWithdrawn,
      availableRupees: wallet.balance,
      heldRupees: 0,
      totalCredited: wallet.totalEarnings,
      totalSpent: wallet.totalWithdrawn,
      currency: wallet.currency,
    },
  };
}

/**
 * Admin-initiated manual refund to a user or driver.
 *
 *   wallet       — credits the subject wallet and debits platform revenue.
 *   bank_account — records an off-platform payout; wallet is untouched.
 */
export async function createAdminManualRefundService(payload = {}, admin = null) {
  const {
    subjectType,
    subjectId,
    amountRupees,
    payoutMethod,
    reason,
    transactionDetails = {},
  } = payload;

  if (!Object.values(REFUND_SUBJECT_TYPE).includes(subjectType)) {
    throw new ApiError(400, 'subjectType must be "user" or "driver"');
  }
  if (!Object.values(REFUND_PAYOUT_METHOD).includes(payoutMethod)) {
    throw new ApiError(400, 'payoutMethod must be "wallet" or "bank_account"');
  }

  const amt = round2(Number(amountRupees) || 0);
  if (amt <= 0) throw new ApiError(400, 'amountRupees must be greater than zero');

  const trimmedReason = String(reason || '').trim();
  if (trimmedReason.length < 3) {
    throw new ApiError(400, 'Refund reason is required (min 3 characters)');
  }

  const txnId = String(transactionDetails.transactionId || '').trim();
  const txnUtr = String(transactionDetails.utr || '').trim();
  if (payoutMethod === REFUND_PAYOUT_METHOD.BANK_ACCOUNT && !txnId && !txnUtr) {
    throw new ApiError(400, 'Transaction ID or UTR is required for bank refunds');
  }

  const walletSnapshot = await getRefundSubjectWalletService(subjectType, subjectId);
  const now = new Date();

  const refundDoc = {
    kind: REFUND_KIND.ADMIN_MANUAL,
    subjectType,
    userId: subjectType === REFUND_SUBJECT_TYPE.USER ? subjectId : null,
    driverId: subjectType === REFUND_SUBJECT_TYPE.DRIVER ? subjectId : null,
    bookingNumber: 'ADMIN-REFUND',
    amountRupees: amt,
    grossPaidRupees: amt,
    cancellationFeeRupees: 0,
    payoutMethod,
    status: REFUND_STATUS.PROCESSED,
    initiatedBy: REFUND_INITIATED_BY.ADMIN,
    reason: trimmedReason.slice(0, 500),
    processedAt: now,
    transactionDetails: {
      mode:
        payoutMethod === REFUND_PAYOUT_METHOD.WALLET
          ? 'wallet'
          : String(transactionDetails.mode || '').slice(0, 80),
      transactionId: txnId,
      utr: txnUtr,
      referenceNumber: String(transactionDetails.referenceNumber || '').slice(0, 120),
      notes: String(transactionDetails.notes || '').slice(0, 500),
    },
  };

  const refund = await Refund.create(refundDoc);

  if (payoutMethod === REFUND_PAYOUT_METHOD.WALLET) {
    if (subjectType === REFUND_SUBJECT_TYPE.USER) {
      await creditWalletService({
        userId: subjectId,
        amount: amt,
        source: WALLET_TXN_SOURCE.ADMIN_CREDIT,
        description: `Admin refund — ${trimmedReason.slice(0, 200)}`,
        refType: 'Admin',
        refId: refund._id,
        initiatedBy: admin?._id,
      });
    } else {
      await creditDriverWalletService({
        driverId: subjectId,
        amount: amt,
        refundId: refund._id,
        description: trimmedReason,
        initiatedBy: admin?._id,
      });
    }

    await recordPlatformRevenueDebit({
      amountRupees: amt,
      userId: subjectType === REFUND_SUBJECT_TYPE.USER ? subjectId : null,
      driverId: subjectType === REFUND_SUBJECT_TYPE.DRIVER ? subjectId : null,
      meta: {
        refundId: String(refund._id),
        payoutMethod,
        reason: trimmedReason,
        walletBalanceAtRefund: walletSnapshot.wallet?.balance ?? 0,
      },
    });
  }

  if (subjectType === REFUND_SUBJECT_TYPE.USER) {
    notifyUserRefundProcessed(subjectId, refund).catch(() => null);
  }

  return {
    refund: refund.toObject(),
    wallet: walletSnapshot.wallet,
  };
}

export { REFUND_STATUS, REFUND_INITIATED_BY, REFUND_KIND, REFUND_SUBJECT_TYPE, REFUND_PAYOUT_METHOD };
