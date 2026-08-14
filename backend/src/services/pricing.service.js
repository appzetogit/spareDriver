import ServicePricing from '../models/servicePricing.model.js';
import SubscriptionPlan from '../models/subscriptionPlan.model.js';
import UserSubscription from '../models/userSubscription.model.js';
import User from '../models/user.model.js';
import Car from '../models/user/car.model.js';
import Zone from '../models/zone.model.js';
import Payment from '../models/payment.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  createRazorpayOrder,
  getRazorpayKeyId,
  verifyRazorpayPaymentSignature,
} from '../utils/razorpay.js';
import {
  SERVICE_TYPES,
  SERVICE_TYPE_LIST,
  SUBSCRIPTION_DISCOUNT_TYPES,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_ASSIGNMENT_STATUS,
  SUBSCRIPTION_CANCEL_REQUEST_STATUS,
} from '../constants/serviceTypes.js';
import {
  PAYMENT_PROVIDER,
  PAYMENT_PURPOSE,
} from '../constants/kitStatus.js';
import { SCHEDULED_BOOKING } from '../constants/bookingStatus.js';
import { isSuperAdmin } from '../constants/staffPermissions.js';
import {
  applyBuffer,
  getDriverConflictMap,
} from './driverConflict.service.js';
import { normaliseOutstationPolicy } from './bookingOutstationCancellation.service.js';
import { normaliseHourlyPolicy } from './bookingCancellation.service.js';
import {
  computeOutstationTripMetrics,
  assertOutstationDaysWithinLimits,
} from '../utils/outstationDuration.js';
import {
  computeOutstationDurationBilling,
  computeOutstationBillingUnits,
  assertOutstationDurationWithinLimits,
} from '../utils/outstationDurationBilling.js';
import {
  OUTSTATION_PRICING_MODEL_CURRENT,
} from '../constants/outstationPricing.js';
import { getActiveLegalDocumentService } from './legalDocument.service.js';
import { sendPushNotification } from './pushNotification.service.js';
import { notifyDriverSubscriptionAssigned } from '../utils/notificationDispatch.js';
import { LEGAL_DOCUMENT_TYPES } from '../models/legalDocument.model.js';
import mongoose from 'mongoose';
import { resolveCarTypeObjectId } from '../utils/carTypeResolve.js';
import {
  computeCouponDiscount,
  resolveCouponByCodeService,
  incrementCouponUsageService,
} from './coupon.service.js';
import { COUPON_APPLICABLE_SERVICES } from '../constants/couponTypes.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ─── Service pricing CRUD ─────────────────────────────────────────────────────

export const listServicePricingsService = async ({ onlyActive = false } = {}) => {
  const filter = onlyActive ? { isActive: true } : {};
  // Hide rows whose serviceType is no longer in the active enum (e.g. legacy point_to_point).
  filter.serviceType = { $in: SERVICE_TYPE_LIST };
  return ServicePricing.find(filter).sort({ sortOrder: 1, createdAt: 1 });
};

export const getServicePricingByTypeService = async (serviceType) => {
  if (!SERVICE_TYPE_LIST.includes(serviceType)) {
    throw new ApiError(400, 'Invalid service type');
  }
  return ServicePricing.findOne({ serviceType });
};

export const upsertServicePricingService = async (data, staffId) => {
  const { serviceType } = data || {};
  if (!SERVICE_TYPE_LIST.includes(serviceType)) {
    throw new ApiError(
      400,
      'serviceType is required and must be one of: ' + SERVICE_TYPE_LIST.join(', '),
    );
  }
  if (!data.name?.trim()) {
    throw new ApiError(400, 'name is required');
  }

  validatePricingForType(serviceType, data);

  const existing = await ServicePricing.findOne({ serviceType });
  if (existing) {
    existing.set({
      ...data,
      updatedBy: staffId || existing.updatedBy,
    });
    await existing.save();
    return existing;
  }
  return ServicePricing.create({
    ...data,
    createdBy: staffId || null,
  });
};

export const updateServicePricingService = async (id, data, staffId) => {
  // Service type cannot be changed once created (unique key).
  if (data.serviceType) delete data.serviceType;

  const existing = await ServicePricing.findById(id);
  if (!existing) throw new ApiError(404, 'Service pricing not found');

  validatePricingForType(existing.serviceType, { ...existing.toObject(), ...data });

  existing.set({ ...data, updatedBy: staffId || null });
  await existing.save();
  return existing;
};

export const deleteServicePricingService = async (id) => {
  const deleted = await ServicePricing.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Service pricing not found');
  return { id };
};

function validatePricingForType(serviceType, data) {
  // Waiting-charge / no-show buffer is a HOURLY-only concept: the
  // driver arrives → waits → bills the customer if they no-show. The
  // outstation flow is scheduled days in advance and has its own
  // time-based cancellation policy (see `cancellation.outstation`), so
  // we skip the cadence validation for it AND force-zero the
  // waitingCharge values so a stale form payload can't sneak a buffer
  // onto an outstation pricing doc.
  if (serviceType === SERVICE_TYPES.HOURLY) {
    validateWaitingCharge(data.waitingCharge);
    validateSlabs(data.slabs);
    validateCustomHours(data.customHours);
    validateHourlyFoodAllowance(data.foodAllowance);
    validateHourlyStayAllowance(data.stayAllowance);
  } else if (serviceType === SERVICE_TYPES.OUTSTATION) {
    data.waitingCharge = ZERO_WAITING_CHARGE();
    const o = data.outstation || {};
    if (o.dailyRate == null || o.dailyRate < 0) {
      throw new ApiError(400, 'Outstation: dailyRate must be a non-negative number');
    }
    if (o.extraHourCharge != null && o.extraHourCharge < 0) {
      throw new ApiError(
        400,
        'Outstation: extraHourCharge must be a non-negative number',
      );
    }
    if (o.foodAllowancePerDay != null && o.foodAllowancePerDay < 0) {
      throw new ApiError(
        400,
        'Outstation: foodAllowancePerDay must be a non-negative number',
      );
    }
    if (o.stayAllowancePerNight != null && o.stayAllowancePerNight < 0) {
      throw new ApiError(
        400,
        'Outstation: stayAllowancePerNight must be a non-negative number',
      );
    }
    if (o.allowancePerNight != null && o.allowancePerNight < 0) {
      throw new ApiError(
        400,
        'Outstation: allowancePerNight must be a non-negative number',
      );
    }
    if (o.minDays && o.maxDays && o.maxDays > 0 && o.maxDays < o.minDays) {
      throw new ApiError(400, 'Outstation: maxDays must be greater than minDays');
    }
    for (const key of [
      'returnReminderMinutes',
      'returnGraceMinutes',
      'returnPromptRepeatMinutes',
      'returnAutoCompleteHours',
    ]) {
      if (o[key] != null && Number(o[key]) < 0) {
        throw new ApiError(400, `Outstation: ${key} must be a non-negative number`);
      }
    }
  }
}

/**
 * Canonical "no waiting buffer" payload used to neutralise the
 * waitingCharge sub-doc for service types that don't have a driver-
 * arrival → wait → bill cycle (currently outstation). Returning a
 * fresh object on each call so callers can mutate freely.
 */
function ZERO_WAITING_CHARGE() {
  return {
    freeWaitingMinutes: 0,
    chargePerMinute: 0,
    noShowPromptMinutes: 0,
    noShowGraceMinutes: 0,
    noShowFeeType: 'percentage',
    noShowFeeAmount: 0,
    maxNoShowPrompts: 0,
    maxBillableMinutes: 0,
  };
}

function validateSlabs(slabs) {
  if (!Array.isArray(slabs) || slabs.length === 0) {
    throw new ApiError(400, 'At least one slab is required for hourly pricing');
  }
  slabs.forEach((s, idx) => {
    if (s.minHours == null || s.maxHours == null) {
      throw new ApiError(400, `Slab #${idx + 1}: minHours and maxHours are required`);
    }
    if (s.maxHours <= s.minHours) {
      throw new ApiError(400, `Slab #${idx + 1}: maxHours must be greater than minHours`);
    }
    if (s.price == null || s.price < 0) {
      throw new ApiError(400, `Slab #${idx + 1}: price must be a non-negative number`);
    }
  });
}

function validateCustomHours(cfg) {
  if (!cfg?.enabled) return;
  if (!cfg.ratePerHour || cfg.ratePerHour <= 0) {
    throw new ApiError(400, 'Custom hours: ratePerHour must be greater than 0');
  }
  if (cfg.maxHours != null && cfg.maxHours < 0) {
    throw new ApiError(400, 'Custom hours: maxHours cannot be negative');
  }
}

function validateHourlyFoodAllowance(cfg) {
  if (!cfg?.enabled) return;
  // Hourly food allowance is no longer charged — only the threshold
  // matters (it controls when the "please provide driver's food"
  // notice fires on the customer UI).
  if (cfg.thresholdHours == null || cfg.thresholdHours <= 0) {
    throw new ApiError(
      400,
      'Food allowance: thresholdHours must be greater than 0',
    );
  }
}

function validateHourlyStayAllowance(cfg) {
  if (!cfg?.enabled) return;
  if (!cfg.amount || cfg.amount < 0) {
    throw new ApiError(400, 'Accommodation allowance: amount must be greater than 0');
  }
  if (cfg.thresholdHours == null || cfg.thresholdHours <= 0) {
    throw new ApiError(
      400,
      'Accommodation allowance: thresholdHours must be greater than 0',
    );
  }
}

/**
 * Enforce the buffer-vs-cadence invariant. The buffer collected at
 * booking creation must always cover the worst-case waiting window the
 * cadence can produce, otherwise the no-show flow could try to settle
 * more than what was pre-collected. The worst case is:
 *
 *   freeWait gone → (maxNoShowPrompts + 1) prompts × promptMinutes
 *                 + 1 final graceMinutes
 *
 * (`freeWaitingMinutes` is excluded because no minute inside it is
 * billable — the cap only has to cover the *billable* tail.)
 */
function validateWaitingCharge(cfg) {
  if (!cfg) return; // Mongoose default kicks in.
  const free = Math.max(0, Number(cfg.freeWaitingMinutes) || 0);
  const perMin = Math.max(0, Number(cfg.chargePerMinute) || 0);
  const promptMins = Math.max(0, Number(cfg.noShowPromptMinutes) || 0);
  const graceMins = Math.max(0, Number(cfg.noShowGraceMinutes) || 0);
  const maxPrompts = Math.max(0, Math.min(5, Number(cfg.maxNoShowPrompts) || 0));
  const maxBillable = Math.max(0, Number(cfg.maxBillableMinutes) || 0);

  if (perMin > 0 && maxBillable <= 0) {
    throw new ApiError(
      400,
      'Waiting charge: maxBillableMinutes must be greater than 0 when chargePerMinute is set',
    );
  }
  const worstCase = (maxPrompts + 1) * promptMins + graceMins;
  if (maxBillable > 0 && maxBillable < worstCase) {
    throw new ApiError(
      400,
      `Waiting charge: maxBillableMinutes (${maxBillable}) must be ≥ ${worstCase} ` +
        `(= (maxNoShowPrompts+1) × noShowPromptMinutes + noShowGraceMinutes) ` +
        'so the pre-collected buffer always covers the worst-case wait.',
    );
  }
  // Sanity: free wait shouldn't dwarf the whole cadence — that produces a
  // free ride that auto-completes without ever reaching the prompt path.
  if (free > 0 && perMin > 0 && maxBillable > 0 && free >= maxBillable + worstCase) {
    throw new ApiError(
      400,
      'Waiting charge: freeWaitingMinutes is larger than the entire billable window — adjust the cadence.',
    );
  }
}

// ─── Subscription plans CRUD ──────────────────────────────────────────────────

function validateSubscriptionPlanFields(data) {
  const platform = Number(data.platformSharePercent ?? 50);
  const driver = Number(data.driverSharePercent ?? 50);
  if (platform < 0 || driver < 0 || platform > 100 || driver > 100) {
    throw new ApiError(400, 'platformSharePercent and driverSharePercent must be between 0 and 100');
  }
  if (round2(platform + driver) !== 100) {
    throw new ApiError(400, 'platformSharePercent + driverSharePercent must equal 100');
  }
  if (data.bookingDiscountMinAmount != null && data.bookingDiscountMinAmount < 0) {
    throw new ApiError(400, 'bookingDiscountMinAmount must be a non-negative number');
  }
  if (data.serviceChargePercent != null && (data.serviceChargePercent < 0 || data.serviceChargePercent > 100)) {
    throw new ApiError(400, 'serviceChargePercent must be between 0 and 100');
  }
  if (data.gstPercent != null && (data.gstPercent < 0 || data.gstPercent > 100)) {
    throw new ApiError(400, 'gstPercent must be between 0 and 100');
  }
}

