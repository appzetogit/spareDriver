import mongoose from 'mongoose';
import {
  COUPON_DISCOUNT_TYPES,
  COUPON_DISCOUNT_TYPE_LIST,
  COUPON_APPLICABLE_SERVICE_LIST,
} from '../constants/couponTypes.js';

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: { type: String, default: '', trim: true },
    discountType: {
      type: String,
      enum: COUPON_DISCOUNT_TYPE_LIST,
      required: true,
    },
    discountValue: { type: Number, required: true, min: 0 },
    /** Which booking/purchase types this coupon works on (one, two, or all). */
    applicableTo: {
      type: [{ type: String, enum: COUPON_APPLICABLE_SERVICE_LIST }],
      validate: {
        validator(v) {
          return Array.isArray(v) && v.length >= 1;
        },
        message: 'At least one applicable service is required',
      },
    },
    isActive: { type: Boolean, default: true, index: true },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    /** Caps percentage discounts (ignored for flat). */
    maxDiscountAmount: { type: Number, default: 0, min: 0 },
    maxUses: { type: Number, default: null, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

couponSchema.index({ isActive: 1, expiresAt: 1 });

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
