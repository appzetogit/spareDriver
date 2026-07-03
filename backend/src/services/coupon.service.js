import Coupon from '../models/coupon.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  COUPON_DISCOUNT_TYPES,
  COUPON_DISCOUNT_TYPE_LIST,
  COUPON_APPLICABLE_SERVICE_LIST,
} from '../constants/couponTypes.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function assertValidApplicableTo(applicableTo) {
  if (!Array.isArray(applicableTo) || applicableTo.length === 0) {
    throw new ApiError(400, 'Select at least one applicable service');
  }
  const unique = [...new Set(applicableTo)];
  for (const svc of unique) {
    if (!COUPON_APPLICABLE_SERVICE_LIST.includes(svc)) {
      throw new ApiError(400, `Invalid applicable service: ${svc}`);
    }
  }
  return unique;
}

function assertDiscountPayload({ discountType, discountValue }) {
  if (!COUPON_DISCOUNT_TYPE_LIST.includes(discountType)) {
    throw new ApiError(400, 'discountType must be percentage or flat');
  }
  const value = Number(discountValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new ApiError(400, 'discountValue must be greater than 0');
  }
  if (discountType === COUPON_DISCOUNT_TYPES.PERCENTAGE && value > 100) {
    throw new ApiError(400, 'Percentage discount cannot exceed 100');
  }
}

export function computeCouponDiscount(rideSubtotal, coupon) {
  if (!coupon) return 0;
  const subtotal = round2(Number(rideSubtotal) || 0);
  if (subtotal <= 0) return 0;

  const minAmount = Number(coupon.minOrderAmount) || 0;
  if (subtotal < minAmount) return 0;

  const value = Number(coupon.discountValue) || 0;
  if (value <= 0) return 0;

  let discount =
    coupon.discountType === COUPON_DISCOUNT_TYPES.PERCENTAGE
      ? (subtotal * value) / 100
      : value;

  const maxCap = Number(coupon.maxDiscountAmount) || 0;
  if (maxCap > 0 && coupon.discountType === COUPON_DISCOUNT_TYPES.PERCENTAGE) {
    discount = Math.min(discount, maxCap);
  }

  return Math.min(round2(discount), subtotal);
}

function assertCouponUsable(coupon, { serviceType } = {}) {
  if (!coupon) throw new ApiError(404, 'Invalid coupon code');
  if (!coupon.isActive) throw new ApiError(400, 'This coupon is no longer active');
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    throw new ApiError(400, 'This coupon has expired');
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    throw new ApiError(400, 'This coupon has reached its usage limit');
  }
  if (serviceType && !coupon.applicableTo.includes(serviceType)) {
    throw new ApiError(400, 'This coupon is not valid for this service');
  }
}

export const listCouponsService = async ({ onlyActive = false } = {}) => {
  const filter = onlyActive ? { isActive: true } : {};
  return Coupon.find(filter).sort({ createdAt: -1 });
};

export const createCouponService = async (body, staffId = null) => {
  const code = normalizeCode(body.code);
  if (!code) throw new ApiError(400, 'Coupon code is required');

  const existing = await Coupon.findOne({ code });
  if (existing) throw new ApiError(409, 'A coupon with this code already exists');

  assertDiscountPayload(body);
  const applicableTo = assertValidApplicableTo(body.applicableTo);

  return Coupon.create({
    code,
    description: String(body.description || '').trim(),
    discountType: body.discountType,
    discountValue: Number(body.discountValue),
    applicableTo,
    isActive: body.isActive !== false,
    minOrderAmount: Math.max(0, Number(body.minOrderAmount) || 0),
    maxDiscountAmount: Math.max(0, Number(body.maxDiscountAmount) || 0),
    maxUses: body.maxUses != null && body.maxUses !== '' ? Number(body.maxUses) : null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    createdBy: staffId,
  });
};

export const updateCouponService = async (id, body) => {
  const coupon = await Coupon.findById(id);
  if (!coupon) throw new ApiError(404, 'Coupon not found');

  if (body.code != null) {
    const code = normalizeCode(body.code);
    if (!code) throw new ApiError(400, 'Coupon code is required');
    const clash = await Coupon.findOne({ code, _id: { $ne: id } });
    if (clash) throw new ApiError(409, 'A coupon with this code already exists');
    coupon.code = code;
  }

  if (body.discountType != null || body.discountValue != null) {
    assertDiscountPayload({
      discountType: body.discountType ?? coupon.discountType,
      discountValue: body.discountValue ?? coupon.discountValue,
    });
    if (body.discountType != null) coupon.discountType = body.discountType;
    if (body.discountValue != null) coupon.discountValue = Number(body.discountValue);
  }

  if (body.applicableTo != null) {
    coupon.applicableTo = assertValidApplicableTo(body.applicableTo);
  }

  if (body.description != null) coupon.description = String(body.description).trim();
  if (body.isActive != null) coupon.isActive = !!body.isActive;
  if (body.minOrderAmount != null) {
    coupon.minOrderAmount = Math.max(0, Number(body.minOrderAmount) || 0);
  }
  if (body.maxDiscountAmount != null) {
    coupon.maxDiscountAmount = Math.max(0, Number(body.maxDiscountAmount) || 0);
  }
  if (body.maxUses !== undefined) {
    coupon.maxUses = body.maxUses != null && body.maxUses !== '' ? Number(body.maxUses) : null;
  }
  if (body.expiresAt !== undefined) {
    coupon.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  }

  await coupon.save();
  return coupon;
};

export const deleteCouponService = async (id) => {
  const deleted = await Coupon.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Coupon not found');
};

export const resolveCouponByCodeService = async (code, { serviceType } = {}) => {
  const normalized = normalizeCode(code);
  if (!normalized) return null;

  const coupon = await Coupon.findOne({ code: normalized });
  if (!coupon) throw new ApiError(404, 'Invalid coupon code');

  assertCouponUsable(coupon, { serviceType });
  return coupon;
};

export const validateCouponService = async ({ code, serviceType, subtotal = 0 }) => {
  const coupon = await resolveCouponByCodeService(code, { serviceType });
  const rideSubtotal = round2(Number(subtotal) || 0);
  const minAmount = Number(coupon.minOrderAmount) || 0;
  if (minAmount > 0 && rideSubtotal > 0 && rideSubtotal < minAmount) {
    throw new ApiError(
      400,
      `Minimum order amount of ₹${minAmount} required for this coupon`,
    );
  }
  const discountAmount = computeCouponDiscount(rideSubtotal, coupon);
  return {
    coupon: {
      _id: coupon._id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      applicableTo: coupon.applicableTo,
      description: coupon.description,
    },
    discountAmount,
  };
};

export const incrementCouponUsageService = async (couponId) => {
  if (!couponId) return;
  await Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: 1 } });
};