export function calculateSubscriptionCheckout(plan, coupon = null) {
  const basePrice = round2(Number(plan.price) || 0);
  const serviceChargePercent = Number(plan.serviceChargePercent) || 0;
  const gstPercent = plan.gstPercent != null ? Number(plan.gstPercent) : 18;
  const platformSharePercent = Number(plan.platformSharePercent ?? 50);
  const driverSharePercent = Number(plan.driverSharePercent ?? 50);

  const couponDiscount = computeCouponDiscount(basePrice, coupon);
  const netBasePrice = round2(Math.max(0, basePrice - couponDiscount));
  const serviceCharge = round2((netBasePrice * serviceChargePercent) / 100);
  const gstAmount = round2(((netBasePrice + serviceCharge) * gstPercent) / 100);
  const totalPayable = round2(netBasePrice + serviceCharge + gstAmount);
  // Driver share is computed on the pre-coupon base so admin-created
  // coupons are absorbed by the platform (same policy as trip bookings).
  const driverShareRupees = round2((basePrice * driverSharePercent) / 100);
  const platformShareRupees = round2(Math.max(0, netBasePrice - driverShareRupees));

  return {
    basePrice,
    couponDiscount,
    netBasePrice,
    serviceCharge,
    serviceChargePercent,
    gstAmount,
    gstPercent,
    totalPayable,
    platformSharePercent,
    driverSharePercent,
    platformShareRupees,
    driverShareRupees,
  };
}

export const listSubscriptionPlansService = async ({ onlyActive = false } = {}) => {
  const filter = onlyActive ? { isActive: true } : {};
  return SubscriptionPlan.find(filter).sort({ sortOrder: 1, durationMonths: 1 });
};

export const createSubscriptionPlanService = async (data, staffId) => {
  if (!data.name?.trim()) throw new ApiError(400, 'name is required');
  if (!data.durationMonths || data.durationMonths < 1) {
    throw new ApiError(400, 'durationMonths must be at least 1');
  }
  if (data.price == null || data.price < 0) {
    throw new ApiError(400, 'price must be a non-negative number');
  }
  if (data.bookingDiscountValue != null && data.bookingDiscountValue < 0) {
    throw new ApiError(400, 'bookingDiscountValue must be a non-negative number');
  }
  if (
    data.includedHoursPerDay != null &&
    (data.includedHoursPerDay < 0 || data.includedHoursPerDay > 24)
  ) {
    throw new ApiError(400, 'includedHoursPerDay must be between 0 and 24');
  }
  validateSubscriptionPlanFields(data);
  return SubscriptionPlan.create({ ...data, createdBy: staffId || null });
};

export const updateSubscriptionPlanService = async (id, data, staffId) => {
  if (data.price != null && data.price < 0) {
    throw new ApiError(400, 'price must be a non-negative number');
  }
  if (data.bookingDiscountValue != null && data.bookingDiscountValue < 0) {
    throw new ApiError(400, 'bookingDiscountValue must be a non-negative number');
  }
  const existing = await SubscriptionPlan.findById(id);
  if (!existing) throw new ApiError(404, 'Subscription plan not found');
  validateSubscriptionPlanFields({ ...existing.toObject(), ...data });
  const updated = await SubscriptionPlan.findByIdAndUpdate(
    id,
    { ...data, updatedBy: staffId || null },
    { new: true, runValidators: true },
  );
  if (!updated) throw new ApiError(404, 'Subscription plan not found');
  return updated;
};

export const deleteSubscriptionPlanService = async (id) => {
  const deleted = await SubscriptionPlan.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Subscription plan not found');
  return { id };
};

// ─── Active subscription helpers ──────────────────────────────────────────────

export const getActiveUserSubscriptionService = async (userId, { carId } = {}) => {
  if (!userId) return null;
  const now = new Date();
  const filter = {
    userId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    expiryDate: { $gt: now },
  };
  if (carId) filter.carId = carId;
  return UserSubscription.findOne(filter)
    .populate('planId', 'name includedHoursPerDay bookingDiscountType bookingDiscountValue durationMonths price')
    .populate('assignedDriverId', 'name phone profilePicture rating')
    .populate('zoneId', 'name city')
    .populate({
      path: 'carId',
      select: 'vehicleNumber carTypeId brandId modelId',
      populate: [
        { path: 'carTypeId', select: 'name' },
        { path: 'brandId', select: 'name' },
        { path: 'modelId', select: 'name' },
      ],
    });
};

export const listActiveUserSubscriptionsService = async (userId) => {
  if (!userId) return [];
  const now = new Date();
  const subs = await UserSubscription.find({
    userId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    expiryDate: { $gt: now },
  })
    .sort({ createdAt: -1 })
    .populate('planId', 'name includedHoursPerDay bookingDiscountType bookingDiscountValue durationMonths price')
    .populate('assignedDriverId', 'name phone profilePicture rating')
    .populate('zoneId', 'name city')
    .populate({
      path: 'carId',
      select: 'vehicleNumber carTypeId brandId modelId image',
      populate: [
        { path: 'carTypeId', select: 'name' },
        { path: 'brandId', select: 'name' },
        { path: 'modelId', select: 'name' },
      ],
    });
  return subs.map((s) => serializeSubscriptionForUser(s));
};

/**
 * Move subscription start (and matching expiry) while no dedicated
 * driver has been assigned yet. Duration months stay the same.
 */
export async function rescheduleUserSubscriptionService(userId, subscriptionId, body = {}) {
  const subscription = await UserSubscription.findOne({
    _id: subscriptionId,
    userId,
  });
  if (!subscription) throw new ApiError(404, 'Subscription not found');
  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    throw new ApiError(400, 'Only active subscriptions can be rescheduled');
  }
  if (subscription.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED) {
    throw new ApiError(400, 'Start date cannot be changed after a driver is assigned');
  }
  if (subscription.assignmentStatus !== SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING) {
    throw new ApiError(400, 'This subscription can no longer be rescheduled');
  }
  if (subscription.cancellationRequest?.status === 'pending') {
    throw new ApiError(400, 'Cannot change start date while a cancellation request is pending');
  }

  const nextStart = new Date(body.startDate);
  if (!Number.isFinite(nextStart.getTime())) {
    throw new ApiError(400, 'startDate is required');
  }
  // Date-only floor: start of local day, not in the past.
  nextStart.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (nextStart.getTime() < today.getTime()) {
    throw new ApiError(422, 'Start date cannot be in the past');
  }

  subscription.startDate = nextStart;
  subscription.expiryDate = addMonths(nextStart, subscription.durationMonths);
  await subscription.save();

  const populated = await UserSubscription.findById(subscription._id)
    .populate('planId', 'name')
    .populate('zoneId', 'name city')
    .populate({
      path: 'carId',
      select: 'vehicleNumber carTypeId brandId modelId image',
      populate: [
        { path: 'carTypeId', select: 'name' },
        { path: 'brandId', select: 'name' },
        { path: 'modelId', select: 'name' },
      ],
    })
    .populate('assignedDriverId', 'name phone profilePicture rating');

  return serializeSubscriptionForUser(populated);
}

/**
 * Admin: move subscription start (and matching expiry). Allowed for
 * active subscriptions whether or not a driver is assigned. When a
 * driver is already assigned, their working window is clamped into the
 * new period and availability is re-checked.
 */
export async function adminRescheduleUserSubscriptionService(
  subscriptionId,
  body = {},
) {
  const subscription = await UserSubscription.findById(subscriptionId);
  if (!subscription) throw new ApiError(404, 'Subscription not found');
  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    throw new ApiError(400, 'Only active subscriptions can be rescheduled');
  }

  const nextStart = startOfDay(new Date(body.startDate));
  if (!Number.isFinite(nextStart.getTime())) {
    throw new ApiError(400, 'startDate is required');
  }
  const nextExpiry = addMonths(nextStart, subscription.durationMonths);

  let nextAssignedAt = subscription.assignedAt
    ? startOfDay(subscription.assignedAt)
    : null;
  let nextWorkingEnd = subscription.assignedWorkingEndDate
    ? startOfDay(subscription.assignedWorkingEndDate)
    : null;

  if (
    subscription.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED
    && subscription.assignedDriverId
  ) {
    if (!nextAssignedAt) nextAssignedAt = nextStart;
    if (nextAssignedAt < nextStart) nextAssignedAt = nextStart;
    if (nextAssignedAt > startOfDay(nextExpiry)) {
      throw new ApiError(
        400,
        'Cannot move the period after the driver working start. Release or reassign the driver first.',
      );
    }
    if (nextWorkingEnd) {
      if (nextWorkingEnd > startOfDay(nextExpiry)) {
        nextWorkingEnd = startOfDay(nextExpiry);
      }
      if (nextWorkingEnd < nextAssignedAt) {
        nextWorkingEnd = null;
      }
    }

    await assertDriverAvailableForSubscription(
      {
        ...subscription.toObject(),
        startDate: nextStart,
        expiryDate: nextExpiry,
        assignedAt: nextAssignedAt,
        assignedWorkingEndDate: nextWorkingEnd
          ? endOfDay(nextWorkingEnd)
          : null,
      },
      subscription.assignedDriverId,
      {
        windowMs: {
          startMs: nextAssignedAt.getTime(),
          endMs: (nextWorkingEnd
            ? endOfDay(nextWorkingEnd)
            : endOfDay(nextExpiry)
          ).getTime(),
        },
      },
    );

    subscription.assignedAt = nextAssignedAt;
    subscription.assignedWorkingEndDate = nextWorkingEnd
      ? endOfDay(nextWorkingEnd)
      : null;
  }

  subscription.startDate = nextStart;
  subscription.expiryDate = nextExpiry;
  await subscription.save();

  await subscription.populate([
    { path: 'userId', select: 'name phone_no email' },
    { path: 'planId', select: 'name' },
    { path: 'zoneId', select: 'name city' },
    {
      path: 'carId',
      select: 'vehicleNumber carTypeId brandId modelId',
      populate: [
        { path: 'carTypeId', select: 'name' },
        { path: 'brandId', select: 'name' },
        { path: 'modelId', select: 'name' },
      ],
    },
    { path: 'assignedDriverId', select: 'name phone rating profilePicture' },
  ]);

  return subscription.toObject ? subscription.toObject() : subscription;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + Math.max(1, Number(months) || 1));
  return next;
}

function normalizeSubscriptionPlace(place, label) {
  if (!place?.address?.trim()) {
    throw new ApiError(400, `${label} address is required`);
  }
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError(400, `${label} location coordinates are required`);
  }
  return {
    address: String(place.address).trim(),
    city: String(place.city || '').trim(),
    lat,
    lng,
  };
}

function buildSubscriptionSnapshot(plan, coupon = null) {
  const checkout = calculateSubscriptionCheckout(plan, coupon);
  return {
    durationMonths: plan.durationMonths,
    includedHoursPerDay: plan.includedHoursPerDay ?? 0,
    bookingDiscountType: plan.bookingDiscountType || SUBSCRIPTION_DISCOUNT_TYPES.PERCENTAGE,
    bookingDiscountValue: plan.bookingDiscountValue ?? 0,
    bookingDiscountMinAmount: plan.bookingDiscountMinAmount ?? 0,
    planNameSnapshot: plan.name || '',
    basePrice: checkout.basePrice,
    couponDiscount: checkout.couponDiscount ?? 0,
    couponCode: coupon?.code || null,
    couponId: coupon?._id || null,
    netBasePrice: checkout.netBasePrice ?? checkout.basePrice,
    serviceCharge: checkout.serviceCharge,
    serviceChargePercent: checkout.serviceChargePercent,
    gstAmount: checkout.gstAmount,
    gstPercent: checkout.gstPercent,
    platformShareRupees: checkout.platformShareRupees,
    driverShareRupees: checkout.driverShareRupees,
    platformSharePercent: checkout.platformSharePercent,
    driverSharePercent: checkout.driverSharePercent,
  };
}

