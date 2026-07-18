import mongoose from 'mongoose';

/**
 * User wallet ledger.
 *
 * Every credit/debit against `User.wallet.balance` writes a document
 * here so the user (and admins) get an authoritative, auditable history
 * of where every rupee went. The matching balance mutation on User and
 * the row write in this collection both happen inside
 * `services/wallet.service.js` — never write to one without the other.
 *
 *   direction: 'credit' (money in) | 'debit' (money out)
 *   source:    where the money came from / went to
 *   refType / refId: optional pointer to the entity that triggered the
 *                    txn (Booking, Razorpay order id, etc.)
 *
 * `balanceAfter` is captured at write time so the FE list can render a
 * running balance without re-deriving from history.
 */

export const WALLET_TXN_DIRECTION = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit',
});

export const WALLET_TXN_SOURCE = Object.freeze({
  /** Razorpay top-up from the user. */
  TOPUP: 'topup',
  /** Admin manually credited the wallet (compensation, goodwill). */
  ADMIN_CREDIT: 'admin_credit',
  /** Admin manually debited the wallet (correction). */
  ADMIN_DEBIT: 'admin_debit',
  /** Debit when a booking is paid for from the wallet. */
  BOOKING_PAYMENT: 'booking_payment',
  /** Credit when a booking is refunded back into the wallet. */
  BOOKING_REFUND: 'booking_refund',
  /** Refund issued because no drivers were found / system cancel. */
  BOOKING_NO_DRIVERS_REFUND: 'booking_no_drivers_refund',
  /**
   * Debit for the actual waiting time accrued at pickup. Cuts from the
   * portion the wallet held aside at booking creation; the unused part
   * of that hold is simply released (no ledger row needed).
   */
  WAITING_CHARGE: 'waiting_charge',
  /**
   * @deprecated Pre-hold model only — the buffer is no longer collected
   * upfront, so no refund txn is written. Kept in the enum for back-compat
   * with any pre-hold bookings that may still be in flight.
   */
  WAITING_BUFFER_REFUND: 'waiting_buffer_refund',
  /** Debit when an extension fareDelta is paid from the wallet. */
  BOOKING_EXTENSION_PAYMENT: 'booking_extension_payment',
  /** Credit for a cancellation fee being waived (rare; admin-driven). */
  CANCELLATION_FEE_WAIVED: 'cancellation_fee_waived',
});

export const WALLET_TXN_STATUS = Object.freeze({
  SUCCESS: 'success',
  PENDING: 'pending',
  FAILED: 'failed',
});

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    direction: {
      type: String,
      enum: Object.values(WALLET_TXN_DIRECTION),
      required: true,
    },
    amountRupees: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },

    source: {
      type: String,
      enum: Object.values(WALLET_TXN_SOURCE),
      required: true,
    },
    description: { type: String, default: '', trim: true, maxlength: 280 },

    /** Optional cross-link to the entity that caused this txn. */
    refType: {
      type: String,
      enum: ['Booking', 'RazorpayOrder', 'Admin', ''],
      default: '',
    },
    refId: { type: String, default: '', trim: true, index: true },

    /** Razorpay specifics for top-ups (kept lean — full record is on the order). */
    razorpay: {
      orderId: { type: String, default: '', trim: true, index: true },
      paymentId: { type: String, default: '', trim: true },
      signature: { type: String, default: '', trim: true },
      /** Gross amount the user paid (paise). */
      amountPaise: { type: Number, default: 0, min: 0 },
      /** Razorpay platform fee including GST (paise). Deducted before credit. */
      feePaise: { type: Number, default: 0, min: 0 },
      /** GST component of the fee (paise); informational — already inside feePaise. */
      taxPaise: { type: Number, default: 0, min: 0 },
      /** Net credited = amountPaise − feePaise. */
      netAmountPaise: { type: Number, default: 0, min: 0 },
    },

    status: {
      type: String,
      enum: Object.values(WALLET_TXN_STATUS),
      default: WALLET_TXN_STATUS.SUCCESS,
      index: true,
    },

    /** Admin who initiated an `admin_credit` / `admin_debit`. */
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ source: 1, status: 1 });

const WalletTransaction =
  mongoose.models.WalletTransaction ||
  mongoose.model('WalletTransaction', walletTransactionSchema);

export default WalletTransaction;
