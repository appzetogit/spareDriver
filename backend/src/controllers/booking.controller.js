import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import {
  createBookingService,
  getActiveBookingForUserService,
  listActiveBookingsForUserService,
  listAllBookingsForUserService,
  getActiveBookingForDriverService,
  getBookingByIdService,
  cancelBookingByUserService,
  searchAgainBookingService,
  rescheduleBookingService,
  sanitizeBookingForDriver,
  listAdminBookingsService,
  assertStaffCanViewBooking,
} from '../services/booking.service.js';
import {
  initiateExtensionService,
  verifyExtensionOtpService,
  payExtensionService,
  cancelExtensionService,
  dismissExtensionByDriverService,
} from '../services/bookingExtension.service.js';
import { declineExtensionPromptService } from '../services/bookingRideEndTimeout.service.js';
import {
  rateDriverService,
  rateCustomerService,
} from '../services/bookingRating.service.js';
import {
  recordCustomerOnMyWay,
  recordCustomerNotComing,
} from '../services/bookingNoShowTimeout.service.js';
import {
  dispatchNextDriverService,
  acceptBookingService,
  rejectBookingService,
  withdrawCurrentOfferService,
  getPendingOfferForDriverService,
  listIncomingScheduledForDriverService,
  countIncomingScheduledForDriverService,
} from '../services/bookingDispatch.service.js';
import {
  createBookingPaymentOrderService,
  verifyBookingPaymentService,
} from '../services/bookingPayment.service.js';
import {
  getOvertimeQuoteService,
  createOvertimePaymentOrderService,
  verifyOvertimePaymentService,
} from '../services/bookingOvertime.service.js';
import {
  markDriverEnRouteService,
  markDriverArrivedService,
  startTripService,
  completeTripService,
  cancelBookingByDriverService,
} from '../services/bookingTrip.service.js';
import {
  listEmergencyPoolBookingsService,
  countEmergencyPoolBookingsService,
  adminAssignDriverToEmergencyPoolService,
  listAvailableDriversForAssignmentService,
  getBookingCarTypeIdService,
  attachScheduleConflictsToDrivers,
} from '../services/bookingEmergencyPool.service.js';
import {
  listOutstationAssignmentsService,
  getOutstationAssignmentDetailService,
  listAvailableDriversForOutstationService,
  adminAssignDriverToOutstationService,
  probeDriverConflictService,
  adminSettleOutstationArrivedService,
} from '../services/bookingOutstationAssignment.service.js';
import {
  listScheduledBookingsForAdminService,
  listAvailableDriversForScheduledBookingService,
  adminAssignDriverToScheduledBookingService,
} from '../services/bookingScheduled.service.js';
import { listAdminScheduledQueueService } from '../services/adminScheduledQueue.service.js';
import Booking from '../models/booking.model.js';

/* ------------------------------------------------------------------ */
/* User                                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /auth/bookings
 *
 * Creates a booking (status: searching for instant + immediate-tier
 * scheduled; pending_assignment for long-lead scheduled). Users can
 * have multiple concurrent bookings as long as no two of them collide
 * on the same car — `assertCarAvailableForWindow` throws 409 when they
 * do, with `{ code, conflictBookingId }` on the error data so the
 * frontend can pop a specific toast.
 */
export const createBooking = asyncHandler(async (req, res) => {
  const { booking, shouldDispatchNow } = await createBookingService(
    req.user._id,
    req.body,
  );
  // Scheduled (long-lead) bookings sit in PENDING_ASSIGNMENT until the
  // queue's `assign` job fires (rideTime − LONG_LEAD_HOURS). Instant
  // bookings + immediate-tier scheduled bookings (morning / ≤6h)
  // dispatch right now exactly like before.
  if (shouldDispatchNow !== false) {
    dispatchNextDriverService(booking._id).catch((err) => {
      console.warn('[booking] initial dispatch failed:', err.message);
    });
  }
  return res
    .status(201)
    .json(new ApiResponse(201, { booking, reused: false }, 'Booking created'));
});

export const getMyActiveBooking = asyncHandler(async (req, res) => {
  const booking = await getActiveBookingForUserService(req.user._id);
  return res.status(200).json(new ApiResponse(200, { booking }, 'Active booking'));
});

