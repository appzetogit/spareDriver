import mongoose from 'mongoose';
import User from '../models/user.model.js';
import WalletTransaction, {
  WALLET_TXN_DIRECTION,
  WALLET_TXN_SOURCE,
  WALLET_TXN_STATUS,
} from '../models/walletTransaction.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayKeyId,
  verifyRazorpayPaymentSignature,
} from '../utils/razorpay.js';

/**
 * User wallet service.
 *
 * Single chokepoint for every balance mutation. The pattern is always:
 *
 *   1. Atomic `User.findOneAndUpdate({ _id, balance >= amount }, $inc)`
 *      so we never let a wallet go negative even under concurrent debits.
 *   2. Write a `WalletTransaction` row capturing `balanceAfter` so the
 *      ledger renders without re-deriving from history.
 *
 * Top-ups are split into two RPCs (`createTopupOrder` returns a Razorpay
 * order; `verifyTopupPayment` validates the signature, fetches the
 * captured payment's `fee`, and credits only the **net** amount). The
 * two-step shape mirrors the booking-payment flow so the FE checkout
 * helper is reusable as-is.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const toPaise = (rupees) => Math.round(Number(rupees) * 100);

const MIN_TOPUP_RUPEES = 10;
const MAX_TOPUP_RUPEES = 100_000;

function ensurePositive(amount, label = 'amount') {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ApiError(400, `${label} must be a positive number`);
  }
  return round2(n);
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export async function getWalletService(userId) {
  if (!userId) throw new ApiError(400, 'userId is required');
  const user = await User.findById(userId).select('wallet name').lean();
  if (!user) throw new ApiError(404, 'User not found');
  const wallet = user.wallet || {
    balance: 0,
    totalCredited: 0,
    totalSpent: 0,
    heldRupees: 0,
    currency: 'INR',
  };
  const balance = round2(wallet.balance || 0);
  const heldRupees = round2(wallet.heldRupees || 0);
  return {
    balance,
    heldRupees,
    // Spendable balance for new bookings / top-down debits. The held
    // portion is locked against active bookings' waiting buffers.
    availableRupees: round2(Math.max(0, balance - heldRupees)),
    totalCredited: round2(wallet.totalCredited || 0),
    totalSpent: round2(wallet.totalSpent || 0),
    currency: wallet.currency || 'INR',
  };
}

export async function listWalletTransactionsService(userId, { page = 1, limit = 20 } = {}) {
  if (!userId) throw new ApiError(400, 'userId is required');
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const filter = { userId };
  const [transactions, total] = await Promise.all([
    WalletTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    WalletTransaction.countDocuments(filter),
  ]);
  return { transactions, total, page: safePage, limit: safeLimit };
}

/* ------------------------------------------------------------------ */
/* Atomic mutations                                                    */
/* ------------------------------------------------------------------ */

/**
 * Credit `amount` rupees to the user's wallet and log a ledger entry.
 *
 *   @param {object} params
 *   @param {string|ObjectId} params.userId
 *   @param {number}          params.amount        rupees (positive)
 *   @param {string}          params.source        WALLET_TXN_SOURCE.*
 *   @param {string}          [params.description]
 *   @param {string}          [params.refType]
 *   @param {string|ObjectId} [params.refId]
 *   @param {object}          [params.razorpay]    top-up metadata
 *   @param {string|ObjectId} [params.initiatedBy] admin id (if applicable)
 *
 * Returns the persisted WalletTransaction document.
 */
export async function creditWalletService({
  userId,
  amount,
  source,
  description = '',
  refType = '',
  refId = '',
  razorpay = null,
  initiatedBy = null,
}) {
  const amt = ensurePositive(amount, 'amount');
  if (!Object.values(WALLET_TXN_SOURCE).includes(source)) {
    throw new ApiError(400, 'Invalid wallet transaction source');
  }

  // Atomic + race-safe: increment balance and lifetime credit counter.
  const updated = await User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    { $inc: { 'wallet.balance': amt, 'wallet.totalCredited': amt } },
    { new: true, projection: { wallet: 1 } },
  );
  if (!updated) throw new ApiError(404, 'User not found');

  return WalletTransaction.create({
    userId,
    direction: WALLET_TXN_DIRECTION.CREDIT,
    amountRupees: amt,
    balanceAfter: round2(updated.wallet?.balance || 0),
    source,
    description: description ? String(description).slice(0, 280) : '',
    refType: refType || '',
    refId: refId ? String(refId) : '',
    razorpay: razorpay || undefined,
    status: WALLET_TXN_STATUS.SUCCESS,
    initiatedBy: initiatedBy || null,
  }).then(async (txn) => {
    const { notifyUserWalletCredited } = await import('../utils/notificationDispatch.js');
    notifyUserWalletCredited(userId, {
      amountRupees: amt,
      source,
      description,
    }).catch(() => null);
    return txn;
  });
}

