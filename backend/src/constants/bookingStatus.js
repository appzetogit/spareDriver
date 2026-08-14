/**
 * Booking lifecycle constants.
 *
 * Mirrored verbatim in `frontend/src/constants/bookingStatus.js`. Keep both
 * files in sync — any new state must land on both sides in the same change.
 *
 * The status machine is intentionally linear with two terminal branches:
 *
 *   searching → driver_assigned → awaiting_payment? → en_route → arrived
 *             → started → completed
 *             ↘ cancelled
 *             ↘ no_drivers_found → (search again → searching) | (cancel → refund)
 *
 * `awaiting_payment` only appears for `pre_ride` payment mode. Phase 4 ends
 * the flow at `driver_assigned` (post-pay) or once `awaiting_payment` is
 * cleared back to `driver_assigned` (pre-pay). Anything from `en_route`
 * onward is Phase 5.
 */

export const BOOKING_STATUS = Object.freeze({
  /**
   * Future-scheduled hourly bookings sit here until the worker fires
   * `kickoffScheduledAssignment` (rideTime − LONG_LEAD_HOURS). At that
   * point the status flips to SEARCHING and the standard wave dispatcher
   * takes over. Instant bookings skip this state entirely.
   */
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
  /**
   * Scheduled booking that still has no driver
   * `SCHEDULED_BOOKING.EMERGENCY_POOL_MINUTES` minutes before pickup.
   * Surfaced on the admin/sub-admin "Emergency Pool" dashboard so a
   * human can assign a driver by hand. Team members only see entries
   * whose pickup is inside a zone they're assigned to.
   */
  IN_EMERGENCY_POOL: 'in_emergency_pool',
});

export const BOOKING_STATUS_LIST = Object.freeze(Object.values(BOOKING_STATUS));

/** Statuses where a booking is still "live" (driver may have work to do). */
export const ACTIVE_BOOKING_STATUSES = Object.freeze([
  BOOKING_STATUS.PENDING_ASSIGNMENT,
  BOOKING_STATUS.SEARCHING,
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
  BOOKING_STATUS.IN_EMERGENCY_POOL,
  /**
   * Soft-active: dispatch exhausted its waves but payment is still held.
   * User can Search again or Cancel (refund only on cancel).
   */
  BOOKING_STATUS.NO_DRIVERS_FOUND,
]);

export const TERMINAL_BOOKING_STATUSES = Object.freeze([
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
]);

/** When does the customer's card get charged. */
export const PAYMENT_MODE = Object.freeze({
  PRE_RIDE: 'pre_ride',
  POST_RIDE: 'post_ride',
});

export const PAYMENT_MODE_LIST = Object.freeze(Object.values(PAYMENT_MODE));

/**
 * Whether the user wants the ride to start right away, at a future time,
 * or is making an outstation (multi-day) booking.
 * Decided on the very first screen of the booking flow.
 */
export const BOOKING_TYPE = Object.freeze({
  INSTANT: 'instant',
  SCHEDULED: 'scheduled',
  /** Outstation (multi-day driver) bookings are always pre-scheduled. */
  OUTSTATION: 'outstation',
});

export const BOOKING_TYPE_LIST = Object.freeze(Object.values(BOOKING_TYPE));

/** Payment lifecycle, independent of ride status. */
export const BOOKING_PAYMENT_STATUS = Object.freeze({
  /** Pre-pay flow before driver accepts; post-pay before ride completes. */
  NOT_DUE_YET: 'not_due_yet',
  /** Razorpay order created, awaiting user to complete checkout. */
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDED: 'refunded',
  PARTIAL_REFUND: 'partial_refund',
  FAILED: 'failed',
});

/** Dispatch policy knobs. */
export const DISPATCH = Object.freeze({
  /** Seconds a wave of drivers has to accept before we move to the next wave. */
  OFFER_TIMEOUT_SECONDS: 30,
  /** Maximum number of waves before declaring "no drivers found". */
  MAX_ATTEMPTS: 5,
  /** Number of drivers offered in parallel per wave. */
  WAVE_SIZE: 5,
  /** First (smallest) search radius, in metres. */
  SEARCH_RADIUS_START_METERS: 1000,
  /** How much to grow the radius each step when a wave is empty. */
  SEARCH_RADIUS_STEP_METERS: 1000,
  /** Hard ceiling — never search drivers further than this from pickup. */
  SEARCH_RADIUS_MAX_METERS: 5000,
  /** Seconds the user has to pay (pre-pay flow) before booking auto-cancels. */
  PRE_PAY_TIMEOUT_SECONDS: 300,
});

