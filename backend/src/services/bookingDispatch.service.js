import Booking from '../models/booking.model.js';
import Car from '../models/user/car.model.js';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import {
  findDriversInExpandingRadius,
  findDriversWithinRadius,
} from './driverFinder.service.js';
import { syncFirebaseDriverStatus } from './driverLocation.service.js';
import {
  adminMarkNoDriversFoundService,
  driverEarningFromFareSnapshot,
} from './booking.service.js';
import { schedulePaymentTimeout } from './bookingPaymentTimeout.service.js';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  BOOKING_TYPE,
  PAYMENT_MODE,
  PAYMENT_POLICY,
  DISPATCH,
  DISPATCH_MODE,
  DISPATCH_RESPONSE,
  SCHEDULED_BOOKING,
} from '../constants/bookingStatus.js';
import {
  estimateBookingWindow,
  findConflictingDriverIds,
} from './driverConflict.service.js';
import {
  isInboxBookingType,
  resolveBookingSearchStartAt,
} from '../utils/bookingInbox.js';
import mongoose from 'mongoose';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToDriver,
  emitToUser,
  emitToAdmins,
  emitToBooking,
} from '../utils/socketEmitters.js';
import {
  notifyUserDriverAssigned,
  notifyUserDriverAccepted,
  notifyDriverNewBookingRequest,
  notifyDriverBookingOfferWithdrawn,
} from '../utils/notificationDispatch.js';

/**
 * Booking dispatcher — two modes:
 *
 * Instant (wave):
 *   Expanding-radius waves of WAVE_SIZE drivers, OFFER_TIMEOUT_SECONDS
 *   per wave, retries until MAX_ATTEMPTS → no_drivers_found.
 *
 * Scheduled (inbox):
 *   One broadcast to every matching driver within max radius. No offer
 *   expiry / wave timer / retry churn. Drivers discover via Incoming
 *   Requests; first accept wins. Unmatched bookings past escalateAt are
 *   swept into the emergency pool by the 45-min batch cron.
 *
 * Wave timers live in memory only (`waveTimers`). A server restart drops
 * outstanding timers; the next driver action or admin sweep resumes things.
 */

/** bookingId → setTimeout handle for the active wave's expiry. */
const waveTimers = new Map();

/**
 * Read the per-service `RIDE_BUFFER_MINUTES` override (admin-tunable
 * via the pricing modal). Falls back to the platform-wide constant.
 *
 * Loaded through a dynamic import so the `bookingDispatch ↔
 * bookingScheduled` module pair can stay loosely coupled (the
 * scheduled service already pulls `dispatchNextDriverService` from
 * here, so a top-level static import would be circular).
 */
async function resolveRideBufferMinutes(serviceType) {
  try {
    const { loadScheduledDispatchConfig } = await import(
      './bookingScheduled.service.js'
    );
    const cfg = await loadScheduledDispatchConfig(serviceType);
    const value = Number(cfg?.RIDE_BUFFER_MINUTES);
    if (Number.isFinite(value) && value >= 0) return value;
  } catch (err) {
    console.warn(
      '[dispatch] failed to load RIDE_BUFFER_MINUTES override:',
      err?.message,
    );
  }
  return SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
}

function clearWaveTimer(bookingId) {
  const handle = waveTimers.get(String(bookingId));
  if (handle) {
    clearTimeout(handle);
    waveTimers.delete(String(bookingId));
  }
}

function alreadyOfferedDriverIds(booking) {
  return (booking.dispatch?.offers || []).map((o) => String(o.driverId));
}

/** Statuses that legitimately keep a driver's `isOnTrip` flag at `true`. */
const ON_TRIP_LOCK_STATUSES = Object.freeze([
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
]);

/**
 * Self-heal pass that runs at the top of every dispatch wave.
 *
 * Two failure modes the rest of the system can't undo on its own:
 *
 *   1. A driver tapped "Start to pickup" on a SCHEDULED booking days
 *      before pickup. The booking is now wedged at EN_ROUTE far from
 *      its actual start time, and the driver's `isOnTrip` flag is set —
 *      so the radius search excludes them from every new wave for the
 *      entire interval. Walk those bookings back to DRIVER_ASSIGNED so
 *      both sides can resume normal life. (The newer
 *      `markDriverEnRouteService` guard prevents the wedge from
 *      happening again, but legacy data still needs cleaning up.)
 *
 *   2. A driver's `isOnTrip` is `true` but they have NO booking in any
 *      "actively committed" status. Cause is usually a server crash
 *      between the booking-status update and the driver-flag update.
 *      Reset their flag so the dispatcher stops skipping them.
 *
 * Both passes are bounded by Mongo aggregations on indexed fields, so
 * the cost is negligible per wave. Failures are logged and swallowed —
 * dispatch must never block on a self-heal hiccup.
 */
