import mongoose from 'mongoose';
import Booking from '../models/booking.model.js';
import Car from '../models/user/car.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  DISPATCH_RESPONSE,
  SCHEDULED_BOOKING,
} from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToDriver,
  emitToBooking,
  emitToAdmins,
} from '../utils/socketEmitters.js';
import { hasOperationalStaffAccess } from '../constants/staffPermissions.js';
import {
  estimateBookingWindow,
  applyBuffer,
  getDriverConflictMap,
} from './driverConflict.service.js';
import { getVehicleConflicts } from './vehicleConflict.service.js';
import { loadScheduledDispatchConfig } from './bookingScheduled.service.js';
import { resolveCarTypeObjectId } from '../utils/carTypeResolve.js';

/**
 * Outstation manual-assignment pipeline.
 *
 *   Outstation bookings are created in PENDING_ASSIGNMENT (no auto-
 *   dispatch). They surface in the admin "Outstation Assignments" queue
 *   where an admin / sub_admin (or a team_member, but read-only and
 *   zone-scoped) picks a driver by hand. The pick goes through three
 *   safety gates before the booking ever flips to DRIVER_ASSIGNED:
 *
 *     1. Vehicle conflict — the booking's `carId` must not be on any
 *        OTHER active booking whose buffered window overlaps the
 *        outstation window.
 *     2. Driver conflict — the chosen driver must not be on any OTHER
 *        active booking whose buffered window overlaps the outstation
 *        window. This catches ongoing rides, future scheduled rides,
 *        and other outstation trips.
 *     3. Atomic claim — the booking is flipped from PENDING_ASSIGNMENT
 *        to DRIVER_ASSIGNED via `findOneAndUpdate` with the status as
 *        a guard. Two admins clicking "Assign" simultaneously can
 *        never both succeed; the loser sees a 409.
 *
 *   A post-claim re-check using `(_id ASC)` as a tiebreaker handles the
 *   even rarer race where two admins assign the SAME driver to TWO
 *   different outstation bookings whose windows overlap. The booking
 *   with the larger `_id` loses and is rolled back to PENDING_ASSIGNMENT.
 *
 *   Buffer:
 *     ServicePricing.scheduledDispatch.RIDE_BUFFER_MINUTES (default 30)
 *     — same knob the wave dispatcher reads, so manual + auto pipelines
 *     stay in lockstep.
 */

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function resolveBufferMinutesFor(serviceType) {
  try {
    const cfg = await loadScheduledDispatchConfig(serviceType);
    const value = Number(cfg?.RIDE_BUFFER_MINUTES);
    if (Number.isFinite(value) && value >= 0) return value;
  } catch {
    /* fall through */
  }
  return SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
}