/**
 * Payment policy knobs.
 *
 *   PAYMENT_DEADLINE_SECONDS  Hard deadline — counted from
 *                             `timeline.driverAssignedAt` — within which the
 *                             customer MUST complete payment. The driver is
 *                             frozen behind an overlay while this clock runs.
 *                             If the booking is still `awaiting_payment` when
 *                             the timer fires we auto-cancel it and release
 *                             the driver back to the dispatcher.
 *   PRE_PAY_WINDOW_SECONDS    Deprecated alias kept so older code paths
 *                             continue to compile. New code should reference
 *                             `PAYMENT_DEADLINE_SECONDS` instead.
 *   RIDE_OTP_LENGTH           How many digits the start-of-ride OTP has.
 *   RIDE_OTP_MAX_ATTEMPTS     Max wrong attempts before the driver must
 *                             contact support (we surface a soft error; the
 *                             booking is not auto-cancelled).
 *   EXTENSION_PROMPT_LEAD_SECONDS  Seconds before booked end time at which
 *                                  we push "ride ending soon — extend?"
 *                                  and the user app surfaces the extend
 *                                  sheet. Kept on both sides so timers
 *                                  stay in lockstep.
 *   RIDE_END_EXTENSION_GRACE_SECONDS  After booked duration ends, how long
 *                                  the customer still has to extend before
 *                                  the server auto-completes the ride.
 */
export const PAYMENT_POLICY = Object.freeze({
  PAYMENT_DEADLINE_SECONDS: 60,
  PRE_PAY_WINDOW_SECONDS: 60,
  RIDE_OTP_LENGTH: 4,
  RIDE_OTP_MAX_ATTEMPTS: 5,
  EXTENSION_PROMPT_LEAD_SECONDS: 58 * 60,
  RIDE_END_EXTENSION_GRACE_SECONDS: 10 * 60,
});

/** Constants for the user-facing "nearby drivers" view (home page). */
export const NEARBY_DRIVERS = Object.freeze({
  /** Default radius shown to the customer on the home page. */
  DEFAULT_RADIUS_METERS: 2000,
  /** Hard ceiling the user-facing endpoint will honour. */
  MAX_RADIUS_METERS: 5000,
  /** Default number of driver pins shown on the map / in the bottom sheet. */
  DEFAULT_LIMIT: 8,
  MAX_LIMIT: 25,
});

/** Driver's response to a dispatch offer. */
export const DISPATCH_RESPONSE = Object.freeze({
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled',
});

/**
 * Scheduled-ride dispatcher policy.
 *
 * The user picks a future pickup time; the backend decides WHEN to start
 * searching for a driver based on the following tiers, in order:
 *
 *   1. "Morning rides" (start time in [MORNING_START_HOUR, MORNING_END_HOUR))
 *      a. pickup is TOMORROW (or today)  → search immediately so
 *         drivers can plan their day.
 *      b. pickup is the day-after-tomorrow or later → defer the
 *         dispatcher to `LEAD_SCHEDULE_HOUR` of the evening BEFORE
 *         pickup. Admins want morning rides assigned the night before.
 *
 *   2. Short-window rides (hoursUntilStart ≤ SHORT_WINDOW_HOURS)
 *      → search immediately — same UX as instant once we're close.
 *
 *   3. Everything else
 *      → defer: enqueue an `assign` job that fires at
 *        `scheduledStartAt − LONG_LEAD_HOURS`.
 *
 * Once the assignment window opens, scheduled bookings use a single
 * non-expiring inbox broadcast to every matching driver (no wave
 * timers). Instant rides keep the timed wave dispatcher.
 *
 * Escalation into the admin emergency pool is a recurring batch sweep
 * every `EMERGENCY_POOL_BATCH_INTERVAL_MINUTES` (default 45). The
 * cutoff itself remains `scheduledStartAt − EMERGENCY_POOL_MINUTES`
 * (worst-case lag into the pool ≈ one batch interval after cutoff).
 *
 * Reminder jobs (`REMINDER_OFFSETS_MINUTES`) only fire once a driver
 * has been assigned. Knobs are overridable per-service via
 * `ServicePricing.scheduledDispatch`.
 */
