import {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
} from '../constants/bookingStatus.js';

/**
 * Which statuses an admin override may move a booking OUT OF, per target.
 *
 * Until this existed only the *target* status was checked, so any state could
 * jump to any allowed state. Two of those jumps corrupted data rather than
 * merely looking odd:
 *
 *   searching → completed   settled payouts on a booking that never had a
 *                           driver: the customer was charged and the money
 *                           went nowhere.
 *   completed → started     rewound a finished trip, and completing it again
 *                           re-ran the payout path. The driver earning was
 *                           idempotent; platform revenue and coupon usage
 *                           were not, so both double-counted.
 *
 * Deliberately permissive about genuine recovery work — forcing a wedged
 * EN_ROUTE booking to ARRIVED, closing out a trip the driver never completed
 * — and strict only about leaving a terminal state, or completing a booking
 * with nobody to pay.
 *
 * Lives apart from the service so the matrix can be unit-tested without the
 * Mongoose model graph behind it.
 */
export const ADMIN_TRANSITION_SOURCES = Object.freeze({
  [BOOKING_STATUS.EN_ROUTE]: Object.freeze([
    BOOKING_STATUS.DRIVER_ASSIGNED,
    BOOKING_STATUS.ARRIVED,
  ]),
  [BOOKING_STATUS.ARRIVED]: Object.freeze([
    BOOKING_STATUS.DRIVER_ASSIGNED,
    BOOKING_STATUS.EN_ROUTE,
    BOOKING_STATUS.STARTED,
  ]),
  [BOOKING_STATUS.STARTED]: Object.freeze([BOOKING_STATUS.ARRIVED]),
  [BOOKING_STATUS.COMPLETED]: Object.freeze([
    BOOKING_STATUS.EN_ROUTE,
    BOOKING_STATUS.ARRIVED,
    BOOKING_STATUS.STARTED,
  ]),
  [BOOKING_STATUS.NO_DRIVERS_FOUND]: Object.freeze([
    BOOKING_STATUS.PENDING_ASSIGNMENT,
    BOOKING_STATUS.SEARCHING,
    BOOKING_STATUS.IN_EMERGENCY_POOL,
  ]),
  [BOOKING_STATUS.IN_EMERGENCY_POOL]: Object.freeze([
    BOOKING_STATUS.PENDING_ASSIGNMENT,
    BOOKING_STATUS.SEARCHING,
    BOOKING_STATUS.NO_DRIVERS_FOUND,
  ]),
  // Cancelling is allowed from anything still live; the cancel service itself
  // claims the booking atomically and rejects rows that already finished.
  [BOOKING_STATUS.CANCELLED]: Object.freeze([...ACTIVE_BOOKING_STATUSES]),
});

/**
 * Check one admin override.
 *
 * Returns a result rather than throwing so this stays free of the HTTP error
 * type; the service turns a rejection into an `ApiError`.
 *
 * Same-status calls are not this function's concern — the service returns
 * early for those, which is what keeps the ARRIVED → ARRIVED OTP backfill
 * working.
 *
 * @param {string} fromStatus  the booking's current status
 * @param {string} toStatus    the status the admin is forcing
 * @param {{ hasDriver?: boolean }} [context]
 * @returns {{ ok: true } | { ok: false, code: string, message: string, allowedFrom?: string[] }}
 */
export function checkAdminTransition(fromStatus, toStatus, { hasDriver = false } = {}) {
  const allowedFrom = ADMIN_TRANSITION_SOURCES[toStatus];

  if (!allowedFrom) {
    return {
      ok: false,
      code: 'STATUS_NOT_OVERRIDABLE',
      message: `Admin cannot override status to ${toStatus}`,
    };
  }

  if (!allowedFrom.includes(fromStatus)) {
    return {
      ok: false,
      code: 'INVALID_STATUS_TRANSITION',
      message: `Cannot move a ${fromStatus} booking to ${toStatus}. Allowed from: ${allowedFrom.join(', ')}.`,
      allowedFrom: [...allowedFrom],
    };
  }

  // Completing settles commission, platform revenue and the driver's earning.
  // With nobody assigned there is no one to pay and the customer has already
  // been charged — refuse rather than book revenue against a null driver.
  if (toStatus === BOOKING_STATUS.COMPLETED && !hasDriver) {
    return {
      ok: false,
      code: 'COMPLETE_WITHOUT_DRIVER',
      message:
        'Cannot complete a booking with no assigned driver — assign a driver first, or cancel it to refund the customer.',
    };
  }

  return { ok: true };
}
