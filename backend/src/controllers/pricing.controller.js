import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import * as pricingService from '../services/pricing.service.js';

// ─── Admin: Service Pricing ───────────────────────────────────────────────────

export const adminListServicePricings = asyncHandler(async (_req, res) => {
  const list = await pricingService.listServicePricingsService({ onlyActive: false });
  return res.status(200).json(new ApiResponse(200, list, 'Service pricings fetched'));
});

export const adminUpsertServicePricing = asyncHandler(async (req, res) => {
  const staffId = req.staff?._id || null;
  const saved = await pricingService.upsertServicePricingService(req.body, staffId);
  return res.status(200).json(new ApiResponse(200, saved, 'Service pricing saved'));
});

export const adminUpdateServicePricing = asyncHandler(async (req, res) => {
  const staffId = req.staff?._id || null;
  const updated = await pricingService.updateServicePricingService(req.params.id, req.body, staffId);
  return res.status(200).json(new ApiResponse(200, updated, 'Service pricing updated'));
});

export const adminDeleteServicePricing = asyncHandler(async (req, res) => {
  await pricingService.deleteServicePricingService(req.params.id);
  return res.status(200).json(new ApiResponse(200, null, 'Service pricing deleted'));
});

// ─── Admin: Subscription Plans ────────────────────────────────────────────────

export const adminListSubscriptionPlans = asyncHandler(async (_req, res) => {
  const plans = await pricingService.listSubscriptionPlansService({ onlyActive: false });
  return res.status(200).json(new ApiResponse(200, plans, 'Subscription plans fetched'));
});

export const adminCreateSubscriptionPlan = asyncHandler(async (req, res) => {
  const staffId = req.staff?._id || null;
  const plan = await pricingService.createSubscriptionPlanService(req.body, staffId);
  return res.status(201).json(new ApiResponse(201, plan, 'Subscription plan created'));
});

export const adminUpdateSubscriptionPlan = asyncHandler(async (req, res) => {
  const staffId = req.staff?._id || null;
  const plan = await pricingService.updateSubscriptionPlanService(req.params.id, req.body, staffId);
  return res.status(200).json(new ApiResponse(200, plan, 'Subscription plan updated'));
});

export const adminDeleteSubscriptionPlan = asyncHandler(async (req, res) => {
  await pricingService.deleteSubscriptionPlanService(req.params.id);
  return res.status(200).json(new ApiResponse(200, null, 'Subscription plan deleted'));
});

// ─── Admin: User Subscriptions & driver assignment ────────────────────────────

export const adminListUserSubscriptions = asyncHandler(async (req, res) => {
  const result = await pricingService.listUserSubscriptionsService({
    status: req.query.status,
    assignmentStatus: req.query.assignmentStatus,
    zoneId: req.query.zoneId,
    staff: req.staff,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 25,
  });
  return res.status(200).json(new ApiResponse(200, result, 'User subscriptions fetched'));
});

export const adminListSubscriptionAvailableDrivers = asyncHandler(async (req, res) => {
  const result = await pricingService.listSubscriptionAvailableDriversService(
    req.params.id,
    {
      search: req.query.search,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
      staff: req.staff,
      carTypeMatch: req.query.carTypeMatch,
      minRating: req.query.minRating,
      onlineOnly: req.query.onlineOnly,
      allIndiaOnly: req.query.allIndiaOnly,
      minDrivingHoursPerDay: req.query.minDrivingHoursPerDay,
      zoneMatch: req.query.zoneMatch,
    },
  );
  return res.status(200).json(new ApiResponse(200, result, 'Available drivers fetched'));
});

export const adminAssignDriverToSubscription = asyncHandler(async (req, res) => {
  const { driverId } = req.body || {};
  if (!driverId) throw new ApiError(400, 'driverId is required');
  const updated = await pricingService.assignDriverToSubscriptionService(
    req.params.id,
    driverId,
    req.staff?._id,
  );
  return res.status(200).json(new ApiResponse(200, updated, 'Driver assigned'));
});

export const adminReleaseSubscriptionDriver = asyncHandler(async (req, res) => {
  const updated = await pricingService.releaseSubscriptionDriverService(
    req.params.id,
    req.body?.reason || '',
  );
  return res.status(200).json(new ApiResponse(200, updated, 'Driver released'));
});

// ─── Public / User-facing ─────────────────────────────────────────────────────

export const getActiveServicePricings = asyncHandler(async (_req, res) => {
  const list = await pricingService.listServicePricingsService({ onlyActive: true });
  return res.status(200).json(new ApiResponse(200, list, 'Active service pricings fetched'));
});

export const getActiveSubscriptionPlans = asyncHandler(async (_req, res) => {
  const plans = await pricingService.listSubscriptionPlansService({ onlyActive: true });
  return res.status(200).json(new ApiResponse(200, plans, 'Active subscription plans fetched'));
});

export const purchaseSubscription = asyncHandler(async (req, res) => {
  const { planId, zoneId, carId, termsAccepted, dailyPickup, dailyDropoff } = req.body || {};
  const checkout = await pricingService.createSubscriptionPurchaseOrderService(
    req.user._id,
    planId,
    zoneId,
    carId,
    {
      termsAccepted: termsAccepted === true || termsAccepted === 'true',
      dailyPickup,
      dailyDropoff,
    },
  );
  return res.status(200).json(new ApiResponse(200, checkout, 'Subscription checkout created'));
});

export const verifySubscriptionPayment = asyncHandler(async (req, res) => {
  const {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    orderId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body || {};

  const result = await pricingService.verifySubscriptionPaymentService(req.user._id, {
    razorpayOrderId: razorpayOrderId || orderId || razorpay_order_id,
    razorpayPaymentId: razorpayPaymentId || razorpay_payment_id,
    razorpaySignature: razorpaySignature || razorpay_signature,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Subscription payment verified'));
});

export const getMySubscription = asyncHandler(async (req, res) => {
  const subscriptions = await pricingService.listActiveUserSubscriptionsService(req.user._id);
  return res.status(200).json(
    new ApiResponse(200, subscriptions, 'Active subscriptions fetched'),
  );
});

export const adminListSubscriptionRevenue = asyncHandler(async (req, res) => {
  const result = await pricingService.listSubscriptionRevenueService({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    zoneId: req.query.zoneId || '',
    search: req.query.search || '',
    from: req.query.from || '',
    to: req.query.to || '',
  });
  return res.status(200).json(new ApiResponse(200, result, 'Subscription revenue fetched'));
});

/**
 * Fare estimate before the user confirms a booking.
 * Body: { serviceType, slabId, bookedHours, scheduledAt, foodProvided }
 * Auth: optional — if the user is logged in we apply their active subscription discount.
 */
export const estimateFare = asyncHandler(async (req, res) => {
  const userId = req.user?._id || null;
  const {
    serviceType,
    slabId = null,
    bookedHours = null,
    scheduledAt = null,
    foodProvided = true,
    stayProvided = true,
    waitingMinutes = 0,
    tollParking = 0,
    days = null,
    actualKm = 0,
    carId = null,
  } = req.body || {};

  const result = await pricingService.estimateFareService({
    serviceType,
    slabId,
    bookedHours,
    scheduledAt,
    foodProvided,
    stayProvided,
    waitingMinutes,
    tollParking,
    days,
    actualKm,
    userId,
    carId,
  });

  return res.status(200).json(new ApiResponse(200, result, 'Fare estimated'));
});
