import Booking from '../models/booking.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_LIST,
  BOOKING_PAYMENT_STATUS,
  DISPATCH_RESPONSE,
  TERMINAL_BOOKING_STATUSES,
  PAYMENT_POLICY,
  SCHEDULED_BOOKING,
} from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { checkAdminTransition } from '../utils/adminBookingTransitions.js';

const ADMIN_OVERRIDE_BLOCKED = new Set([
  BOOKING_STATUS.PENDING_ASSIGNMENT,
  BOOKING_STATUS.SEARCHING,
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
]);

/**
 * Guard one admin override. The matrix itself lives in
 * `utils/adminBookingTransitions.js` so it can be unit-tested without the
 * model graph; this only turns a rejection into the HTTP error the panel
 * shows, listing the sources that would have worked.
 */
function assertAdminTransitionAllowed(fromStatus, toStatus, booking) {
  const verdict = checkAdminTransition(fromStatus, toStatus, {
    hasDriver: Boolean(booking?.driverId),
  });
  if (verdict.ok) return;
  throw new ApiError(
    verdict.code === 'STATUS_NOT_OVERRIDABLE' ? 400 : 409,
    verdict.message,
    { code: verdict.code, from: fromStatus, to: toStatus },
  );
}

import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToDriver,
  emitToBooking,
  emitToAdmins,
} from '../utils/socketEmitters.js';
import { cancelPaymentTimeout } from './bookingPaymentTimeout.service.js';
import { notifyDriverOrderAssigned } from '../utils/notificationDispatch.js';
import { queueBookingInvoiceEmail } from './bookingInvoiceEmail.service.js';
import { ApiError } from '../utils/apiError.js';
import {
  applyBuffer,
  assertDriverFreeForWindow,
  estimateBookingWindow,
} from './driverConflict.service.js';

function generateRideOtp() {
  const len = PAYMENT_POLICY.RIDE_OTP_LENGTH;
  const max = 10 ** len;
  const n = Math.floor(Math.random() * max);
  return String(n).padStart(len, '0');
}

