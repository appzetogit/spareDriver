import mongoose from 'mongoose';
import { PAYMENT_PROVIDER, PAYMENT_PURPOSE } from '../constants/kitStatus.js';

/**
 * Payment / online transaction ledger.
 *
 * Razorpay-mediated charges (kit, subscription, booking, wallet top-up)
 * land here with order/payment/signature ids so Account → Online
 * Transactions can reconcile against the Razorpay dashboard.
 *
 * Internal wallet credits (trip_fare / allowance / waiting) also use
 * this collection with `provider: wallet` — those are NOT online
 * gateway rows.
 */

const paymentSchema = new mongoose.Schema(
  {
    provider: { type: String, default: PAYMENT_PROVIDER.RAZORPAY },
    purpose: {
      type: String,
      enum: Object.values(PAYMENT_PURPOSE),
      required: true,
    },
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    referenceModel: { type: String, default: 'KitOrder' },

    razorpayOrderId: { type: String, default: '', index: true },
    /** Only set after successful Razorpay payment — never store empty string */
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },

    // `min: 0` rather than `min: 1` because internal wallet credits
    // (trip-fare / allowance settlements) can validly be sub-rupee on
    // tiny fares — and even if they aren't, the upstream guards
    // already filter zero-rupee rows out before we ever get here.
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'failed', 'refunded'],
      default: 'created',
    },
    method: { type: String, default: '' },
    failureReason: { type: String, default: '' },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
      index: true,
    },

    /**
     * Free-form payload for internal book-keeping. Used by the
     * driver-earnings settlement (`completeTripService`) to stamp the
     * fare-share / allowance-share split, the originating booking
     * number, service type, and the breakdown components on the
     * ledger row so admin audits don't have to re-derive any math.
     * Razorpay-mediated rows may store fee/tax/reference labels here.
     */
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

/** One row per kit / subscription / wallet-topup reference. */
paymentSchema.index(
  { referenceId: 1, referenceModel: 1 },
  {
    unique: true,
    partialFilterExpression: {
      referenceModel: { $in: ['KitOrder', 'UserSubscription', 'WalletTransaction'] },
    },
  },
);

paymentSchema.index(
  { razorpayPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      razorpayPaymentId: { $exists: true, $type: 'string', $gt: '' },
    },
  },
);

paymentSchema.index({ provider: 1, createdAt: -1 });
paymentSchema.index({ purpose: 1, status: 1, createdAt: -1 });

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
export default Payment;