/**
 * GET /auth/bookings/active-list
 *
 * Returns every active booking for the user (sorted by status priority
 * then earliest pickup). Used by the frontend to show an "Active rides"
 * rail when the customer has more than one in flight.
 */
export const getMyActiveBookings = asyncHandler(async (req, res) => {
  const bookings = await listActiveBookingsForUserService(req.user._id);
  return res
    .status(200)
    .json(new ApiResponse(200, { bookings }, 'Active bookings'));
});

/**
 * GET /auth/bookings
 *
 * Returns all bookings for the user (active + completed/cancelled).
 */
export const getMyBookings = asyncHandler(async (req, res) => {
  const bookings = await listAllBookingsForUserService(req.user._id);
  return res.status(200).json(new ApiResponse(200, { bookings }, 'All bookings'));
});

export const getBookingById = asyncHandler(async (req, res) => {
  const booking = await getBookingByIdService(req.params.id, { userId: req.user._id });
  return res.status(200).json(new ApiResponse(200, { booking }, 'Booking fetched'));
});

export const cancelBooking = asyncHandler(async (req, res) => {
  await withdrawCurrentOfferService(req.params.id, 'cancelled_by_user');
  const booking = await cancelBookingByUserService(req.user._id, req.params.id, req.body?.reason);
  return res.status(200).json(new ApiResponse(200, { booking }, 'Booking cancelled'));
});

export const searchAgainBooking = asyncHandler(async (req, res) => {
  const booking = await searchAgainBookingService(req.user._id, req.params.id);
  return res
    .status(200)
    .json(new ApiResponse(200, { booking }, 'Searching for a driver again'));
});

export const rescheduleBooking = asyncHandler(async (req, res) => {
  const booking = await rescheduleBookingService(
    req.user._id,
    req.params.id,
    req.body || {},
  );
  return res
    .status(200)
    .json(new ApiResponse(200, { booking }, 'Booking rescheduled'));
});

export const createBookingPayment = asyncHandler(async (req, res) => {
  const order = await createBookingPaymentOrderService(req.user._id, req.params.id);
  return res.status(200).json(new ApiResponse(200, { razorpay: order }, 'Payment order created'));
});

export const verifyBookingPayment = asyncHandler(async (req, res) => {
  const booking = await verifyBookingPaymentService(req.user._id, req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, { booking }, 'Payment verified'));
});

export const getBookingOvertime = asyncHandler(async (req, res) => {
  const data = await getOvertimeQuoteService(req.user._id, req.params.id);
  return res.status(200).json(new ApiResponse(200, data, 'Overtime quote'));
});

export const createBookingOvertimePayment = asyncHandler(async (req, res) => {
  const order = await createOvertimePaymentOrderService(req.user._id, req.params.id);
  return res.status(200).json(new ApiResponse(200, { razorpay: order }, 'Overtime payment order created'));
});

export const verifyBookingOvertimePayment = asyncHandler(async (req, res) => {
  const booking = await verifyOvertimePaymentService(req.user._id, req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, { booking }, 'Overtime payment verified'));
});

/* ------------------------------------------------------------------ */
/* Driver                                                              */
/* ------------------------------------------------------------------ */

export const getDriverActiveBooking = asyncHandler(async (req, res) => {
  const booking = await getActiveBookingForDriverService(req.driver._id);
  return res.status(200).json(new ApiResponse(200, { booking }, 'Driver active booking'));
});

export const getDriverPendingOffer = asyncHandler(async (req, res) => {
  const offer = await getPendingOfferForDriverService(req.driver._id);
  return res
    .status(200)
    .json(new ApiResponse(200, { offer }, offer ? 'Pending offer' : 'No pending offer'));
});

export const getDriverIncomingScheduled = asyncHandler(async (req, res) => {
  const result = await listIncomingScheduledForDriverService(req.driver._id);
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Incoming scheduled requests'));
});

export const getDriverIncomingScheduledCount = asyncHandler(async (req, res) => {
  const count = await countIncomingScheduledForDriverService(req.driver._id);
  return res
    .status(200)
    .json(new ApiResponse(200, { count }, 'Incoming scheduled count'));
});

