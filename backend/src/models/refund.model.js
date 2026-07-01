import mongoose from 'mongoose';

/**
 * Refund ledger.
 *
 * Every cancellation that returns money to the customer lands here as
 * its own document — one Refund per Razorpay refund attempt. The admin
 * "Account → Refunds" page reads this collection directly and the
 * cancellation services append to it. Booking + payment-source ids are
 * indexed so the admin can also see the full history per booking.
 *
 * Status machine:
 *
 *   pending  → created, Razorpay call in-flight (or queued for retry).
 *   processed → Razorpay accepted and returned a refund id.
 *   failed   → Razorpay rejected the call (logged in `error`); admin can
 *              retry manually.
 *
 * `amountRupees` is what we owe the customer; `cancellationFeeRupees`
 * is the platform's retention (= paid × userCancellationFeePercent).
 * Refunds are NOT issued automatically: an admin reviews the entry on
 * the "Account → Refunds" page, processes the refund manually on the
 * Razorpay dashboard, then flips the status from `pending` → `processed`
 * (capturing the gateway refund id) or → `failed` with a note.
 */

const REFUND_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PROCESSED: 'processed',
  FAILED: 'failed',
});

const REFUND_INITIATED_BY = Object.freeze({
  USER: 'user',
  DRIVER: 'driver',
  SYSTEM: 'system',
  ADMIN: 'admin',
});

const refundSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    bookingNumber: { type: String, default: '', trim: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /** What we'll pay back to the customer (₹). */
    amountRupees: { type: Number, required: true, min: 0 },
    /**
     * Cancellation fee retained by the platform (₹). Computed as
     * `paid × ServicePricing.cancellation.userCancellationFeePercent`.
     * Same admin-tunable percentage applies pre- and post-STARTED.
     */
    cancellationFeeRupees: { type: Number, default: 0, min: 0 },
    /** What the customer actually paid before the cancellation. */
    grossPaidRupees: { type: Number, default: 0, min: 0 },

    /** Razorpay payment id we're refunding against. */
    razorpayPaymentId: { type: String, default: '', trim: true, index: true },
    /** Razorpay-issued refund id (populated once `status === processed`). */
    razorpayRefundId: { type: String, default: '', trim: true },

    status: {
      type: String,
      enum: Object.values(REFUND_STATUS),
      default: REFUND_STATUS.PENDING,
      index: true,
    },
    initiatedBy: {
      type: String,
      enum: Object.values(REFUND_INITIATED_BY),
      default: REFUND_INITIATED_BY.SYSTEM,
    },
    reason: { type: String, default: '', trim: true },
    /** Free-form note from Razorpay when the refund call fails. */
    error: { type: String, default: '', trim: true },

    /** Audit timestamps complementing `timestamps: true`. */
    processedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },

    /** Optional cross-link to our internal `Payment` doc (kit/booking). */
    paymentRefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
  },
  { timestamps: true },
);

refundSchema.index({ status: 1, createdAt: -1 });

const Refund = mongoose.models.Refund || mongoose.model('Refund', refundSchema);

export { REFUND_STATUS, REFUND_INITIATED_BY };
export default Refund;
