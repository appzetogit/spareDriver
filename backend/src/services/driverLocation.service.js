import { Driver } from '../models/driverModels/driver.model.js';
import Booking from '../models/booking.model.js';
import { getRtdb, isFirebaseReady } from '../config/firebase.js';
import { emitToAdmins } from '../utils/socketEmitters.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import { ACTIVE_BOOKING_STATUSES } from '../constants/bookingStatus.js';

/**
 * Live-location pipeline for drivers.
 *
 * Storage split:
 *   - Firebase Realtime DB → /drivers/{driverId}/location  ← every emit (5s)
 *     Authoritative source for "where is this driver right now". User apps
 *     and the admin live map subscribe here.
 *   - MongoDB → Driver.location + Driver.lastLocationAt    ← throttled (>=60s)
 *     Used for `$nearSphere` matching during booking. Drivers don't teleport
 *     so a 60s-stale snapshot is fine for dispatch.
 *
 * Anything in this file silently no-ops when Firebase isn't configured so
 * Phase 2 deployments keep working until the env is filled in.
 */

const MONGO_SNAPSHOT_MIN_INTERVAL_MS = 60_000;
const STATUS_TRIP_CACHE_MS = 30_000;

/** In-memory map of driverId → last Mongo write timestamp (per process). */
const lastMongoWriteAt = new Map();
const onlineSinceByDriver = new Map();
const lastStatusFingerprint = new Map();
const activeTripCache = new Map();

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isFiniteNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function validateCoords({ lat, lng }) {
  return isFiniteNum(lat) && isFiniteNum(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function driverPath(driverId) {
  return `drivers/${driverId}`;
}

function nowMs() {
  return Date.now();
}

function placeLabel(place) {
  if (!place) return null;
  const parts = [place.address, place.city].filter(Boolean);
  return parts.join(', ') || null;
}

function placeCoords(place) {
  const c = place?.location?.coordinates;
  if (!Array.isArray(c) || c.length !== 2) return null;
  const [lng, lat] = c;
  if (!isFiniteNum(lat) || !isFiniteNum(lng)) return null;
  return { lat, lng };
}

function serializeActiveTrip(booking) {
  if (!booking) return null;
  return {
    bookingId: String(booking._id),
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    serviceType: booking.serviceType || null,
    pickup: placeLabel(booking.pickup),
    dropoff:
      placeLabel(booking.dropoff) || booking.outstation?.destinationAddress || null,
    pickupCoords: placeCoords(booking.pickup),
    dropoffCoords: placeCoords(booking.dropoff),
    customerName: booking.userId?.name || null,
    customerPhone: booking.userId?.phone_no || null,
  };
}

async function loadActiveTripForDriver(driverId) {
  const key = String(driverId);
  const cached = activeTripCache.get(key);
  const now = nowMs();
  if (cached && now - cached.at < STATUS_TRIP_CACHE_MS) {
    return cached.trip;
  }

  const booking = await Booking.findOne({
    driverId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
  })
    .select('_id bookingNumber status serviceType pickup dropoff outstation userId')
    .populate('userId', 'name phone_no')
    .sort({ updatedAt: -1 })
    .lean();

  const trip = serializeActiveTrip(booking);
  activeTripCache.set(key, { at: now, trip });
  return trip;
}

/**
 * Mirror Mongo driver state (isOnTrip + active booking) into Firebase `/status`.
 * Skips the RTDB write when nothing changed.
 */
export async function syncFirebaseDriverStatus(driverId) {
  if (!driverId) return false;

  const driver = await Driver.findById(driverId).select('isOnline isOnTrip').lean();
  if (!driver?.isOnline) return false;

  let activeTrip = null;
  if (driver.isOnTrip) {
    activeTrip = await loadActiveTripForDriver(driverId);
  }

  const payload = {
    isOnline: true,
    isOnTrip: Boolean(driver.isOnTrip),
    since: onlineSinceByDriver.get(String(driverId)) || nowMs(),
    activeTrip,
  };
  const fingerprint = JSON.stringify(payload);
  if (lastStatusFingerprint.get(String(driverId)) === fingerprint) {
    return true;
  }
  lastStatusFingerprint.set(String(driverId), fingerprint);

  return writeFirebaseStatus(driverId, payload);
}

/* ------------------------------------------------------------------ */
/* Firebase writes                                                     */
/* ------------------------------------------------------------------ */

async function writeFirebaseLocation(driverId, payload) {
  const rtdb = getRtdb();
  if (!rtdb) return false;
  try {
    await rtdb.ref(`${driverPath(driverId)}/location`).set(payload);
    return true;
  } catch (err) {
    console.warn('[driverLocation] Firebase write failed:', err.message);
    return false;
  }
}

async function writeFirebaseStatus(driverId, status) {
  const rtdb = getRtdb();
  if (!rtdb) return false;
  try {
    await rtdb.ref(`${driverPath(driverId)}/status`).set(status);
    return true;
  } catch (err) {
    console.warn('[driverLocation] Firebase status write failed:', err.message);
    return false;
  }
}

async function clearFirebaseDriver(driverId) {
  const rtdb = getRtdb();
  if (!rtdb) return false;
  try {
    await rtdb.ref(driverPath(driverId)).remove();
    return true;
  } catch (err) {
    console.warn('[driverLocation] Firebase clear failed:', err.message);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Mongo writes                                                        */
/* ------------------------------------------------------------------ */

async function snapshotMongoLocation(driverId, { lat, lng }) {
  await Driver.updateOne(
    { _id: driverId },
    {
      $set: {
        location: { type: 'Point', coordinates: [lng, lat] },
        lastLocationAt: new Date(),
      },
    },
  );
  lastMongoWriteAt.set(String(driverId), nowMs());
}

/* ------------------------------------------------------------------ */
/* Public service API                                                  */
/* ------------------------------------------------------------------ */

/**
 * Persist a driver's current GPS position.
 *
 * Behavior:
 *   - Always writes to Firebase (cheap, broadcast).
 *   - Writes to Mongo at most once every `MONGO_SNAPSHOT_MIN_INTERVAL_MS`.
 *
 * @param {string} driverId
 * @param {{ lat:number; lng:number; accuracy?:number; heading?:number; speed?:number }} coords
 * @returns {{ accepted: boolean; firebase: boolean; mongoSnapshot: boolean; reason?: string }}
 */
export async function recordDriverLocation(driverId, coords) {
  if (!driverId) return { accepted: false, firebase: false, mongoSnapshot: false, reason: 'no driverId' };
  if (!validateCoords(coords)) {
    return { accepted: false, firebase: false, mongoSnapshot: false, reason: 'invalid coordinates' };
  }

  const { lat, lng, accuracy, heading, speed } = coords;
  const now = nowMs();

  const fbPayload = {
    lat,
    lng,
    accuracy: isFiniteNum(accuracy) ? accuracy : null,
    heading: isFiniteNum(heading) ? heading : null,
    speed: isFiniteNum(speed) ? speed : null,
    updatedAt: now,
  };

  const firebaseOk = await writeFirebaseLocation(driverId, fbPayload);

  syncFirebaseDriverStatus(driverId).catch((err) => {
    console.warn('[driverLocation] Firebase status sync failed:', err.message);
  });

  let mongoSnapshot = false;
  const lastMongoAt = lastMongoWriteAt.get(String(driverId)) || 0;
  if (now - lastMongoAt >= MONGO_SNAPSHOT_MIN_INTERVAL_MS) {
    try {
      await snapshotMongoLocation(driverId, { lat, lng });
      mongoSnapshot = true;
    } catch (err) {
      console.warn('[driverLocation] Mongo snapshot failed:', err.message);
    }
  }

  return { accepted: true, firebase: firebaseOk, mongoSnapshot };
}

/**
 * Mark a driver as available in Firebase. Called when the REST online toggle
 * flips on, AND when the driver's socket reconnects after going online.
 */
export async function markDriverOnlineLive(driverId) {
  if (!driverId) return;
  const key = String(driverId);
  onlineSinceByDriver.set(key, nowMs());
  lastStatusFingerprint.delete(key);
  activeTripCache.delete(key);
  await syncFirebaseDriverStatus(driverId);
  emitToAdmins(S2C_EVENTS.DRIVER_STATUS_CHANGED, {
    driverId: key,
    isOnline: true,
    at: nowMs(),
  });
}

/**
 * Tear down a driver's live presence. Called when:
 *   - REST online toggle flips off
 *   - Their socket disconnects (with a small grace period to absorb reloads)
 */
export async function markDriverOfflineLive(driverId) {
  if (!driverId) return;
  const key = String(driverId);
  await clearFirebaseDriver(driverId);
  lastMongoWriteAt.delete(key);
  onlineSinceByDriver.delete(key);
  lastStatusFingerprint.delete(key);
  activeTripCache.delete(key);
  emitToAdmins(S2C_EVENTS.DRIVER_STATUS_CHANGED, {
    driverId: key,
    isOnline: false,
    at: nowMs(),
  });
}

/**
 * Driver profile metadata for the admin live map (no coordinates — Firebase
 * is the sole source for positions).
 */
export async function listLiveDriverMapMetadata() {
  const drivers = await Driver.find({
    isOnline: true,
    approvalStatus: 'approved',
    isDeleted: false,
  })
    .select('_id name phone rating isOnTrip')
    .lean();

  const onTripIds = drivers.filter((d) => d.isOnTrip).map((d) => d._id);
  const bookings = onTripIds.length
    ? await Booking.find({
        driverId: { $in: onTripIds },
        status: { $in: ACTIVE_BOOKING_STATUSES },
      })
        .select('_id driverId bookingNumber status serviceType pickup dropoff outstation userId')
        .populate('userId', 'name phone_no')
        .lean()
    : [];

  const tripByDriver = new Map();
  for (const booking of bookings) {
    tripByDriver.set(String(booking.driverId), serializeActiveTrip(booking));
  }

  return drivers.map((d) => ({
    driverId: String(d._id),
    name: d.name,
    phone: d.phone,
    rating: d.rating,
    isOnTrip: d.isOnTrip,
    activeTrip: tripByDriver.get(String(d._id)) || null,
  }));
}

/**
 * Returns true when the live pipeline is fully usable (Firebase initialized).
 * Routes can use this to surface a friendly "feature disabled" message instead
 * of failing silently.
 */
export function isLiveLocationReady() {
  return isFirebaseReady();
}