function zoneScopeForStaff(staff) {
  if (!staff) return [];
  if (hasOperationalStaffAccess(staff)) return null;
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
 * Whether an outstation assignment should immediately set
 * `Driver.isOnTrip = true`. Pickup within one buffer window of now →
 * lock; otherwise let the driver keep taking offers until the
 * conflict-service shadow filters them out. Mirrors the emergency-
 * pool rule so manual + auto pipelines behave identically.
 */
function shouldImmediatelyLockOutstation(booking, bufferMinutes) {
  const startSrc =
    booking?.outstation?.pickupAt || booking?.outstation?.startDate;
  if (!startSrc) return true;
  const startMs = new Date(startSrc).getTime();
  if (!Number.isFinite(startMs)) return true;
  const lockLeadMs = Math.max(0, Number(bufferMinutes) || 0) * 60_000;
  return startMs - Date.now() <= lockLeadMs;
}

function bookingWindowMs(booking) {
  return estimateBookingWindow(booking);
}

/* ------------------------------------------------------------------ */
/* Listing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Paginated list of outstation bookings sitting in PENDING_ASSIGNMENT.
 *
 *   admin / sub_admin → every row across the platform
 *   team_member       → rows whose `zoneIds` overlap their `assignedZones`
 *                       (returns [] when the staff has no zones)
 *
 * Supported filters (all optional, all combine with AND):
 *   - search          booking number / id substring
 *   - city            case-insensitive substring on `pickup.city`
 *   - bookingType     'instant' | 'scheduled'
 *   - zoneId          a single zone the row must include
 *   - dateFrom        ISO; outstation.startDate ≥ dateFrom
 *   - dateTo          ISO; outstation.startDate ≤ dateTo
 *
 * Ordered by `outstation.startDate` ASC so the soonest-departing trip
 * sits at the top. Returns the standard pagination envelope.
 */
export async function listOutstationAssignmentsService({ staff, query = {} }) {
  const {
    page = 1,
    limit = 20,
    search,
    city,
    bookingType,
    zoneId,
    dateFrom,
    dateTo,
  } = query;

  const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

  const filter = {
    status: BOOKING_STATUS.PENDING_ASSIGNMENT,
    serviceType: SERVICE_TYPES.OUTSTATION,
    isDeleted: false,
  };

  const scope = zoneScopeForStaff(staff);
  if (scope !== null) {
    if (!scope.length) {
      return { bookings: [], total: 0, page: parseInt(page, 10), pages: 0 };
    }
    filter.zoneIds = { $in: scope };
  }

  if (zoneId) {
    try {
      const zoneObj = new mongoose.Types.ObjectId(String(zoneId));
      // Combine with the staff scope above so team_members can't
      // bypass their assignedZones by passing an out-of-scope zoneId.
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
    } catch {
      /* ignore bad id */
    }
  }

  if (search) {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(search);
    filter.$or = [
      { bookingNumber: { $regex: search, $options: 'i' } },
      ...(isObjectId ? [{ _id: search }] : []),
    ];
  }
  if (city) {
    filter['pickup.city'] = { $regex: city, $options: 'i' };
  }
  if (bookingType) {
    filter.bookingType = bookingType;
  }
  if (dateFrom || dateTo) {
    filter['outstation.startDate'] = {};
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!Number.isNaN(d.getTime())) filter['outstation.startDate'].$gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!Number.isNaN(d.getTime())) filter['outstation.startDate'].$lte = d;
    }
    if (Object.keys(filter['outstation.startDate']).length === 0) {
      delete filter['outstation.startDate'];
    }
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate('userId', 'name phone_no')
      .populate('zoneIds', 'name code city')
      .sort({ 'outstation.startDate': 1, createdAt: 1 })
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

/* ------------------------------------------------------------------ */
/* Detail (with conflicts)                                             */
/* ------------------------------------------------------------------ */

/**
 * Load a single PENDING_ASSIGNMENT outstation booking + a pre-computed
 * vehicle-conflict report for its `carId`. The driver picker queries
 * conflicts per-candidate separately.
 *
 * Returns `null` if the booking exists but the calling staff isn't
 * allowed to see it (out-of-zone team_member) — the controller maps
 * this to a 404.
 */