async function selfHealDriverLockState() {
  // 1. Walk back any SCHEDULED booking parked in EN_ROUTE while pickup
  //    is still well beyond the buffer window. We use the platform-wide
  //    default buffer here rather than the per-service override —
  //    accidentally clearing a few minutes early is harmless (the
  //    radius search will still match conflicting drivers via the
  //    overlap window) and keeps the heal cheap (no per-booking
  //    pricing lookup).
  try {
    const wedgeCutoffMs =
      Date.now() + SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES * 60_000;
    const wedged = await Booking.find({
      isDeleted: false,
      bookingType: BOOKING_TYPE.SCHEDULED,
      status: BOOKING_STATUS.EN_ROUTE,
      'hourly.scheduledStartAt': { $gt: new Date(wedgeCutoffMs) },
    })
      .select('_id userId driverId timeline status')
      .lean();
    for (const b of wedged) {
      try {
        await Booking.updateOne(
          { _id: b._id, status: BOOKING_STATUS.EN_ROUTE },
          {
            $set: { status: BOOKING_STATUS.DRIVER_ASSIGNED },
            $unset: { 'timeline.enRouteAt': '' },
          },
        );
        if (b.driverId) {
          await Driver.updateOne(
            { _id: b.driverId },
            { $set: { isOnTrip: false } },
          );
        }
        // Sync any open driver/user/admin UIs so they don't keep
        // rendering the stale EN_ROUTE state until the next refresh.
        const payload = {
          bookingId: String(b._id),
          status: BOOKING_STATUS.DRIVER_ASSIGNED,
        };
        emitToBooking(b._id, S2C_EVENTS.BOOKING_UPDATED, payload);
        if (b.userId) emitToUser(b.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
        if (b.driverId) emitToDriver(b.driverId, S2C_EVENTS.BOOKING_UPDATED, payload);
        emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);
      } catch (err) {
        console.warn(
          '[dispatch] failed to walk back wedged scheduled booking',
          String(b._id),
          err?.message,
        );
      }
    }
  } catch (err) {
    console.warn('[dispatch] self-heal wedge sweep failed:', err?.message);
  }

  // 2. Drivers flagged on-trip with no booking to back the flag. Bulk
  //    reset — the `$nin` is bounded by the live in-progress booking
  //    count which is small in practice.
  try {
    const lockedDriverIds = await Booking.distinct('driverId', {
      isDeleted: false,
      driverId: { $ne: null },
      status: { $in: ON_TRIP_LOCK_STATUSES },
    });
    await Driver.updateMany(
      { isOnTrip: true, _id: { $nin: lockedDriverIds } },
      { $set: { isOnTrip: false } },
    );
  } catch (err) {
    console.warn('[dispatch] self-heal stale isOnTrip sweep failed:', err?.message);
  }
}

function buildOfferPayload(booking, driver, { customer, car } = {}) {
  return {
    bookingId: String(booking._id),
    bookingNumber: booking.bookingNumber,
    serviceType: booking.serviceType,
    // Drivers need to tell scheduled vs instant requests apart at a
    // glance — the offer modal themes itself off this field.
    bookingType: booking.bookingType,
    paymentMode: booking.paymentMode,
    pickup: booking.pickup,
    dropoff: booking.dropoff || null,
    hourly: booking.hourly || null,
    outstation: booking.outstation || null,
    // Drivers only ever see their own earning — never the customer's
    // gross total or the platform commission. Computed once here so the
    // offer payload, the active-trip view and the trip history all show
    // the same number.
    fare: {
      driverEarning: driverEarningFromFareSnapshot(booking.fareSnapshot),
      currency: 'INR',
    },
    customer: customer
      ? {
          name: customer.name || '',
          profilePicture: customer.profilePicture || '',
        }
      : null,
    car: car
      ? {
          _id: String(car._id),
          vehicleNumber: car.vehicleNumber || '',
          transmission: car.transmission || '',
          carTypeName: car.carTypeId?.name || '',
          brandName: car.brandId?.name || '',
          modelName: car.modelId?.name || '',
          fuelTypeName: car.fuelTypeId?.name || '',
        }
      : null,
    offerExpiresAt: booking.dispatch.currentExpiresAt || null,
    distanceMeters: driver.distanceMeters ?? null,
    waveSize: booking.dispatch.pendingOfferIds.length,
    /** True when this is an open inbox item (no countdown). */
    inbox: booking.dispatch?.mode === DISPATCH_MODE.INBOX
      || (isInboxBookingType(booking.bookingType)
        && !booking.dispatch?.currentExpiresAt),
  };
}

function isInboxDispatch(booking) {
  if (!booking) return false;
  if (booking.dispatch?.mode === DISPATCH_MODE.INBOX) return true;
  return (
    isInboxBookingType(booking.bookingType)
    && booking.dispatch?.mode !== DISPATCH_MODE.WAVE
  );
}

function emitUserDispatchUpdate(booking) {
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, {
    bookingId: String(booking._id),
    status: booking.status,
    dispatch: {
      attempt: booking.dispatch.attemptsCount,
      maxAttempts: booking.dispatch.maxAttempts,
      radiusMeters: booking.dispatch.currentRadiusMeters,
      pendingDriverCount: booking.dispatch.pendingOfferIds.length,
    },
  });
}

