/** Whether admin can manually assign a driver from the bookings list. */
export function getBookingAssignmentMode(booking) {
  if (!booking || booking.driverId) return null;
  if (booking.status === 'in_emergency_pool') return 'emergency_pool';
  if (booking.status === 'pending_assignment' && booking.serviceType === 'outstation') {
    return 'outstation';
  }
  return null;
}

export function canAdminAssignBooking(booking) {
  return getBookingAssignmentMode(booking) !== null;
}

export const BOOKING_ASSIGN_CONFIG = {
  emergency_pool: {
    driversPath: (id) => `/admin/emergency-pool/${id}/available-drivers`,
    assignPath: (id) => `/admin/emergency-pool/${id}/assign-driver`,
    label: 'Scheduled ride',
  },
  outstation: {
    driversPath: (id) => `/admin/outstation-assignments/${id}/available-drivers`,
    assignPath: (id) => `/admin/outstation-assignments/${id}/assign-driver`,
    detailPath: (id) => `/admin/outstation-assignments/${id}`,
    label: 'Outstation trip',
  },
};

export const BOOKING_DETAIL_PATH = (id) => `/admin/bookings/${id}`;
