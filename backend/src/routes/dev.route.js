/**
 * DEV-ONLY test routes for scheduled ride end-to-end testing.
 *
 * Mounted at /api/v1/dev — only available when NODE_ENV !== 'production'.
 * These routes bypass auth and let you manually trigger any phase of the
 * scheduled booking lifecycle without waiting for real timers to fire.
 *
 * ⚠️  NEVER expose these routes in production. The guard at the top of
 *     app.js enforces this, but double-check before any deployment.
 *
 * ---
 * Available endpoints:
 *
 *   GET  /api/v1/dev/bookings/:id/inspect
 *        → Full booking snapshot with scheduled metadata + queue jobs
 *
 *   POST /api/v1/dev/bookings/:id/trigger-assign
 *        → Runs kickoffScheduledAssignment — flips PENDING_ASSIGNMENT → SEARCHING
 *          and starts the wave dispatcher immediately (simulates BullMQ assign job)
 *
 *   POST /api/v1/dev/bookings/:id/trigger-escalate
 *        → Runs escalateToEmergencyPool — moves booking to IN_EMERGENCY_POOL
 *          (simulates BullMQ escalate job)
 *
 *   POST /api/v1/dev/bookings/:id/trigger-remind
 *        Body: { minutesAhead: 60 }
 *        → Fires the reminder socket event to the user / driver
 *
 *   POST /api/v1/dev/bookings/:id/force-status
 *        Body: { status: "searching" }
 *        → Directly sets the booking status in the DB (escape hatch)
 *
 *   POST /api/v1/dev/bookings/:id/force-dispatch
 *        → Immediately triggers dispatchNextDriverService (starts wave search)
 *          even if booking is not in SEARCHING status (forces it first)
 *
 *   GET  /api/v1/dev/drivers/available
 *        Query: ?lat=...&lng=...&radius=2000
 *        → Lists online, idle, approved drivers near a coordinate for verification
 *
 *   GET  /api/v1/dev/queue/jobs
 *        → Lists pending BullMQ scheduled-booking jobs (requires Redis)
 */

import express from 'express';
import Booking from '../models/booking.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { kickoffScheduledAssignment, sendScheduledReminder } from '../services/bookingScheduled.service.js';
import { dispatchNextDriverService } from '../services/bookingDispatch.service.js';
import { BOOKING_STATUS, BOOKING_STATUS_LIST } from '../constants/bookingStatus.js';

const router = express.Router();

/** Dev routes accept Mongo `_id` or human `bookingNumber` (e.g. BK-20260812-790934). */
async function resolveDevBookingId(ref) {
  const key = String(ref || '').trim();
  if (!key) throw new ApiError(400, 'Booking id required');

  if (/^[a-fA-F0-9]{24}$/.test(key)) {
    const byId = await Booking.findById(key).select('_id bookingNumber').lean();
    if (byId) return String(byId._id);
  }

  const byNumber = await Booking.findOne({ bookingNumber: key })
    .select('_id bookingNumber')
    .lean();
  if (byNumber) return String(byNumber._id);

  throw new ApiError(404, `Booking not found for "${key}"`);
}

/* ------------------------------------------------------------------ */
/* Guard — never run in production                                     */
/* ------------------------------------------------------------------ */
router.use((_req, _res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return next(new ApiError(403, 'Dev routes are disabled in production'));
  }
  next();
});

/* ------------------------------------------------------------------ */
/* GET /bookings/:id/inspect                                           */
/* ------------------------------------------------------------------ */
router.get(
  '/bookings/:id/inspect',
  asyncHandler(async (req, res) => {
    const bookingId = await resolveDevBookingId(req.params.id);
    const booking = await Booking.findById(bookingId)
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone_no isOnline isOnTrip')
      .lean();

    if (!booking) throw new ApiError(404, 'Booking not found');

    // Summarise the dispatch wave history for easy reading
    const dispatchSummary = (booking.dispatch?.offers || []).map((o) => ({
      driverId: String(o.driverId),
      offeredAt: o.offeredAt,
      response: o.response,
      respondedAt: o.respondedAt,
    }));

    const info = {
      _id: String(booking._id),
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      serviceType: booking.serviceType,
      bookingType: booking.bookingType,
      pickupAddress: booking.pickup?.address,
      scheduledStartAt: booking.hourly?.scheduledStartAt || null,
      durationHours: booking.hourly?.durationHours || null,
      fareTotal: booking.fareSnapshot?.total || null,
      paymentStatus: booking.paymentStatus,
      scheduled: booking.scheduled || null,
      dispatch: {
        attemptsCount: booking.dispatch?.attemptsCount || 0,
        maxAttempts: booking.dispatch?.maxAttempts || null,
        currentRadiusMeters: booking.dispatch?.currentRadiusMeters || null,
        pendingOfferIds: (booking.dispatch?.pendingOfferIds || []).map(String),
        currentExpiresAt: booking.dispatch?.currentExpiresAt || null,
        offersHistory: dispatchSummary,
      },
      timeline: booking.timeline || null,
      user: booking.userId || null,
      driver: booking.driverId || null,
    };

    res.json(new ApiResponse(200, info, 'Booking inspection'));
  }),
);

/* ------------------------------------------------------------------ */
/* POST /bookings/:id/trigger-assign                                   */
/* Simulates the BullMQ "assign" job firing.                          */
/* ------------------------------------------------------------------ */
router.post(
  '/bookings/:id/trigger-assign',
  asyncHandler(async (req, res) => {
    const bookingId = await resolveDevBookingId(req.params.id);
    const result = await kickoffScheduledAssignment(bookingId);
    res.json(new ApiResponse(200, result, 'Assign job triggered'));
  }),
);

