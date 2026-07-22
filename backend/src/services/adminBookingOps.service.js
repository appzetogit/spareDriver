import Booking from '../models/booking.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_LIST,
  BOOKING_PAYMENT_STATUS,
  DISPATCH_RESPONSE,
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
import { notifyDriverOrderAssigned } from '../utils/notificationDispatch.js';
import { ApiError } from '../utils/apiError.js';

/** Pre-trip statuses where admin can swap the assigned driver. */
export const ADMIN_REASSIGN_STATUSES = Object.freeze([
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
]);

/**
 * Drivers available for admin assign/reassign on any booking.
 * Reuses the emergency-pool geo ranking helper.
 */
export async function listAvailableDriversForAdminBookingService(
  bookingId,
  { page, limit } = {},
) {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false })
    .select('pickup driverId status carId')
    .lean();
  if (!booking) throw new ApiError(404, 'Booking not found');

  const {
    listAvailableDriversForAssignmentService,
    getBookingCarTypeIdService,
  } = await import('./bookingEmergencyPool.service.js');

  const carTypeId = (await getBookingCarTypeIdService(bookingId)) || null;
  const coords = booking?.pickup?.location?.coordinates;
  const pickupCoords =
    Array.isArray(coords) && coords.length === 2
      ? { lng: coords[0], lat: coords[1] }
      : null;

  const result = await listAvailableDriversForAssignmentService({
    carTypeId,
    pickupCoords,
    page,
    limit,
  });

  // Hide the currently assigned driver from the picker.
  if (booking.driverId && result?.drivers?.length) {
    const currentId = String(booking.driverId);
    result.drivers = result.drivers.filter((d) => String(d._id) !== currentId);
    if (typeof result.total === 'number' && result.total > 0) {
      result.total = Math.max(0, result.total - 1);
    }
  }

  return result;
}

/**
 * Assign or reassign a driver on a live (pre-STARTED) booking.
 * First assign for open pool statuses; swap when a driver is already set.
 */
