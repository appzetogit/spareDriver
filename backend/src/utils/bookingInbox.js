import { BOOKING_TYPE } from '../constants/bookingStatus.js';

/** Booking types that use the open inbox broadcast (not timed waves). */
export const INBOX_BOOKING_TYPES = Object.freeze([
  BOOKING_TYPE.SCHEDULED,
  BOOKING_TYPE.OUTSTATION,
]);

export function isInboxBookingType(bookingType) {
  return INBOX_BOOKING_TYPES.includes(bookingType);
}

/**
 * Pickup datetime used for tier / escalate / reminder math.
 * Hourly scheduled → `hourly.scheduledStartAt`;
 * Outstation → `outstation.pickupAt` (legacy `startDate` fallback).
 */
export function resolveBookingSearchStartAt(booking) {
  if (!booking) return null;
  const hourlyStart = booking?.hourly?.scheduledStartAt;
  if (hourlyStart) {
    const d = new Date(hourlyStart);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const outStart = booking?.outstation?.pickupAt || booking?.outstation?.startDate;
  if (outStart) {
    const d = new Date(outStart);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}