function notifyWaveWithdrawn(driverIds, bookingId, reason) {
  for (const id of driverIds) {
    emitToDriver(id, S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, {
      bookingId: String(bookingId),
      reason,
    });
    notifyDriverBookingOfferWithdrawn(id, {
      bookingId,
      reason,
    }).catch(() => null);
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Shared candidate prep used by both wave + inbox dispatch paths.
 */
async function prepareDispatchCandidates(booking, { excludeAlreadyOffered = true } = {}) {
  const [lng, lat] = booking.pickup?.location?.coordinates || [];
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { ok: false, reason: 'bad_pickup' };
  }

  const car = booking.carId
    ? await Car.findById(booking.carId)
        .populate('carTypeId', 'name')
        .populate('brandId', 'name')
        .populate('modelId', 'name')
        .populate('fuelTypeId', 'name')
        .lean()
    : null;
  const customer = await User.findById(booking.userId)
    .select('name phone_no profilePicture')
    .lean();
  const carTypeIds = car?.carTypeId?._id ? [String(car.carTypeId._id)] : [];

  const bufferMinutes = await resolveRideBufferMinutes(booking.serviceType);
  const newWindow = estimateBookingWindow(booking);
  const conflictedDriverIds = newWindow
    ? await findConflictingDriverIds({
        window: newWindow,
        excludeBookingId: booking._id,
        bufferMinutes,
      })
    : [];

  const excludeDriverIds = [
    ...(excludeAlreadyOffered ? alreadyOfferedDriverIds(booking) : []),
    ...conflictedDriverIds,
  ];

  return {
    ok: true,
    lat,
    lng,
    car,
    customer,
    carTypeIds,
    excludeDriverIds,
    startMeters:
      booking.dispatch?.currentRadiusMeters || DISPATCH.SEARCH_RADIUS_START_METERS,
    maxMeters:
      booking.dispatch?.maxRadiusMeters || DISPATCH.SEARCH_RADIUS_MAX_METERS,
  };
}

/**
 * One-shot (or refresh) inbox broadcast for scheduled bookings.
 *
 * @param {string} bookingId
 * @param {{ rebroadcast?: boolean }} [opts]
 *   rebroadcast=true → add newly matching drivers without clearing
 *   existing pending inbox holders (used by the 45-min cron).
 */
export async function broadcastScheduledInboxService(bookingId, opts = {}) {
  const rebroadcast = !!opts.rebroadcast;
  const booking = await Booking.findById(bookingId);
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status !== BOOKING_STATUS.SEARCHING) {
    return { ok: false, reason: 'not_searching' };
  }

  const startAt = resolveBookingSearchStartAt(booking);
  if (startAt && startAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'ride_time_passed' };
  }

  clearWaveTimer(bookingId);
  await selfHealDriverLockState();

  // First broadcast only: skip if already ran (kickoff idempotency).
  // Rebroadcast path continues so newly-online drivers get the request.
  if (
    !rebroadcast
    && booking.dispatch?.mode === DISPATCH_MODE.INBOX
    && (booking.dispatch?.attemptsCount || 0) >= 1
  ) {
    return {
      ok: true,
      alreadyBroadcast: true,
      driverIds: (booking.dispatch.pendingOfferIds || []).map(String),
      newDriverCount: 0,
    };
  }

  // Never re-offer drivers who already rejected, or who already hold a
  // pending inbox row. Conflicted drivers come from prepare below.
  const skipIds = new Set([
    ...(booking.dispatch?.pendingOfferIds || []).map(String),
    ...(booking.dispatch?.offers || [])
      .filter(
        (o) =>
          o.response === DISPATCH_RESPONSE.REJECTED
          || o.response === DISPATCH_RESPONSE.ACCEPTED,
      )
      .map((o) => String(o.driverId)),
  ]);

  const prepared = await prepareDispatchCandidates(booking, {
    excludeAlreadyOffered: false,
  });
  if (!prepared.ok) {
    booking.dispatch = booking.dispatch || {};
    booking.dispatch.mode = DISPATCH_MODE.INBOX;
    booking.dispatch.currentExpiresAt = null;
    if (!rebroadcast) {
      booking.dispatch.pendingOfferIds = [];
      booking.dispatch.attemptsCount = 1;
    }
    await booking.save();
    emitUserDispatchUpdate(booking);
    return { ok: true, empty: true, reason: prepared.reason, newDriverCount: 0 };
  }

  const { lat, lng, car, customer, carTypeIds, excludeDriverIds, maxMeters } =
    prepared;

  const excludeMerged = [
    ...new Set([...excludeDriverIds.map(String), ...skipIds]),
  ];

  // Outstation auto-search only offers to drivers who opted in, and
  // prefer those who listed at least one of the booking's zones.
  let extraMatch = null;
  if (booking.bookingType === BOOKING_TYPE.OUTSTATION) {
    extraMatch = { availableForOutstation: true };
    const zoneOids = (booking.zoneIds || [])
      .map((z) => {
        try {
          return new mongoose.Types.ObjectId(String(z?._id || z));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (zoneOids.length) {
      extraMatch.$or = [
        { preferredOutstationZones: { $in: zoneOids } },
        { outstationAllIndiaOk: true },
      ];
    }
  }

  const drivers = await findDriversWithinRadius({
    lat,
    lng,
    radiusMeters: maxMeters,
    limit: SCHEDULED_BOOKING.INBOX_BROADCAST_LIMIT,
    carTypeIds,
    excludeDriverIds: excludeMerged,
    extraMatch,
  });

  booking.dispatch = booking.dispatch || {};
  booking.dispatch.mode = DISPATCH_MODE.INBOX;
  booking.dispatch.currentExpiresAt = null;
  booking.dispatch.currentRadiusMeters = maxMeters;
  booking.dispatch.attemptsCount = Math.max(1, booking.dispatch.attemptsCount || 0);

  const existingPending = new Set(
    (booking.dispatch.pendingOfferIds || []).map(String),
  );
  const alreadyOfferedRows = new Set(
    (booking.dispatch.offers || []).map((o) => String(o.driverId)),
  );

  const newDrivers = [];
  for (const driver of drivers) {
    const id = String(driver._id);
    if (existingPending.has(id)) continue;
    existingPending.add(id);
    newDrivers.push(driver);
    if (!alreadyOfferedRows.has(id)) {
      booking.dispatch.offers.push({
        driverId: driver._id,
        offeredAt: new Date(),
        response: null,
        distanceMeters: driver.distanceMeters ?? null,
      });
    } else {
      // Previously timed-out / cancelled offer — reopen as pending
      const row = booking.dispatch.offers.find(
        (o) => String(o.driverId) === id && o.response == null,
      );
      if (!row) {
        booking.dispatch.offers.push({
          driverId: driver._id,
          offeredAt: new Date(),
          response: null,
          distanceMeters: driver.distanceMeters ?? null,
        });
      }
    }
  }

  booking.dispatch.pendingOfferIds = [...existingPending];
  await booking.save();

  for (const driver of newDrivers) {
    const offerPayload = buildOfferPayload(booking, driver, { customer, car });
    emitToDriver(driver._id, S2C_EVENTS.BOOKING_OFFERED, offerPayload);
    notifyDriverNewBookingRequest(driver._id, booking, offerPayload).catch(() => null);
  }
  emitUserDispatchUpdate(booking);

  return {
    ok: true,
    empty: existingPending.size === 0,
    rebroadcast,
    newDriverCount: newDrivers.length,
    driverIds: [...existingPending],
    radiusMeters: maxMeters,
  };
}

/**
 * Start (or continue) the dispatch loop for a booking. Scheduled bookings
 * use the inbox broadcast; instant/outstation (and any booking already
 * marked wave-mode) use timed waves.
 *
 * @param {string} bookingId
 */
export async function dispatchNextDriverService(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status !== BOOKING_STATUS.SEARCHING) {
    return { ok: false, reason: 'not_searching' };
  }

  // Scheduled + outstation → open inbox (no timers).
  if (isInboxBookingType(booking.bookingType)) {
    return broadcastScheduledInboxService(bookingId);
  }

  clearWaveTimer(bookingId);

  // Belt-and-braces cleanup before each wave: walks back any SCHEDULED
  // booking wedged at EN_ROUTE far from pickup and resets stale
  // `Driver.isOnTrip` flags. Without this, a single early-en-route tap
  // (or a crashed cancel path) would silently exclude the driver from
  // every dispatch wave for hours/days.
  await selfHealDriverLockState();

  const maxAttempts = booking.dispatch?.maxAttempts || DISPATCH.MAX_ATTEMPTS;
  if ((booking.dispatch?.attemptsCount || 0) >= maxAttempts) {
    return failBookingNoDrivers(bookingId);
  }

  const prepared = await prepareDispatchCandidates(booking, {
    excludeAlreadyOffered: true,
  });
  if (!prepared.ok) {
    return failBookingNoDrivers(bookingId);
  }

  const {
    lat,
    lng,
    car,
    customer,
    carTypeIds,
    excludeDriverIds,
    startMeters,
    maxMeters,
  } = prepared;

  const { drivers, radiusMeters } = await findDriversInExpandingRadius({
    lat,
    lng,
    startMeters,
    stepMeters: DISPATCH.SEARCH_RADIUS_STEP_METERS,
    maxMeters,
    limit: DISPATCH.WAVE_SIZE,
    minResults: 1,
    carTypeIds,
    excludeDriverIds,
  });

  if (!drivers.length) {
    return failBookingNoDrivers(bookingId);
  }

  const expiresAt = new Date(Date.now() + DISPATCH.OFFER_TIMEOUT_SECONDS * 1000);
  booking.dispatch.mode = DISPATCH_MODE.WAVE;
  booking.dispatch.currentExpiresAt = expiresAt;
  booking.dispatch.currentRadiusMeters = radiusMeters;
  booking.dispatch.attemptsCount = (booking.dispatch.attemptsCount || 0) + 1;
  booking.dispatch.pendingOfferIds = drivers.map((d) => d._id);
  for (const driver of drivers) {
    booking.dispatch.offers.push({
      driverId: driver._id,
      offeredAt: new Date(),
      response: null,
      distanceMeters: driver.distanceMeters ?? null,
    });
  }
  await booking.save();

  // Emit to every driver in the wave in parallel (socket + FCM hydrate).
  for (const driver of drivers) {
    const offerPayload = buildOfferPayload(booking, driver, { customer, car });
    emitToDriver(driver._id, S2C_EVENTS.BOOKING_OFFERED, offerPayload);
    notifyDriverNewBookingRequest(driver._id, booking, offerPayload).catch(() => null);
  }
  emitUserDispatchUpdate(booking);

  // Schedule the wave-level timeout-skip.
  const handle = setTimeout(() => {
    handleWaveTimeoutService(bookingId).catch((err) => {
      console.warn('[dispatch] wave timeout handler failed:', err.message);
    });
  }, DISPATCH.OFFER_TIMEOUT_SECONDS * 1000);
  waveTimers.set(String(bookingId), handle);

  return {
    ok: true,
    wave: booking.dispatch.attemptsCount,
    driverIds: drivers.map((d) => String(d._id)),
    radiusMeters,
  };
}

async function failBookingNoDrivers(bookingId) {
  clearWaveTimer(bookingId);

  // Scheduled: stay in SEARCHING with an empty inbox until the batch
  // escalate cron (or a later manual path) moves the booking. Do NOT
  // enqueue per-booking retry waves.
  const peek = await Booking.findById(bookingId);
  if (peek?.bookingType === BOOKING_TYPE.SCHEDULED) {
    peek.dispatch = peek.dispatch || {};
    peek.dispatch.mode = DISPATCH_MODE.INBOX;
    peek.dispatch.pendingOfferIds = [];
    peek.dispatch.currentExpiresAt = null;
    if (!(peek.dispatch.attemptsCount > 0)) {
      peek.dispatch.attemptsCount = 1;
    }
    await peek.save();
    emitUserDispatchUpdate(peek);
    return { ok: false, reason: 'scheduled_awaiting_emergency_pool' };
  }

  // Instant: soft-park as NO_DRIVERS_FOUND (payment held; user can
  // search again or cancel for a refund). No auto-refund here.
  const booking = await adminMarkNoDriversFoundService(bookingId);
  const escalated = booking.status === BOOKING_STATUS.IN_EMERGENCY_POOL;
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, {
    bookingId: String(booking._id),
    status: booking.status,
  });
  emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
    kind: escalated ? 'emergency_pool_entered' : 'no_drivers_found',
    severity: 'warn',
    message: escalated
      ? `Scheduled booking ${booking.bookingNumber} needs manual driver assignment`
      : `Booking ${booking.bookingNumber} could not find a driver`,
    data: { bookingId: String(booking._id) },
  });
  return {
    ok: false,
    reason: escalated ? 'in_emergency_pool' : 'no_drivers_found',
  };
}

