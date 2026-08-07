import mongoose from 'mongoose';
import Booking from '../models/booking.model.js';
import Car from '../models/user/car.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  BOOKING_TYPE,
  DISPATCH_RESPONSE,
  SCHEDULED_BOOKING,
} from '../constants/bookingStatus.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToDriver,
  emitToBooking,
  emitToAdmins,
} from '../utils/socketEmitters.js';
import { notifyDriverOrderAssigned, notifyAdminEmergencyPoolEntered } from '../utils/notificationDispatch.js';
import { withdrawCurrentOfferService } from './bookingDispatch.service.js';
import {
  cancelScheduledBookingJobs,
  enqueueRemindersAfterAssignment,
} from './bookingScheduled.service.js';
import {
  isSuperAdmin,
} from '../constants/staffPermissions.js';
import { resolveBookingSearchStartAt } from '../utils/bookingInbox.js';
import {
  applyBuffer,
  assertDriverFreeForWindow,
  enrichDriversWithScheduleConflicts,
  estimateBookingWindow,
} from './driverConflict.service.js';

/**
 * Emergency pool — the manual-assignment safety net for scheduled rides.
 *
 *   Recurring `escalate-batch` job (every ~45 min) finds unmatched
 *   scheduled + outstation bookings past `scheduled.escalateAt` (= start −
 *   EMERGENCY_POOL_MINUTES) and calls `escalateToEmergencyPool`.
 *     → booking moves to `IN_EMERGENCY_POOL`.
 *     → admin/sub-admin see every entry; team_member only sees rows
 *       whose `zoneIds` overlap their `assignedZones`.
 *     → admin picks a driver and calls `adminAssignDriverToEmergencyPool`,
 *       which mirrors the standard accept-booking transition.
 *
 * The wave/inbox dispatcher is bypassed at assignment — this is a human
 * picking a specific driver, not an offer broadcast.
 */

/**
 * Lazily load the buffer-minutes resolver from `bookingDispatch`. Used
 * by the manual-assignment path so the lock decision uses the same
 * per-service buffer admins configure for the auto dispatcher.
 */
async function resolveBufferMinutesFor(serviceType) {
  try {
    const { loadScheduledDispatchConfig } = await import(
      './bookingScheduled.service.js'
    );
    const cfg = await loadScheduledDispatchConfig(serviceType);
    const value = Number(cfg?.RIDE_BUFFER_MINUTES);
    if (Number.isFinite(value) && value >= 0) return value;
  } catch {
    // fall through to default
  }
  return SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
}

/**
 * Whether an emergency-pool assignment should immediately set
 * `Driver.isOnTrip = true`. Same logic as the dispatcher's accept
 * path — instant bookings always lock; scheduled bookings only lock
 * if pickup is within one buffer window of now.
 */
async function shouldImmediatelyLockOnEmergencyAssign(booking) {
  if (!booking) return true;
  if (
    booking.bookingType !== BOOKING_TYPE.SCHEDULED
    && booking.bookingType !== BOOKING_TYPE.OUTSTATION
  ) {
    return true;
  }

  const { resolveBookingSearchStartAt } = await import('../utils/bookingInbox.js');
  const scheduledAt = resolveBookingSearchStartAt(booking);
  if (!scheduledAt) return true;
  const startMs = scheduledAt.getTime();
  if (!Number.isFinite(startMs)) return true;

  const bufferMinutes = await resolveBufferMinutesFor(booking.serviceType);
  const lockLeadMs = Math.max(0, Number(bufferMinutes) || 0) * 60_000;
  return startMs - Date.now() <= lockLeadMs;
}

/* ------------------------------------------------------------------ */
/* Escalation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Moves a scheduled booking into the manual-assignment queue if still
 * unmatched. Called by the batch escalate cron (and legacy per-booking
 * escalate jobs during drain).
 *
 *   - PENDING_ASSIGNMENT / SEARCHING / NO_DRIVERS_FOUND → IN_EMERGENCY_POOL
 *   - any other status → no-op
 *
 * Withdraws any in-flight inbox/wave offers so drivers stop seeing it.
 */