export async function getOutstationAssignmentDetailService(bookingId, staff) {
  const booking = await Booking.findOne({
    _id: bookingId,
    isDeleted: false,
  })
    .populate('userId', 'name phone_no email')
    .populate('zoneIds', 'name code city')
    .lean();
  if (!booking) return null;

  // Zone scoping for team_members.
  const scope = zoneScopeForStaff(staff);
  if (scope !== null) {
    const allowedZoneIds = new Set(scope.map(String));
    const bookingZones = (booking.zoneIds || []).map((z) =>
      String(z?._id || z),
    );
    if (!bookingZones.some((id) => allowedZoneIds.has(id))) {
      return null;
    }
  }

  // Load the car so the UI can show vehicle number / make / model and
  // surface vehicle conflicts before the driver picker even opens.
  let car = null;
  if (booking.carId) {
    car = await Car.findById(booking.carId)
      .populate('carTypeId', 'name')
      .populate('brandId', 'name')
      .populate('modelId', 'name')
      .populate('fuelTypeId', 'name')
      .lean();
  }

  const baseWindow = bookingWindowMs(booking);
  const bufferMinutes = await resolveBufferMinutesFor(booking.serviceType);
  const buffered = baseWindow ? applyBuffer(baseWindow, bufferMinutes) : null;

  const vehicleConflicts = buffered
    ? await getVehicleConflicts({
      carId: booking.carId,
      window: buffered,
      excludeBookingId: booking._id,
      bufferMinutes,
    })
    : [];

  return {
    booking,
    car,
    bufferMinutes,
    window: baseWindow
      ? {
        startMs: baseWindow.startMs,
        endMs: baseWindow.endMs,
        bufferedStartMs: buffered.startMs,
        bufferedEndMs: buffered.endMs,
      }
      : null,
    vehicleConflicts,
  };
}

/* ------------------------------------------------------------------ */
/* Driver picker                                                       */
/* ------------------------------------------------------------------ */

/**
 * Returns a ranked list of approved drivers (online first, then by
 * rating + experience) along with a per-driver `conflicts` array. The
 * UI uses the conflict array to render an "Already booked" badge plus
 * the overlapping bookings on hover.
 *
 * `carTypeId` is optional. When set we filter to drivers whose
 * `carTypeExperience` includes it; otherwise we return everyone (the
 * caller can show a "no car type filter" hint).
 */
export async function listAvailableDriversForOutstationService(
  bookingId,
  {
    search,
    page = 1,
    limit = 50,
    staff,
    carTypeMatch = 'true',
    minRating,
    onlineOnly,
    allIndiaOnly,
    minDrivingHoursPerDay,
  } = {},
) {
  const detail = await getOutstationAssignmentDetailService(bookingId, staff);
  if (!detail) {
    throw new ApiError(404, 'Outstation booking not found or out of zone');
  }
  const { booking, car, bufferMinutes, window } = detail;

  if (booking.status !== BOOKING_STATUS.PENDING_ASSIGNMENT) {
    throw new ApiError(
      409,
      `Booking is no longer pending assignment (status: ${booking.status})`,
    );
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 300);
  const skip = (pageNum - 1) * limitNum;

  const carTypeId = await resolveCarTypeObjectId(car?.carTypeId?._id || car?.carTypeId);

  // Resolve the booking's zone IDs so we can filter to drivers who opted
  // into those zones. `zoneIds` on the booking is already populated with
  // objects by `getOutstationAssignmentDetailService`.
  const bookingZoneIds = (booking.zoneIds || []).map((z) => {
    try { return new mongoose.Types.ObjectId(String(z?._id || z)); } catch { return null; }
  }).filter(Boolean);

  const match = {
    approvalStatus: 'approved',
    isDeleted: { $ne: true },
    // Drivers must have explicitly opted in to outstation.
    availableForOutstation: true,
  };

  // Zone filter — only show drivers who opted into at least one of the
  // booking's pickup zones. This is the key new behaviour: admins only
  // see zone-relevant drivers in the picker.
  if (bookingZoneIds.length) {
    match.preferredOutstationZones = { $in: bookingZoneIds };
  }

  if (carTypeId && carTypeMatch !== 'false') {
    match.carTypeExperience = carTypeId;
  }
  if (minRating != null && minRating !== '') {
    const rating = Number(minRating);
    if (Number.isFinite(rating) && rating > 0) match.rating = { $gte: rating };
  }
  if (onlineOnly === 'true' || onlineOnly === true) {
    match.isOnline = true;
  }
  if (allIndiaOnly === 'true' || allIndiaOnly === true) {
    match.outstationAllIndiaOk = true;
  }
  if (minDrivingHoursPerDay != null && minDrivingHoursPerDay !== '') {
    const hours = Number(minDrivingHoursPerDay);
    if (Number.isFinite(hours) && hours > 0) {
      match.outstationMaxDrivingHoursPerDay = { $gte: hours };
    }
  }
  if (search) {
    const q = String(search).trim();
    if (q) {
      match.$or = [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ];
    }
  }

  const [drivers, total] = await Promise.all([
    Driver.find(match)
      .select(
        'name phone email rating experienceYears isOnline isOnTrip location lastLocationAt carTypeExperience availableForOutstation preferredOutstationZones outstationAvailabilityUpdatedAt outstationAllIndiaOk outstationMaxDrivingHoursPerDay cancellationStats',
      )
      .populate('carTypeExperience', 'name')
      .populate('preferredOutstationZones', 'name city')
      .sort({
        'cancellationStats.priorityPenaltyPoints': 1,
        isOnline: -1,
        rating: -1,
        experienceYears: -1,
      })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Driver.countDocuments(match),
  ]);

  // Bulk conflict lookup for every candidate.
  let conflictMap = {};
  if (drivers.length && window) {
    conflictMap = await getDriverConflictMap({
      driverIds: drivers.map((d) => d._id),
      window: {
        startMs: window.bufferedStartMs,
        endMs: window.bufferedEndMs,
      },
      excludeBookingId: booking._id,
      bufferMinutes,
    });
  }

  const enriched = drivers.map((d) => ({
    ...d,
    conflicts: conflictMap[String(d._id)] || [],
    hasConflict: Boolean(conflictMap[String(d._id)]?.length),
  }));

  return {
    drivers: enriched,
    total,
    page: pageNum,
    bufferMinutes,
    window,
    carTypeId: carTypeId ? String(carTypeId) : null,
    bookingZoneIds: bookingZoneIds.map(String),
  };
}