/**
 * Debit `amount` rupees from the user's wallet if and only if the
 * available balance covers it. Returns the persisted WalletTransaction
 * document.
 *
 * "Available" = `balance − heldRupees`. The held portion is locked
 * against active bookings' waiting-charge buffer and cannot be spent on
 * anything else. The settle path (`settleWaitingBuffer`) bypasses this
 * check via `bypassHeld: true` because it is precisely the operation
 * that turns held funds into a real debit.
 *
 * Throws `ApiError(402, 'Insufficient wallet balance', { ... })` with
 * `{ requiredAmount, walletBalance, availableRupees, heldRupees,
 * shortBy }` in `data` when the available balance is too low — the FE
 * uses this to prompt a top-up of exactly the right amount and explain
 * the held portion.
 */
export async function debitWalletService({
  userId,
  amount,
  source,
  description = '',
  refType = '',
  refId = '',
  initiatedBy = null,
  /**
   * If true, the held portion of the wallet is treated as spendable for
   * this debit. Used by the waiting-buffer settlement path which is
   * authorised to convert a previously-held amount into a real debit.
   * Defaults to false so all other paths honour the hold.
   */
  bypassHeld = false,
}) {
  const amt = ensurePositive(amount, 'amount');
  if (!Object.values(WALLET_TXN_SOURCE).includes(source)) {
    throw new ApiError(400, 'Invalid wallet transaction source');
  }

  // Atomic guard. Two modes:
  //   bypassHeld=false (default): require balance − heldRupees ≥ amt so
  //                               the held portion is protected.
  //   bypassHeld=true:            require balance ≥ amt (raw). The
  //                               waiting-buffer settle uses this.
  //
  // MongoDB lacks a native `$expr` in update filters across versions
  // we support, so we use a small server-side guard re-read on the
  // bypassHeld=false path.
  let updated = null;
  if (bypassHeld) {
    updated = await User.findOneAndUpdate(
      { _id: userId, isDeleted: false, 'wallet.balance': { $gte: amt } },
      { $inc: { 'wallet.balance': -amt, 'wallet.totalSpent': amt } },
      { new: true, projection: { wallet: 1 } },
    );
  } else {
    // Atomic-with-condition using $expr — supported since MongoDB 4.2.
    updated = await User.findOneAndUpdate(
      {
        _id: userId,
        isDeleted: false,
        $expr: {
          $gte: [
            { $subtract: ['$wallet.balance', { $ifNull: ['$wallet.heldRupees', 0] }] },
            amt,
          ],
        },
      },
      { $inc: { 'wallet.balance': -amt, 'wallet.totalSpent': amt } },
      { new: true, projection: { wallet: 1 } },
    );
  }

  if (!updated) {
    const wallet = await getWalletService(userId).catch(() => null);
    const balance = wallet?.balance || 0;
    const heldRupees = wallet?.heldRupees || 0;
    const availableRupees = wallet?.availableRupees || 0;
    throw new ApiError(402, 'Insufficient wallet balance', {
      requiredAmount: amt,
      walletBalance: round2(balance),
      heldRupees: round2(heldRupees),
      availableRupees: round2(availableRupees),
      shortBy: round2(Math.max(0, amt - availableRupees)),
    });
  }

  return WalletTransaction.create({
    userId,
    direction: WALLET_TXN_DIRECTION.DEBIT,
    amountRupees: amt,
    balanceAfter: round2(updated.wallet?.balance || 0),
    source,
    description: description ? String(description).slice(0, 280) : '',
    refType: refType || '',
    refId: refId ? String(refId) : '',
    status: WALLET_TXN_STATUS.SUCCESS,
    initiatedBy: initiatedBy || null,
  }).then(async (txn) => {
    const { notifyUserWalletDebited } = await import('../utils/notificationDispatch.js');
    notifyUserWalletDebited(userId, {
      amountRupees: amt,
      source,
      description,
    }).catch(() => null);
    return txn;
  });
}

/**
 * Soft-hold `amount` rupees on the user's wallet. The balance is NOT
 * decremented — only `heldRupees` goes up, which makes `debitWalletService`
 * refuse other spends that would dip into the held portion.
 *
 * Used at booking creation to reserve the waiting-charge buffer without
 * pre-charging the customer. Released by `releaseWalletHoldService` (on
 * cancel) or by the settle path (which consumes part of the hold as a
 * real debit and releases the rest).
 *
 * Throws `ApiError(402, ...)` with the same shape as `debitWalletService`
 * when there isn't enough available balance to cover the hold.
 *
 * No WalletTransaction is written for holds — they're transient (no
 * actual money movement). The booking's `waiting.bufferRupees` field is
 * the authoritative record of what's held against which booking.
 */