/**
 * Decide whether a freshly-accepted booking should immediately mark
 * the driver as `isOnTrip: true`. Returns `true` for:
 *
 *   - Instant bookings (driver is committed right now).
 *   - Scheduled bookings whose pickup is inside one buffer window of
 *     now (e.g. ≤ 30 min away by default) — at that point we don't
 *     want to risk offering them another ride.
 *
 * Returns `false` for far-future scheduled bookings: the driver
 * stays dispatchable for non-overlapping work in the meantime and
 * the overlap-check in `dispatchNextDriverService` protects the
 * accepted booking.
 */
async function shouldImmediatelyLockDriver(booking) {
  if (!booking) return true;
  if (!isInboxBookingType(booking.bookingType)) return true;

  const scheduledAt = resolveBookingSearchStartAt(booking);
  if (!scheduledAt) return true;
  const startMs = scheduledAt.getTime();
  if (!Number.isFinite(startMs)) return true;

  const bufferMinutes = await resolveRideBufferMinutes(booking.serviceType);
  const lockLeadMs = Math.max(0, Number(bufferMinutes) || 0) * 60_000;
  return startMs - Date.now() <= lockLeadMs;
}

/** Driver accepts a live offer for a booking. First driver wins (atomic claim). */
export async function acceptBookingService(bookingId, driverId) {
  // Hard stop: an actively locked driver must not claim another ride,
  // even if a stale offer is still sitting in their inbox.
  const driverRow = await Driver.findById(driverId).select('isOnTrip').lean();
  if (!driverRow) return { ok: false, reason: 'driver_not_found' };
  if (driverRow.isOnTrip) {
    return { ok: false, reason: 'driver_on_trip' };
  }

  // Reject accepts after pickup time for scheduled/outstation inbox offers.
  const preview = await Booking.findById(bookingId)
    .select('bookingType hourly outstation status driverId')
    .lean();
  if (!preview) return { ok: false, reason: 'not_found' };
  if (isInboxBookingType(preview.bookingType)) {
    const startAt = resolveBookingSearchStartAt(preview);
    if (startAt && startAt.getTime() <= Date.now()) {
      return { ok: false, reason: 'ride_time_passed' };
    }
  }

  // Atomic first-wins: claim the booking while still SEARCHING and this
  // driver is in the pending set. Concurrent accepts fail the filter.
  const booking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      isDeleted: false,
      status: BOOKING_STATUS.SEARCHING,
      driverId: null,
      'dispatch.pendingOfferIds': driverId,
    },
    {
      $set: {
        driverId,
        'dispatch.pendingOfferIds': [],
        'dispatch.currentExpiresAt': null,
      },
    },
    { new: true },
  );

  if (!booking) {
    const existing = await Booking.findOne({ _id: bookingId, isDeleted: false }).select(
      'status driverId dispatch.pendingOfferIds',
    );
    if (!existing) return { ok: false, reason: 'not_found' };
    if (existing.status !== BOOKING_STATUS.SEARCHING || existing.driverId) {
      return { ok: false, reason: 'no_longer_searching' };
    }
    return { ok: false, reason: 'not_in_active_wave' };
  }

  clearWaveTimer(bookingId);

  // Rebuild loser list from offer rows still unmarked as responded.
  const losers = (booking.dispatch?.offers || [])
    .filter(
      (o) =>
        o.response == null
        && String(o.driverId) !== String(driverId),
    )
    .map((o) => String(o.driverId));

  // Mark this driver's offer as accepted.
  const offer = booking.dispatch.offers.find(
    (o) => String(o.driverId) === String(driverId) && o.response == null,
  );
  if (offer) {
    offer.response = DISPATCH_RESPONSE.ACCEPTED;
    offer.respondedAt = new Date();
  }

  for (const loserId of losers) {
    const otherOffer = booking.dispatch.offers.find(
      (o) => String(o.driverId) === String(loserId) && o.response == null,
    );
    if (otherOffer) {
      otherOffer.response = DISPATCH_RESPONSE.CANCELLED;
      otherOffer.respondedAt = new Date();
    }
  }

  const acceptedAt = new Date();
  booking.timeline.driverAssignedAt = acceptedAt;

  const alreadyPaid =
    booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID;

  if (alreadyPaid) {
    booking.status = BOOKING_STATUS.DRIVER_ASSIGNED;
    booking.timeline.paymentDeadlineAt = null;
    booking.cancellation = null;
  } else {
    booking.timeline.paymentDeadlineAt = new Date(
      acceptedAt.getTime() + PAYMENT_POLICY.PAYMENT_DEADLINE_SECONDS * 1000,
    );
    booking.status = BOOKING_STATUS.AWAITING_PAYMENT;
    booking.paymentMode = PAYMENT_MODE.PRE_RIDE;
    booking.paymentStatus = BOOKING_PAYMENT_STATUS.PENDING;
  }
  await booking.save();

  const shouldLockDriver = await shouldImmediatelyLockDriver(booking);
  if (shouldLockDriver) {
    await Driver.updateOne({ _id: driverId }, { $set: { isOnTrip: true } });
    syncFirebaseDriverStatus(driverId).catch(() => {});
  }

  if (!alreadyPaid) {
    schedulePaymentTimeout(booking._id);
  }

  if (booking.bookingType === BOOKING_TYPE.SCHEDULED) {
    import('./bookingScheduled.service.js')
      .then(({ enqueueRemindersAfterAssignment }) =>
        enqueueRemindersAfterAssignment(booking),
      )
      .catch((err) =>
        console.warn(
          '[bookingDispatch] reminder enqueue failed for',
          String(booking._id),
          err?.message,
        ),
      );
  }

  notifyWaveWithdrawn(losers, booking._id, 'awarded_to_other_driver');

  const userPayload = {
    bookingId: String(booking._id),
    status: booking.status,
    paymentMode: booking.paymentMode,
    paymentStatus: booking.paymentStatus,
    driverId: String(driverId),
    timeline: booking.timeline?.toObject?.() || booking.timeline,
    cancellation: booking.cancellation
      ? booking.cancellation?.toObject?.() || booking.cancellation
      : null,
  };
  const driverPayload = {
    bookingId: String(booking._id),
    status: booking.status,
    driverId: String(driverId),
    timeline: booking.timeline?.toObject?.() || booking.timeline,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, userPayload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToDriver(driverId, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, userPayload);

  notifyUserDriverAccepted(booking.userId, booking).catch(() => null);
  notifyUserDriverAssigned(booking.userId, booking).catch(() => null);

  return { ok: true, status: booking.status };
}

