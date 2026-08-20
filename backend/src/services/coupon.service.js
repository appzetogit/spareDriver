import Coupon from '../models/coupon.model.js';
import Booking from '../models/booking.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  COUPON_DISCOUNT_TYPES,
  COUPON_DISCOUNT_TYPE_LIST,
  COUPON_APPLICABLE_SERVICE_LIST,
} from '../constants/couponTypes.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';

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

/** Plain pricing fields — Mongoose docs + lean rows both work. */
export function serializeCoupon(coupon) {
  if (!coupon) return null;
  const obj = typeof coupon.toObject === 'function' ? coupon.toObject() : coupon;
  const type = String(obj.discountType || '').trim().toLowerCase();
  const discountType =
    type === 'percent' || type === '%'
      ? COUPON_DISCOUNT_TYPES.PERCENTAGE
      : type;
  return {
    _id: obj._id,
    code: obj.code,
    discountType,
    discountValue: Number(obj.discountValue ?? obj.value ?? obj.amount) || 0,
    minOrderAmount: Number(obj.minOrderAmount) || 0,
    maxDiscountAmount: Number(obj.maxDiscountAmount) || 0,
    applicableTo: Array.isArray(obj.applicableTo) ? obj.applicableTo : [],
    isActive: obj.isActive !== false,
    description: obj.description || '',
    maxUses: obj.maxUses ?? null,
    usedCount: Number(obj.usedCount) || 0,
    expiresAt: obj.expiresAt || null,
  };
}

export function computeCouponDiscount(rideSubtotal, coupon) {
  if (!coupon) return 0;
  const c = serializeCoupon(coupon);
  const subtotal = round2(Number(rideSubtotal) || 0);
  if (subtotal <= 0) return 0;

  const minAmount = Number(c.minOrderAmount) || 0;
  if (subtotal < minAmount) return 0;

  const value = Number(c.discountValue) || 0;
  if (value <= 0) return 0;

  const isPercent = c.discountType === COUPON_DISCOUNT_TYPES.PERCENTAGE;
  let discount = isPercent ? (subtotal * value) / 100 : value;

  const maxCap = Number(c.maxDiscountAmount) || 0;
  if (maxCap > 0 && isPercent) {
    discount = Math.min(discount, maxCap);
  }

  return Math.min(round2(discount), subtotal);
}

/** Reject codes that would stamp as "applied" with a ₹0 discount. */
export function assertCouponDiscountApplies(rideSubtotal, coupon) {
  if (!coupon) return;
  const discount = computeCouponDiscount(rideSubtotal, coupon);
  if (discount > 0) return;
  const c = serializeCoupon(coupon);
  const minAmount = Number(c.minOrderAmount) || 0;
  const subtotal = round2(Number(rideSubtotal) || 0);
  if (minAmount > 0 && subtotal < minAmount) {
    throw new ApiError(
      400,
      `Minimum order amount of ₹${minAmount} required for this coupon`,
    );
  }
  throw new ApiError(400, 'This coupon does not reduce the fare for this booking');
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
  const applicable = Array.isArray(coupon.applicableTo) ? coupon.applicableTo : [];
  if (serviceType && !applicable.includes(serviceType)) {
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

  const coupon = await Coupon.findOne({ code: normalized }).lean();
  if (!coupon) throw new ApiError(404, 'Invalid coupon code');

  const plain = serializeCoupon(coupon);
  assertCouponUsable(plain, { serviceType });
  return plain;
};

export const validateCouponService = async ({ code, serviceType, subtotal = 0 }) => {
  const coupon = await resolveCouponByCodeService(code, { serviceType });
  const rideSubtotal = round2(Number(subtotal) || 0);
  if (rideSubtotal > 0) {
    assertCouponDiscountApplies(rideSubtotal, coupon);
  }
  const discountAmount = computeCouponDiscount(rideSubtotal, coupon);
  return {
    coupon: {
      _id: coupon._id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minOrderAmount: coupon.minOrderAmount,
      maxDiscountAmount: coupon.maxDiscountAmount,
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

/**
 * Redemptions for a coupon: every booking that carried the code, with
 * user/trip context. `countedTowardLimit` is true only for completed
 * trips (matches when usedCount is incremented).
 */
export const getCouponAnalyticsService = async (couponId) => {
  if (!couponId) throw new ApiError(400, 'Coupon id is required');
  const coupon = await Coupon.findById(couponId).lean();
  if (!coupon) throw new ApiError(404, 'Coupon not found');

  const bookings = await Booking.find({
    isDeleted: { $ne: true },
    $or: [
      { 'fareSnapshot.couponId': coupon._id },
      { 'fareSnapshot.couponCode': coupon.code },
    ],
  })
    .select(
      'bookingNumber status serviceType userId driverId fareSnapshot.couponDiscount fareSnapshot.couponCode fareSnapshot.total fareSnapshot.serviceCharge createdAt timeline.completedAt timeline.cancelledAt',
    )
    .populate('userId', 'name email phone_no')
    .populate('driverId', 'name phone')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const redemptions = bookings.map((b) => {
    const counted = b.status === BOOKING_STATUS.COMPLETED;
    return {
      bookingId: b._id,
      bookingNumber: b.bookingNumber,
      status: b.status,
      serviceType: b.serviceType,
      countedTowardLimit: counted,
      couponDiscount: round2(b.fareSnapshot?.couponDiscount || 0),
      couponCode: b.fareSnapshot?.couponCode || coupon.code,
      fareTotal: round2(b.fareSnapshot?.total || 0),
      platformFee: round2(b.fareSnapshot?.serviceCharge || 0),
      createdAt: b.createdAt,
      completedAt: b.timeline?.completedAt || null,
      cancelledAt: b.timeline?.cancelledAt || null,
      user: b.userId
        ? {
            _id: b.userId._id,
            name: b.userId.name || '',
            email: b.userId.email || '',
            phone: b.userId.phone_no || '',
          }
        : null,
      driver: b.driverId
        ? {
            _id: b.driverId._id,
            name: b.driverId.name || '',
            phone: b.driverId.phone || '',
          }
        : null,
    };
  });

  const completed = redemptions.filter((r) => r.countedTowardLimit);
  const absorbedDiscount = round2(
    completed.reduce((sum, r) => sum + (Number(r.couponDiscount) || 0), 0),
  );

  return {
    coupon,
    summary: {
      totalApplications: redemptions.length,
      completedTrips: completed.length,
      cancelledOrUnfulfilled: redemptions.length - completed.length,
      usedCount: coupon.usedCount || 0,
      maxUses: coupon.maxUses,
      absorbedDiscountTotal: absorbedDiscount,
    },
    redemptions,
  };
};