export async function holdWalletService({ userId, amount }) {
  const amt = ensurePositive(amount, 'amount');
  const updated = await User.findOneAndUpdate(
    {
      _id: userId,
      isDeleted: false,
      $expr: {
        $gte: [
          { $subtract: ['$wallet.balance', { $ifNull: ['$wallet.heldRupees', 0] }] },
          amt,
        ],
      },
    },
    { $inc: { 'wallet.heldRupees': amt } },
    { new: true, projection: { wallet: 1 } },
  );
  if (!updated) {
    const wallet = await getWalletService(userId).catch(() => null);
    const balance = wallet?.balance || 0;
    const heldRupees = wallet?.heldRupees || 0;
    const availableRupees = wallet?.availableRupees || 0;
    throw new ApiError(402, 'Insufficient wallet balance to reserve waiting buffer', {
      requiredAmount: amt,
      walletBalance: round2(balance),
      heldRupees: round2(heldRupees),
      availableRupees: round2(availableRupees),
      shortBy: round2(Math.max(0, amt - availableRupees)),
    });
  }
  return {
    balance: round2(updated.wallet?.balance || 0),
    heldRupees: round2(updated.wallet?.heldRupees || 0),
  };
}

/**
 * Release a previously-held amount back to spendable. Idempotent under
 * `Math.max(0, ...)` — if the wallet has somehow drifted (e.g. an admin
 * adjusted heldRupees manually) we never let the counter go negative.
 *
 * `amount` is rupees-to-release. Returning a positive number is fine
 * but uncommon; the standard pattern is release-what-you-held.
 */
export async function releaseWalletHoldService({ userId, amount }) {
  const amt = ensurePositive(amount, 'amount');
  // Clamp at the current heldRupees so we never go negative even if the
  // caller asks to release more than is held.
  const updated = await User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    [
      {
        $set: {
          'wallet.heldRupees': {
            $max: [0, { $subtract: [{ $ifNull: ['$wallet.heldRupees', 0] }, amt] }],
          },
        },
      },
    ],
    { new: true, projection: { wallet: 1 } },
  );
  if (!updated) return null;
  return {
    balance: round2(updated.wallet?.balance || 0),
    heldRupees: round2(updated.wallet?.heldRupees || 0),
  };
}

/* ------------------------------------------------------------------ */
/* Razorpay top-up                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create a Razorpay order so the user can top-up the wallet by `amount`
 * rupees. Logs a PENDING transaction we'll flip to SUCCESS the moment
 * `verifyTopupPaymentService` validates the signature.
 *
 * The pending row lets us reconcile via the Razorpay dashboard if the
 * client never returns — the admin can complete the top-up later.
 */
export async function createTopupOrderService(userId, amount) {
  const amt = ensurePositive(amount, 'amount');
  if (amt < MIN_TOPUP_RUPEES) {
    throw new ApiError(400, `Minimum top-up is \u20B9${MIN_TOPUP_RUPEES}`);
  }
  if (amt > MAX_TOPUP_RUPEES) {
    throw new ApiError(400, `Maximum top-up is \u20B9${MAX_TOPUP_RUPEES}`);
  }

  const user = await User.findById(userId).select('name email phone_no').lean();
  if (!user) throw new ApiError(404, 'User not found');

  const amountPaise = toPaise(amt);
  const order = await createRazorpayOrder({
    amountPaise,
    receipt: `wt_${String(userId).slice(-12)}_${Date.now().toString(36).slice(-4)}`,
    notes: {
      userId: String(userId),
      purpose: 'wallet_topup',
    },
  });

  // Persist the intent so we can re-credit reliably on verify. We do
  // NOT touch the balance here — only verifyTopupPaymentService does.
  await WalletTransaction.create({
    userId,
    direction: WALLET_TXN_DIRECTION.CREDIT,
    amountRupees: amt,
    balanceAfter: 0, // unknown until the credit lands
    source: WALLET_TXN_SOURCE.TOPUP,
    description: `Wallet top-up \u2014 Razorpay order ${order.id}`,
    refType: 'RazorpayOrder',
    refId: order.id,
    razorpay: {
      orderId: order.id,
      amountPaise,
    },
    status: WALLET_TXN_STATUS.PENDING,
  });

  return {
    keyId: getRazorpayKeyId(),
    orderId: order.id,
    amount: amountPaise,
    currency: 'INR',
    name: 'SpareDriver',
    description: `Wallet top-up \u20B9${amt}`,
    prefill: {
      name: user.name || '',
      email: user.email || '',
      contact: user.phone_no ? String(user.phone_no) : '',
    },
  };
}

