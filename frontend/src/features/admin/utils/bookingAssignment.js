/** Statuses where staff can manually assign a scheduled ride (no driver yet). */
const SCHEDULED_ASSIGN_STATUSES = new Set([
  'searching',
  'pending_assignment',
  'in_emergency_pool',
  'no_drivers_found',
]);

/** Outstation pool statuses that still need a driver. */
const OUTSTATION_ASSIGN_STATUSES = new Set([
  'pending_assignment',
  'searching',
  'in_emergency_pool',
  'no_drivers_found',
]);

/** Pre-trip statuses where admin can swap an already-assigned driver. */
const REASSIGN_STATUSES = new Set([
  'driver_assigned',
  'awaiting_payment',
  'en_route',
  'arrived',
]);

function hasDriver(booking) {
  return Boolean(booking?.driverId);
}

/** Whether admin can manually assign a driver from the bookings list. */
export function getBookingAssignmentMode(booking) {
  if (!booking) return null;

  // Already assigned → reassign (pre-trip only).
  if (hasDriver(booking) && REASSIGN_STATUSES.has(booking.status)) {
    return 'reassign';
  }

  if (hasDriver(booking)) return null;

  // Outstation has its own conflict-aware assign path (opted-in drivers).
  if (
    booking.serviceType === 'outstation' &&
    OUTSTATION_ASSIGN_STATUSES.has(booking.status)
  ) {
    return 'outstation';
  }

  // Prefer the emergency-pool path whenever the booking is in the pool,
  // including scheduled rides that timed out of auto-dispatch.
  if (booking.status === 'in_emergency_pool') return 'emergency_pool';

  const isScheduled =
    booking.bookingType === 'scheduled' ||
    // List rows from scheduled-jobs are always scheduled
    booking._assignmentContext === 'scheduled';

  if (isScheduled && SCHEDULED_ASSIGN_STATUSES.has(booking.status)) {
    return 'scheduled';
  }

  return null;
}

export function canAdminAssignBooking(booking) {
  return getBookingAssignmentMode(booking) !== null;
}

/** Prefer when opening the drawer from Scheduled Bookings page. */
export function canAssignScheduledBooking(booking) {
  if (!booking || hasDriver(booking)) return false;
  if (booking.serviceType === 'outstation') return false;
  return SCHEDULED_ASSIGN_STATUSES.has(booking.status);
}

/** Label for the assign / reassign row action. */
export function getAssignActionLabel(booking) {
  return hasDriver(booking) ? 'Reassign' : 'Assign';
}

export const BOOKING_ASSIGN_CONFIG = {
  scheduled: {
    driversPath: (id) => `/admin/bookings/scheduled-jobs/${id}/available-drivers`,
    assignPath: (id) => `/admin/bookings/scheduled-jobs/${id}/assign-driver`,
    label: 'Scheduled ride',
  },
  emergency_pool: {
    driversPath: (id) => `/admin/emergency-pool/${id}/available-drivers`,
    assignPath: (id) => `/admin/emergency-pool/${id}/assign-driver`,
    label: 'Emergency pool',
  },
  outstation: {
    driversPath: (id) => `/admin/outstation-assignments/${id}/available-drivers`,
    assignPath: (id) => `/admin/outstation-assignments/${id}/assign-driver`,
    detailPath: (id) => `/admin/outstation-assignments/${id}`,
    label: 'Outstation trip',
  },
  reassign: {
    driversPath: (id) => `/admin/bookings/${id}/available-drivers`,
    assignPath: (id) => `/admin/bookings/${id}/assign-driver`,
    label: 'Reassign driver',
  },
};

/** Short copy explaining who appears in the assign picker for each mode. */
export const DRIVER_ELIGIBILITY_GUIDE = {
  scheduled: {
    title: 'Who appears here',
    points: [
      'Approved drivers who are not currently on a trip',
      'Matched to this booking’s vehicle car type (when set)',
      'Nearest to pickup first when location is available',
      'Schedule conflicts are flagged — you cannot assign those',
    ],
  },
  emergency_pool: {
    title: 'Who appears here',
    points: [
      'Approved drivers who are not currently on a trip',
      'Matched to this booking’s vehicle car type (when set)',
      'Nearest to pickup first when location is available',
      'Online is optional — use the Online only filter if needed',
    ],
  },
  outstation: {
    title: 'Who appears here',
    points: [
      'Approved drivers who opted in for outstation trips',
      'Preferred zones overlap this booking’s zones',
      'Car-type match, online, rating, and All-India filters apply when set',
      'On-trip drivers may appear but conflicts are blocked',
    ],
  },
  reassign: {
    title: 'Who appears here',
    points: [
      'Approved drivers who are not currently on a trip',
      'Current assigned driver is hidden from this list',
      'Matched to this booking’s vehicle car type (when set)',
      'Nearest to pickup first when location is available',
    ],
  },
};

export const BOOKING_DETAIL_PATH = (id) => `/admin/bookings/${id}`;