export async function adminAssignBookingDriverService(
  bookingId,
  driverId,
  { notes = '', staff = null } = {},
) {
  if (!bookingId || !driverId) {
    throw new ApiError(400, 'bookingId and driverId are required');
  }

  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) throw new ApiError(404, 'Booking not found');

  const previousDriverId = booking.driverId ? String(booking.driverId) : null;
  const isReassign = Boolean(previousDriverId);

  if (isReassign) {
    if (!ADMIN_REASSIGN_STATUSES.includes(booking.status)) {
      throw new ApiError(
        409,
        `Cannot reassign driver for status: ${booking.status}`,
      );
    }
    if (previousDriverId === String(driverId)) {
      throw new ApiError(409, 'Driver is already assigned to this booking');
    }
  } else {
    const firstAssignOk = [
      BOOKING_STATUS.SEARCHING,
      BOOKING_STATUS.PENDING_ASSIGNMENT,
      BOOKING_STATUS.IN_EMERGENCY_POOL,
      BOOKING_STATUS.NO_DRIVERS_FOUND,
    ].includes(booking.status);
    if (!firstAssignOk) {
      throw new ApiError(
        409,
        `Cannot assign driver for status: ${booking.status}`,
      );
    }
  }

  const driver = await Driver.findOne({
    _id: driverId,
    isDeleted: { $ne: true },
    approvalStatus: 'approved',
  });
  if (!driver) throw new ApiError(404, 'Driver not found or not approved');
  if (driver.isOnTrip) {
    throw new ApiError(409, 'Driver is already on another trip');
  }

  try {
    const { withdrawCurrentOfferService } = await import(
      './bookingDispatch.service.js'
    );
    await withdrawCurrentOfferService(booking._id, 'admin_manual_assign');
  } catch (err) {
    console.warn(
      '[adminBookingOps] failed to withdraw offers for',
      String(booking._id),
      err?.message,
    );
  }

  const now = new Date();
  const fresh = await Booking.findById(bookingId);
  if (!fresh || fresh.isDeleted) throw new ApiError(404, 'Booking not found');

  // Release previous driver (best-effort).
  if (previousDriverId) {
    Driver.updateOne({ _id: previousDriverId }, { $set: { isOnTrip: false } }).catch(
      (err) =>
        console.warn(
          '[adminBookingOps] failed to clear previous driver isOnTrip:',
          err?.message,
        ),
    );
    emitToDriver(previousDriverId, S2C_EVENTS.BOOKING_UPDATED, {
      bookingId: String(fresh._id),
      status: fresh.status,
      previousStatus: fresh.status,
      adminOverride: true,
      reassigned: true,
    });
    emitToDriver(previousDriverId, S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, {
      bookingId: String(fresh._id),
      reason: 'admin_reassigned',
    });
  }

  fresh.driverId = driver._id;
  fresh.timeline = fresh.timeline || {};
  fresh.timeline.driverAssignedAt = now;
  // First assign → DRIVER_ASSIGNED. Reassign mid-trip-progress → reset to
  // DRIVER_ASSIGNED so the new driver starts clean. Keep awaiting_payment.
  if (
    !isReassign ||
    fresh.status === BOOKING_STATUS.EN_ROUTE ||
    fresh.status === BOOKING_STATUS.ARRIVED
  ) {
    fresh.status = BOOKING_STATUS.DRIVER_ASSIGNED;
  }
  fresh.scheduled = {
    ...(fresh.scheduled?.toObject?.() || fresh.scheduled || {}),
    manualAssign: {
      assignedBy: staff?._id || null,
      assignedAt: now,
      notes: notes || '',
      reassigned: isReassign,
      previousDriverId: previousDriverId || null,
    },
  };

  if (fresh.dispatch) {
    fresh.dispatch.offers = fresh.dispatch.offers || [];
    fresh.dispatch.offers.push({
      driverId: driver._id,
      offeredAt: now,
      respondedAt: now,
      response: DISPATCH_RESPONSE.ACCEPTED,
      distanceMeters: null,
    });
    fresh.dispatch.pendingOfferIds = [];
    fresh.dispatch.currentExpiresAt = null;
  }

  await fresh.save();

  await Driver.updateOne({ _id: driver._id }, { $set: { isOnTrip: true } });

  try {
    const { enqueueRemindersAfterAssignment } = await import(
      './bookingScheduled.service.js'
    );
    enqueueRemindersAfterAssignment(fresh).catch(() => {});
  } catch {
    /* optional */
  }

  const userPayload = {
    bookingId: String(fresh._id),
    status: fresh.status,
    paymentMode: fresh.paymentMode,
    paymentStatus: fresh.paymentStatus,
    driverId: String(driver._id),
    timeline: fresh.timeline?.toObject?.() || fresh.timeline,
    reassigned: isReassign,
  };
  const driverPayload = {
    bookingId: String(fresh._id),
    status: fresh.status,
    driverId: String(driver._id),
    timeline: fresh.timeline?.toObject?.() || fresh.timeline,
  };

  emitToUser(fresh.userId, S2C_EVENTS.BOOKING_UPDATED, userPayload);
  if (isReassign) {
    emitToUser(fresh.userId, S2C_EVENTS.BOOKING_DRIVER_REASSIGNING, {
      bookingId: String(fresh._id),
      reason: 'admin_reassigned',
    });
  }
  emitToBooking(fresh._id, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToDriver(driver._id, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, userPayload);

  notifyDriverOrderAssigned(driver._id, fresh).catch(() => null);

  return {
    booking: await Booking.findById(fresh._id)
      .populate('driverId', 'name phone_no')
      .populate('userId', 'name phone_no')
      .lean(),
    paid: fresh.paymentStatus === BOOKING_PAYMENT_STATUS.PAID,
    reassigned: isReassign,
  };
}

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

  if (status === BOOKING_STATUS.CANCELLED) {
    const { cancelBookingByAdminService } = await import('./booking.service.js');
    const cancelled = await cancelBookingByAdminService(bookingId, reason);
    return { booking: cancelled, previousStatus, changed: true };
  }

  booking.status = status;

  const now = new Date();
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