export const driverAcceptSubscription = asyncHandler(async (req, res) => {
  const { acceptSubscriptionOfferService } = await import(
    '../services/subscriptionDispatch.service.js'
  );
  const result = await acceptSubscriptionOfferService(req.params.id, req.driver._id);
  return res.status(200).json(new ApiResponse(200, result, 'Subscription accepted'));
});

export const driverRejectSubscription = asyncHandler(async (req, res) => {
  const { rejectSubscriptionOfferService } = await import(
    '../services/subscriptionDispatch.service.js'
  );
  const result = await rejectSubscriptionOfferService(req.params.id, req.driver._id);
  return res.status(200).json(new ApiResponse(200, result, 'Subscription ignored'));
});

export const getDriverAssignedSubscriptions = asyncHandler(async (req, res) => {
  const { listDriverAssignedSubscriptionsService } = await import(
    '../services/subscriptionDispatch.service.js'
  );
  const result = await listDriverAssignedSubscriptionsService(req.driver._id);
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Assigned subscriptions'));
});

export const getDriverAssignedSubscriptionById = asyncHandler(async (req, res) => {
  const { getDriverAssignedSubscriptionService } = await import(
    '../services/subscriptionDispatch.service.js'
  );
  const result = await getDriverAssignedSubscriptionService(
    req.driver._id,
    req.params.id,
  );
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Subscription details'));
});

export const driverAcceptBooking = asyncHandler(async (req, res) => {
  const result = await acceptBookingService(req.params.id, req.driver._id);
  if (!result.ok) {
    const message =
      result.reason === 'ride_time_passed'
        ? 'Ride time has passed — this request is no longer available'
        : result.reason === 'driver_on_trip'
          ? 'Finish your current trip before accepting another ride'
          : result.reason || 'Cannot accept booking';
    throw new ApiError(409, message);
  }
  return res.status(200).json(new ApiResponse(200, result, 'Booking accepted'));
});

export const driverRejectBooking = asyncHandler(async (req, res) => {
  const result = await rejectBookingService(req.params.id, req.driver._id);
  // `rejectBookingService` returns the dispatch result (which may itself be a
  // `no_drivers_found`) — that's fine, treat it as a successful reject.
  return res.status(200).json(new ApiResponse(200, result, 'Booking rejected'));
});

export const driverGetBookingById = asyncHandler(async (req, res) => {
  const booking = await getBookingByIdService(req.params.id, { driverId: req.driver._id });
  return res.status(200).json(new ApiResponse(200, { booking }, 'Booking fetched'));
});

/* --- Trip execution (post-accept lifecycle) ----------------------- */

export const driverMarkEnRoute = asyncHandler(async (req, res) => {
  const booking = await markDriverEnRouteService(req.driver._id, req.params.id);
  return res
    .status(200)
    .json(new ApiResponse(200, { booking: sanitizeBookingForDriver(booking) }, 'Heading to pickup'));
});

export const driverMarkArrived = asyncHandler(async (req, res) => {
  const { driverCoords } = req.body || {};
  const booking = await markDriverArrivedService(req.driver._id, req.params.id, {
    driverCoords:
      driverCoords && typeof driverCoords === 'object'
        ? {
            lat: Number(driverCoords.lat),
            lng: Number(driverCoords.lng),
            // Forwarded so the proximity guard can widen its radius by however
            // uncertain the fix admits it is. Without it a driver standing at
            // the gate with a 90 m fix is told they are too far away.
            accuracy: Number(driverCoords.accuracy),
          }
        : null,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, { booking: sanitizeBookingForDriver(booking) }, 'Arrived at pickup'));
});

export const driverStartTrip = asyncHandler(async (req, res) => {
  const booking = await startTripService(req.driver._id, req.params.id, { otp: req.body?.otp });
  return res
    .status(200)
    .json(new ApiResponse(200, { booking: sanitizeBookingForDriver(booking) }, 'Trip started'));
});

export const driverCompleteTrip = asyncHandler(async (req, res) => {
  const booking = await completeTripService(req.driver._id, req.params.id);
  return res
    .status(200)
    .json(new ApiResponse(200, { booking: sanitizeBookingForDriver(booking) }, 'Trip completed'));
});

