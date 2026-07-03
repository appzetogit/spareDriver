import Booking from '../models/booking.model.js';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_LIST,
  TERMINAL_BOOKING_STATUSES,
} from '../constants/bookingStatus.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToDriver,
  emitToBooking,
  emitToAdmins,
} from '../utils/socketEmitters.js';
import { cancelPaymentTimeout } from './bookingPaymentTimeout.service.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Admin override for booking status — used to unblock account deletions
 * (cancel stuck trips, force-complete, etc.). Emits the same socket events
 * as the normal trip pipeline so clients stay in sync.
 */
export async function adminUpdateBookingStatusService(
  bookingId,
  { status, reason = '' } = {},
  admin = null,
) {
  if (!status || !BOOKING_STATUS_LIST.includes(status)) {
    throw new ApiError(400, `status must be one of: ${BOOKING_STATUS_LIST.join(', ')}`);
  }

  const booking = await Booking.findById(bookingId);
  if (!booking || booking.isDeleted) throw new ApiError(404, 'Booking not found');

  const previousStatus = booking.status;
  if (previousStatus === status) {
    return { booking: booking.toObject(), previousStatus, changed: false };
  }

  booking.status = status;

  const now = new Date();
  if (status === BOOKING_STATUS.CANCELLED) {
    booking.cancellation = {
      ...(booking.cancellation?.toObject?.() || booking.cancellation || {}),
      cancelledAt: now,
      cancelledBy: 'admin',
      reason: reason || booking.cancellation?.reason || 'admin_cancelled',
    };
    cancelPaymentTimeout(booking._id);
    if (booking.driverId) {
      const { Driver } = await import('../models/driverModels/driver.model.js');
      await Driver.updateOne({ _id: booking.driverId }, { $set: { isOnTrip: false } });
    }
  }

  if (status === BOOKING_STATUS.COMPLETED && !booking.timeline?.completedAt) {
    booking.timeline = {
      ...(booking.timeline?.toObject?.() || booking.timeline || {}),
      completedAt: now,
    };
    cancelPaymentTimeout(booking._id);
    if (booking.driverId) {
      const { Driver } = await import('../models/driverModels/driver.model.js');
      await Driver.updateOne({ _id: booking.driverId }, { $set: { isOnTrip: false } });
    }
  }

  if (TERMINAL_BOOKING_STATUSES.includes(status) && booking.driverId) {
    const { Driver } = await import('../models/driverModels/driver.model.js');
    await Driver.updateOne({ _id: booking.driverId }, { $set: { isOnTrip: false } });
  }

  await booking.save();

  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    bookingNumber: booking.bookingNumber || '',
    previousStatus,
    adminOverride: true,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
  if (booking.driverId) {
    emitToDriver(booking.driverId, S2C_EVENTS.BOOKING_UPDATED, payload);
  }
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);

  return { booking: booking.toObject(), previousStatus, changed: true };
}