export async function escalateToEmergencyPool(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { ok: false, reason: 'not_found' };

  const escalatable = new Set([
    BOOKING_STATUS.PENDING_ASSIGNMENT,
    BOOKING_STATUS.SEARCHING,
    BOOKING_STATUS.NO_DRIVERS_FOUND,
  ]);
  if (booking.driverId || !escalatable.has(booking.status)) {
    return { ok: false, reason: 'not_escalatable', status: booking.status };
  }

  // Past pickup → auto-refund instead of parking in the emergency pool.
  const startAt = resolveBookingSearchStartAt(booking);
  if (startAt && startAt.getTime() <= Date.now()) {
    const { expireUnassignedScheduledBooking } = await import(
      './bookingScheduled.service.js'
    );
    return expireUnassignedScheduledBooking(booking._id);
  }

  // Best-effort: withdraw the current wave so we don't keep paging
  // drivers about a booking that an admin is about to assign manually.
  try {
    await withdrawCurrentOfferService(booking._id, 'moved_to_emergency_pool');
  } catch (err) {
    console.warn(
      '[emergencyPool] failed to withdraw offers for',
      String(booking._id),
      err?.message,
    );
  }

  booking.status = BOOKING_STATUS.IN_EMERGENCY_POOL;
  booking.scheduled = {
    ...(booking.scheduled?.toObject?.() || booking.scheduled || {}),
    escalatedAt: new Date(),
    emergencyPool: {
      ...(booking.scheduled?.emergencyPool?.toObject?.() ||
        booking.scheduled?.emergencyPool ||
        {}),
      enteredAt: new Date(),
    },
  };
  await booking.save();

  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    scheduledStartAt: booking.hourly?.scheduledStartAt || null,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
    kind: 'emergency_pool_entered',
    severity: 'warn',
    message:
      booking.bookingType === BOOKING_TYPE.OUTSTATION
        ? `Outstation booking ${booking.bookingNumber} needs manual driver assignment`
        : `Scheduled booking ${booking.bookingNumber} needs manual driver assignment`,
    data: { bookingId: String(booking._id) },
  });
  notifyAdminEmergencyPoolEntered(booking).catch(() => null);

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Listing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Resolve which zones a staff account is allowed to see in the emergency
 * pool. `null` means "all zones" (super admin); an array of ObjectIds
 * means "filter to these zones" (sub_admin + team_member).
 */
function zoneScopeForStaff(staff) {
  if (!staff) return [];
  if (isSuperAdmin(staff)) return null;
  const ids = (staff.assignedZones || [])
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return ids;
}

/**
 * List bookings sitting in the emergency pool, scoped by the caller's
 * role:
 *
 *   super admin              → every row
 *   sub_admin / team_member  → rows whose `zoneIds` overlap `assignedZones`
 *                              (returns [] when the staff has no zones)
 *
 * Ordered by `hourly.scheduledStartAt` ASC so the most urgent pickups
 * surface first. Returns the standard `{ bookings, total, page, pages }`
 * pagination envelope used by other admin list endpoints.
 */