function timelineObject(booking) {
  return {
    ...(booking.timeline?.toObject?.() || booking.timeline || {}),
  };
}
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
  { page, limit, search, onlineOnly, minRating, carTypeMatch } = {},
) {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false })
    .select('pickup driverId status carId serviceType bookingType hourly outstation timeline')
    .lean();
  if (!booking) throw new ApiError(404, 'Booking not found');

  const {
    listAvailableDriversForAssignmentService,
    getBookingCarTypeIdService,
    attachScheduleConflictsToDrivers,
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
    search,
    onlineOnly,
    minRating,
    carTypeMatch,
  });

  // Hide the currently assigned driver from the picker.
  if (booking.driverId && result?.drivers?.length) {
    const currentId = String(booking.driverId);
    result.drivers = result.drivers.filter((d) => String(d._id) !== currentId);
    if (typeof result.total === 'number' && result.total > 0) {
      result.total = Math.max(0, result.total - 1);
    }
  }

  await attachScheduleConflictsToDrivers(booking, result);
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

  if (staff) {
    const { assertStaffCanViewBooking } = await import('./booking.service.js');
    assertStaffCanViewBooking(staff, booking);
  }

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

  const { loadScheduledDispatchConfig } = await import(
    './bookingScheduled.service.js'
  );
  let bufferMinutes = SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
  try {
    const cfg = await loadScheduledDispatchConfig(booking.serviceType);
    const value = Number(cfg?.RIDE_BUFFER_MINUTES);
    if (Number.isFinite(value) && value >= 0) bufferMinutes = value;
  } catch {
    /* defaults */
  }
  const baseWindow = estimateBookingWindow(booking);
  if (baseWindow) {
    await assertDriverFreeForWindow({
      driverId: driver._id,
      window: applyBuffer(baseWindow, bufferMinutes),
      excludeBookingId: booking._id,
      bufferMinutes,
    });
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
 *
 * When forcing **arrived**, also mints `rideStartOtp` (same as the driver
 * "I've arrived" path) and includes the code in the user socket payload —
 * otherwise the customer UI has no OTP to show.
 */
export async function adminUpdateBookingStatusService(
  bookingId,
  { status, reason = '' } = {},
  admin = null,
) {
  if (!status || !BOOKING_STATUS_LIST.includes(status)) {
    throw new ApiError(400, `status must be one of: ${BOOKING_STATUS_LIST.join(', ')}`);
  }
  if (ADMIN_OVERRIDE_BLOCKED.has(status)) {
    throw new ApiError(400, `Admin cannot override status to ${status}`);
  }

  const booking = await Booking.findById(bookingId);
  if (!booking || booking.isDeleted) throw new ApiError(404, 'Booking not found');

  const previousStatus = booking.status;
  const needsOtpBackfill =
    previousStatus === BOOKING_STATUS.ARRIVED
    && status === BOOKING_STATUS.ARRIVED
    && !booking.rideStartOtp?.code;

  if (previousStatus === status && !needsOtpBackfill) {
    return { booking: booking.toObject(), previousStatus, changed: false };
  }

  assertAdminTransitionAllowed(previousStatus, status, booking);

  if (status === BOOKING_STATUS.CANCELLED) {
    const { cancelBookingByAdminService } = await import('./booking.service.js');
    const cancelled = await cancelBookingByAdminService(bookingId, reason);
    return { booking: cancelled, previousStatus, changed: true };
  }

  const now = new Date();
  booking.status = status;
  booking.timeline = timelineObject(booking);

  if (status === BOOKING_STATUS.EN_ROUTE && !booking.timeline.enRouteAt) {
    booking.timeline.enRouteAt = now;
  }

  let mintedOtp = false;
  if (status === BOOKING_STATUS.ARRIVED) {
    if (!booking.timeline.arrivedAt) {
      booking.timeline.arrivedAt = now;
    }
    // Match markDriverArrivedService: customer must see a start OTP.
    // Regenerate when missing or already verified (stale from a prior cycle).
    if (!booking.rideStartOtp?.code || booking.rideStartOtp?.verifiedAt) {
      booking.rideStartOtp = {
        code: generateRideOtp(),
        generatedAt: now,
        verifiedAt: null,
        attempts: 0,
      };
      mintedOtp = true;
    }
  }

  if (status === BOOKING_STATUS.STARTED) {
    if (!booking.timeline.startedAt) booking.timeline.startedAt = now;
    if (booking.rideStartOtp && !booking.rideStartOtp.verifiedAt) {
      booking.rideStartOtp.verifiedAt = now;
    }
  }

  let justCompleted = false;
  if (status === BOOKING_STATUS.COMPLETED && !booking.timeline.completedAt) {
    booking.timeline.completedAt = now;
    justCompleted = true;
    cancelPaymentTimeout(booking._id);
    if (booking.driverId) {
      await Driver.updateOne({ _id: booking.driverId }, { $set: { isOnTrip: false } });
    }

    // Settle the same trip-end money the driver's own complete path
    // settles, BEFORE the save below so the consumed/released waiting
    // buffer and the cleared pending extensions persist with the
    // booking. Without this an admin-completed trip left the waiting
    // hold on the customer's wallet and pending extension intents
    // dangling forever.
    const { settleWaitingBuffer, clearPendingExtensionsOnTerminate } = await import(
      './bookingExtension.service.js'
    );
    await settleWaitingBuffer(booking).catch((err) =>
      console.warn('[adminBookingOps] waiting settle failed:', err?.message),
    );
    await clearPendingExtensionsOnTerminate(booking, reason || 'completed_by_admin').catch(
      (err) =>
        console.warn('[adminBookingOps] extension cleanup failed:', err?.message),
    );
  }

  if (TERMINAL_BOOKING_STATUSES.includes(status) && booking.driverId) {
    await Driver.updateOne({ _id: booking.driverId }, { $set: { isOnTrip: false } });
  }

  await booking.save();

  if (justCompleted) {
    // Credit the driver, book platform revenue, count the coupon and
    // fire referral rewards — the same payout sequence the driver-side
    // complete runs. Admin-completed trips used to skip all of it, so
    // the driver was never paid and the trip never showed on their
    // Earnings page.
    const { settleCompletedTripPayouts } = await import('./bookingTrip.service.js');
    await settleCompletedTripPayouts(booking).catch((err) =>
      console.warn('[adminBookingOps] trip payout settle failed:', err?.message),
    );
    queueBookingInvoiceEmail(booking);
  }

  if (status === BOOKING_STATUS.ARRIVED && mintedOtp) {
    // Hourly no-show prompts only — outstation uses admin settle.
    if (booking.serviceType !== SERVICE_TYPES.OUTSTATION) {
      const { schedulePromptTimer } = await import('./bookingNoShowTimeout.service.js');
      schedulePromptTimer(booking._id, booking.timeline.arrivedAt || now).catch((err) =>
        console.warn('[adminBookingOps] no-show schedule failed:', err?.message),
      );
    }
    const { notifyUserDriverArrived } = await import('../utils/notificationDispatch.js');
    notifyUserDriverArrived(booking.userId, booking).catch(() => null);
  }

  const basePayload = {
    bookingId: String(booking._id),
    status: booking.status,
    bookingNumber: booking.bookingNumber || '',
    previousStatus,
    adminOverride: true,
    timeline: booking.timeline?.toObject?.() || booking.timeline || null,
    driverId: booking.driverId ? String(booking.driverId) : null,
  };

  const userPayload = { ...basePayload };
  if (booking.rideStartOtp?.code) {
    userPayload.rideStartOtp = {
      code: booking.rideStartOtp.code,
      generatedAt: booking.rideStartOtp.generatedAt,
      verifiedAt: booking.rideStartOtp.verifiedAt,
    };
  }

  const driverPayload = { ...basePayload };
  if (booking.rideStartOtp?.code) {
    driverPayload.otpRequired = !booking.rideStartOtp.verifiedAt;
  }

  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, userPayload);
  if (booking.driverId) {
    emitToDriver(booking.driverId, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  }
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, driverPayload);

  return { booking: booking.toObject(), previousStatus, changed: true };
}
