/** Keep in sync with backend/src/constants/couponTypes.js */
export const COUPON_DISCOUNT_TYPES = Object.freeze({
  PERCENTAGE: 'percentage',
  FLAT: 'flat',
});

export const COUPON_APPLICABLE_SERVICES = Object.freeze({
  HOURLY: 'hourly',
  OUTSTATION: 'outstation',
  SUBSCRIPTION: 'subscription',
});

export const COUPON_APPLICABLE_SERVICE_LIST = Object.freeze(
  Object.values(COUPON_APPLICABLE_SERVICES),
);

export const COUPON_APPLICABLE_SERVICE_LABELS = Object.freeze({
  [COUPON_APPLICABLE_SERVICES.HOURLY]: 'Hourly',
  [COUPON_APPLICABLE_SERVICES.OUTSTATION]: 'Outstation',
  [COUPON_APPLICABLE_SERVICES.SUBSCRIPTION]: 'Subscription',
});