/**
 * Driver rejects their pending offer. Removes them from the active set.
 * Wave mode: if the wave is now empty, immediately dispatches the next one.
 * Inbox mode: booking stays open for other drivers (no re-broadcast).
 */
export async function rejectBookingService(bookingId, driverId) {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status !== BOOKING_STATUS.SEARCHING) {
    return { ok: false, reason: 'not_searching' };
  }
  const pending = (booking.dispatch?.pendingOfferIds || []).map(String);
  if (!pending.includes(String(driverId))) {
    return { ok: false, reason: 'not_in_active_wave' };
  }

  const inbox = isInboxDispatch(booking);

  const offer = booking.dispatch.offers.find(
    (o) => String(o.driverId) === String(driverId) && o.response == null,
  );
  if (offer) {
    offer.response = DISPATCH_RESPONSE.REJECTED;
    offer.respondedAt = new Date();
  }
  booking.dispatch.pendingOfferIds = booking.dispatch.pendingOfferIds.filter(
    (id) => String(id) !== String(driverId),
  );
  const stillPending = booking.dispatch.pendingOfferIds.length;
  if (stillPending === 0) {
    booking.dispatch.currentExpiresAt = null;
  }
  await booking.save();

  emitToDriver(driverId, S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, {
    bookingId: String(booking._id),
    reason: 'rejected_by_driver',
  });
  notifyDriverBookingOfferWithdrawn(driverId, {
    bookingId: booking._id,
    reason: 'rejected_by_driver',
  }).catch(() => null);

  // Inbox: never auto-dispatch a next wave — stay open until accept /
  // escalate (even if every candidate rejected).
  if (inbox) {
    return { ok: true, pendingDriverCount: stillPending, inbox: true };
  }

  if (stillPending === 0) {
    clearWaveTimer(bookingId);
    return dispatchNextDriverService(bookingId);
  }

  return { ok: true, pendingDriverCount: stillPending };
}