export const driverCancelBooking = asyncHandler(async (req, res) => {
  const booking = await cancelBookingByDriverService(
    req.driver._id,
    req.params.id,
    req.body?.reason,
  );
  return res
    .status(200)
    .json(new ApiResponse(200, { booking: sanitizeBookingForDriver(booking) }, 'Booking cancelled'));
});

/* ------------------------------------------------------------------ */
/* User: abort pre-pay + extend the ride                               */
/* ------------------------------------------------------------------ */

/**
 * POST /auth/bookings/:id/extensions/initiate
 *
 * Phase 1 of the 3-step extension handshake. Customer picks the
 * additional hours; backend computes fareDelta + generates an OTP that
 * is pushed to the driver via socket. Returns the customer-safe row
 * (no OTP code) for the FE to drive its multi-step modal.
 *
 *   body: { additionalHours?, additionalMinutes?, additionalDays?, unit? }
 *         // Hourly: 15-minute steps. Prefer minutes.
 *         // Outstation: unit="days" (default) or unit="hours".
 */
export const initiateBookingExtension = asyncHandler(async (req, res) => {
  const result = await initiateExtensionService(req.user._id, req.params.id, req.body);
  return res
    .status(201)
    .json(new ApiResponse(201, result, 'Extension initiated. Ask your driver for the code.'));
});

/**
 * POST /auth/bookings/:id/extensions/verify-otp
 *
 * Phase 2. Customer types the 4-digit code the driver read out.
 *   body: { extensionId, otp }
 */
export const verifyBookingExtensionOtp = asyncHandler(async (req, res) => {
  const result = await verifyExtensionOtpService(req.user._id, req.params.id, req.body);
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Code verified. Proceed to pay.'));
});

/**
 * POST /auth/bookings/:id/extensions/pay
 *
 * Phase 3. Customer confirms payment from wallet. The fareDelta is
 * debited atomically; on success the row becomes `accepted` and the
 * booking is broadcast to all parties.
 *
 *   body: { extensionId }
 */
export const payBookingExtension = asyncHandler(async (req, res) => {
  const result = await payExtensionService(req.user._id, req.params.id, req.body);
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Extension paid'));
});

/**
 * POST /auth/bookings/:id/extensions/cancel
 *
 * Drop an open extension intent (either `pending_otp` or
 * `pending_payment`). Used by the "Change hours" / dismiss-mid-flow
 * paths so the next initiate isn't blocked by a stale row.
 *
 *   body: { extensionId }
 */
export const cancelBookingExtension = asyncHandler(async (req, res) => {
  const result = await cancelExtensionService(req.user._id, req.params.id, req.body);
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Extension cancelled'));
});

/**
 * POST /auth/bookings/:id/extensions/decline-prompt
 *
 * Customer closed the “extend your trip” popup without extending
 * (“Not now”). Stops outstation pre-return repeat nudges for this
 * booked window.
 */
export const declineBookingExtensionPrompt = asyncHandler(async (req, res) => {
  const result = await declineExtensionPromptService(req.user._id, req.params.id);
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Extension prompt dismissed'));
});

/**
 * POST /driver/bookings/:id/extensions/dismiss
 *
 * Driver-side endpoint. The driver is dismissing the customer's
 * extension request before the customer either verifies the OTP or
 * pays. We mark the row declined + `dismissedByDriver` so the
 * customer's app can show a "Driver dismissed — try again" state.
 *
 *   body: { extensionId }
 */
export const driverDismissBookingExtension = asyncHandler(async (req, res) => {
  const result = await dismissExtensionByDriverService(
    req.driver._id,
    req.params.id,
    req.body,
  );
  // Same sanitizer as en-route / arrive / start / complete / cancel —
  // without it the FE replaces the in-memory trip with a raw
  // fareSnapshot (no top-level `driverEarning`) and the "Your earning"
  // tile drops to ₹0 until the next fetch.
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...result,
        booking: sanitizeBookingForDriver(result.booking),
      },
      'Extension dismissed',
    ),
  );
});

/**
 * POST /auth/bookings/:id/rate-driver
 *
 * Customer submits a 1–5 star rating + optional review for the driver
 * that completed this trip. Once-only: a second submit hits 409.
 *
 *   body: { stars: 1..5, review?: string<=500 }
 */
