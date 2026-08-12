/** Keep in sync with backend/src/constants/bookingStatus.js */

export const BOOKING_STATUS = Object.freeze({
  PENDING_ASSIGNMENT: 'pending_assignment',
  SEARCHING: 'searching',
  DRIVER_ASSIGNED: 'driver_assigned',
  AWAITING_PAYMENT: 'awaiting_payment',
  EN_ROUTE: 'en_route',
  ARRIVED: 'arrived',
  STARTED: 'started',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_DRIVERS_FOUND: 'no_drivers_found',
  IN_EMERGENCY_POOL: 'in_emergency_pool',
});

export const BOOKING_STATUS_LIST = Object.freeze(Object.values(BOOKING_STATUS));

export const ACTIVE_BOOKING_STATUSES = Object.freeze([
  BOOKING_STATUS.PENDING_ASSIGNMENT,
  BOOKING_STATUS.SEARCHING,
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
  BOOKING_STATUS.IN_EMERGENCY_POOL,
  /** Soft-active until user cancels (refund) or searches again. */
  BOOKING_STATUS.NO_DRIVERS_FOUND,
]);

export const TERMINAL_BOOKING_STATUSES = Object.freeze([
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
]);

export const PAYMENT_MODE = Object.freeze({
  PRE_RIDE: 'pre_ride',
  POST_RIDE: 'post_ride',
});

export const PAYMENT_MODE_LIST = Object.freeze(Object.values(PAYMENT_MODE));

export const BOOKING_TYPE = Object.freeze({
  INSTANT: 'instant',
  SCHEDULED: 'scheduled',
  /** Outstation (multi-day driver) bookings are always pre-scheduled. */
  OUTSTATION: 'outstation',
});

export const BOOKING_TYPE_LIST = Object.freeze(Object.values(BOOKING_TYPE));

export const BOOKING_TYPE_LABELS = Object.freeze({
  [BOOKING_TYPE.INSTANT]: 'Book now',
  [BOOKING_TYPE.SCHEDULED]: 'Schedule for later',
  [BOOKING_TYPE.OUTSTATION]: 'Round trip',
});

export const BOOKING_TYPE_DESCRIPTIONS = Object.freeze({
  [BOOKING_TYPE.INSTANT]: "We'll find a driver right now and they'll head over.",
  [BOOKING_TYPE.SCHEDULED]: 'Pick a date and time — we dispatch a driver closer to start.',
  [BOOKING_TYPE.OUTSTATION]: 'Multi-day round trip with a dedicated driver.',
});

export const PAYMENT_MODE_LABELS = Object.freeze({
  [PAYMENT_MODE.PRE_RIDE]: 'Pay before ride starts',
  [PAYMENT_MODE.POST_RIDE]: 'Pay after ride completes',
});

export const PAYMENT_MODE_DESCRIPTIONS = Object.freeze({
  [PAYMENT_MODE.PRE_RIDE]:
    'Settle the bill right after your driver accepts. The ride begins as soon as payment is confirmed.',
  [PAYMENT_MODE.POST_RIDE]:
    'Skip payment now. Pay once your driver drops you off and the trip is marked complete.',
});

export const BOOKING_PAYMENT_STATUS = Object.freeze({
  NOT_DUE_YET: 'not_due_yet',
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDED: 'refunded',
  PARTIAL_REFUND: 'partial_refund',
  FAILED: 'failed',
});

/**
 * Payment policy mirror — keep in sync with backend/src/constants/bookingStatus.js
 * `PAYMENT_POLICY`. The client uses these to drive the Pay Now countdown,
 * the OTP input length, and the extension-prompt timer.
 *
 *   PAYMENT_DEADLINE_SECONDS  Single source of truth for the "user must
 *                             pay before the booking auto-cancels" clock.
 *                             Driver overlay + user countdown both read
 *                             this number — keep them in lockstep.
 */
export const PAYMENT_POLICY = Object.freeze({
  PAYMENT_DEADLINE_SECONDS: 60,
  PRE_PAY_WINDOW_SECONDS: 60,
  RIDE_OTP_LENGTH: 4,
  RIDE_OTP_MAX_ATTEMPTS: 5,
  EXTENSION_PROMPT_LEAD_SECONDS: 58 * 60,
  /** After booked end, seconds left to extend before auto-complete. */
  RIDE_END_EXTENSION_GRACE_SECONDS: 10 * 60,
});

/**
 * Scheduled-ride policy mirror — keep in sync with backend's
 * `SCHEDULED_BOOKING`. The UI uses these to gate the date/time picker
 * (`MIN_SCHEDULED_LEAD_HOURS`) and to label the assignment window
 * ("we start looking N hours before pickup").
 */
export const SCHEDULED_BOOKING = Object.freeze({
  MORNING_START_HOUR: 6,
  MORNING_END_HOUR: 10,
  SHORT_WINDOW_HOURS: 6,
  LONG_LEAD_HOURS: 4,
  LEAD_SCHEDULE_HOUR: 18,
  EMERGENCY_POOL_MINUTES: 120,
  RIDE_BUFFER_MINUTES: 120,
  MIN_SCHEDULED_LEAD_HOURS: 2,
  /** Outstation-only (calendar days). Hourly scheduled ignores these. */
  MIN_OUTSTATION_LEAD_DAYS: 8,
  DRIVER_VISIBILITY_DAYS: 8,
  EMERGENCY_POOL_DAYS: 2,
  REMINDER_OFFSETS_MINUTES: [60, 15],
});

/**
 * Merge a per-service `scheduledDispatch` override (from
 * `ServicePricing`) onto the platform defaults above. Use this anywhere
 * the user-facing UI needs the SAME numbers the backend will apply
 * when the booking is created — never read from `SCHEDULED_BOOKING`
 * directly without merging the override.
 */
export function mergeScheduledDispatchConfig(override) {
  if (!override || typeof override !== 'object') {
    return { ...SCHEDULED_BOOKING };
  }
  return { ...SCHEDULED_BOOKING, ...override };
}

/**
 * Read a non-negative numeric dispatch knob. Prefer the admin value
 * even when it is `0` — `Number(x) || default` wrongly treats 0 as
 * "missing" and snaps back to the platform default (e.g. 8-day lead).
 */
export function readDispatchNumber(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return n;
  const fb = Number(fallback);
  return Number.isFinite(fb) && fb >= 0 ? fb : 0;
}

/**
 * Statuses where the counterparty's phone may be shown. Hidden until
 * the driver taps "Start to pickup". Keep in sync with backend
 * `bookingStatus.js`.
 */
export const CONTACT_REVEALED_STATUSES = Object.freeze([
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
  BOOKING_STATUS.COMPLETED,
]);

export function isBookingContactRevealed(bookingOrStatus) {
  if (!bookingOrStatus) return false;
  const status =
    typeof bookingOrStatus === 'string'
      ? bookingOrStatus
      : bookingOrStatus.status;
  if (CONTACT_REVEALED_STATUSES.includes(status)) return true;
  if (
    status === BOOKING_STATUS.CANCELLED &&
    (bookingOrStatus?.timeline?.enRouteAt ||
      bookingOrStatus?.timeline?.arrivedAt)
  ) {
    return true;
  }
  return false;
}