export async function listEmergencyPoolBookingsService({ staff, query = {} }) {
  const { page = 1, limit = 20, search, zoneId, bookingType, dateFrom, dateTo } = query;
  const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

  // Past-start pool rows should already be refunded; sweep any leftovers
  // when admins open the pool so they don't linger until the next cron.
  const now = new Date();
  Booking.find({
    status: BOOKING_STATUS.IN_EMERGENCY_POOL,
    isDeleted: false,
    driverId: null,
    $or: [
      { 'hourly.scheduledStartAt': { $lte: now } },
      { 'outstation.pickupAt': { $lte: now } },
      { 'outstation.startDate': { $lte: now } },
    ],
  })
    .select('_id')
    .lean()
    .then(async (stale) => {
      if (!stale?.length) return;
      const { expireUnassignedScheduledBooking } = await import(
        './bookingScheduled.service.js'
      );
      for (const row of stale) {
        expireUnassignedScheduledBooking(row._id).catch(() => {});
      }
    })
    .catch(() => {});

  const filter = {
    status: BOOKING_STATUS.IN_EMERGENCY_POOL,
    isDeleted: false,
    // Hide past-start rows from the pool UI (they are being expired above).
    $and: [
      {
        $or: [
          { 'hourly.scheduledStartAt': { $gt: now } },
          {
            'hourly.scheduledStartAt': { $exists: false },
            'outstation.pickupAt': { $gt: now },
          },
          {
            'hourly.scheduledStartAt': { $exists: false },
            'outstation.pickupAt': { $exists: false },
            'outstation.startDate': { $gt: now },
          },
        ],
      },
    ],
  };

  // Staff scope — team_members only see their assigned zones.
  const scope = zoneScopeForStaff(staff);
  if (scope !== null) {
    if (!scope.length) {
      return { bookings: [], total: 0, page: parseInt(page, 10), pages: 0 };
    }
    filter.zoneIds = { $in: scope };
  }

  // Optional zone filter (UI dropdown — must be within the staff scope for
  // team_members, or any zone for admins).
  if (zoneId) {
    try {
      const zoneObj = new mongoose.Types.ObjectId(String(zoneId));
      if (filter.zoneIds?.$in) {
        const allowed = filter.zoneIds.$in.map(String);
        if (allowed.includes(String(zoneObj))) {
          filter.zoneIds = { $in: [zoneObj] };
        } else {
          return { bookings: [], total: 0, page: parseInt(page, 10), pages: 0 };
        }
      } else {
        filter.zoneIds = { $in: [zoneObj] };
      }
    } catch { /* ignore bad id */ }
  }

  if (search) {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(search);
    filter.$and.push({
      $or: [
        { bookingNumber: { $regex: search, $options: 'i' } },
        ...(isObjectId ? [{ _id: search }] : []),
      ],
    });
  }

  if (bookingType) {
    filter.bookingType = bookingType;
  }

  if (dateFrom || dateTo) {
    filter['hourly.scheduledStartAt'] = {};
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!Number.isNaN(d.getTime())) filter['hourly.scheduledStartAt'].$gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!Number.isNaN(d.getTime())) filter['hourly.scheduledStartAt'].$lte = d;
    }
    if (Object.keys(filter['hourly.scheduledStartAt']).length === 0) {
      delete filter['hourly.scheduledStartAt'];
    }
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate('userId', 'name phone_no')
      .populate('zoneIds', 'name code city')
      .populate({
        path: 'carId',
        select: 'vehicleNumber transmission image carTypeId brandId modelId fuelTypeId',
        populate: [
          { path: 'carTypeId', select: 'name' },
          { path: 'brandId', select: 'name' },
          { path: 'modelId', select: 'name' },
          { path: 'fuelTypeId', select: 'name' },
        ],
      })
      .sort({ 'hourly.scheduledStartAt': 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return {
    bookings,
    total,
    page: parseInt(page, 10),
    pages: Math.ceil(total / Math.max(1, parseInt(limit, 10))),
  };
}

/**
 * Lightweight count for admin sidebar badge. Scoped like the list.
 */
export async function countEmergencyPoolBookingsService({ staff } = {}) {
  const now = new Date();
  const filter = {
    status: BOOKING_STATUS.IN_EMERGENCY_POOL,
    isDeleted: false,
    $or: [
      { 'hourly.scheduledStartAt': { $gt: now } },
      {
        'hourly.scheduledStartAt': { $exists: false },
        'outstation.pickupAt': { $gt: now },
      },
      {
        'hourly.scheduledStartAt': { $exists: false },
        'outstation.pickupAt': { $exists: false },
        'outstation.startDate': { $gt: now },
      },
    ],
  };
  const scope = zoneScopeForStaff(staff);
  if (scope !== null) {
    if (!scope.length) return 0;
    filter.zoneIds = { $in: scope };
  }
  return Booking.countDocuments(filter);
}

/* ------------------------------------------------------------------ */
/* Manual assignment                                                   */
/* ------------------------------------------------------------------ */

/**
 * Admin picks a specific driver for a booking sitting in the emergency
 * pool. Mirrors the success path of `acceptBookingService` (driver
 * stamped, on-trip flag set, sockets fanned out) but skips the wave
 * machinery entirely — there is no offer, no timeout, no withdrawal.
 *
 * Pre-payment is not retriggered: scheduled bookings are wallet-paid at
 * creation time, so the driver gets a fully-paid booking they can start
 * immediately (matching the `alreadyPaid` branch in
 * `acceptBookingService`).
 *
 * @param {string} bookingId
 * @param {string} driverId
 * @param {{ staffId?: string, notes?: string }} opts
 */
export async function adminAssignDriverToEmergencyPoolService(
  bookingId,
  driverId,
  { staffId, notes = '' } = {},
) {
  if (!bookingId || !driverId) {
    throw new ApiError(400, 'bookingId and driverId are required');
  }

  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status !== BOOKING_STATUS.IN_EMERGENCY_POOL) {
    throw new ApiError(
      409,
      `Booking is not in the emergency pool (status: ${booking.status})`,
    );
  }

  const startAt = resolveBookingSearchStartAt(booking);
  if (startAt && startAt.getTime() <= Date.now()) {
    throw new ApiError(
      409,
      'Ride time has passed — this booking will be auto-refunded',
    );
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

  // Cancel any pending scheduled-jobs so the worker doesn't fire the
  // already-assigned booking back into reminders / escalation cycles.
  cancelScheduledBookingJobs(booking._id).catch(() => {});

  const now = new Date();
  booking.driverId = driver._id;
  booking.timeline = booking.timeline || {};
  booking.timeline.driverAssignedAt = now;
  booking.status = BOOKING_STATUS.DRIVER_ASSIGNED;
  booking.scheduled = {
    ...(booking.scheduled?.toObject?.() || booking.scheduled || {}),
    emergencyPool: {
      ...(booking.scheduled?.emergencyPool?.toObject?.() ||
        booking.scheduled?.emergencyPool ||
        {}),
      assignedBy: staffId || null,
      assignedAt: now,
      notes: notes || '',
    },
  };

  if (booking.dispatch) {
    // Record this as an admin-side assignment in the offers history for
    // the audit trail (matches the dispatch row shape used for accepts).
    booking.dispatch.offers = booking.dispatch.offers || [];
    booking.dispatch.offers.push({
      driverId: driver._id,
      offeredAt: now,
      respondedAt: now,
      response: DISPATCH_RESPONSE.ACCEPTED,
      distanceMeters: null,
    });
    booking.dispatch.pendingOfferIds = [];
    booking.dispatch.currentExpiresAt = null;
  }

  await booking.save();

  // Mirror the dispatcher's "only lock immediately if pickup is close"
  // rule so admins can still hand drivers a far-future scheduled
  // booking without taking them off the dispatch radar for the
  // intervening hours. `markDriverEnRouteService` flips the flag for
  // sure once the driver actually starts heading to pickup.
  const lockNow = await shouldImmediatelyLockOnEmergencyAssign(booking);
  if (lockNow) {
    await Driver.updateOne({ _id: driver._id }, { $set: { isOnTrip: true } });
  }

  // Now that the booking has a driver, queue the pre-pickup reminders.
  // Fire-and-forget — the queue degrades to no-op when Redis is down,
  // and stamping `remindersEnqueuedAt` keeps repeats out of Redis on
  // re-saves.
  enqueueRemindersAfterAssignment(booking).catch((err) =>
    console.warn(
      '[emergencyPool] reminder enqueue failed for',
      String(booking._id),
      err?.message,
    ),
  );

  // Hydrate the driver-side payload exactly like the dispatcher does so
  // the driver app can route straight to the active-trip screen.
  const userPayload = {
    bookingId: String(booking._id),
    status: booking.status,
    paymentMode: booking.paymentMode,
    paymentStatus: booking.paymentStatus,
    driverId: String(driver._id),
    timeline: booking.timeline?.toObject?.() || booking.timeline,
  };
  const driverPayload = {
    bookingId: String(booking._id),
    status: booking.status,
    driverId: String(driver._id),
    timeline: booking.timeline?.toObject?.() || booking.timeline,
  };

  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, userPayload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToDriver(driver._id, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, userPayload);

  notifyDriverOrderAssigned(driver._id, booking).catch(() => null);

  return {
    booking: await Booking.findById(booking._id)
      .populate('driverId', 'name phone_no')
      .populate('userId', 'name phone_no')
      .lean(),
    paid: booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID,
  };
}

/**
 * Helper for the admin "Schedule Pool" driver picker.
 *
 * Drivers are sorted by geo-distance from the booking's pickup
 * coordinates (closest first) so the admin sees the most relevant
 * candidates at the top. Falls back to the flat online→rating sort
 * when the booking has no valid coordinates.
 *
 * Returns a paginated envelope: { drivers, total, page }.
 * Each driver row has an extra `distanceKm` field (null when no geo).
 */
export async function listAvailableDriversForAssignmentService({
  carTypeId,
  pickupCoords,   // { lng, lat } from booking.pickup
  page = 1,
  limit = 20,
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (pageNum - 1) * limitNum;

  const hasGeo =
    pickupCoords &&
    Number.isFinite(pickupCoords.lng) &&
    Number.isFinite(pickupCoords.lat) &&
    !(pickupCoords.lng === 0 && pickupCoords.lat === 0);

  // Base match conditions shared by both geo + flat paths.
  const matchStage = {
    approvalStatus: 'approved',
    isDeleted: { $ne: true },
    isOnTrip: false,
  };
  if (carTypeId) {
    try {
      matchStage.carTypeExperience = new mongoose.Types.ObjectId(String(carTypeId));
    } catch { /* ignore bad id */ }
  }

  if (hasGeo) {
    // $geoNear must be the first stage in an aggregation pipeline.
    // It injects a `distanceMeters` field that we convert to km.
    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [pickupCoords.lng, pickupCoords.lat] },
          distanceField: 'distanceMeters',
          spherical: true,
          // No maxDistance cap — admin may need far-away drivers in emergencies.
          query: matchStage,
        },
      },
      {
        $addFields: {
          distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] },
        },
      },
      {
        $project: {
          name: 1,
          phone_no: 1,
          rating: 1,
          experienceYears: 1,
          isOnline: 1,
          location: 1,
          lastLocationAt: 1,
          distanceKm: 1,
          distanceMeters: 1,
        },
      },
      // Count facet for total (before skip/limit).
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limitNum }],
          count: [{ $count: 'n' }],
        },
      },
    ];

    const [result] = await Driver.aggregate(pipeline);
    const drivers = result?.data || [];
    const total = result?.count?.[0]?.n || 0;
    return { drivers, total, page: pageNum, hasGeo: true };
  }

  // Flat fallback — no valid pickup coordinates.
  const [drivers, total] = await Promise.all([
    Driver.find(matchStage)
      .select('name phone_no rating experienceYears isOnline location lastLocationAt')
      .sort({ isOnline: -1, rating: -1, experienceYears: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean()
      .then((rows) => rows.map((d) => ({ ...d, distanceKm: null }))),
    Driver.countDocuments(matchStage),
  ]);
  return { drivers, total, page: pageNum, hasGeo: false };
}

/**
 * Look up the user's car so the admin "assign driver" picker can scope
 * to drivers who actually can drive it.
 */
export async function getBookingCarTypeIdService(bookingId) {
  const booking = await Booking.findById(bookingId).select('carId').lean();
  if (!booking?.carId) return null;
  const car = await Car.findById(booking.carId).select('carTypeId').lean();
  return car?.carTypeId ? String(car.carTypeId) : null;
}

/**
 * Enrich an available-drivers result with booking + subscription
 * schedule conflicts for the given booking.
 */
export async function attachScheduleConflictsToDrivers(booking, result) {
  if (!booking || !result?.drivers?.length) return result;
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
  const buffered = baseWindow ? applyBuffer(baseWindow, bufferMinutes) : null;
  result.drivers = await enrichDriversWithScheduleConflicts(result.drivers, {
    window: buffered,
    excludeBookingId: booking._id,
    bufferMinutes,
  });
  return result;
}