export const rateDriverByCustomer = asyncHandler(async (req, res) => {
  const result = await rateDriverService(req.user._id, req.params.id, req.body);
  return res
    .status(201)
    .json(new ApiResponse(201, result, 'Thanks for rating your driver'));
});

/**
 * POST /driver/bookings/:id/rate-customer
 *
 * Driver submits a 1–5 star rating + optional review for the customer
 * after the trip completes. Once-only: a second submit hits 409.
 *
 *   body: { stars: 1..5, review?: string<=500 }
 */
export const rateCustomerByDriver = asyncHandler(async (req, res) => {
  const result = await rateCustomerService(req.driver._id, req.params.id, req.body);
  return res
    .status(201)
    .json(new ApiResponse(201, result, 'Thanks for rating the customer'));
});

/**
 * POST /auth/bookings/:id/noshow/respond
 *
 * Customer's answer to the "are you coming?" prompt that fired when
 * the driver had been waiting past `noShowPromptMinutes`.
 *
 *   body: { response: 'on_my_way' | 'not_coming' }
 *
 * "on_my_way" cancels the auto-complete timer and reschedules the
 * prompt for another grace cycle. "not_coming" fires the auto-complete
 * immediately so the driver doesn't sit idle through the deadline.
 */
export const respondToNoShowPrompt = asyncHandler(async (req, res) => {
  const response = String(req.body?.response || '').trim();
  if (response !== 'on_my_way' && response !== 'not_coming') {
    throw new ApiError(
      400,
      'response must be "on_my_way" or "not_coming"',
    );
  }
  // The booking is loaded inside the no-show service — we just trust
  // `:id` here since the caller is authenticated as a user already
  // and a stray bookingId is a no-op (no timer to cancel, no booking
  // to update).
  if (response === 'on_my_way') {
    await recordCustomerOnMyWay(req.params.id);
  } else {
    await recordCustomerNotComing(req.params.id);
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { response }, 'Response recorded'));
});

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export const getAdminBookings = asyncHandler(async (req, res) => {
  const result = await listAdminBookingsService(req.query, { staff: req.staff });
  return res.status(200).json(new ApiResponse(200, result, 'Bookings fetched'));
});

export const getAdminBookingById = asyncHandler(async (req, res) => {
  const booking = await getBookingByIdService(req.params.id);
  assertStaffCanViewBooking(req.staff, booking);
  return res.status(200).json(new ApiResponse(200, { booking }, 'Booking fetched'));
});

/* ------------------------------------------------------------------ */
/* Admin → Emergency Pool                                              */
/* ------------------------------------------------------------------ */

/**
 * Scheduled bookings that have no driver within
 * `SCHEDULED_BOOKING.EMERGENCY_POOL_MINUTES` of pickup escalate here.
 *
 *   - admin / sub_admin   see entries in their assigned zones
 *                         (super admin: every entry; sub_admin: assignedZones)
 *   - team_member         see only entries whose pickup falls in a
 *                         zone they're assigned to (`assignedZones`).
 *
 * Admin then picks a driver via POST /emergency-pool/:id/assign-driver.
 */
