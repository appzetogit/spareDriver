/** Booking service types — keep in sync with frontend/src/constants/serviceTypes.js */
export const SERVICE_TYPES = Object.freeze({
  HOURLY: 'hourly',
  OUTSTATION: 'outstation',
});

export const SERVICE_TYPE_LIST = Object.freeze(Object.values(SERVICE_TYPES));

export const SERVICE_TYPE_LABELS = Object.freeze({
  [SERVICE_TYPES.HOURLY]: 'Hourly',
  [SERVICE_TYPES.OUTSTATION]: 'Outstation',
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
  PENDING: 'pending', // paid but no driver assigned yet
  ASSIGNED: 'assigned', // dedicated driver assigned
  RELEASED: 'released', // assignment ended (e.g. user/admin released the driver)
});

/**
 * Defaults for subscription dedicated-driver auto-search (inbox broadcast).
 * Overridable via AppSettings.subscriptionDispatch.
 */
export const SUBSCRIPTION_DISPATCH = Object.freeze({
  AUTO_SEARCH_ENABLED: true,
  /** Minutes after payment before auto-search stops and admin assigns manually. */
  ESCALATE_MINUTES: 1440,
  INBOX_BROADCAST_LIMIT: 50,
  /** Geo radius (meters) around dailyPickup when searching. */
  SEARCH_RADIUS_METERS: 25_000,
});