/* ------------------------------------------------------------------ */
/* Manual assignment                                                   */
/* ------------------------------------------------------------------ */

/**
 * Admin / sub_admin picks a specific driver for an outstation booking.
 *
 *   Race protection:
 *     - CAS on `Booking.findOneAndUpdate({ status: PENDING_ASSIGNMENT,
 *       driverId: null })` → only one admin can ever flip a given
 *       booking to DRIVER_ASSIGNED.
 *     - Post-CAS re-check on driver + vehicle conflicts; if another
 *       overlapping booking was committed concurrently, the booking
 *       with the LARGER `_id` rolls back to PENDING_ASSIGNMENT
 *       (deterministic winner — both sides agree on who keeps the
 *       assignment without needing a transaction).
 *
 *   Locking:
 *     - `Driver.isOnTrip = true` only if pickup is within one buffer
 *       window of now. Far-future outstation assignments leave the
 *       driver in the dispatch pool; the conflict service prevents
 *       overlapping offers.
 */
export async function adminAssignDriverToOutstationService(
  bookingId,
  driverId,
  { staffId, notes = '', staff } = {},
) {
  if (!bookingId || !driverId) {
    throw new ApiError(400, 'bookingId and driverId are required');
  }

  // 1. Load booking + zone-scope check.
  const detail = await getOutstationAssignmentDetailService(bookingId, staff);
  if (!detail) throw new ApiError(404, 'Outstation booking not found or out of zone');
  const { booking: bookingDoc, bufferMinutes, window } = detail;

  if (bookingDoc.serviceType !== SERVICE_TYPES.OUTSTATION) {
    throw new ApiError(400, 'Only outstation bookings can be assigned from this queue');
  }
  if (bookingDoc.status !== BOOKING_STATUS.PENDING_ASSIGNMENT) {
    throw new ApiError(
      409,
      `Booking is no longer pending assignment (status: ${bookingDoc.status})`,
    );
  }
  if (!window) {
    throw new ApiError(500, 'Booking is missing its outstation window — cannot validate');
  }

  // 2. Driver sanity check. We also re-verify the outstation opt-in
  // here \u2014 the picker already filters on it, but the FE could
  // hold a stale list (driver toggled off between fetch and assign),
  // and we don't want a multi-day overnight job pushed onto a driver
  // who has explicitly opted out.
  const driver = await Driver.findOne({
    _id: driverId,
    isDeleted: { $ne: true },
    approvalStatus: 'approved',
  });
  if (!driver) throw new ApiError(404, 'Driver not found or not approved');
  if (!driver.availableForOutstation) {
    throw new ApiError(
      409,
      'This driver has opted out of outstation assignments. Pick another driver.',
    );
  }

  // 3. Vehicle conflict (excluding this booking).
  const vehicleConflicts = await getVehicleConflicts({
    carId: bookingDoc.carId,
    window: { startMs: window.bufferedStartMs, endMs: window.bufferedEndMs },
    excludeBookingId: bookingDoc._id,
    bufferMinutes,
  });
  if (vehicleConflicts.length) {
    const err = new ApiError(
      409,
      'This vehicle is already booked in an overlapping window. Cannot assign.',
    );
    err.data = { code: 'VEHICLE_CONFLICT', conflicts: vehicleConflicts };
    throw err;
  }

  // 4. Driver conflict (excluding this booking).
  const driverConflictMap = await getDriverConflictMap({
    driverIds: [driver._id],
    window: { startMs: window.bufferedStartMs, endMs: window.bufferedEndMs },
    excludeBookingId: bookingDoc._id,
    bufferMinutes,
  });
  const driverConflicts = driverConflictMap[String(driver._id)] || [];
  if (driverConflicts.length) {
    const err = new ApiError(
      409,
      'Driver is already assigned to an overlapping booking. Pick another driver.',
    );
    err.data = { code: 'DRIVER_CONFLICT', conflicts: driverConflicts };
    throw err;
  }

  // 5. Atomic CAS — flip the booking to DRIVER_ASSIGNED in a single
  // findOneAndUpdate. Two admins clicking Assign on the same booking
  // are serialised here: only one update matches the guard.
  const now = new Date();
  const updatedBooking = await Booking.findOneAndUpdate(
    {
      _id: bookingDoc._id,
      status: BOOKING_STATUS.PENDING_ASSIGNMENT,
      driverId: null,
      isDeleted: false,
    },
    {
      $set: {
        driverId: driver._id,
        status: BOOKING_STATUS.DRIVER_ASSIGNED,
        'timeline.driverAssignedAt': now,
        'scheduled.emergencyPool.assignedBy': staffId || null,
        'scheduled.emergencyPool.assignedAt': now,
        'scheduled.emergencyPool.notes': notes || '',
      },
      $push: {
        'dispatch.offers': {
          driverId: driver._id,
          offeredAt: now,
          respondedAt: now,
          response: DISPATCH_RESPONSE.ACCEPTED,
          distanceMeters: null,
        },
      },
    },
    { new: true },
  );
  if (!updatedBooking) {
    throw new ApiError(409, 'Booking was just assigned by someone else');
  }

  // 6. Post-CAS conflict re-check — handles the race where two admins
  // assign THE SAME driver to two DIFFERENT bookings whose windows
  // overlap. Both transactions pass the pre-check, both CAS succeed
  // (different booking IDs), then both detect each other. We use
  // `_id` (Mongo ObjectId, time-ordered) as the tiebreaker: the
  // booking with the LARGER `_id` rolls back, the smaller keeps.
  const postCheck = await getDriverConflictMap({
    driverIds: [driver._id],
    window: { startMs: window.bufferedStartMs, endMs: window.bufferedEndMs },
    excludeBookingId: bookingDoc._id,
    bufferMinutes,
  });
  const lateConflicts = postCheck[String(driver._id)] || [];
  if (lateConflicts.length) {
    const ourId = String(updatedBooking._id);
    const weLose = lateConflicts.some((c) => String(c._id) < ourId);
    if (weLose) {
      await Booking.updateOne(
        { _id: updatedBooking._id },
        {
          $set: {
            driverId: null,
            status: BOOKING_STATUS.PENDING_ASSIGNMENT,
            'timeline.driverAssignedAt': null,
          },
        },
      );
      const err = new ApiError(
        409,
        'Driver was assigned to an overlapping booking by another admin. Pick a different driver.',
      );
      err.data = { code: 'DRIVER_CONFLICT_RACE', conflicts: lateConflicts };
      throw err;
    }
  }

  // 7. Lock the driver if pickup is imminent.
  const lockNow = shouldImmediatelyLockOutstation(updatedBooking, bufferMinutes);
  if (lockNow) {
    await Driver.updateOne(
      { _id: driver._id, isOnTrip: false },
      { $set: { isOnTrip: true } },
    );
  }

  // 8. Socket fan-out — mirror the emergency-pool service.
  const userPayload = {
    bookingId: String(updatedBooking._id),
    status: updatedBooking.status,
    paymentMode: updatedBooking.paymentMode,
    paymentStatus: updatedBooking.paymentStatus,
    driverId: String(driver._id),
    timeline: updatedBooking.timeline?.toObject?.() || updatedBooking.timeline,
  };
  const driverPayload = {
    bookingId: String(updatedBooking._id),
    status: updatedBooking.status,
    driverId: String(driver._id),
    timeline: updatedBooking.timeline?.toObject?.() || updatedBooking.timeline,
  };

  emitToUser(updatedBooking.userId, S2C_EVENTS.BOOKING_UPDATED, userPayload);
  emitToBooking(updatedBooking._id, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToDriver(driver._id, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, userPayload);

  emitToDriver(driver._id, S2C_EVENTS.NOTIFICATION, {
    title: 'New outstation assignment',
    body: `Admin assigned booking ${updatedBooking.bookingNumber} to you.`,
    severity: 'info',
    data: {
      bookingId: String(updatedBooking._id),
      // Forward both naming conventions so the driver app can switch
      // over to pickupAt/expectedReturnAt at its own pace.
      pickupAt:
        updatedBooking.outstation?.pickupAt ||
        updatedBooking.outstation?.startDate ||
        null,
      expectedReturnAt:
        updatedBooking.outstation?.expectedReturnAt ||
        updatedBooking.outstation?.endDate ||
        null,
      startDate: updatedBooking.outstation?.startDate || null,
      endDate: updatedBooking.outstation?.endDate || null,
      destinationAddress: updatedBooking.outstation?.destinationAddress || '',
    },
  });

  return {
    booking: await Booking.findById(updatedBooking._id)
      .populate('driverId', 'name phone email rating')
      .populate('userId', 'name phone_no')
      .lean(),
    paid: updatedBooking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID,
    locked: lockNow,
  };
}

/* ------------------------------------------------------------------ */
/* Conflict probe (UI hover)                                           */
/* ------------------------------------------------------------------ */

/**
 * Lightweight endpoint used by the UI to re-run the driver-conflict
 * check for a specific (bookingId, driverId) pair WITHOUT committing
 * anything — used to refresh the "no conflict" banner the moment a
 * picker row is selected.
 */
export async function probeDriverConflictService(bookingId, driverId, staff) {
  const detail = await getOutstationAssignmentDetailService(bookingId, staff);
  if (!detail) throw new ApiError(404, 'Outstation booking not found or out of zone');
  const { booking, bufferMinutes, window, vehicleConflicts } = detail;
  if (!window) return { driverConflicts: [], vehicleConflicts: [] };

  const map = await getDriverConflictMap({
    driverIds: [driverId],
    window: { startMs: window.bufferedStartMs, endMs: window.bufferedEndMs },
    excludeBookingId: booking._id,
    bufferMinutes,
  });
  return {
    driverConflicts: map[String(driverId)] || [],
    vehicleConflicts,
    bufferMinutes,
  };
}