export const getEmergencyPoolBookings = asyncHandler(async (req, res) => {
  const result = await listEmergencyPoolBookingsService({
    staff: req.staff,
    query: req.query,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Emergency-pool bookings fetched'));
});

export const getEmergencyPoolCount = asyncHandler(async (req, res) => {
  const count = await countEmergencyPoolBookingsService({ staff: req.staff });
  return res
    .status(200)
    .json(new ApiResponse(200, { count }, 'Emergency-pool count'));
});

export const getEmergencyPoolAvailableDrivers = asyncHandler(async (req, res) => {
  // Resolve carTypeId from query or from the booking's car.
  const carTypeId =
    req.query?.carTypeId ||
    (await getBookingCarTypeIdService(req.params.id)) ||
    null;

  // Look up the booking so the service can geo-sort and flag
  // schedule / subscription conflicts on each candidate.
  const booking = await Booking.findById(req.params.id)
    .select('pickup serviceType bookingType hourly outstation timeline')
    .lean();
  const coords = booking?.pickup?.location?.coordinates;
  const pickupCoords =
    Array.isArray(coords) && coords.length === 2
      ? { lng: coords[0], lat: coords[1] }
      : null;

  const result = await listAvailableDriversForAssignmentService({
    carTypeId,
    pickupCoords,
    page: req.query?.page,
    limit: req.query?.limit,
    search: req.query?.search,
    onlineOnly: req.query?.onlineOnly,
    minRating: req.query?.minRating,
    carTypeMatch: req.query?.carTypeMatch,
  });
  await attachScheduleConflictsToDrivers(booking, result);
  return res
    .status(200)
    .json(new ApiResponse(200, { ...result, carTypeId }, 'Available drivers fetched'));
});

export const assignDriverToEmergencyPoolBooking = asyncHandler(async (req, res) => {
  const { driverId, notes } = req.body || {};
  if (!driverId) throw new ApiError(400, 'driverId is required');
  const result = await adminAssignDriverToEmergencyPoolService(
    req.params.id,
    driverId,
    { staffId: req.staff?._id, notes },
  );
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Driver assigned to booking'));
});

/* ------------------------------------------------------------------ */
/* Admin → Outstation Assignments                                      */
/* ------------------------------------------------------------------ */

/**
 * Outstation bookings skip the wave dispatcher entirely. They land in
 * PENDING_ASSIGNMENT and surface here.
 *
 *   - admin / sub_admin → every entry, every zone
 *   - team_member       → only entries whose zoneIds overlap
 *                         `assignedZones`. Same scoping as the
 *                         emergency-pool list.
 *
 * Driver assignment is gated through
 * `adminAssignDriverToOutstationService` which validates BOTH driver
 * and vehicle conflicts (with the configured RIDE_BUFFER_MINUTES
 * padding) before flipping the booking to DRIVER_ASSIGNED.
 */
export const getOutstationAssignments = asyncHandler(async (req, res) => {
  const result = await listOutstationAssignmentsService({
    staff: req.staff,
    query: req.query,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Outstation assignments fetched'));
});

export const getOutstationAssignmentDetail = asyncHandler(async (req, res) => {
  const detail = await getOutstationAssignmentDetailService(req.params.id, req.staff);
  if (!detail) throw new ApiError(404, 'Outstation booking not found or out of zone');
  return res
    .status(200)
    .json(new ApiResponse(200, detail, 'Outstation booking detail'));
});

export const getOutstationAssignmentDrivers = asyncHandler(async (req, res) => {
  const result = await listAvailableDriversForOutstationService(req.params.id, {
    search: req.query?.search,
    page: req.query?.page,
    limit: req.query?.limit,
    staff: req.staff,
    carTypeMatch: req.query?.carTypeMatch,
    minRating: req.query?.minRating,
    onlineOnly: req.query?.onlineOnly,
    allIndiaOnly: req.query?.allIndiaOnly,
    minDrivingHoursPerDay: req.query?.minDrivingHoursPerDay,
    zoneId: req.query?.zoneId,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Available drivers fetched'));
});

export const assignDriverToOutstation = asyncHandler(async (req, res) => {
  const { driverId, notes } = req.body || {};
  if (!driverId) throw new ApiError(400, 'driverId is required');
  const result = await adminAssignDriverToOutstationService(req.params.id, driverId, {
    staffId: req.staff?._id,
    staff: req.staff,
    notes,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Driver assigned to outstation booking'));
});

export const probeOutstationDriverConflict = asyncHandler(async (req, res) => {
  const driverId = req.query?.driverId;
  if (!driverId) throw new ApiError(400, 'driverId is required');
  const result = await probeDriverConflictService(req.params.id, driverId, req.staff);
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Driver conflict probe'));
});

/**
 * POST /admin/outstation-assignments/:id/settle-arrived
 *
 * Admin settles an outstation booking stuck at ARRIVED (no OTP):
 * platform keeps commission/fee, admin-entered driver payout, remainder
 * refunded to the user wallet. Frees driver + ends the booking.
 */
export const settleOutstationArrived = asyncHandler(async (req, res) => {
  const { driverPayoutRupees, notes } = req.body || {};
  if (driverPayoutRupees == null || driverPayoutRupees === '') {
    throw new ApiError(400, 'driverPayoutRupees is required');
  }
  const result = await adminSettleOutstationArrivedService(req.params.id, {
    driverPayoutRupees,
    notes,
    staffId: req.staff?._id,
    staff: req.staff,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Outstation booking settled'));
});

/* ------------------------------------------------------------------ */
/* Admin → Scheduled Jobs                                              */
/* ------------------------------------------------------------------ */

/**
 * GET /admin/bookings/scheduled-jobs
 * Mongo scheduled rides list (with filters). Team members only see
 * bookings in their assigned zones. Queue jobs live under
 * GET /admin/queues/scheduled-booking.
 */
export const getScheduledJobs = asyncHandler(async (req, res) => {
  const scheduledBookings = await listScheduledBookingsForAdminService({
    staff: req.staff,
    query: req.query,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, { scheduledBookings }, 'Scheduled rides fetched'));
});

/**
 * GET /admin/bookings/scheduled-jobs/:id/available-drivers
 * Geo-ranked drivers for manual assign (zone-scoped for team_member).
 */
export const getScheduledBookingAvailableDrivers = asyncHandler(async (req, res) => {
  const result = await listAvailableDriversForScheduledBookingService(
    req.params.id,
    {
      staff: req.staff,
      page: req.query?.page,
      limit: req.query?.limit,
      carTypeId: req.query?.carTypeId,
      search: req.query?.search,
      onlineOnly: req.query?.onlineOnly,
      minRating: req.query?.minRating,
      carTypeMatch: req.query?.carTypeMatch,
    },
  );
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Available drivers fetched'));
});

/**
 * POST /admin/bookings/scheduled-jobs/:id/assign-driver
 * Manual assign for open scheduled rides. Admin/sub_admin: any zone.
 * Team members: only bookings overlapping their assignedZones.
 */
export const assignDriverToScheduledBooking = asyncHandler(async (req, res) => {
  const { driverId, notes } = req.body || {};
  if (!driverId) throw new ApiError(400, 'driverId is required');
  const result = await adminAssignDriverToScheduledBookingService(
    req.params.id,
    driverId,
    { staff: req.staff, notes },
  );
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Driver assigned to scheduled booking'));
});

/**
 * GET /admin/queues/scheduled-booking
 * BullMQ worker jobs (reminders + escalate-batch). Legacy assign /
 * escalate / retry leftovers are hidden.
 */
export const getScheduledQueueJobs = asyncHandler(async (req, res) => {
  const snapshot = await listAdminScheduledQueueService(req.query);
  return res
    .status(200)
    .json(new ApiResponse(200, snapshot, 'Scheduled queue jobs fetched'));
});

export const adminUpdateBookingStatus = asyncHandler(async (req, res) => {
  const { adminUpdateBookingStatusService } = await import('../services/adminBookingOps.service.js');
  const { status, reason } = req.body || {};
  const result = await adminUpdateBookingStatusService(
    req.params.id,
    { status, reason },
    req.staff,
  );
  return res.status(200).json(new ApiResponse(200, result, 'Booking status updated'));
});

/**
 * GET /admin/bookings/:id/available-drivers
 * Drivers picker for general assign / reassign from the bookings list.
 */
export const getAdminBookingAvailableDrivers = asyncHandler(async (req, res) => {
  const { listAvailableDriversForAdminBookingService } = await import(
    '../services/adminBookingOps.service.js'
  );
  const result = await listAvailableDriversForAdminBookingService(req.params.id, {
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search,
    onlineOnly: req.query.onlineOnly,
    minRating: req.query.minRating,
    carTypeMatch: req.query.carTypeMatch,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Available drivers fetched'));
});

/**
 * POST /admin/bookings/:id/assign-driver
 * Assign or reassign a driver on a live booking (ops roles).
 */
export const assignDriverToAdminBooking = asyncHandler(async (req, res) => {
  const { adminAssignBookingDriverService } = await import(
    '../services/adminBookingOps.service.js'
  );
  const { driverId, notes } = req.body || {};
  if (!driverId) throw new ApiError(400, 'driverId is required');
  const result = await adminAssignBookingDriverService(req.params.id, driverId, {
    notes,
    staff: req.staff,
  });
  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      result.reassigned ? 'Driver reassigned' : 'Driver assigned',
    ),
  );
});