export const SCHEDULED_BOOKING = Object.freeze({
  MORNING_START_HOUR: 6,
  MORNING_END_HOUR: 10,
  SHORT_WINDOW_HOURS: 6,
  LONG_LEAD_HOURS: 4,
  /**
   * Hour-of-day (0–23) at which the "morning ride scheduled for a
   * future date" assignment job fires the evening BEFORE pickup.
   * Default 18 (6 PM). Admin-tunable per service.
   */
  LEAD_SCHEDULE_HOUR: 18,
  EMERGENCY_POOL_MINUTES: 120,
  /**
   * How often the batch escalate cron scans for overdue unmatched
   * scheduled bookings. 45 min balances sweep cost vs latency into
   * the emergency pool (worst-case lag ≈ one interval after cutoff).
   * Override via ServicePricing.scheduledDispatch when tighter sweeps
   * are needed.
   */
  EMERGENCY_POOL_BATCH_INTERVAL_MINUTES: 45,
  /**
   * Buffer (in minutes) padded around every booking's time window when
   * checking for conflicts on the dispatch side. A driver is offered a
   * new booking ONLY if none of their existing active/scheduled
   * bookings overlap `[newStart − RIDE_BUFFER_MINUTES, newEnd +
   * RIDE_BUFFER_MINUTES]`. Lets drivers stack future scheduled
   * bookings safely without back-to-back overlaps.
   */
  RIDE_BUFFER_MINUTES: 120,
  REMINDER_OFFSETS_MINUTES: Object.freeze([60, 15]),
  /**
   * Hard floor on how far in advance a scheduled booking can be created.
   * The emergency-pool window opens `EMERGENCY_POOL_MINUTES` before
   * pickup, so anything sooner than that has no safety net — we
   * require ≥ 2h lead time to keep the dispatcher honest. Users
   * needing a ride sooner should pick "Instant".
   */
  MIN_SCHEDULED_LEAD_HOURS: 2,
  /**
   * Outstation-only day knobs (hourly scheduled stays on the hour fields
   * above). Calendar days, local midnight relative to pickup date.
   */
  MIN_OUTSTATION_LEAD_DAYS: 8,
  DRIVER_VISIBILITY_DAYS: 8,
  EMERGENCY_POOL_DAYS: 2,
  /** Cap for one-shot inbox broadcast (matching drivers within max radius). */
  INBOX_BROADCAST_LIMIT: 50,
});

/** Dispatch modes stored on `booking.dispatch.mode`. */
export const DISPATCH_MODE = Object.freeze({
  /** Instant (and legacy) timed waves with offer expiry. */
  WAVE: 'wave',
  /** Scheduled open inbox — no offer countdown. */
  INBOX: 'inbox',
});

/**
 * Instant / scheduled / outstation: phone/email unlock at ARRIVED.
 * Chat stays available earlier. Keep in sync with frontend bookingStatus.js.
 */
export const CONTACT_REVEALED_STATUSES = Object.freeze([
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
  BOOKING_STATUS.COMPLETED,
]);

export const OUTSTATION_CONTACT_REVEALED_STATUSES = Object.freeze([
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
  BOOKING_STATUS.COMPLETED,
]);

function isOutstationContactBooking(booking) {
  if (!booking || typeof booking === 'string') return false;
  return (
    booking.bookingType === 'outstation'
    || booking.serviceType === 'outstation'
    || Boolean(booking.outstation)
  );
}

/**
 * Whether either party may see the other's contact details.
 * All ride types: only after the driver marks arrived.
 * Cancelled trips keep contact only if it had already unlocked.
 */
export function isBookingContactRevealed(bookingOrStatus) {
  if (!bookingOrStatus) return false;
  const status =
    typeof bookingOrStatus === 'string'
      ? bookingOrStatus
      : bookingOrStatus.status;
  const outstation = isOutstationContactBooking(bookingOrStatus);
  const allowed = outstation
    ? OUTSTATION_CONTACT_REVEALED_STATUSES
    : CONTACT_REVEALED_STATUSES;
  if (allowed.includes(status)) return true;
  if (status === BOOKING_STATUS.CANCELLED) {
    return Boolean(bookingOrStatus?.timeline?.arrivedAt);
  }
  return false;
}