/**
 * Validate a Razorpay payment signature, mark the matching PENDING
 * transaction as SUCCESS, and atomically credit the wallet with the
 * **full** amount the user topped up (e.g. ₹500 in → ₹500 credited).
 *
 * Razorpay’s gateway fee is absorbed by the platform — it is stored on
 * the transaction for reconciliation but is NOT deducted from the
 * user’s wallet balance.
 *
 * Idempotent: if the order has already been credited (matching SUCCESS
 * row exists) we no-op and return the latest balance.
 */
export async function verifyTopupPaymentService(userId, { orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'orderId, paymentId and signature are required');
  }

  const ok = verifyRazorpayPaymentSignature({ orderId, paymentId, signature });
  if (!ok) {
    await WalletTransaction.updateOne(
      { userId, 'razorpay.orderId': orderId, status: WALLET_TXN_STATUS.PENDING },
      { $set: { status: WALLET_TXN_STATUS.FAILED, description: 'Signature verification failed' } },
    );
    throw new ApiError(400, 'Payment signature verification failed');
  }

  const pending = await WalletTransaction.findOne({
    userId,
    'razorpay.orderId': orderId,
    source: WALLET_TXN_SOURCE.TOPUP,
  }).sort({ createdAt: -1 });

  if (!pending) {
    throw new ApiError(404, 'Top-up order not found');
  }

  // Already credited? Just return the current balance.
  if (pending.status === WALLET_TXN_STATUS.SUCCESS) {
    const wallet = await getWalletService(userId);
    return { wallet, transaction: pending.toObject(), alreadyCredited: true };
  }

  let payment;
  try {
    payment = await fetchRazorpayPayment(paymentId);
  } catch (err) {
    throw new ApiError(
      502,
      err?.message || 'Could not fetch payment details from Razorpay. Please retry.',
    );
  }

  if (payment.order_id && payment.order_id !== orderId) {
    throw new ApiError(400, 'Payment does not belong to this top-up order');
  }

  const status = String(payment.status || '').toLowerCase();
  if (status !== 'captured' && status !== 'authorized') {
    throw new ApiError(400, `Payment is not successful (status: ${status || 'unknown'})`);
  }

  const grossPaise = Math.max(
    0,
    Number(payment.amount) || Number(pending.razorpay?.amountPaise) || toPaise(pending.amountRupees),
  );
  // Kept for admin reconciliation only — never subtracted from credit.
  const feePaise = Math.max(0, Number(payment.fee) || 0);
  const taxPaise = Math.max(0, Number(payment.tax) || 0);
  // Full top-up amount lands in the wallet (platform absorbs gateway fee).
  const orderedRupees = round2(Number(pending.amountRupees) || 0);
  const paidRupees = round2(grossPaise / 100);
  const amt = orderedRupees > 0 ? orderedRupees : paidRupees;

  if (amt <= 0) {
    throw new ApiError(400, 'Top-up amount is zero');
  }

  const grossRupees = paidRupees;
  const feeRupees = round2(feePaise / 100);

  const updated = await User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    { $inc: { 'wallet.balance': amt, 'wallet.totalCredited': amt } },
    { new: true, projection: { wallet: 1 } },
  );
  if (!updated) throw new ApiError(404, 'User not found');

  pending.status = WALLET_TXN_STATUS.SUCCESS;
  pending.amountRupees = amt;
  pending.balanceAfter = round2(updated.wallet?.balance || 0);
  pending.description = `Wallet top-up \u20B9${amt}`;
  pending.razorpay = {
    ...(pending.razorpay?.toObject?.() || pending.razorpay || {}),
    paymentId,
    signature,
    amountPaise: grossPaise,
    feePaise,
    taxPaise,
    // netAmountPaise = credited amount (full top-up; fee not deducted)
    netAmountPaise: toPaise(amt),
  };
  await pending.save();

  // Full snapshot (balance + held + available) so the client never
  // flashes gross balance as "available" after a top-up.
  const wallet = await getWalletService(userId);

  return {
    wallet,
    transaction: pending.toObject(),
    alreadyCredited: false,
    creditedRupees: amt,
    feeRupees,
    grossRupees,
  };
}

export const WALLET_LIMITS = Object.freeze({
  MIN_TOPUP_RUPEES,
  MAX_TOPUP_RUPEES,
});