async function syncSubscriptionPaymentRecord(subscription, razorpayOrderId) {
  return Payment.findOneAndUpdate(
    { referenceId: subscription._id, referenceModel: 'UserSubscription' },
    {
      $set: {
        provider: PAYMENT_PROVIDER.RAZORPAY,
        purpose: PAYMENT_PURPOSE.SUBSCRIPTION,
        referenceId: subscription._id,
        referenceModel: 'UserSubscription',
        userId: subscription.userId,
        razorpayOrderId,
        amount: subscription.amount,
        currency: 'INR',
        status: 'created',
        failureReason: '',
        meta: {
          subscriptionNumber: subscription.subscriptionNumber || '',
          planName: subscription.planNameSnapshot || '',
        },
      },
      $unset: { razorpayPaymentId: 1, razorpaySignature: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export const createSubscriptionPurchaseOrderService = async (
  userId,
  planId,
  zoneId,
  carId,
  { termsAccepted, dailyPickup, dailyDropoff, couponCode } = {},
) => {
  if (!planId || !zoneId || !carId) {
    throw new ApiError(400, 'planId, zoneId and carId are required');
  }
  if (!termsAccepted) {
    throw new ApiError(400, 'You must accept the subscription terms and conditions');
  }

  const pickup = normalizeSubscriptionPlace(dailyPickup, 'Daily pickup');
  const dropoff = normalizeSubscriptionPlace(dailyDropoff, 'Daily drop-off');

  const terms = await getActiveLegalDocumentService(LEGAL_DOCUMENT_TYPES.SUBSCRIPTION);
  if (!terms) {
    throw new ApiError(503, 'Subscription terms are not configured yet. Please try again later.');
  }

  const [user, plan, zone, car] = await Promise.all([
    User.findById(userId).select('name email phone_no').lean(),
    SubscriptionPlan.findOne({ _id: planId, isActive: true }),
    Zone.findOne({ _id: zoneId, isActive: true }).select('_id name city').lean(),
    Car.findOne({ _id: carId, userId, isActive: { $ne: false } }).select('_id carTypeId vehicleNumber').lean(),
  ]);

  if (!user) throw new ApiError(404, 'User not found');
  if (!plan) throw new ApiError(404, 'Subscription plan not found or inactive');
  if (!zone) throw new ApiError(400, 'Invalid or inactive service zone');
  if (!car) throw new ApiError(400, 'Invalid car selection');

  const existingActive = await UserSubscription.findOne({
    userId,
    carId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    expiryDate: { $gt: new Date() },
  });
  if (existingActive) {
    throw new ApiError(409, 'This car already has an active subscription');
  }

  const now = new Date();
  const termsAcceptedAt = now;
  const coupon = couponCode
    ? await resolveCouponByCodeService(couponCode, {
        serviceType: COUPON_APPLICABLE_SERVICES.SUBSCRIPTION,
      })
    : null;
  const snapshot = buildSubscriptionSnapshot(plan, coupon);
  const totalPayable = round2(
    (snapshot.netBasePrice ?? snapshot.basePrice) + snapshot.serviceCharge + snapshot.gstAmount,
  );
  let subscription = await UserSubscription.findOne({
    userId,
    planId,
    carId,
    status: SUBSCRIPTION_STATUS.PENDING_PAYMENT,
  });

  if (!subscription) {
    subscription = await UserSubscription.create({
      userId,
      planId,
      zoneId,
      carId,
      status: SUBSCRIPTION_STATUS.PENDING_PAYMENT,
      startDate: now,
      expiryDate: addMonths(now, plan.durationMonths),
      amount: totalPayable,
      assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING,
      termsAcceptedAt,
      termsVersionSnapshot: terms.version,
      termsTitleSnapshot: terms.title,
      termsContentSnapshot: terms.content,
      dailyPickup: pickup,
      dailyDropoff: dropoff,
      ...snapshot,
    });
  } else {
    subscription.zoneId = zoneId;
    subscription.carId = carId;
    subscription.amount = totalPayable;
    subscription.startDate = now;
    subscription.expiryDate = addMonths(now, plan.durationMonths);
    subscription.termsAcceptedAt = termsAcceptedAt;
    subscription.termsVersionSnapshot = terms.version;
    subscription.termsTitleSnapshot = terms.title;
    subscription.termsContentSnapshot = terms.content;
    subscription.dailyPickup = pickup;
    subscription.dailyDropoff = dropoff;
    Object.assign(subscription, snapshot);
    await subscription.save();
  }

  const amountPaise = Math.round(totalPayable * 100);
  const razorpayOrder = await createRazorpayOrder({
    amountPaise,
    currency: 'INR',
    receipt: `sub_${String(subscription._id).slice(-10)}_${Date.now().toString(36).slice(-4)}`,
    notes: {
      userSubscriptionId: String(subscription._id),
      userId: String(userId),
      planId: String(planId),
      zoneId: String(zoneId),
    },
  });

  subscription.razorpayOrderId = razorpayOrder.id;
  await subscription.save();
  await syncSubscriptionPaymentRecord(subscription, razorpayOrder.id);

  return {
    subscriptionId: subscription._id,
    subscriptionNumber: subscription.subscriptionNumber || '',
    keyId: getRazorpayKeyId(),
    orderId: razorpayOrder.id,
    amount: amountPaise,
    currency: 'INR',
    name: 'SpareDriver',
    description: `${plan.name} — ${plan.durationMonths} month subscription`,
    pricing: {
      basePrice: snapshot.basePrice,
      serviceCharge: snapshot.serviceCharge,
      serviceChargePercent: snapshot.serviceChargePercent,
      gstAmount: snapshot.gstAmount,
      gstPercent: snapshot.gstPercent,
      totalPayable,
      platformShareRupees: snapshot.platformShareRupees,
      driverShareRupees: snapshot.driverShareRupees,
    },
    prefill: {
      name: user.name || '',
      email: user.email || '',
      contact: user.phone_no ? String(user.phone_no) : '',
    },
  };
};

export const verifySubscriptionPaymentService = async (
  userId,
  { razorpayOrderId, razorpayPaymentId, razorpaySignature },
) => {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ApiError(400, 'razorpayOrderId, razorpayPaymentId and razorpaySignature are required');
  }

  const subscription = await UserSubscription.findOne({ userId, razorpayOrderId });
  if (!subscription) throw new ApiError(404, 'Subscription order not found');

  if (subscription.status === SUBSCRIPTION_STATUS.ACTIVE) {
    await subscription.populate([
      { path: 'planId', select: 'name durationMonths includedHoursPerDay' },
      { path: 'zoneId', select: 'name city' },
      { path: 'assignedDriverId', select: 'name phone rating profilePicture' },
    ]);
    return {
      subscription: serializeSubscriptionForUser(subscription),
      alreadyPaid: true,
    };
  }

  const valid = verifyRazorpayPaymentSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });
  if (!valid) throw new ApiError(400, 'Payment signature verification failed');

  const now = new Date();
  subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
  subscription.startDate = now;
  subscription.expiryDate = addMonths(now, subscription.durationMonths);
  subscription.razorpayPaymentId = razorpayPaymentId;
  subscription.razorpaySignature = razorpaySignature;
  subscription.paidAt = now;
  subscription.assignmentStatus = SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING;
  await subscription.save();

  if (subscription.couponId) {
    await incrementCouponUsageService(subscription.couponId);
  }

  await Payment.findOneAndUpdate(
    { referenceId: subscription._id, referenceModel: 'UserSubscription' },
    {
      $set: {
        userId: subscription.userId,
        razorpayPaymentId,
        razorpaySignature,
        status: 'captured',
        meta: {
          subscriptionNumber: subscription.subscriptionNumber || '',
          planName: subscription.planNameSnapshot || '',
        },
      },
    },
  );

  await subscription.populate([
    { path: 'planId', select: 'name durationMonths includedHoursPerDay bookingDiscountType bookingDiscountValue' },
    { path: 'zoneId', select: 'name city' },
    { path: 'assignedDriverId', select: 'name phone rating profilePicture' },
    {
      path: 'carId',
      select: 'vehicleNumber carTypeId brandId modelId image',
      populate: [
        { path: 'carTypeId', select: 'name' },
        { path: 'brandId', select: 'name' },
        { path: 'modelId', select: 'name' },
      ],
    },
  ]);

  await sendPushNotification(
    { userId: subscription.userId },
    {
      title: 'Subscription successful',
      body: 'You are subscribed successfully. We will assign the best driver for your car soon.',
      severity: 'success',
      data: {
        kind: 'subscription_purchased',
        subscriptionId: String(subscription._id),
      },
    },
  );

  // Auto-search dedicated drivers (open inbox) — best-effort.
  try {
    const { setupSubscriptionSearch } = await import('./subscriptionDispatch.service.js');
    await setupSubscriptionSearch(subscription);
  } catch (err) {
    console.warn('[subscription] auto-search setup failed:', err?.message);
  }

  return { subscription: serializeSubscriptionForUser(subscription), alreadyPaid: false };
};

// ─── Fare calculation helpers ─────────────────────────────────────────────────

export function findSlabForDuration(slabs = [], hours = 0) {
  if (!Array.isArray(slabs) || slabs.length === 0) return null;
  const sorted = [...slabs].sort((a, b) => a.minHours - b.minHours);
  const match = sorted.find((s) => hours > s.minHours && hours <= s.maxHours);
  if (match) return match;
  if (hours <= sorted[0].maxHours) return sorted[0];
  return sorted[sorted.length - 1];
}

function minutesOfDay(date) {
  const at = new Date(date);
  return at.getHours() * 60 + at.getMinutes();
}

function parseHHmm(s, fallback) {
  const [h, m] = (s || fallback).split(':').map(Number);
  return h * 60 + m;
}

/**
 * Returns true when the given timestamp falls inside the night window.
 * Handles wrap-around (e.g. 22:00 → 06:00) by splitting the window
 * around midnight.
 */
export function isNightRideAt(date, nightConfig) {
  if (!nightConfig?.enabled) return false;
  const start = parseHHmm(nightConfig.startTime, '22:00');
  const end = parseHHmm(nightConfig.endTime, '06:00');
  if (start === end) return false;
  const cur = minutesOfDay(date);
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

/**
 * Does any part of a ride that starts at `startAt` and lasts `durationHours`
 * cross the night window? Lets a 6-hour booking that starts at 18:00 still
 * trigger the night charge because the last few hours dip into the night.
 *
 * Implementation: walk hour-by-hour across the booking, returning true the
 * moment any minute hits the window. Cheap (max ~24 iterations) and avoids
 * the corner-case-laden arithmetic of overlapping two wrap-around ranges.
 */
export function rideCoversNightWindow(startAt, durationHours, nightConfig) {
  if (!nightConfig?.enabled) return false;
  const duration = Math.max(0, Math.ceil(Number(durationHours) || 0));
  if (!duration) return isNightRideAt(startAt, nightConfig);
  const startMs = startAt ? new Date(startAt).getTime() : Date.now();
  // Sample every 15 minutes so we never miss a short window (e.g. 23:50–00:10).
  const stepMs = 15 * 60 * 1000;
  const totalMs = duration * 60 * 60 * 1000;
  for (let t = 0; t <= totalMs; t += stepMs) {
    if (isNightRideAt(new Date(startMs + t), nightConfig)) return true;
  }
  return false;
}

/**
 * Does this booking qualify for a night charge purely on the basis of
 * its booked duration? Admin sets `nightCharge.thresholdHours` (0 to
 * disable). Independent of `isNightRideAt` — either trigger fires the
 * charge.
 */
export function isLongDurationNight(bookedHours, nightConfig) {
  if (!nightConfig?.enabled) return false;
  const threshold = Number(nightConfig.thresholdHours) || 0;
  if (threshold <= 0) return false;
  return Number(bookedHours) >= threshold;
}

function applySubscriptionDiscount(subtotal, subscription) {
  if (!subscription || subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) return 0;
  const minAmount = Number(subscription.bookingDiscountMinAmount) || 0;
  if (subtotal < minAmount) return 0;
  const value = subscription.bookingDiscountValue || 0;
  if (value <= 0) return 0;
  const discount =
    subscription.bookingDiscountType === SUBSCRIPTION_DISCOUNT_TYPES.PERCENTAGE
      ? (subtotal * value) / 100
      : value;
  return Math.min(round2(discount), round2(subtotal));
}

/**
 * Resolve platform-fee knobs from a pricing doc (or fare-breakdown
 * snapshot). Prefer the new flat|percentage pair; fall back to the
 * legacy `serviceChargePercent` so old docs keep working until re-saved.
 */
function resolvePlatformFeeConfig(pricing = {}) {
  const type = pricing.platformFeeType === 'flat' ? 'flat' : 'percentage';
  const amount = Math.max(0, Number(pricing.platformFeeAmount) || 0);
  const legacyPct = Math.max(0, Number(pricing.serviceChargePercent) || 0);

  if (type === 'flat') {
    return { type: 'flat', amount };
  }
  // Percentage: use new amount when set; otherwise legacy percent.
  if (amount > 0) return { type: 'percentage', amount };
  if (legacyPct > 0) return { type: 'percentage', amount: legacyPct };
  return { type: 'percentage', amount: 0 };
}

function computePlatformFee(netSubtotal, pricing) {
  const { type, amount } = resolvePlatformFeeConfig(pricing);
  if (amount <= 0) return { fee: 0, type, amount };
  if (type === 'flat') {
    return { fee: round2(amount), type, amount };
  }
  return {
    fee: round2((Math.max(0, Number(netSubtotal) || 0) * amount) / 100),
    type,
    amount,
  };
}

/**
 * Apply the customer-facing layers (platform fee, GST, subscription
 * discount) and split the booked subtotal into platform commission +
 * driver earning.
 *
 * Coupon discount is applied to the ride subtotal BEFORE platform fee
 * and GST. GST is calculated on (netSubtotal + platformFee).
 *
 * `allowancePassThrough` is the portion of `subtotal` we treat as a
 * pure driver allowance (food + stay): the platform doesn't take any
 * commission on it — the rupees flow 1:1 to the driver to offset
 * their out-of-pocket food / lodging on the trip. Commission applies
 * only to `commissionableSubtotal = subtotal − allowancePassThrough`
 * (the daily-rate / slab-price portion the platform actually brokered).
 *
 * Platform commission is computed on the pre-coupon subtotal so drivers
 * are not penalised when a coupon is used. The coupon cost is absorbed
 * by the platform (recorded as a COUPON_DISCOUNT revenue debit on
 * trip completion).
 */
function applyPlatformLayers(subtotal, pricing, subscription, allowancePassThrough = 0, coupon = null) {
  const couponDiscount = computeCouponDiscount(subtotal, coupon);
  const netSubtotal = Math.max(0, round2(subtotal - couponDiscount));

  const { fee: platformFee, type: platformFeeType, amount: platformFeeAmount } =
    computePlatformFee(netSubtotal, pricing);
  const gstPercent = pricing.gstPercent || 0;
  const gstAmount = ((netSubtotal + platformFee) * gstPercent) / 100;
  const subscriptionDiscount = applySubscriptionDiscount(netSubtotal, subscription);
  const totalPayable = Math.max(0, netSubtotal + platformFee + gstAmount - subscriptionDiscount);

  const platformCommissionPercent = pricing.platformCommissionPercent || 0;
  const passThrough = Math.max(0, Math.min(Number(allowancePassThrough) || 0, subtotal));
  const commissionableSubtotal = Math.max(0, subtotal - passThrough);
  const platformCommission = (commissionableSubtotal * platformCommissionPercent) / 100;
  const driverEarning = Math.max(0, subtotal - platformCommission);
  const driverFareEarning = Math.max(
    0,
    commissionableSubtotal - platformCommission,
  );
  const driverAllowanceEarning = passThrough;

  return {
    couponDiscount: round2(couponDiscount),
    netSubtotal: round2(netSubtotal),
    // New names
    platformFee: round2(platformFee),
    platformFeeType,
    platformFeeAmount,
    // Back-compat aliases used across fareSnapshot / FE / invoices
    serviceCharge: round2(platformFee),
    serviceChargePercent: platformFeeType === 'percentage' ? platformFeeAmount : 0,
    gstAmount: round2(gstAmount),
    gstPercent,
    subscriptionDiscount: round2(subscriptionDiscount),
    totalPayable: round2(totalPayable),
    platformCommission: round2(platformCommission),
    platformCommissionPercent,
    commissionableSubtotal: round2(commissionableSubtotal),
    allowancePassThrough: round2(passThrough),
    driverFareEarning: round2(driverFareEarning),
    driverAllowanceEarning: round2(driverAllowanceEarning),
    driverEarning: round2(driverEarning),
  };
}

// ─── HOURLY fare ──────────────────────────────────────────────────────────────

export function calculateHourlyFare({
  pricing,
  slab = null,
  isCustomDuration = false,
  actualDurationMin = null,
  bookedHours = null,
  isNightRide = false,
  waitingMinutes = 0,
  tollParking = 0,
  /**
   * User overrides for the long-booking driver allowances. Default to
   * `true` so a missing flag means "the user IS providing it" and we
   * don't accidentally charge extra. Only takes effect once the
   * configured `thresholdHours` is crossed AND `userOptOut` is on.
   */
  foodProvided = true,
  stayProvided = true,
  subscription = null,
  coupon = null,
} = {}) {
  if (!pricing) throw new ApiError(400, 'Service pricing is required for fare calculation');

  let packagePrice = 0;
  let slabMaxHours = 0;
  if (isCustomDuration) {
    const rate = pricing.customHours?.ratePerHour || 0;
    const hours = Math.max(1, Math.ceil(bookedHours || 0));
    packagePrice = rate * hours;
    slabMaxHours = hours;
  } else {
    packagePrice = slab?.price ?? 0;
    slabMaxHours = slab?.maxHours ?? bookedHours ?? 0;
  }

  let extraHours = 0;
  let extraHourCharge = 0;
  if (actualDurationMin != null && slabMaxHours > 0) {
    const overflowMin = Math.max(0, actualDurationMin - slabMaxHours * 60);
    extraHours = Math.ceil(overflowMin / 60);
    extraHourCharge = extraHours * (pricing.extraHourCharge || 0);
  }

  const freeWait = pricing.waitingCharge?.freeWaitingMinutes ?? 0;
  const perMin = pricing.waitingCharge?.chargePerMinute ?? 0;
  const billableWait = Math.max(0, (waitingMinutes || 0) - freeWait);
  const waitingCharge = billableWait * perMin;

  // Night charge: time-of-day window OR long-duration threshold (both
  // are admin-configurable). Either trigger applies the charge once.
  let nightCharge = 0;
  let nightChargeTriggered = false;
  if (pricing.nightCharge?.enabled) {
    const longRide = isLongDurationNight(bookedHours, pricing.nightCharge);
    if (isNightRide || longRide) {
      nightChargeTriggered = true;
      nightCharge =
        pricing.nightCharge.type === 'percentage'
          ? (packagePrice * (pricing.nightCharge.amount || 0)) / 100
          : pricing.nightCharge.amount || 0;
    }
  }

  // Food allowance for HOURLY is no longer billed — the threshold acts
  // purely as a "your booking is long enough that the driver will need a
  // meal, please arrange food yourself" notice. We surface
  // `foodRequired` / `foodThresholdHours` so the UI can render the
  // warning; the customer is never charged an allowance for hourly.
  const foodAllowance = 0;
  const foodCfg = pricing.foodAllowance;
  const foodThresholdHours = foodCfg?.thresholdHours || 0;
  const foodRequired =
    !!foodCfg?.enabled &&
    bookedHours != null &&
    foodThresholdHours > 0 &&
    Number(bookedHours) >= foodThresholdHours;
  // Kept `foodEligible` in the response shape for back-compat with
  // any older clients that read it — always equal to foodRequired now.
  const foodEligible = foodRequired;

  // Driver accommodation allowance for very long hourly bookings
  // (overnight). Mirrors the food allowance shape so the UI can treat
  // the two identically.
  let stayAllowance = 0;
  const stayCfg = pricing.stayAllowance;
  const stayThresholdHours = stayCfg?.thresholdHours || 0;
  const stayEligible =
    !!stayCfg?.enabled &&
    bookedHours != null &&
    stayThresholdHours > 0 &&
    Number(bookedHours) >= stayThresholdHours;
  const stayOptedOut = stayCfg?.userOptOut && stayProvided === true;
  if (stayEligible && !stayOptedOut) {
    stayAllowance = stayCfg.amount || 0;
  }

  const toll = pricing.tollParkingEnabled ? Math.max(0, tollParking || 0) : 0;

  const subtotal =
    packagePrice +
    extraHourCharge +
    waitingCharge +
    nightCharge +
    foodAllowance +
    stayAllowance +
    toll;
  // Hourly long-booking food + stay allowances follow the same
  // pass-through rule as outstation: the driver keeps them in full,
  // the platform commissions only the slab / extra-hour / night /
  // waiting / toll layers. Toll stays commissionable here (it's
  // already part of the platform-brokered fare in hourly), unlike
  // outstation where toll is paid directly to the driver and
  // omitted from subtotal entirely.
  const layers = applyPlatformLayers(
    subtotal,
    pricing,
    subscription,
    foodAllowance + stayAllowance,
    coupon,
  );

  return {
    serviceType: SERVICE_TYPES.HOURLY,
    isCustomDuration: !!isCustomDuration,
    bookedHours: bookedHours || 0,
    packagePrice: round2(packagePrice),
    extraHours,
    extraHourCharge: round2(extraHourCharge),
    waitingMinutes: waitingMinutes || 0,
    waitingCharge: round2(waitingCharge),
    nightCharge: round2(nightCharge),
    nightChargeTriggered,
    nightChargeThresholdHours: pricing.nightCharge?.thresholdHours || 0,
    foodAllowance: round2(foodAllowance),
    foodThresholdHours,
    foodEligible,
    /**
     * Notice flag for the customer UI: "your booking is long enough
     * that the driver needs a meal — please arrange food yourself".
     * No charge is added to the fare when this is true.
     */
    foodRequired,
    foodProvided: true,
    foodOptOutAvailable: false,
    stayAllowance: round2(stayAllowance),
    stayThresholdHours,
    stayEligible,
    stayProvided: !!stayProvided,
    stayOptOutAvailable: !!(stayCfg?.userOptOut && stayEligible),
    tollParking: round2(toll),
    subtotal: round2(subtotal),
    ...layers,
  };
}

// ─── OUTSTATION fare ──────────────────────────────────────────────────────────

/**
 * Outstation pricing model — split food (per day) and stay (per night)
 * allowances so admins can tune the two costs independently:
 *
 *   subtotal = dailyRate × days
 *            + (foodProvided ? 0 : foodAllowancePerDay   × days)
 *            + (stayProvided ? 0 : stayAllowancePerNight × nights)
 *
 * The customer UI today still exposes a single all-or-nothing toggle
 * that flips both `foodProvided` and `stayProvided` together, so both
 * allowances waive in lockstep from the customer's point of view. The
 * fields remain independent in the data model so the toggles can be
 * split in the future without another schema change.
 *
 * Back-compat: when both split fields are 0 we fall back to the
 * legacy `outstation.allowancePerNight × nights` (waived only when
 * BOTH provided flags are true) — that keeps older saved pricing docs
 * producing the same fare without a manual migration.
 *
 * Toll & parking are NEVER added to the outstation fare. The customer
 * pays those directly to the driver during the trip; the booking flow
 * surfaces a notice but no rupee is added here.
 */
export function calculateOutstationFare({
  pricing,
  days = 1,
  nights: nightsIn = null,
  // `actualKm` and `tollParking` accepted for back-compat with older
  // callers; both are no-ops in the new pricing model.
  actualKm: _actualKm = 0, // eslint-disable-line no-unused-vars
  foodProvided = true,
  stayProvided = true,
  tollParking: _tollParking = 0, // eslint-disable-line no-unused-vars
  subscription = null,
  coupon = null,
} = {}) {
  if (!pricing) throw new ApiError(400, 'Service pricing is required for fare calculation');
  const o = pricing.outstation || {};

  const tripDays = Math.max(1, Math.ceil(Number(days) || 1));
  // Prefer explicit nights (calendar midnights crossed). Fall back to
  // days − 1 only when the caller didn't supply nights.
  const nights =
    nightsIn != null && Number.isFinite(Number(nightsIn))
      ? Math.max(0, Math.floor(Number(nightsIn)))
      : Math.max(0, tripDays - 1);

  const dailyRate = Number(o.dailyRate) || 0;
  const foodAllowancePerDay = Number(o.foodAllowancePerDay) || 0;
  const stayAllowancePerNight = Number(o.stayAllowancePerNight) || 0;
  const extraHourCharge = Number(o.extraHourCharge) || 0;
  const legacyAllowancePerNight = Number(o.allowancePerNight) || 0;
  // If the admin hasn't migrated to the split fields yet, treat the
  // legacy combined `allowancePerNight` as the per-night charge —
  // waived only when BOTH provided flags are true so the legacy
  // behaviour is preserved exactly.
  const useLegacyAllowance =
    foodAllowancePerDay <= 0 &&
    stayAllowancePerNight <= 0 &&
    legacyAllowancePerNight > 0;

  // Convention:
  //   foodProvided/stayProvided === true   → that need is taken care
  //                                          of by the customer → no
  //                                          allowance charged for it
  //   foodProvided/stayProvided === false  → that need is NOT taken
  //                                          care of → allowance must
  //                                          be charged
  // Booking-create defaults upstream remain `?? true` so legacy
  // clients omitting the flags keep their "no extra charge" behaviour.
  const dailyRateTotal = dailyRate * tripDays;
  let foodAllowanceTotal = 0;
  let stayAllowanceTotal = 0;
  let legacyAllowanceTotal = 0;
  if (useLegacyAllowance) {
    const bothProvided = foodProvided === true && stayProvided === true;
    legacyAllowanceTotal = bothProvided ? 0 : legacyAllowancePerNight * nights;
  } else {
    foodAllowanceTotal = foodProvided === true ? 0 : foodAllowancePerDay * tripDays;
    stayAllowanceTotal = stayProvided === true ? 0 : stayAllowancePerNight * nights;
  }
  const allowanceTotal =
    foodAllowanceTotal + stayAllowanceTotal + legacyAllowanceTotal;

  const customerArrangesAll = foodProvided === true && stayProvided === true;

  const subtotal = dailyRateTotal + allowanceTotal;
  // Outstation: the food + stay (and any legacy combined) allowance
  // is pass-through to the driver — no platform commission on it.
  // Only the daily-rate portion is commissionable.
  const layers = applyPlatformLayers(
    subtotal,
    pricing,
    subscription,
    allowanceTotal,
    coupon,
  );

  return {
    serviceType: SERVICE_TYPES.OUTSTATION,
    days: tripDays,
    nights,
    // ── New shape ──
    dailyRate: round2(dailyRate),
    dailyRateTotal: round2(dailyRateTotal),
    foodAllowancePerDay: round2(foodAllowancePerDay),
    foodAllowanceTotal: round2(foodAllowanceTotal),
    stayAllowancePerNight: round2(stayAllowancePerNight),
    stayAllowanceTotal: round2(stayAllowanceTotal),
    // Snapshotted for extensions — never re-read live admin rates.
    outstationExtraHourCharge: round2(extraHourCharge),
    extraHourChargeRate: round2(extraHourCharge),
    minDays: Math.max(1, Number(o.minDays) || 1),
    maxDays: Math.max(0, Number(o.maxDays) || 0),
    returnReminderMinutes: Math.max(0, Number(o.returnReminderMinutes) || 120),
    returnGraceMinutes: Math.max(0, Number(o.returnGraceMinutes) || 30),
    returnPromptRepeatMinutes: Math.max(
      0,
      Number(o.returnPromptRepeatMinutes) || 30,
    ),
    returnAutoCompleteHours: Math.max(0, Number(o.returnAutoCompleteHours) || 0),
    // Combined total — surfaced for back-compat with clients that read
    // a single `allowanceTotal` line (sums food + stay + legacy
    // fallback).
    allowanceTotal: round2(allowanceTotal),
    // Legacy combined per-night number — only non-zero when the
    // pricing doc hasn't been migrated to the split fields. Clients
    // should prefer the split fields above and fall back to this only
    // when both are zero.
    allowancePerNight: round2(legacyAllowancePerNight),
    legacyAllowanceTotal: round2(legacyAllowanceTotal),
    customerArrangesAll,
    foodProvided: foodProvided === true,
    stayProvided: stayProvided === true,
    // ── Legacy fields (always 0 in the new model) ──
    kmIncludedTotal: 0,
    extraKm: 0,
    extraKmCharge: 0,
    nightHaltCharge: 0,
    nightHaltTotal: 0,
    stayChargePerNight: 0,
    stayChargeTotal: 0,
    tollParking: 0,
    subtotal: round2(subtotal),
    ...layers,
  };
}

/**
 * Outstation V2 — duration-based billing (24h blocks + fractional extra hours).
 * Never uses calendar-date day counting.
 */
export function calculateOutstationFareV2({
  pricing,
  pickupAt,
  expectedReturnAt,
  durationMinutes: durationMinutesIn = null,
  foodProvided = true,
  stayProvided = true,
  subscription = null,
  coupon = null,
} = {}) {
  if (!pricing) {
    throw new ApiError(400, 'Service pricing is required for fare calculation');
  }
  const o = pricing.outstation || {};
  const minDays = Math.max(1, Number(o.minDays) || 1);

  let billing;
  if (durationMinutesIn != null && Number.isFinite(Number(durationMinutesIn))) {
    const mins = Math.max(0, Math.floor(Number(durationMinutesIn)));
    billing = {
      durationMinutes: mins,
      durationHours: mins / 60,
      durationMs: mins * 60_000,
      ...computeOutstationBillingUnits(mins, { minDays }),
    };
  } else if (pickupAt && expectedReturnAt) {
    billing = computeOutstationDurationBilling(pickupAt, expectedReturnAt, {
      minDays,
    });
  } else {
    throw new ApiError(
      400,
      'Outstation V2 fare requires pickupAt and expectedReturnAt',
    );
  }

  const dailyRate = Number(o.dailyRate) || 0;
  const configuredExtraHour = Number(o.extraHourCharge) || 0;
  const extraHourCharge =
    configuredExtraHour > 0
      ? configuredExtraHour
      : dailyRate > 0
        ? round2(dailyRate / 24)
        : 0;
  const foodAllowancePerDay = Number(o.foodAllowancePerDay) || 0;
  const stayAllowancePerNight = Number(o.stayAllowancePerNight) || 0;
  const legacyAllowancePerNight = Number(o.allowancePerNight) || 0;
  const useLegacyAllowance =
    foodAllowancePerDay <= 0 &&
    stayAllowancePerNight <= 0 &&
    legacyAllowancePerNight > 0;

  const dailyRateTotal = dailyRate * billing.billableFullDays;
  const extraHourTotal = round2(
    billing.billableExtraHours * extraHourCharge,
  );
  const baseServiceSubtotal = round2(dailyRateTotal + extraHourTotal);

  let foodAllowanceTotal = 0;
  let stayAllowanceTotal = 0;
  let legacyAllowanceTotal = 0;
  if (useLegacyAllowance) {
    const bothProvided = foodProvided === true && stayProvided === true;
    legacyAllowanceTotal = bothProvided
      ? 0
      : legacyAllowancePerNight * billing.billableNights;
  } else {
    foodAllowanceTotal =
      foodProvided === true
        ? 0
        : foodAllowancePerDay * billing.foodServiceDays;
    stayAllowanceTotal =
      stayProvided === true
        ? 0
        : stayAllowancePerNight * billing.billableNights;
  }
  const allowanceTotal =
    foodAllowanceTotal + stayAllowanceTotal + legacyAllowanceTotal;

  const subtotal = round2(baseServiceSubtotal + allowanceTotal);
  const layers = applyPlatformLayers(
    subtotal,
    pricing,
    subscription,
    allowanceTotal,
    coupon,
  );

  return {
    serviceType: SERVICE_TYPES.OUTSTATION,
    pricingModelVersion: OUTSTATION_PRICING_MODEL_CURRENT,
    durationMinutes: billing.durationMinutes,
    durationHours: billing.durationHours,
    durationMs: billing.durationMs,
    billableFullDays: billing.billableFullDays,
    billableExtraHours: billing.billableExtraHours,
    billableExtraMinutes: Math.round(billing.billableExtraHours * 60),
    billableNights: billing.billableNights,
    foodServiceDays: billing.foodServiceDays,
    // Back-compat display keys — V2 uses billable* fields, not calendar days.
    days: billing.billableFullDays,
    nights: billing.billableNights,
    dailyRate: round2(dailyRate),
    dailyRateTotal: round2(dailyRateTotal),
    extraHourCharge: round2(extraHourCharge),
    extraHourChargeRate: round2(extraHourCharge),
    outstationExtraHourCharge: round2(extraHourCharge),
    extraHourTotal: round2(extraHourTotal),
    baseServiceSubtotal: round2(baseServiceSubtotal),
    foodAllowancePerDay: round2(foodAllowancePerDay),
    foodAllowanceTotal: round2(foodAllowanceTotal),
    stayAllowancePerNight: round2(stayAllowancePerNight),
    stayAllowanceTotal: round2(stayAllowanceTotal),
    allowanceTotal: round2(allowanceTotal),
    allowancePerNight: round2(legacyAllowancePerNight),
    legacyAllowanceTotal: round2(legacyAllowanceTotal),
    minDays,
    maxDays: Math.max(0, Number(o.maxDays) || 0),
    returnReminderMinutes: Math.max(0, Number(o.returnReminderMinutes) || 120),
    returnGraceMinutes: Math.max(0, Number(o.returnGraceMinutes) || 30),
    returnPromptRepeatMinutes: Math.max(
      0,
      Number(o.returnPromptRepeatMinutes) || 30,
    ),
    returnAutoCompleteHours: Math.max(0, Number(o.returnAutoCompleteHours) || 0),
    customerArrangesAll: foodProvided === true && stayProvided === true,
    foodProvided: foodProvided === true,
    stayProvided: stayProvided === true,
    kmIncludedTotal: 0,
    extraKm: 0,
    extraKmCharge: 0,
    nightHaltCharge: 0,
    nightHaltTotal: 0,
    stayChargePerNight: 0,
    stayChargeTotal: 0,
    tollParking: 0,
    subtotal: round2(subtotal),
    ...layers,
  };
}

/**
 * Universal estimate — branches on serviceType.
 */
export const estimateFareService = async ({
  serviceType,
  // hourly fields
  slabId,
  bookedHours,
  waitingMinutes = 0,
  // outstation fields
  days,
  nights = null,
  pickupAt = null,
  expectedReturnAt = null,
  actualKm = 0,
  stayProvided = true,
  // shared fields
  scheduledAt,
  tollParking = 0,
  foodProvided = true,
  userId = null,
  carId = null,
  couponCode = null,
}) => {
  const pricing = await getServicePricingByTypeService(serviceType);
  if (!pricing || !pricing.isActive) {
    throw new ApiError(404, 'Pricing for this service type is not available');
  }

  const subscription = userId
    ? await getActiveUserSubscriptionService(userId, { carId: carId || undefined })
    : null;

  const coupon = couponCode
    ? await resolveCouponByCodeService(couponCode, { serviceType })
    : null;
  const couponMeta = coupon
    ? { _id: coupon._id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue }
    : null;
  // Outstation only checks the start; hourly checks the whole booked
  // window so a 6-hour ride that starts at 18:00 still triggers night.
  const isNight =
    serviceType === SERVICE_TYPES.HOURLY
      ? rideCoversNightWindow(
          scheduledAt || new Date(),
          Number(bookedHours) || 0,
          pricing.nightCharge,
        )
      : isNightRideAt(scheduledAt || new Date(), pricing.nightCharge);

  if (serviceType === SERVICE_TYPES.HOURLY) {
    let slab = null;
    let isCustom = false;
    if (slabId) {
      slab = pricing.slabs.id(slabId);
      if (!slab) throw new ApiError(400, 'Selected slab not found in pricing config');
    } else if (bookedHours != null) {
      // No slab chosen — try to fit a slab first, otherwise fall back to the
      // custom-hours rate if enabled.
      const fitted = findSlabForDuration(pricing.slabs, bookedHours);
      const maxSlabHours = (pricing.slabs || []).reduce(
        (max, s) => Math.max(max, s.maxHours || 0),
        0,
      );
      if (pricing.customHours?.enabled && bookedHours > maxSlabHours) {
        isCustom = true;
      } else {
        slab = fitted;
      }
    }

    if (isCustom) {
      if (!pricing.customHours?.enabled) {
        throw new ApiError(400, 'Custom-duration bookings are disabled for this service');
      }
      const maxCustom = pricing.customHours.maxHours || 0;
      if (maxCustom > 0 && bookedHours > maxCustom) {
        throw new ApiError(400, `Custom duration cannot exceed ${maxCustom} hours`);
      }
      if (!pricing.customHours.ratePerHour || pricing.customHours.ratePerHour <= 0) {
        throw new ApiError(400, 'Custom hourly rate is not configured');
      }
    }

    const breakdown = calculateHourlyFare({
      pricing,
      slab,
      isCustomDuration: isCustom,
      bookedHours: bookedHours ?? slab?.maxHours ?? null,
      isNightRide: isNight,
      waitingMinutes,
      tollParking,
      foodProvided,
      stayProvided,
      subscription,
      coupon,
    });

    const waitingBuffer = buildWaitingBufferPreview(pricing);

    return {
      pricingId: pricing._id,
      serviceType: pricing.serviceType,
      serviceName: pricing.name,
      waitingBuffer,
      selectedSlab: slab
        ? {
            _id: slab._id,
            label: slab.label,
            minHours: slab.minHours,
            maxHours: slab.maxHours,
            price: slab.price,
          }
        : null,
      customHours: pricing.customHours?.enabled
        ? {
            enabled: true,
            maxHours: pricing.customHours.maxHours || 0,
            ratePerHour: pricing.customHours.ratePerHour || 0,
            label: pricing.customHours.label || 'Custom duration',
          }
        : { enabled: false },
      isCustomDuration: isCustom,
      isNightRide: isNight,
      // Surface the admin extras config so the FE can decide whether to
      // render the food / stay toggles without re-fetching the pricing
      // doc separately.
      extrasConfig: {
        foodAllowance: {
          enabled: !!pricing.foodAllowance?.enabled,
          // Amount is intentionally 0 for hourly — we no longer
          // charge a food allowance, only display the "please provide
          // driver's food" notice when threshold is crossed.
          amount: 0,
          thresholdHours: pricing.foodAllowance?.thresholdHours || 0,
          userOptOut: false,
        },
        stayAllowance: {
          enabled: !!pricing.stayAllowance?.enabled,
          amount: pricing.stayAllowance?.amount || 0,
          thresholdHours: pricing.stayAllowance?.thresholdHours || 0,
          userOptOut: !!pricing.stayAllowance?.userOptOut,
        },
        nightCharge: {
          enabled: !!pricing.nightCharge?.enabled,
          startTime: pricing.nightCharge?.startTime || '22:00',
          endTime: pricing.nightCharge?.endTime || '06:00',
          type: pricing.nightCharge?.type || 'flat',
          amount: pricing.nightCharge?.amount || 0,
          thresholdHours: pricing.nightCharge?.thresholdHours || 0,
        },
      },
      fareBreakdown: breakdown,
      subscription: serializeSubscriptionForUser(subscription),
      coupon: couponMeta,
      // Hourly cancellation snapshot — status-driven (searching is free,
      // pre-arrival flat ₹, post-arrival flat ₹ or %). Surfaced so the
      // review/confirm page can render a "Cancellation policy" summary
      // without an extra round-trip.
      cancellationPolicy: {
        hourly: normaliseHourlyPolicy(pricing.cancellation),
      },
    };
  }

  if (serviceType === SERVICE_TYPES.OUTSTATION) {
    if (!pickupAt || !expectedReturnAt) {
      throw new ApiError(
        400,
        'Outstation estimate requires pickupAt and expectedReturnAt',
      );
    }

    let durationMeta;
    try {
      durationMeta = computeOutstationDurationBilling(pickupAt, expectedReturnAt);
    } catch (err) {
      throw new ApiError(400, err.message);
    }

    const oCfg = pricing.outstation || {};
    try {
      assertOutstationDurationWithinLimits(durationMeta.durationMinutes, {
        minDays: oCfg.minDays,
        maxDays: oCfg.maxDays,
      });
    } catch (err) {
      throw new ApiError(400, err.message, err.details || undefined);
    }

    const breakdown = calculateOutstationFareV2({
      pricing,
      pickupAt,
      expectedReturnAt,
      foodProvided,
      stayProvided,
      subscription,
      coupon,
    });

    return {
      pricingId: pricing._id,
      serviceType: pricing.serviceType,
      serviceName: pricing.name,
      // Outstation has no pickup-side waiting policy \u2014 the driver
      // travels with the customer for the entire round trip, so there's
      // no "free wait \u2192 per-min ticker" moment to bill for. We
      // return an empty buffer descriptor so the customer-facing
      // FareCard hides the "Waiting reserve" line and the wallet check
      // doesn't pre-hold money that will never be used.
      waitingBuffer: {
        bufferRupees: 0,
        freeWaitingMinutes: 0,
        chargePerMinute: 0,
        maxBillableMinutes: 0,
        maxNoShowPrompts: 0,
        noShowPromptMinutes: 0,
        noShowGraceMinutes: 0,
      },
      isNightRide: isNight,
      fareBreakdown: breakdown,
      subscription: serializeSubscriptionForUser(subscription),
      coupon: couponMeta,
      // Outstation cancellation policy snapshot — surfaced so the
      // review/confirm page can render a "Cancellation policy"
      // summary without a separate fetch. Mirrors the
      // `cancellation.outstation` sub-doc on `ServicePricing`.
      cancellationPolicy: {
        outstation: normaliseOutstationPolicy(pricing.cancellation?.outstation),
      },
    };
  }

  throw new ApiError(400, 'Unknown service type');
};

/**
 * Compact preview of the waiting-buffer policy for the customer UI.
 * Surfaces what we'll pre-collect at booking creation, why, and how
 * the unused portion is refunded — used by `FareCard` to render the
 * "Waiting buffer (refundable)" line.
 */
function buildWaitingBufferPreview(pricing) {
  const wc = pricing?.waitingCharge || {};
  const perMin = Math.max(0, Number(wc.chargePerMinute) || 0);
  const maxBillable = Math.max(0, Number(wc.maxBillableMinutes) || 0);
  return {
    bufferRupees: round2(maxBillable * perMin),
    freeWaitingMinutes: Math.max(0, Number(wc.freeWaitingMinutes) || 0),
    chargePerMinute: perMin,
    maxBillableMinutes: maxBillable,
    maxNoShowPrompts: Math.max(0, Number(wc.maxNoShowPrompts) || 0),
    noShowPromptMinutes: Math.max(0, Number(wc.noShowPromptMinutes) || 0),
    noShowGraceMinutes: Math.max(0, Number(wc.noShowGraceMinutes) || 0),
    noShowFeeType:
      wc.noShowFeeType === 'flat' ? 'flat' : 'percentage',
    noShowFeeAmount: Math.max(0, Number(wc.noShowFeeAmount) || 0),
  };
}

export function serializeSubscriptionForUser(subscription) {
  if (!subscription) return null;
  const doc = subscription.toObject ? subscription.toObject() : subscription;
  const assigned = doc.assignedDriverId;
  return {
    _id: doc._id,
    subscriptionNumber: doc.subscriptionNumber || '',
    status: doc.status,
    planNameSnapshot: doc.planNameSnapshot,
    planId: doc.planId,
    zoneId: doc.zoneId,
    carId: doc.carId,
    dailyPickup: doc.dailyPickup || null,
    dailyDropoff: doc.dailyDropoff || null,
    durationMonths: doc.durationMonths,
    includedHoursPerDay: doc.includedHoursPerDay,
    bookingDiscountType: doc.bookingDiscountType,
    bookingDiscountValue: doc.bookingDiscountValue,
    bookingDiscountMinAmount: doc.bookingDiscountMinAmount ?? 0,
    startDate: doc.startDate,
    expiryDate: doc.expiryDate,
    paidAt: doc.paidAt,
    amount: doc.amount,
    basePrice: doc.basePrice ?? doc.amount,
    serviceCharge: doc.serviceCharge ?? 0,
    serviceChargePercent: doc.serviceChargePercent ?? 0,
    gstAmount: doc.gstAmount ?? 0,
    gstPercent: doc.gstPercent ?? 0,
    platformShareRupees: doc.platformShareRupees ?? 0,
    driverShareRupees: doc.driverShareRupees ?? 0,
    assignmentStatus: doc.assignmentStatus,
    assignedDriverId: assigned?._id || assigned || null,
    assignedDriver: assigned && typeof assigned === 'object'
      ? {
        _id: assigned._id,
        name: assigned.name,
        phone: assigned.phone || assigned.phone_no,
        rating: assigned.rating,
        profilePicture: assigned.profilePicture,
      }
      : null,
    driverSharePaidAt: doc.driverSharePaidAt,
    termsAcceptedAt: doc.termsAcceptedAt,
    termsVersionSnapshot: doc.termsVersionSnapshot,
    termsTitleSnapshot: doc.termsTitleSnapshot,
    cancellationRequest: doc.cancellationRequest || null,
  };
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inclusiveCalendarDays(start, end) {
  const s = startOfDay(start);
  const e = startOfDay(end);
  if (e < s) return 0;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.floor((e - s) / MS_PER_DAY) + 1;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseWorkingDateInput(value, label) {
  if (!value) throw new ApiError(400, `${label} is required`);
  const d = startOfDay(new Date(value));
  if (Number.isNaN(d.getTime())) throw new ApiError(400, `Invalid ${label}`);
  return d;
}

function parseOptionalWorkingDate(value) {
  if (!value) return null;
  const d = startOfDay(new Date(value));
  if (Number.isNaN(d.getTime())) throw new ApiError(400, 'Invalid working end date');
  return d;
}

function assertDateWithinSubscription(date, subscription, label) {
  const d = startOfDay(date);
  const subStart = startOfDay(subscription.startDate);
  const subEnd = startOfDay(subscription.expiryDate);
  if (d < subStart || d > subEnd) {
    throw new ApiError(400, `${label} must be within the subscription period`);
  }
  return d;
}

function subscriptionStintKey(driverId, assignedAt) {
  return `${String(driverId)}_${new Date(assignedAt).getTime()}`;
}

function capWorkingDays(days, totalSubscriptionDays) {
  const n = Math.max(0, Number(days) || 0);
  if (!totalSubscriptionDays) return n;
  return Math.min(n, totalSubscriptionDays);
}

function buildSubscriptionDriverStints(doc) {
  const subStart = doc.startDate ? new Date(doc.startDate) : null;
  const subEnd = doc.expiryDate ? new Date(doc.expiryDate) : null;
  if (!subStart || !subEnd) {
    return { stints: [], totalSubscriptionDays: 0 };
  }

  const totalSubscriptionDays = inclusiveCalendarDays(subStart, subEnd);
  const stints = [];
  const now = new Date();

  for (const prev of doc.previousAssignments || []) {
    const driverId = prev.driverId?._id || prev.driverId;
    if (!driverId || !prev.assignedAt) continue;
    const stintStart = new Date(
      Math.max(startOfDay(prev.assignedAt).getTime(), subStart.getTime()),
    );
    const endRaw = prev.releasedAt ? endOfDay(prev.releasedAt) : subEnd;
    const stintEnd = new Date(Math.min(endRaw.getTime(), subEnd.getTime()));
    if (stintEnd < stintStart) continue;
    stints.push({
      driverId,
      driver:
        typeof prev.driverId === 'object' && prev.driverId?.name
          ? {
            _id: driverId,
            name: prev.driverId.name,
            phone: prev.driverId.phone || prev.driverId.phone_no || '',
          }
          : null,
      assignedAt: prev.assignedAt,
      releasedAt: prev.releasedAt || null,
      workingDays: capWorkingDays(inclusiveCalendarDays(stintStart, stintEnd), totalSubscriptionDays),
      lastWorkingDay: stintEnd,
      stintStart,
      stintEnd,
      isCurrent: false,
    });
  }

  const assignedId = doc.assignedDriverId?._id || doc.assignedDriverId;
  if (assignedId && doc.assignedAt) {
    const stintStart = new Date(
      Math.max(startOfDay(doc.assignedAt).getTime(), subStart.getTime()),
    );
    const plannedEndRaw = doc.assignedWorkingEndDate
      ? endOfDay(doc.assignedWorkingEndDate)
      : subEnd;
    const stintEnd = new Date(Math.min(plannedEndRaw.getTime(), subEnd.getTime()));
    const effectiveEnd = new Date(Math.min(stintEnd.getTime(), now.getTime()));
    if (effectiveEnd >= stintStart) {
      stints.push({
        driverId: assignedId,
        driver:
          typeof doc.assignedDriverId === 'object' && doc.assignedDriverId?.name
            ? {
              _id: assignedId,
              name: doc.assignedDriverId.name,
              phone: doc.assignedDriverId.phone || doc.assignedDriverId.phone_no || '',
            }
            : null,
        assignedAt: doc.assignedAt,
        releasedAt: null,
        assignedWorkingEndDate: doc.assignedWorkingEndDate || null,
        workingDays: capWorkingDays(
          inclusiveCalendarDays(stintStart, effectiveEnd),
          totalSubscriptionDays,
        ),
        lastWorkingDay: stintEnd,
        stintStart,
        stintEnd,
        plannedStintEnd: stintEnd,
        isCurrent: true,
      });
    }
  }

  return { stints, totalSubscriptionDays };
}

function summarizeSubscriptionPayouts(doc) {
  const { stints, totalSubscriptionDays } = buildSubscriptionDriverStints(doc);
  const driverSharePool = round2(Number(doc.driverShareRupees) || 0);
  const platformEarned = round2(Number(doc.platformShareRupees) || 0);
  const totalRevenue = round2(Number(doc.amount) || 0);
  const payouts = Array.isArray(doc.driverPayouts) ? doc.driverPayouts : [];

  const paidByStint = new Map();
  for (const p of payouts) {
    const key = subscriptionStintKey(p.driverId, p.assignedAt);
    const entry = paidByStint.get(key) || { total: 0, payments: [] };
    entry.total += Number(p.amountRupees) || 0;
    entry.payments.push(p);
    paidByStint.set(key, entry);
  }

  let paidToDriver = round2(
    payouts.reduce((sum, p) => sum + (Number(p.amountRupees) || 0), 0),
  );
  const legacyFullyPaid = !payouts.length && !!doc.driverSharePaidAt;
  if (legacyFullyPaid) {
    paidToDriver = driverSharePool;
  }

  const enrichedStints = stints.map((stint) => {
    const key = subscriptionStintKey(stint.driverId, stint.assignedAt);
    const paidInfo = paidByStint.get(key);
    const paidSoFar = round2(paidInfo?.total || 0);
    const payments = (paidInfo?.payments || []).map((p) => ({
      _id: p._id,
      amountRupees: round2(Number(p.amountRupees) || 0),
      paidAt: p.paidAt,
    }));
    return {
      ...stint,
      key,
      paidSoFar,
      payments,
    };
  });

  const driverGroupsMap = new Map();
  for (const stint of enrichedStints) {
    const id = String(stint.driverId);
    const existing = driverGroupsMap.get(id);
    if (!existing) {
      driverGroupsMap.set(id, {
        driverId: id,
        driver: stint.driver,
        periods: [stint],
        paidSoFar: stint.paidSoFar || 0,
        payments: [...(stint.payments || [])],
        totalWorkingDays: stint.workingDays || 0,
      });
    } else {
      existing.periods.push(stint);
      existing.paidSoFar = round2((existing.paidSoFar || 0) + (stint.paidSoFar || 0));
      existing.payments.push(...(stint.payments || []));
      existing.totalWorkingDays += stint.workingDays || 0;
    }
  }
  const driverGroups = Array.from(driverGroupsMap.values()).map((g) => ({
    ...g,
    paidSoFar: round2(g.paidSoFar),
    key: g.driverId,
  }));

  const remainingDriverShare = round2(Math.max(0, driverSharePool - paidToDriver));
  const canPayMore = remainingDriverShare > 0 && enrichedStints.length > 0;

  return {
    totalRevenue,
    platformEarned,
    driverSharePool,
    paidToDriver,
    remainingDriverShare,
    canPayMore,
    totalSubscriptionDays,
    stints: enrichedStints,
    driverGroups,
  };
}

export const getSubscriptionDriverPayoutDetailService = async (subscriptionId) => {
  const sub = await UserSubscription.findById(subscriptionId)
    .populate('userId', 'name phone_no email')
    .populate('zoneId', 'name city')
    .populate('assignedDriverId', 'name phone')
    .populate('previousAssignments.driverId', 'name phone')
    .lean();
  if (!sub) throw new ApiError(404, 'Subscription not found');
  if (!sub.paidAt) throw new ApiError(400, 'Subscription has not been paid yet');

  const payoutSummary = summarizeSubscriptionPayouts(sub);
  return {
    subscription: {
      _id: sub._id,
      subscriptionNumber: sub.subscriptionNumber || '',
      planNameSnapshot: sub.planNameSnapshot,
      startDate: sub.startDate,
      expiryDate: sub.expiryDate,
      paidAt: sub.paidAt,
      amount: sub.amount,
      platformShareRupees: sub.platformShareRupees,
      driverShareRupees: sub.driverShareRupees,
      userId: sub.userId,
      zoneId: sub.zoneId,
    },
    ...payoutSummary,
  };
};

export const paySubscriptionDriverSharesService = async (subscriptionId, staffId, body = {}) => {
  const { payouts } = body;
  if (!Array.isArray(payouts) || !payouts.length) {
    throw new ApiError(400, 'payouts array is required');
  }

  const sub = await UserSubscription.findById(subscriptionId)
    .populate('assignedDriverId', 'name phone')
    .populate('previousAssignments.driverId', 'name phone');
  if (!sub) throw new ApiError(404, 'Subscription not found');
  if (!sub.paidAt) throw new ApiError(400, 'Subscription has not been paid yet');

  const summary = summarizeSubscriptionPayouts(sub.toObject());
  const stintMap = new Map(summary.stints.map((s) => [s.key, s]));
  const driverSharePool = summary.driverSharePool;
  let newPayoutTotal = 0;

  for (const item of payouts) {
    const driverId = item?.driverId;
    let assignedAt = item?.assignedAt;
    const amountRupees = round2(Number(item?.amountRupees));

    if (!driverId) {
      throw new ApiError(400, 'Each payout requires driverId');
    }
    if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
      throw new ApiError(400, 'Each payout amount must be greater than zero');
    }

    let stint;
    if (assignedAt) {
      const key = subscriptionStintKey(driverId, assignedAt);
      stint = stintMap.get(key);
    } else {
      const driverStints = summary.stints.filter(
        (s) => String(s.driverId) === String(driverId),
      );
      if (!driverStints.length) {
        throw new ApiError(400, 'Driver has no working period on this subscription');
      }
      stint = driverStints[driverStints.length - 1];
      assignedAt = stint.assignedAt;
    }

    if (!stint) {
      throw new ApiError(400, 'Driver stint not found for this subscription');
    }

    newPayoutTotal = round2(newPayoutTotal + amountRupees);
    if (summary.paidToDriver + newPayoutTotal > driverSharePool) {
      throw new ApiError(
        400,
        `Total driver payouts cannot exceed the driver pool (${driverSharePool})`,
      );
    }

    const credited = await Driver.findOneAndUpdate(
      {
        _id: stint.driverId,
        isDeleted: { $ne: true },
      },
      {
        $inc: {
          'wallet.balance': amountRupees,
          'wallet.totalEarnings': amountRupees,
        },
      },
      { new: true },
    );
    if (!credited) {
      throw new ApiError(404, `Driver ${stint.driverId} not found`);
    }

    sub.driverPayouts.push({
      driverId: stint.driverId,
      assignedAt: stint.assignedAt,
      releasedAt: stint.releasedAt,
      workingDays: stint.workingDays,
      amountRupees,
      paidAt: new Date(),
      paidBy: staffId || null,
    });
  }

  await sub.save();
  return getSubscriptionDriverPayoutDetailService(subscriptionId);
};

// ─── Admin: assign / release a dedicated driver to a subscription ─────────────

function subscriptionWindowMs(subscription) {
  const startMs = subscription?.startDate ? new Date(subscription.startDate).getTime() : null;
  const endMs = subscription?.expiryDate ? new Date(subscription.expiryDate).getTime() : null;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { startMs, endMs };
}

function zoneScopeForStaff(staff) {
  if (!staff) return [];
  if (isSuperAdmin(staff)) return null;
  return (staff.assignedZones || [])
    .map((id) => String(id))
    .filter(Boolean);
}

async function assertDriverAvailableForSubscription(
  subscription,
  driverId,
  { excludeSubscriptionId, windowMs } = {},
) {
  const overlapWindow = windowMs || subscriptionWindowMs(subscription);
  const overlappingSubscription = await UserSubscription.findOne({
    _id: { $ne: excludeSubscriptionId || subscription._id },
    assignedDriverId: driverId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED,
    startDate: { $lt: new Date(overlapWindow?.endMs || subscription.expiryDate) },
    expiryDate: { $gt: new Date(overlapWindow?.startMs || subscription.startDate) },
  }).select('_id planNameSnapshot userId assignedAt assignedWorkingEndDate startDate expiryDate');

  if (overlappingSubscription) {
    // Refine with the other subscription's actual working stint when present.
    const otherStart =
      overlappingSubscription.assignedAt || overlappingSubscription.startDate;
    const otherEnd =
      overlappingSubscription.assignedWorkingEndDate
      || overlappingSubscription.expiryDate;
    const otherStartMs = otherStart ? new Date(otherStart).getTime() : null;
    const otherEndMs = otherEnd ? new Date(otherEnd).getTime() : null;
    const overlaps =
      !overlapWindow
      || (
        Number.isFinite(otherStartMs)
        && Number.isFinite(otherEndMs)
        && otherStartMs <= overlapWindow.endMs
        && otherEndMs >= overlapWindow.startMs
      );
    if (overlaps) {
      throw new ApiError(
        409,
        'Driver is already assigned to another active subscription in this period',
      );
    }
  }

  const baseWindow = overlapWindow;
  if (!baseWindow) return;

  const bufferMinutes = SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
  const buffered = applyBuffer(baseWindow, bufferMinutes);
  const driverConflictMap = await getDriverConflictMap({
    driverIds: [driverId],
    window: buffered,
    bufferMinutes,
  });
  const conflicts = driverConflictMap[String(driverId)] || [];
  if (conflicts.length) {
    const err = new ApiError(
      409,
      'Driver is already assigned to an overlapping booking. Pick another driver.',
    );
    err.data = { code: 'DRIVER_CONFLICT', conflicts };
    throw err;
  }
}

export const assignDriverToSubscriptionService = async (
  subscriptionId,
  driverId,
  staffId,
  {
    workingStartDate,
    workingEndDate,
    previousDriverLastWorkingDate,
  } = {},
) => {
  const sub = await UserSubscription.findById(subscriptionId).populate({
    path: 'carId',
    select: 'carTypeId vehicleNumber brandId modelId',
    populate: { path: 'carTypeId', select: 'name' },
  });
  if (!sub) throw new ApiError(404, 'Subscription not found');
  if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    throw new ApiError(400, 'Cannot assign a driver to an inactive subscription');
  }
  if (sub.cancellationRequest?.status === 'pending') {
    throw new ApiError(
      400,
      'Resolve the pending cancellation request before assigning a driver',
    );
  }

  const workStart = assertDateWithinSubscription(
    parseWorkingDateInput(workingStartDate, 'Working start date'),
    sub,
    'Working start date',
  );
  const workEnd = workingEndDate
    ? assertDateWithinSubscription(
      parseWorkingDateInput(workingEndDate, 'Working end date'),
      sub,
      'Working end date',
    )
    : null;
  if (workEnd && workEnd < workStart) {
    throw new ApiError(400, 'Working end date cannot be before start date');
  }

  const driver = await Driver.findOne({
    _id: driverId,
    isDeleted: { $ne: true },
    approvalStatus: 'approved',
  })
    .select('_id name phone rating profilePicture carTypeExperience')
    .populate('carTypeExperience', 'name')
    .lean();
  if (!driver) throw new ApiError(404, 'Driver not found or not approved');

  if (
    sub.assignedDriverId
    && String(sub.assignedDriverId) === String(driverId)
  ) {
    throw new ApiError(
      409,
      'This driver is already assigned to this subscription. Release them first before reassigning.',
    );
  }

  const carTypeId = await resolveCarTypeObjectId(
    sub.carId?.carTypeId?._id || sub.carId?.carTypeId,
  );
  if (carTypeId) {
    const hasExperience = (driver.carTypeExperience || []).some((ct) => {
      const id = ct?._id || ct;
      return String(id) === String(carTypeId);
    });
    if (!hasExperience) {
      throw new ApiError(409, 'Driver does not have experience with this car type');
    }
  }

  await assertDriverAvailableForSubscription(sub, driverId, {
    windowMs: {
      startMs: workStart.getTime(),
      endMs: (workEnd ? endOfDay(workEnd) : new Date(sub.expiryDate)).getTime(),
    },
  });

  if (sub.assignedDriverId) {
    const prevLastDay = assertDateWithinSubscription(
      parseWorkingDateInput(
        previousDriverLastWorkingDate,
        'Previous driver last working date',
      ),
      sub,
      'Previous driver last working date',
    );
    if (sub.assignedAt && prevLastDay < startOfDay(sub.assignedAt)) {
      throw new ApiError(
        400,
        'Previous driver last working date cannot be before their start date',
      );
    }
    sub.previousAssignments.push({
      driverId: sub.assignedDriverId,
      assignedAt: sub.assignedAt,
      releasedAt: endOfDay(prevLastDay),
      releaseReason: 'reassigned by admin',
    });
  }

  sub.assignedDriverId = driverId;
  sub.assignedAt = workStart;
  sub.assignedWorkingEndDate = workEnd ? endOfDay(workEnd) : null;
  sub.assignedBy = staffId || null;
  sub.assignmentStatus = SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED;
  sub.releasedAt = null;
  sub.releaseReason = '';

  try {
    const { withdrawSubscriptionInboxOffers } = await import(
      './subscriptionDispatch.service.js'
    );
    await withdrawSubscriptionInboxOffers(sub, 'assigned_by_admin');
  } catch {
    /* ignore */
  }

  await sub.save();

  await sub.populate('zoneId', 'name city');

  const terms = await getActiveLegalDocumentService(LEGAL_DOCUMENT_TYPES.SUBSCRIPTION);
  const carLabel = sub.carId?.vehicleNumber || 'your car';

  let emailResult = { sent: false, reason: 'not_attempted' };
  try {
    const { sendSubscriptionDriverAssignmentEmail } = await import(
      './subscriptionAssignmentEmail.service.js'
    );
    emailResult = await sendSubscriptionDriverAssignmentEmail({
      subscription: sub.toObject ? sub.toObject() : sub,
      driver,
      terms,
    });
  } catch (err) {
    console.error('[email] subscription assignment email failed:', err?.message || err);
    emailResult = { sent: false, reason: err?.message || 'send_failed' };
  }

  await sendPushNotification(
    { userId: sub.userId },
    {
      title: 'Dedicated driver assigned',
      body: `${driver.name} has been assigned for ${carLabel}. Check your email for terms and driver details.`,
      severity: 'success',
      data: {
        kind: 'subscription_driver_assigned',
        subscriptionId: String(sub._id),
        driverId: String(driverId),
        driverName: driver.name || '',
        driverPhone: driver.phone || '',
        termsVersion: terms?.version ? String(terms.version) : '',
      },
    },
  );

  notifyDriverSubscriptionAssigned(driverId, {
    subscriptionId: sub._id,
    carLabel,
  }).catch(() => null);

  const result = sub.toObject ? sub.toObject() : sub;
  result.assignmentEmail = emailResult;
  return result;
};

export const releaseSubscriptionDriverService = async (
  subscriptionId,
  { reason = '', lastWorkingDate } = {},
) => {
  const sub = await UserSubscription.findById(subscriptionId);
  if (!sub) throw new ApiError(404, 'Subscription not found');
  if (!sub.assignedDriverId) {
    throw new ApiError(400, 'No driver is currently assigned to this subscription');
  }

  const lastDay = assertDateWithinSubscription(
    parseWorkingDateInput(lastWorkingDate, 'Last working date'),
    sub,
    'Last working date',
  );
  if (sub.assignedAt && lastDay < startOfDay(sub.assignedAt)) {
    throw new ApiError(400, 'Last working date cannot be before the driver start date');
  }

  sub.previousAssignments.push({
    driverId: sub.assignedDriverId,
    assignedAt: sub.assignedAt,
    releasedAt: endOfDay(lastDay),
    releaseReason: reason || 'released by admin',
  });
  sub.assignedDriverId = null;
  sub.assignedAt = null;
  sub.assignedWorkingEndDate = null;
  sub.assignmentStatus = SUBSCRIPTION_ASSIGNMENT_STATUS.RELEASED;
  sub.releasedAt = new Date();
  sub.releaseReason = reason || '';
  await sub.save();
  return sub;
};

export const listSubscriptionAvailableDriversService = async (
  subscriptionId,
  {
    search,
    page = 1,
    limit = 50,
    staff,
    carTypeMatch = 'true',
    minRating,
    onlineOnly,
    allIndiaOnly,
    minDrivingHoursPerDay,
    zoneMatch,
  } = {},
) => {
  const sub = await UserSubscription.findById(subscriptionId)
    .populate('zoneId', 'name city')
    .populate({
      path: 'carId',
      select: 'carTypeId vehicleNumber brandId modelId',
      populate: [
        { path: 'carTypeId', select: 'name' },
        { path: 'brandId', select: 'name' },
        { path: 'modelId', select: 'name' },
      ],
    })
    .lean();
  if (!sub) throw new ApiError(404, 'Subscription not found');
  if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    throw new ApiError(400, 'Only active subscriptions can receive driver assignments');
  }

  const scope = zoneScopeForStaff(staff);
  if (scope !== null) {
    const zoneId = String(sub.zoneId?._id || sub.zoneId || '');
    if (!scope.includes(zoneId)) {
      throw new ApiError(404, 'Subscription not found or out of zone');
    }
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 300);
  const skip = (pageNum - 1) * limitNum;

  const match = {
    approvalStatus: 'approved',
    isDeleted: { $ne: true },
  };

  const subscriptionCarTypeId = await resolveCarTypeObjectId(
    sub.carId?.carTypeId?._id || sub.carId?.carTypeId,
  );
  const subscriptionZoneId = sub.zoneId?._id || sub.zoneId || null;

  if (carTypeMatch !== 'false' && subscriptionCarTypeId) {
    match.carTypeExperience = subscriptionCarTypeId;
  }

  if (zoneMatch === 'true' || zoneMatch === true) {
    if (subscriptionZoneId) {
      try {
        match.preferredOutstationZones = new mongoose.Types.ObjectId(String(subscriptionZoneId));
      } catch { /* ignore */ }
    }
  }

  if (minRating != null && minRating !== '') {
    const rating = Number(minRating);
    if (Number.isFinite(rating) && rating > 0) match.rating = { $gte: rating };
  }
  if (onlineOnly === 'true' || onlineOnly === true) {
    match.isOnline = true;
  }
  if (allIndiaOnly === 'true' || allIndiaOnly === true) {
    match.outstationAllIndiaOk = true;
  }
  if (minDrivingHoursPerDay != null && minDrivingHoursPerDay !== '') {
    const hours = Number(minDrivingHoursPerDay);
    if (Number.isFinite(hours) && hours > 0) {
      match.outstationMaxDrivingHoursPerDay = { $gte: hours };
    }
  }

  if (search) {
    const q = String(search).trim();
    if (q) {
      match.$or = [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ];
    }
  }

  const [total, drivers] = await Promise.all([
    Driver.countDocuments(match),
    Driver.find(match)
      .select(
        'name phone rating profilePicture isOnline experienceYears carTypeExperience outstationAllIndiaOk outstationMaxDrivingHoursPerDay preferredOutstationZones',
      )
      .populate('carTypeExperience', 'name')
      .populate('preferredOutstationZones', 'name city')
      .sort({ isOnline: -1, rating: -1, experienceYears: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
  ]);

  const baseWindow = subscriptionWindowMs(sub);
  const bufferMinutes = SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
  const buffered = baseWindow ? applyBuffer(baseWindow, bufferMinutes) : null;
  const assignedDriverIds = await UserSubscription.find({
    _id: { $ne: sub._id },
    status: SUBSCRIPTION_STATUS.ACTIVE,
    assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED,
    assignedDriverId: { $ne: null },
    startDate: { $lt: sub.expiryDate },
    expiryDate: { $gt: sub.startDate },
  })
    .select('assignedDriverId')
    .lean();
  const busySubscriptionDrivers = new Set(
    assignedDriverIds.map((row) => String(row.assignedDriverId)),
  );

  let conflictMap = {};
  if (buffered && drivers.length) {
    conflictMap = await getDriverConflictMap({
      driverIds: drivers.map((d) => d._id),
      window: buffered,
      bufferMinutes,
    });
  }

  const enriched = drivers.map((driver) => {
    const id = String(driver._id);
    const bookingConflicts = conflictMap[id] || [];
    const hasSubscriptionConflict = busySubscriptionDrivers.has(id);
    const zoneIds = (driver.preferredOutstationZones || []).map((z) => String(z?._id || z));
    const inSubscriptionZone = subscriptionZoneId
      ? zoneIds.includes(String(subscriptionZoneId))
      : false;
    return {
      ...driver,
      conflicts: bookingConflicts,
      hasConflict: bookingConflicts.length > 0 || hasSubscriptionConflict,
      hasSubscriptionConflict,
      inSubscriptionZone,
    };
  });

  return {
    drivers: enriched,
    total,
    page: pageNum,
    limit: limitNum,
    subscriptionZone: sub.zoneId || null,
    subscriptionCarTypeId: subscriptionCarTypeId ? String(subscriptionCarTypeId) : null,
    subscriptionCar: sub.carId || null,
    subscription: {
      dailyPickup: sub.dailyPickup || null,
      dailyDropoff: sub.dailyDropoff || null,
      includedHoursPerDay: sub.includedHoursPerDay,
      durationMonths: sub.durationMonths,
      planNameSnapshot: sub.planNameSnapshot,
    },
  };
};

const escapeSubscriptionRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function applyUserSubscriptionSearch(filter, search) {
  const q = String(search || '').trim();
  if (!q) return;
  const escaped = escapeSubscriptionRegex(q);
  const users = await User.find({
    $or: [
      { name: { $regex: escaped, $options: 'i' } },
      { phone_no: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ],
  })
    .select('_id')
    .lean();

  filter.$or = [
    { subscriptionNumber: { $regex: escaped, $options: 'i' } },
    { planNameSnapshot: { $regex: escaped, $options: 'i' } },
    ...(users.length ? [{ userId: { $in: users.map((u) => u._id) } }] : []),
  ];
}

function applyPaidAtRange(filter, from, to) {
  if (!from && !to) return;
  const paidAt = { ...(filter.paidAt || {}), $ne: null };
  if (from) {
    const fromDate = new Date(from);
    if (!Number.isNaN(fromDate.getTime())) paidAt.$gte = fromDate;
  }
  if (to) {
    const toDate = new Date(to);
    if (!Number.isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999);
      paidAt.$lte = toDate;
    }
  }
  filter.paidAt = paidAt;
}

export const listUserSubscriptionsService = async ({
  status,
  assignmentStatus,
  zoneId,
  search = '',
  cancelRequestStatus = '',
  from = '',
  to = '',
  staff,
  page = 1,
  limit = 25,
} = {}) => {
  const filter = { paidAt: { $ne: null } };
  if (status && status !== 'all') filter.status = status;
  else if (!status) filter.status = SUBSCRIPTION_STATUS.ACTIVE;
  if (assignmentStatus) filter.assignmentStatus = assignmentStatus;
  if (cancelRequestStatus === SUBSCRIPTION_CANCEL_REQUEST_STATUS.PENDING) {
    filter['cancellationRequest.status'] = SUBSCRIPTION_CANCEL_REQUEST_STATUS.PENDING;
  }
  applyPaidAtRange(filter, from, to);

  const scope = zoneScopeForStaff(staff);
  if (scope !== null) {
    if (!scope.length) {
      return { items: [], total: 0, page: Math.max(1, page), limit };
    }
    if (zoneId) {
      if (!scope.includes(String(zoneId))) {
        return { items: [], total: 0, page: Math.max(1, page), limit };
      }
      filter.zoneId = zoneId;
    } else {
      filter.zoneId = { $in: scope };
    }
  } else if (zoneId) {
    filter.zoneId = zoneId;
  }

  await applyUserSubscriptionSearch(filter, search);

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    UserSubscription.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name phone_no email')
      .populate('planId', 'name durationMonths price includedHoursPerDay')
      .populate('zoneId', 'name city')
      .populate('assignedDriverId', 'name phone rating profilePicture')
      .populate({
        path: 'carId',
        select: 'vehicleNumber carTypeId brandId modelId',
        populate: [
          { path: 'carTypeId', select: 'name' },
          { path: 'brandId', select: 'name' },
          { path: 'modelId', select: 'name' },
        ],
      }),
    UserSubscription.countDocuments(filter),
  ]);
  return { items, total, page: Math.max(1, page), limit };
};

export const listSubscriptionRevenueService = async ({
  page = 1,
  limit = 20,
  zoneId = '',
  search = '',
  from = '',
  to = '',
  payoutStatus = '',
  status = '',
  forExport = false,
} = {}) => {
  const filter = {
    paidAt: { $ne: null },
  };
  if (status && status !== 'all') filter.status = status;
  else if (!status) filter.status = SUBSCRIPTION_STATUS.ACTIVE;
  if (zoneId) filter.zoneId = zoneId;
  applyPaidAtRange(filter, from, to);
  await applyUserSubscriptionSearch(filter, search);

  const maxLimit = forExport ? 10000 : 100;
  const safeLimit = Math.max(1, Math.min(maxLimit, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const skip = (safePage - 1) * safeLimit;

  const allItems = await UserSubscription.find(filter)
    .sort({ paidAt: -1 })
    .populate('userId', 'name phone_no email')
    .populate('zoneId', 'name city')
    .populate('assignedDriverId', 'name phone')
    .populate('previousAssignments.driverId', 'name phone')
    .lean();

  let enriched = allItems.map((item) => {
    const payout = summarizeSubscriptionPayouts(item);
    return {
      ...item,
      totalRevenue: payout.totalRevenue,
      platformEarned: payout.platformEarned,
      paidToDriver: payout.paidToDriver,
      remainingDriverShare: payout.remainingDriverShare,
      driverSharePool: payout.driverSharePool,
      canPayMore: payout.canPayMore,
      driverStintCount: payout.stints.length,
    };
  });

  if (payoutStatus === 'remaining') {
    enriched = enriched.filter((row) => (row.remainingDriverShare || 0) > 0);
  } else if (payoutStatus === 'paid') {
    enriched = enriched.filter((row) => (row.remainingDriverShare || 0) <= 0);
  }

  const total = enriched.length;
  const pageItems = enriched.slice(skip, skip + safeLimit);

  let totalRevenue = 0;
  let totalPlatformEarned = 0;
  let totalDriverPool = 0;
  let totalPaidToDriver = 0;
  let totalRemaining = 0;
  for (const doc of enriched) {
    totalRevenue += doc.totalRevenue || 0;
    totalPlatformEarned += doc.platformEarned || 0;
    totalDriverPool += doc.driverSharePool || 0;
    totalPaidToDriver += doc.paidToDriver || 0;
    totalRemaining += doc.remainingDriverShare || 0;
  }

  return {
    items: pageItems,
    total,
    page: safePage,
    limit: safeLimit,
    totals: {
      count: total,
      totalRevenue: round2(totalRevenue),
      totalPlatformEarned: round2(totalPlatformEarned),
      totalDriverPool: round2(totalDriverPool),
      totalPaidToDriver: round2(totalPaidToDriver),
      totalRemaining: round2(totalRemaining),
    },
  };
};
