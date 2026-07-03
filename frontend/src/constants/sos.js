import { BOOKING_STATUS } from './bookingStatus.js';

export const SOS_ELIGIBLE_BOOKING_STATUSES = [
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
];

export const SOS_STATUS = {
  ACTIVE: 'ACTIVE',
  RESOLVED: 'RESOLVED',
};

export const SOS_SOCKET_EVENTS = {
  NEW_SOS: 'new-sos',
  SOS_LOCATION: 'sos-location',
  SOS_RESOLVED: 'sos-resolved',
};