/** Called by the timer when no driver in the active wave has responded in time. */
export async function handleWaveTimeoutService(bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.SEARCHING) return;

  // Drain legacy scheduled rows that still had a wave timer: convert to
  // open inbox instead of timing out / expanding waves.
  if (booking.bookingType === BOOKING_TYPE.SCHEDULED || isInboxDispatch(booking)) {
    clearWaveTimer(bookingId);
    booking.dispatch.mode = DISPATCH_MODE.INBOX;
    booking.dispatch.currentExpiresAt = null;
    await booking.save();
    // If nobody was pending (already expired wave), try one inbox broadcast.
    if (!(booking.dispatch.pendingOfferIds || []).length) {
      await broadcastScheduledInboxService(bookingId);
    }
    return;
  }

  const pending = (booking.dispatch?.pendingOfferIds || []).map(String);
  if (pending.length === 0) return;

  // Mark every unresponded offer in the wave as timed out.
  for (const driverId of pending) {
    const offer = booking.dispatch.offers.find(
      (o) => String(o.driverId) === String(driverId) && o.response == null,
    );
    if (offer) {
      offer.response = DISPATCH_RESPONSE.TIMEOUT;
      offer.respondedAt = new Date();
    }
  }

  booking.dispatch.pendingOfferIds = [];
  booking.dispatch.currentExpiresAt = null;
  await booking.save();

  notifyWaveWithdrawn(pending, booking._id, 'timeout');

  await dispatchNextDriverService(bookingId);
}

