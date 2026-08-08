/** Keep in sync with backend/src/constants/serviceTypes.js */
export const SERVICE_TYPES = Object.freeze({
  HOURLY: 'hourly',
  OUTSTATION: 'outstation',
});

export const SERVICE_TYPE_LIST = Object.freeze(Object.values(SERVICE_TYPES));

export const SERVICE_TYPE_LABELS = Object.freeze({
  [SERVICE_TYPES.HOURLY]: 'Hourly',
  [SERVICE_TYPES.OUTSTATION]: 'Outstation (multi-day)',
});

export const SERVICE_TYPE_DESCRIPTIONS = Object.freeze({
  [SERVICE_TYPES.HOURLY]:
    'Hourly bookings. User picks a duration slab; extra hours billed if the ride runs over.',
  [SERVICE_TYPES.OUTSTATION]:
    'Multi-day trips. Daily rate × days + night halt × (days−1) + optional food and stay charges if the customer does not provide.',
});

export const SUBSCRIPTION_DISCOUNT_TYPES = Object.freeze({
  PERCENTAGE: 'percentage',
  FLAT: 'flat',
});

export const SUBSCRIPTION_STATUS = Object.freeze({
  PENDING_PAYMENT: 'pending_payment',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
});

export const SUBSCRIPTION_ASSIGNMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  RELEASED: 'released',
});

export const SUBSCRIPTION_CANCEL_REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});
