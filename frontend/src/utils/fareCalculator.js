/**
 * Client-side mirror of backend `pricing.service.js`.
 * Keep math in sync with backend; this exists for instant admin preview
 * and frontend booking review (no HTTP round-trip needed).
 */
import { SERVICE_TYPES } from '../constants/serviceTypes';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function isNightRideAt(date, nightConfig) {
  if (!nightConfig?.enabled) return false;
  const [startH, startM] = (nightConfig.startTime || '22:00').split(':').map(Number);
  const [endH, endM] = (nightConfig.endTime || '06:00').split(':').map(Number);
  const at = new Date(date);
  const cur = at.getHours() * 60 + at.getMinutes();
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  if (start === end) return false;
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

function applyCouponDiscount(subtotal, coupon) {
  if (!coupon) return 0;
  const minAmount = Number(coupon.minOrderAmount) || 0;
  if (subtotal < minAmount) return 0;
  const value = Number(coupon.discountValue) || 0;
  if (value <= 0) return 0;
  let discount =
    coupon.discountType === 'percentage'
      ? (subtotal * value) / 100
      : value;
  const maxCap = Number(coupon.maxDiscountAmount) || 0;
  if (maxCap > 0 && coupon.discountType === 'percentage') {
    discount = Math.min(discount, maxCap);
  }
  return Math.min(round2(discount), round2(subtotal));
}

function applySubscriptionDiscount(subtotal, subscription) {
  if (!subscription) return 0;
  const minAmount = Number(subscription.bookingDiscountMinAmount) || 0;
  if (subtotal < minAmount) return 0;
  const value = subscription.bookingDiscountValue || 0;
  if (value <= 0) return 0;
  const discount =
    subscription.bookingDiscountType === 'percentage'
      ? (subtotal * value) / 100
      : value;
  return Math.min(round2(discount), round2(subtotal));
}

export function calculateSubscriptionCheckout(plan, coupon = null) {
  const basePrice = round2(Number(plan?.price) || 0);
  const serviceChargePercent = Number(plan?.serviceChargePercent) || 0;
  const gstPercent = plan?.gstPercent != null ? Number(plan.gstPercent) : 18;
  const platformSharePercent = Number(plan?.platformSharePercent ?? 50);
  const driverSharePercent = Number(plan?.driverSharePercent ?? 50);
  const couponDiscount = applyCouponDiscount(basePrice, coupon);
  const netBasePrice = round2(Math.max(0, basePrice - couponDiscount));
  const serviceCharge = round2((netBasePrice * serviceChargePercent) / 100);
  const gstAmount = round2(((netBasePrice + serviceCharge) * gstPercent) / 100);
  const totalPayable = round2(netBasePrice + serviceCharge + gstAmount);
  const platformShareRupees = round2((netBasePrice * platformSharePercent) / 100);
  const driverShareRupees = round2((netBasePrice * driverSharePercent) / 100);
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

/**
 * Mirror of backend `pricing.service.js#applyPlatformLayers`. See the
 * backend doc-comment for the full reasoning — short version:
 *
 *   `allowancePassThrough` is the food + stay allowance portion of the
 *   subtotal. Platform commission is NEVER applied to it; those rupees
 *   flow 1:1 to the driver. Platform fee + GST still hit the net
 *   (post-coupon) subtotal — they're customer-facing fees.
 */
function resolvePlatformFeeConfig(pricing = {}) {
  const type = pricing.platformFeeType === 'flat' ? 'flat' : 'percentage';
  const amount = Math.max(0, Number(pricing.platformFeeAmount) || 0);
  const legacyPct = Math.max(0, Number(pricing.serviceChargePercent) || 0);
  if (type === 'flat') return { type: 'flat', amount };
  if (amount > 0) return { type: 'percentage', amount };
  if (legacyPct > 0) return { type: 'percentage', amount: legacyPct };
  return { type: 'percentage', amount: 0 };
}

function applyPlatformLayers(subtotal, pricing, subscription, allowancePassThrough = 0, coupon = null) {
  const couponDiscount = applyCouponDiscount(subtotal, coupon);
  const netSubtotal = Math.max(0, round2(subtotal - couponDiscount));

  const { type: platformFeeType, amount: platformFeeAmount } =
    resolvePlatformFeeConfig(pricing || {});
  const platformFee =
    platformFeeType === 'flat'
      ? platformFeeAmount
      : (netSubtotal * platformFeeAmount) / 100;
  const gstPercent = pricing.gstPercent || 0;
  const gstAmount = ((netSubtotal + platformFee) * gstPercent) / 100;
  const subscriptionDiscount = applySubscriptionDiscount(netSubtotal, subscription);
  const totalPayable = Math.max(0, netSubtotal + platformFee + gstAmount - subscriptionDiscount);

  const platformCommissionPercent = pricing.platformCommissionPercent || 0;
  const passThrough = Math.max(0, Math.min(Number(allowancePassThrough) || 0, subtotal));
  const commissionableSubtotal = Math.max(0, subtotal - passThrough);
  const platformCommission = (commissionableSubtotal * platformCommissionPercent) / 100;
  const driverEarning = Math.max(0, subtotal - platformCommission);
  const driverFareEarning = Math.max(0, commissionableSubtotal - platformCommission);
  const driverAllowanceEarning = passThrough;

  return {
    couponDiscount: round2(couponDiscount),
    netSubtotal: round2(netSubtotal),
    platformFee: round2(platformFee),
    platformFeeType,
    platformFeeAmount,
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

export function calculateHourlyFare({
  pricing,
  slab = null,
  actualDurationMin = null,
  bookedHours = null,
  isNightRide = false,
  waitingMinutes = 0,
  tollParking = 0,
  subscription = null,
} = {}) {
  if (!pricing) return null;

  const slabPrice = slab?.price ?? 0;
  const slabMaxHours = slab?.maxHours ?? bookedHours ?? 0;

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

  let nightCharge = 0;
  if (isNightRide && pricing.nightCharge?.enabled) {
    nightCharge =
      pricing.nightCharge.type === 'percentage'
        ? (slabPrice * (pricing.nightCharge.amount || 0)) / 100
        : pricing.nightCharge.amount || 0;
  }

  const toll = pricing.tollParkingEnabled ? Math.max(0, tollParking || 0) : 0;

  const subtotal = slabPrice + extraHourCharge + waitingCharge + nightCharge + toll;
  const layers = applyPlatformLayers(subtotal, pricing, subscription);

  return {
    serviceType: SERVICE_TYPES.HOURLY,
    packagePrice: round2(slabPrice),
    extraHours,
    extraHourCharge: round2(extraHourCharge),
    waitingMinutes: waitingMinutes || 0,
    waitingCharge: round2(waitingCharge),
    nightCharge: round2(nightCharge),
    tollParking: round2(toll),
    subtotal: round2(subtotal),
    ...layers,
  };
}

/**
 * Mirrors the backend outstation pricing model with separate food
 * (per day) and stay (per night) allowances:
 *
 *   subtotal = dailyRate × days
 *            + (foodProvided ? 0 : foodAllowancePerDay   × days)
 *            + (stayProvided ? 0 : stayAllowancePerNight × nights)
 *
 * Back-compat: when both split fields are 0 and the legacy
 * `outstation.allowancePerNight` is set, fall back to the combined
 * per-night charge (waived only when BOTH provided flags are true).
 * Toll & parking are NEVER added — they're paid by the customer
 * directly to the driver.
 */
export function calculateOutstationFare({
  pricing,
  days = 1,
  // `actualKm` and `tollParking` accepted for back-compat; both are
  // no-ops in the current pricing model.
  actualKm: _actualKm = 0, // eslint-disable-line no-unused-vars
  foodProvided = true,
  stayProvided = true,
  tollParking: _tollParking = 0, // eslint-disable-line no-unused-vars
  subscription = null,
} = {}) {
  if (!pricing) return null;
  const o = pricing.outstation || {};

  const tripDays = Math.max(1, Math.ceil(days));
  const nights = Math.max(0, tripDays - 1);

  const dailyRate = Number(o.dailyRate) || 0;
  const foodAllowancePerDay = Number(o.foodAllowancePerDay) || 0;
  const stayAllowancePerNight = Number(o.stayAllowancePerNight) || 0;
  const legacyAllowancePerNight = Number(o.allowancePerNight) || 0;
  const useLegacyAllowance =
    foodAllowancePerDay <= 0 &&
    stayAllowancePerNight <= 0 &&
    legacyAllowancePerNight > 0;

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
  );

  return {
    serviceType: SERVICE_TYPES.OUTSTATION,
    days: tripDays,
    nights,
    dailyRate: round2(dailyRate),
    dailyRateTotal: round2(dailyRateTotal),
    foodAllowancePerDay: round2(foodAllowancePerDay),
    foodAllowanceTotal: round2(foodAllowanceTotal),
    stayAllowancePerNight: round2(stayAllowancePerNight),
    stayAllowanceTotal: round2(stayAllowanceTotal),
    allowanceTotal: round2(allowanceTotal),
    allowancePerNight: round2(legacyAllowancePerNight),
    legacyAllowanceTotal: round2(legacyAllowanceTotal),
    customerArrangesAll,
    foodProvided: foodProvided === true,
    stayProvided: stayProvided === true,
    // Legacy fields — always 0 in the new model.
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

export const formatCurrency = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
