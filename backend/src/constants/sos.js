import { BOOKING_STATUS } from './bookingStatus.js';

export const SOS_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  RESOLVED: 'RESOLVED',
});

export const SOS_STATUS_LIST = Object.freeze(Object.values(SOS_STATUS));

export const SOS_TRIGGERED_BY = Object.freeze({
  PASSENGER: 'PASSENGER',
  DRIVER: 'DRIVER',
});

export const SOS_TRIGGERED_BY_LIST = Object.freeze(Object.values(SOS_TRIGGERED_BY));

/** Booking phases where SOS is allowed (active in-ride). */
export const SOS_ELIGIBLE_BOOKING_STATUSES = Object.freeze([
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
]);

export const SOS_AUDIT_EVENT = Object.freeze({
  SOS_TRIGGERED: 'SOS_TRIGGERED',
  ADMIN_NOTIFIED: 'ADMIN_NOTIFIED',
  OPERATIONS_NOTIFIED: 'OPERATIONS_NOTIFIED',
  EMERGENCY_CONTACT_NOTIFIED: 'EMERGENCY_CONTACT_NOTIFIED',
  LOCATION_UPDATED: 'LOCATION_UPDATED',
  SOS_RESOLVED: 'SOS_RESOLVED',
});

export const SOS_SOCKET_EVENTS = Object.freeze({
  NEW_SOS: 'new-sos',
  SOS_LOCATION: 'sos-location',
  SOS_RESOLVED: 'sos-resolved',
});

export const SOS_SOCKET_ROOMS = Object.freeze({
  ADMIN: 'admin-room',
  OPERATIONS: 'operations-room',
});