/** Backwards-compat alias for legacy callers. */
export const handleOfferTimeoutService = handleWaveTimeoutService;

/**
 * Withdraw every in-flight offer for a booking (used by user-cancel and
 * post-payment dispatch transitions).
 */
export async function withdrawCurrentOfferService(bookingId, reason = 'cancelled') {
  clearWaveTimer(bookingId);
  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  const pending = (booking.dispatch?.pendingOfferIds || []).map(String);
  if (!pending.length) return;

  for (const driverId of pending) {
    const offer = booking.dispatch.offers.find(
      (o) => String(o.driverId) === String(driverId) && o.response == null,
    );
    if (offer) {
      offer.response = DISPATCH_RESPONSE.CANCELLED;
      offer.respondedAt = new Date();
    }
  }
  booking.dispatch.pendingOfferIds = [];
  booking.dispatch.currentExpiresAt = null;
  await booking.save();

  notifyWaveWithdrawn(pending, bookingId, reason);
}

/**
 * Resume helper for timed wave offers only (instant). Scheduled inbox
 * items are listed via `listIncomingScheduledForDriverService`.
 */
export async function getPendingOfferForDriverService(driverId) {
  if (!driverId) return null;

  const now = new Date();
  const booking = await Booking.findOne({
    isDeleted: false,
    status: BOOKING_STATUS.SEARCHING,
    bookingType: { $ne: BOOKING_TYPE.SCHEDULED },
    'dispatch.pendingOfferIds': driverId,
    'dispatch.currentExpiresAt': { $gt: now },
    $or: [
      { 'dispatch.mode': DISPATCH_MODE.WAVE },
      { 'dispatch.mode': { $exists: false } },
      { 'dispatch.mode': null },
    ],
  }).lean();

  if (!booking) return null;

  const offerRow = (booking.dispatch?.offers || []).find(
    (o) => String(o.driverId) === String(driverId) && o.response == null,
  );

  const [car, customer] = await Promise.all([
    booking.carId
      ? Car.findById(booking.carId)
          .populate('carTypeId', 'name')
          .populate('brandId', 'name')
          .populate('modelId', 'name')
          .populate('fuelTypeId', 'name')
          .lean()
      : null,
    User.findById(booking.userId).select('name phone_no profilePicture').lean(),
  ]);

  return buildOfferPayload(
    booking,
    {
      _id: driverId,
      distanceMeters: offerRow?.distanceMeters ?? null,
    },
    { customer, car },
  );
}

