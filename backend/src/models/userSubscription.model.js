import mongoose from 'mongoose';
import {
  SUBSCRIPTION_DISCOUNT_TYPES,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_ASSIGNMENT_STATUS,
  SUBSCRIPTION_CANCEL_REQUEST_STATUS,
} from '../constants/serviceTypes.js';
import { generateSubscriptionNumber } from '../utils/orderNumber.util.js';

const subscriptionPlaceSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, trim: true },
    city: { type: String, default: '', trim: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const userSubscriptionSchema = new mongoose.Schema(
  {
    /** Human-readable subscription ID shown to users/admins (e.g. SUB-20260721-48213). */
    subscriptionNumber: { type: String, unique: true, sparse: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true,
    },
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
      required: true,
      index: true,
    },
    /** The customer's car this dedicated driver subscription covers. */
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Car',
      required: true,
      index: true,
    },
    /** Daily routine pickup for the dedicated driver subscription. */
    dailyPickup: { type: subscriptionPlaceSchema, default: null },
    /** Daily routine drop-off for the dedicated driver subscription. */
    dailyDropoff: { type: subscriptionPlaceSchema, default: null },

    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.PENDING_PAYMENT,
      index: true,
    },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },

    // ── Payment (Razorpay) ──
    /** Total amount the customer paid (base + service charge + GST). */
    amount: { type: Number, required: true, min: 0 },
    basePrice: { type: Number, default: 0, min: 0 },
    couponDiscount: { type: Number, default: 0, min: 0 },
    couponCode: { type: String, default: null, trim: true },
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
    netBasePrice: { type: Number, default: 0, min: 0 },
    serviceCharge: { type: Number, default: 0, min: 0 },
    serviceChargePercent: { type: Number, default: 0, min: 0, max: 100 },
    gstAmount: { type: Number, default: 0, min: 0 },
    gstPercent: { type: Number, default: 0, min: 0, max: 100 },
    platformShareRupees: { type: Number, default: 0, min: 0 },
    driverShareRupees: { type: Number, default: 0, min: 0 },
    platformSharePercent: { type: Number, default: 0, min: 0, max: 100 },
    driverSharePercent: { type: Number, default: 0, min: 0, max: 100 },
    driverSharePaidAt: { type: Date, default: null },
    driverSharePaidTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },
    /** Per-driver stint payouts (pro-rated by working days). */
    driverPayouts: {
      type: [
        new mongoose.Schema(
          {
            driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
            assignedAt: { type: Date, required: true },
            releasedAt: { type: Date, default: null },
            workingDays: { type: Number, required: true, min: 0 },
            amountRupees: { type: Number, required: true, min: 0 },
            paidAt: { type: Date, required: true },
            paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          },
          { _id: true },
        ),
      ],
      default: [],
    },
    razorpayOrderId: { type: String, default: '' },
    razorpayPaymentId: { type: String, default: '' },
    razorpaySignature: { type: String, default: '' },
    paymentMethod: { type: String, default: '' },
    paidAt: { type: Date, default: null },

    // ── Dedicated driver assignment ──
    assignmentStatus: {
      type: String,
      enum: Object.values(SUBSCRIPTION_ASSIGNMENT_STATUS),
      default: SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING,
      index: true,
    },
    assignedDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
      index: true,
    },
    assignedAt: { type: Date, default: null },
    /** Last calendar day this driver is scheduled to work (null → subscription expiry). */
    assignedWorkingEndDate: { type: Date, default: null },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    releasedAt: { type: Date, default: null },
    releaseReason: { type: String, default: '' },
    cancellationSettlement: {
      confirmedAt: { type: Date, default: null },
      confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
    },
    /**
     * User cancel before driver assignment. Present only after a request;
     * status is pending until admin approves (cancel + refund) or rejects.
     */
    cancellationRequest: {
      type: new mongoose.Schema(
        {
          status: {
            type: String,
            enum: Object.values(SUBSCRIPTION_CANCEL_REQUEST_STATUS),
            required: true,
          },
          reason: { type: String, default: '', trim: true, maxlength: 500 },
          requestedAt: { type: Date, default: null },
          reviewedAt: { type: Date, default: null },
          reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
          },
          reviewNote: { type: String, default: '', trim: true, maxlength: 500 },
        },
        { _id: false },
      ),
      default: null,
    },
    /** History of previously-assigned drivers (when reassignment happens). */
    previousAssignments: {
      type: [
        new mongoose.Schema(
          {
            driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
            assignedAt: Date,
            releasedAt: Date,
            releaseReason: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    // ── Plan snapshot (so later plan edits don't retro-affect existing subscribers) ──
    durationMonths: { type: Number, required: true, min: 1 },
    includedHoursPerDay: { type: Number, default: 0, min: 0, max: 24 },
    bookingDiscountType: {
      type: String,
      enum: Object.values(SUBSCRIPTION_DISCOUNT_TYPES),
      default: SUBSCRIPTION_DISCOUNT_TYPES.PERCENTAGE,
    },
    bookingDiscountValue: { type: Number, default: 0, min: 0 },
    bookingDiscountMinAmount: { type: Number, default: 0, min: 0 },
    planNameSnapshot: { type: String, default: '' },

    // ── Terms acceptance at purchase ──
    termsAcceptedAt: { type: Date, default: null },
    termsVersionSnapshot: { type: Number, default: 0, min: 0 },
    termsTitleSnapshot: { type: String, default: '' },
    termsContentSnapshot: { type: String, default: '' },

    /**
     * Open-inbox auto-search for dedicated-driver assignment
     * (same shape as booking.dispatch for scheduled/outstation).
     */
    dispatch: {
      mode: { type: String, default: 'inbox' },
      pendingOfferIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }],
        default: [],
      },
      offers: {
        type: [
          new mongoose.Schema(
            {
              driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
              offeredAt: { type: Date, default: Date.now },
              respondedAt: { type: Date, default: null },
              response: { type: String, default: null },
              distanceMeters: { type: Number, default: null },
            },
            { _id: false },
          ),
        ],
        default: [],
      },
      attemptsCount: { type: Number, default: 0, min: 0 },
      escalateAt: { type: Date, default: null },
      assignmentStartedAt: { type: Date, default: null },
      escalatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

userSubscriptionSchema.pre('validate', function assignSubscriptionNumber(next) {
  if (!this.subscriptionNumber) {
    this.subscriptionNumber = generateSubscriptionNumber();
  }
  next();
});

userSubscriptionSchema.index({ userId: 1, status: 1 });
userSubscriptionSchema.index({ userId: 1, carId: 1, status: 1 });
userSubscriptionSchema.index({ zoneId: 1, status: 1, assignmentStatus: 1 });
userSubscriptionSchema.index({ expiryDate: 1 });
userSubscriptionSchema.index({ assignedDriverId: 1, status: 1, assignmentStatus: 1 });

const UserSubscription =
  mongoose.models.UserSubscription ||
  mongoose.model('UserSubscription', userSubscriptionSchema);

export default UserSubscription;
