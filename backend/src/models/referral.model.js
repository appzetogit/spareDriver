import mongoose from 'mongoose';
import {
  REFERRAL_QUALIFICATION,
  REFERRAL_ROLE,
  REFERRAL_STATUS,
} from '../constants/referral.js';

const referralSchema = new mongoose.Schema(
  {
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    referrerRole: {
      type: String,
      enum: Object.values(REFERRAL_ROLE),
      required: true,
      index: true,
    },
    referredId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    referredRole: {
      type: String,
      enum: Object.values(REFERRAL_ROLE),
      required: true,
      index: true,
    },
    referralCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(REFERRAL_STATUS),
      default: REFERRAL_STATUS.PENDING,
      index: true,
    },
    referrerRewardRupees: { type: Number, default: 0, min: 0 },
    referredRewardRupees: { type: Number, default: 0, min: 0 },
    qualificationType: {
      type: String,
      enum: Object.values(REFERRAL_QUALIFICATION),
      required: true,
    },
    minBookingAmountRupees: { type: Number, default: 0, min: 0 },
    requiredCompletedTrips: { type: Number, default: 1, min: 0 },
    completedTripsCount: { type: Number, default: 0, min: 0 },
    qualifiedAt: { type: Date, default: null },
    rewardedAt: { type: Date, default: null },
    qualificationBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    walletTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },
    driverPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
    rejectionReason: { type: String, default: '', trim: true, maxlength: 280 },
  },
  { timestamps: true },
);

referralSchema.index({ referredId: 1, referredRole: 1 }, { unique: true });
referralSchema.index({ referrerId: 1, referrerRole: 1, createdAt: -1 });
referralSchema.index({ status: 1, createdAt: -1 });

const Referral =
  mongoose.models.Referral || mongoose.model('Referral', referralSchema);

export default Referral;