/**
 * List open inbox requests (scheduled hourly + outstation + subscription)
 * available to this driver.
 */
export async function listIncomingScheduledForDriverService(driverId) {
  if (!driverId) return { requests: [], count: 0 };

  // While locked on an active trip, hide inbox accepts entirely.
  const driverRow = await Driver.findById(driverId).select('isOnTrip').lean();
  if (driverRow?.isOnTrip) {
    return { requests: [], count: 0 };
  }

  const now = new Date();

  // Opportunistic cleanup: past-start inbox rows still holding this driver
  // get auto-refunded (best-effort) so they disappear without waiting for
  // the next escalate-batch sweep.
  Booking.find({
    isDeleted: false,
    status: {
      $in: [
        BOOKING_STATUS.SEARCHING,
        BOOKING_STATUS.PENDING_ASSIGNMENT,
        BOOKING_STATUS.IN_EMERGENCY_POOL,
        BOOKING_STATUS.NO_DRIVERS_FOUND,
      ],
    },
    bookingType: { $in: [BOOKING_TYPE.SCHEDULED, BOOKING_TYPE.OUTSTATION] },
    driverId: null,
    'dispatch.pendingOfferIds': driverId,
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
        expireUnassignedScheduledBooking(row._id).catch((err) =>
          console.warn(
            '[dispatch] opportunistic expire failed for',
            String(row._id),
            err?.message,
          ),
        );
      }
    })
    .catch(() => {});

  const bookings = await Booking.find({
    isDeleted: false,
    status: BOOKING_STATUS.SEARCHING,
    bookingType: { $in: [BOOKING_TYPE.SCHEDULED, BOOKING_TYPE.OUTSTATION] },
    'dispatch.pendingOfferIds': driverId,
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
  })
    .sort({ 'hourly.scheduledStartAt': 1, 'outstation.pickupAt': 1 })
    .lean();

  // Extra guard for mixed/legacy docs that slipped past the query.
  const futureBookings = bookings.filter((booking) => {
    const startAt = resolveBookingSearchStartAt(booking);
    return startAt && startAt.getTime() > Date.now();
  });

  let requests = [];
  if (futureBookings.length) {
    const carIds = [...new Set(futureBookings.map((b) => String(b.carId || '')).filter(Boolean))];
    const userIds = [...new Set(futureBookings.map((b) => String(b.userId || '')).filter(Boolean))];

    const [cars, customers] = await Promise.all([
      carIds.length
        ? Car.find({ _id: { $in: carIds } })
            .populate('carTypeId', 'name')
            .populate('brandId', 'name')
            .populate('modelId', 'name')
            .populate('fuelTypeId', 'name')
            .lean()
        : [],
      userIds.length
        ? User.find({ _id: { $in: userIds } })
            .select('name phone_no profilePicture')
            .lean()
        : [],
    ]);

    const carById = new Map(cars.map((c) => [String(c._id), c]));
    const customerById = new Map(customers.map((u) => [String(u._id), u]));

    requests = futureBookings.map((booking) => {
      const offerRow = (booking.dispatch?.offers || []).find(
        (o) => String(o.driverId) === String(driverId) && o.response == null,
      );
      return buildOfferPayload(
        booking,
        {
          _id: driverId,
          distanceMeters: offerRow?.distanceMeters ?? null,
        },
        {
          customer: customerById.get(String(booking.userId)),
          car: carById.get(String(booking.carId)),
        },
      );
    });
  }

  // Always merge subscription inbox offers — even when booking list is empty.
  // (Previously we early-returned here, so count could show 1 subscription
  // while the Incoming tab rendered zero cards.)
  let subscriptionRequests = [];
  try {
    const { listIncomingSubscriptionsForDriverService } = await import(
      './subscriptionDispatch.service.js'
    );
    subscriptionRequests = await listIncomingSubscriptionsForDriverService(driverId);
  } catch (err) {
    console.warn('[dispatch] subscription inbox list failed:', err?.message);
  }

  const merged = [...subscriptionRequests, ...requests];
  return { requests: merged, count: merged.length };
}

export async function countIncomingScheduledForDriverService(driverId) {
  if (!driverId) return 0;
  const now = new Date();
  const bookingCount = await Booking.countDocuments({
    isDeleted: false,
    status: BOOKING_STATUS.SEARCHING,
    bookingType: { $in: [BOOKING_TYPE.SCHEDULED, BOOKING_TYPE.OUTSTATION] },
    'dispatch.pendingOfferIds': driverId,
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
  });
  let subCount = 0;
  try {
    const { countIncomingSubscriptionsForDriverService } = await import(
      './subscriptionDispatch.service.js'
    );
    subCount = await countIncomingSubscriptionsForDriverService(driverId);
  } catch {
    subCount = 0;
  }
  return bookingCount + subCount;
}