/* ------------------------------------------------------------------ */
/* POST /bookings/:id/trigger-escalate                                 */
/* Simulates the BullMQ "escalate" job firing.                        */
/* ------------------------------------------------------------------ */
router.post(
  '/bookings/:id/trigger-escalate',
  asyncHandler(async (req, res) => {
    const { escalateToEmergencyPool } = await import('../services/bookingEmergencyPool.service.js');
    const bookingId = await resolveDevBookingId(req.params.id);
    const result = await escalateToEmergencyPool(bookingId);
    res.json(new ApiResponse(200, result, 'Escalate job triggered'));
  }),
);

/* ------------------------------------------------------------------ */
/* POST /bookings/:id/trigger-remind                                   */
/* Body: { minutesAhead: 60 }                                         */
/* ------------------------------------------------------------------ */
router.post(
  '/bookings/:id/trigger-remind',
  asyncHandler(async (req, res) => {
    const minutesAhead = Number(req.body?.minutesAhead) || 15;
    const bookingId = await resolveDevBookingId(req.params.id);
    const result = await sendScheduledReminder(bookingId, minutesAhead);
    res.json(new ApiResponse(200, result, `Reminder fired (${minutesAhead}m ahead)`));
  }),
);

/* ------------------------------------------------------------------ */
/* POST /bookings/:id/force-status                                     */
/* Body: { status: "searching" }   ← any valid BOOKING_STATUS value  */
/* Use as an escape hatch to put a booking into any state.            */
/* ------------------------------------------------------------------ */
router.post(
  '/bookings/:id/force-status',
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!status || !BOOKING_STATUS_LIST.includes(status)) {
      throw new ApiError(
        400,
        `Invalid status. Must be one of: ${BOOKING_STATUS_LIST.join(', ')}`,
      );
    }
    const bookingId = await resolveDevBookingId(req.params.id);
    const booking = await Booking.findById(bookingId);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const previousStatus = booking.status;
    booking.status = status;
    await booking.save();

    res.json(
      new ApiResponse(
        200,
        { previousStatus, newStatus: status },
        `Status forced to "${status}"`,
      ),
    );
  }),
);

/* ------------------------------------------------------------------ */
/* POST /bookings/:id/force-dispatch                                   */
/* Forces the booking into SEARCHING then immediately runs a          */
/* dispatch wave — useful to test driver offer flow without needing   */
/* the booking to be in the right state.                              */
/* ------------------------------------------------------------------ */
router.post(
  '/bookings/:id/force-dispatch',
  asyncHandler(async (req, res) => {
    const bookingId = await resolveDevBookingId(req.params.id);
    const booking = await Booking.findById(bookingId);
    if (!booking) throw new ApiError(404, 'Booking not found');

    if (booking.status !== BOOKING_STATUS.SEARCHING) {
      booking.status = BOOKING_STATUS.SEARCHING;
      await booking.save();
    }

    const result = await dispatchNextDriverService(bookingId);
    res.json(new ApiResponse(200, result, 'Dispatch wave triggered'));
  }),
);

/* ------------------------------------------------------------------ */
/* GET /drivers/available                                              */
/* Query: ?lat=...&lng=...&radius=2000                                */
/* Lists online idle approved drivers — verify drivers exist before   */
/* running dispatch tests.                                            */
/* ------------------------------------------------------------------ */
router.get(
  '/drivers/available',
  asyncHandler(async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseInt(req.query.radius, 10) || 5000;

    let filter = {
      approvalStatus: 'approved',
      isDeleted: { $ne: true },
      isOnTrip: false,
      isOnline: true,
    };

    // Geo filter if coordinates provided
    if (!isNaN(lat) && !isNaN(lng)) {
      filter.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radius,
        },
      };
    }

    const drivers = await Driver.find(filter)
      .select('name phone_no rating isOnline isOnTrip location lastLocationAt approvalStatus')
      .limit(50)
      .lean();

    res.json(
      new ApiResponse(
        200,
        { count: drivers.length, drivers },
        `${drivers.length} available driver(s)${!isNaN(lat) ? ` within ${radius}m` : ''}`,
      ),
    );
  }),
);

/* ------------------------------------------------------------------ */
/* GET /queue/jobs                                                     */
/* Lists pending BullMQ jobs for the scheduled-booking queue.         */
/* ------------------------------------------------------------------ */
router.get(
  '/queue/jobs',
  asyncHandler(async (req, res) => {
    let jobs = [];
    let queueInfo = null;

    try {
      const { getScheduledBookingQueue } = await import('../queues/scheduledBooking.queue.js');
      const queue = await getScheduledBookingQueue();
      if (queue) {
        const [waiting, delayed, active, completed, failed] = await Promise.all([
          queue.getWaiting(0, 50),
          queue.getDelayed(0, 50),
          queue.getActive(0, 50),
          queue.getCompleted(0, 20),
          queue.getFailed(0, 20),
        ]);
        queueInfo = {
          waiting: waiting.map((j) => ({ id: j.id, name: j.name, data: j.data, delay: j.delay })),
          delayed: delayed.map((j) => ({
            id: j.id,
            name: j.name,
            data: j.data,
            processesAt: j.processedOn ? new Date(j.processedOn) : null,
            delay: j.delay,
          })),
          active: active.map((j) => ({ id: j.id, name: j.name, data: j.data })),
          completedCount: completed.length,
          failedCount: failed.length,
          failed: failed.map((j) => ({
            id: j.id,
            name: j.name,
            data: j.data,
            failedReason: j.failedReason,
          })),
        };
      } else {
        queueInfo = { error: 'Queue not initialized — Redis may not be configured' };
      }
    } catch (err) {
      queueInfo = { error: `Could not access queue: ${err.message}` };
    }

    res.json(new ApiResponse(200, queueInfo, 'Queue jobs'));
  }),
);

export default router;
