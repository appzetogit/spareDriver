import { Driver } from '../models/driverModels/driver.model.js';
import Booking from '../models/booking.model.js';
import { getRtdb, isFirebaseReady } from '../config/firebase.js';
import { emitToAdmins, emitToBooking } from '../utils/socketEmitters.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import { ACTIVE_BOOKING_STATUSES, BOOKING_STATUS, isBookingContactRevealed } from '../constants/bookingStatus.js';
import { LOCATION_STALE_AFTER_MS } from '../constants/driverTracking.js';
import { acquireThrottle, getJson, setJson, deleteKeys } from '../utils/ephemeralStore.js';

/**
 * Live-location pipeline for drivers.
 *
 * Three destinations, each with a different audience and freshness need:
 *
 *   - Firebase RTDB `/drivers/{driverId}`   ← every fix
 *     Staff only. Powers the admin live map and nothing else.
 *
 *   - Firebase RTDB `/trips/{bookingId}/driver`   ← every fix, while the ride
 *     is in a customer-visible phase. Exactly what that ride's customer is
 *     allowed to see, and nothing more. Customers subscribe here instead of to
 *     the whole `/drivers` tree, which used to hand every client the live
 *     position of every driver in the fleet.
 *
 *   - MongoDB `Driver.location`   ← throttled (>=60s)
 *     Feeds `$nearSphere` dispatch matching. Drivers don't teleport, so a
 *     60s-stale snapshot is fine for choosing who to offer a ride to.
 *
 * Every RTDB write carries `updatedAt` and `staleAfter` so a reader can tell a
 * live position from a frozen one. Without that a driver whose app was killed
 * leaves a car parked on the customer's map forever, with an ETA that keeps
 * counting down from a coordinate that stopped moving an hour ago.
 *
 * Anything here silently no-ops when Firebase isn't configured.
 */

const MONGO_SNAPSHOT_MIN_INTERVAL_MS = 60_000;
const STATUS_TRIP_CACHE_MS = 30_000;

/**
 * Ride phases whose driver position the customer is entitled to see.
 * Before EN_ROUTE the driver hasn't set off; after STARTED the ride is over.
 * This is the authoritative gate — the client-side equivalent it replaces was
 * cosmetic, because the data had already been delivered to the device.
 */
const CUSTOMER_VISIBLE_STATUSES = new Set([
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
]);

/* ------------------------------------------------------------------ */
/* Shared-state keys (Redis when configured, per-process Map otherwise) */
/* ------------------------------------------------------------------ */

const KEY = {
  mongoThrottle: (id) => `driverloc:mongo:${id}`,
  onlineSince: (id) => `driverloc:since:${id}`,
  statusPrint: (id) => `driverloc:print:${id}`,
  activeTrip: (id) => `driverloc:trip:${id}`,
};

const ONLINE_SINCE_TTL_MS = 24 * 60 * 60 * 1000;
const STATUS_PRINT_TTL_MS = 10 * 60_000;

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

function tripPath(bookingId) {
  return `trips/${bookingId}/driver`;
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
    customerPhone: isBookingContactRevealed(booking)
      ? booking.userId?.phone_no || null
      : null,
  };
}

async function loadActiveTripForDriver(driverId) {
  const key = KEY.activeTrip(driverId);
  const cached = await getJson(key);
  if (cached) return cached.trip;

  const booking = await Booking.findOne({
    driverId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
  })
    .select('_id bookingNumber status serviceType pickup dropoff outstation userId')
    .populate('userId', 'name phone_no')
    .sort({ updatedAt: -1 })
    .lean();

  const trip = serializeActiveTrip(booking);
  await setJson(key, { trip }, STATUS_TRIP_CACHE_MS);
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

  const since = (await getJson(KEY.onlineSince(driverId)))?.at || nowMs();
  const payload = {
    isOnline: true,
    isOnTrip: Boolean(driver.isOnTrip),
    since,
    activeTrip,
  };

  const fingerprint = JSON.stringify(payload);
  const printKey = KEY.statusPrint(driverId);
  const lastPrint = await getJson(printKey);
  if (lastPrint?.fp === fingerprint) return true;
  await setJson(printKey, { fp: fingerprint }, STATUS_PRINT_TTL_MS);

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

/**
 * Publish to the per-trip node the ride's customer reads.
 *
 * Carries position and freshness only — no driver identity, no customer
 * contact details. Whatever the customer app needs beyond this comes from the
 * authenticated booking API, not from a database anyone can subscribe to.
 */
async function writeFirebaseTripLocation(bookingId, payload) {
  const rtdb = getRtdb();
  if (!rtdb) return false;
  try {
    await rtdb.ref(tripPath(bookingId)).set(payload);
    return true;
  } catch (err) {
    console.warn('[driverLocation] Firebase trip write failed:', err.message);
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

/**
 * Remove a finished ride's location node.
 *
 * Called from every path that releases a driver from a booking. Leaving it
 * behind would let the customer keep watching a driver who has moved on to
 * someone else's ride.
 */
export async function clearTripLocation(bookingId) {
  if (!bookingId) return false;
  const rtdb = getRtdb();
  if (!rtdb) return false;
  try {
    await rtdb.ref(tripPath(bookingId)).remove();
    return true;
  } catch (err) {
    console.warn('[driverLocation] Firebase trip clear failed:', err.message);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Mongo writes                                                        */
/* ------------------------------------------------------------------ */

async function snapshotMongoLocation(driverId, { lat, lng, at }) {
  await Driver.updateOne(
    { _id: driverId },
    {
      $set: {
        location: { type: 'Point', coordinates: [lng, lat] },
        lastLocationAt: new Date(at),
        // Keep the presence watermark in lockstep with the snapshot path so a
        // throttled write never leaves lastFixAt behind lastLocationAt.
        lastFixAt: new Date(at),
      },
    },
  );
}

/** Presence watermark — every accepted fix, not only the throttled snapshot. */
async function touchLastFixAt(driverId, at) {
  await Driver.updateOne({ _id: driverId }, { $set: { lastFixAt: new Date(at) } });
}

/* ------------------------------------------------------------------ */
/* Public service API                                                  */
/* ------------------------------------------------------------------ */

/**
 * Persist a driver's current GPS position.
 *
 * @param {string} driverId
 * @param {{ lat:number; lng:number; accuracy?:number; heading?:number; speed?:number }} coords
 * @returns {{ accepted: boolean; firebase: boolean; mongoSnapshot: boolean; trip: boolean; reason?: string }}
 */
export async function recordDriverLocation(driverId, coords) {
  if (!driverId) return { accepted: false, firebase: false, mongoSnapshot: false, trip: false, reason: 'no driverId' };
  if (!validateCoords(coords)) {
    return { accepted: false, firebase: false, mongoSnapshot: false, trip: false, reason: 'invalid coordinates' };
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
    // Readers treat a fix past this instant as stale rather than live. It is
    // written alongside the position so no reader has to guess the policy.
    staleAfter: now + LOCATION_STALE_AFTER_MS,
  };

  const firebaseOk = await writeFirebaseLocation(driverId, fbPayload);

  syncFirebaseDriverStatus(driverId).catch((err) => {
    console.warn('[driverLocation] Firebase status sync failed:', err.message);
  });

  // Fan out to the customer, but only for a ride actually in flight.
  let tripOk = false;
  const activeTrip = await loadActiveTripForDriver(driverId);
  if (activeTrip && CUSTOMER_VISIBLE_STATUSES.has(activeTrip.status)) {
    tripOk = await writeFirebaseTripLocation(activeTrip.bookingId, {
      ...fbPayload,
      bookingId: activeTrip.bookingId,
      status: activeTrip.status,
    });

    // Socket mirror of the same point. Firebase is the primary channel; this
    // is the fallback that keeps the map alive when RTDB is unreachable or the
    // client has no Firebase config.
    emitToBooking(activeTrip.bookingId, S2C_EVENTS.TRIP_LOCATION_UPDATED, {
      bookingId: activeTrip.bookingId,
      ...fbPayload,
    });
  }

  let mongoSnapshot = false;
  if (await acquireThrottle(KEY.mongoThrottle(driverId), MONGO_SNAPSHOT_MIN_INTERVAL_MS)) {
    try {
      await snapshotMongoLocation(driverId, { lat, lng, at: now });
      mongoSnapshot = true;
    } catch (err) {
      console.warn('[driverLocation] Mongo snapshot failed:', err.message);
    }
  } else {
    // Socket + HTTP ingest both land here. Without this, only the native batch
    // path advanced lastFixAt and the presence sweeper treated foreground
    // socket traffic as "gone" after a few quiet minutes in the background.
    try {
      await touchLastFixAt(driverId, now);
    } catch (err) {
      console.warn('[driverLocation] lastFixAt touch failed:', err.message);
    }
  }

  return { accepted: true, firebase: firebaseOk, mongoSnapshot, trip: tripOk };
}

/**
 * Mark a driver as available in Firebase. Called when the REST online toggle
 * flips on, AND when the driver's socket reconnects after going online.
 */
export async function markDriverOnlineLive(driverId) {
  if (!driverId) return;
  const key = String(driverId);
  await setJson(KEY.onlineSince(key), { at: nowMs() }, ONLINE_SINCE_TTL_MS);
  await deleteKeys(KEY.statusPrint(key), KEY.activeTrip(key));
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
 *   - Their socket disconnects and the grace period expires
 */
export async function markDriverOfflineLive(driverId) {
  if (!driverId) return;
  const key = String(driverId);
  await clearFirebaseDriver(driverId);
  await deleteKeys(
    KEY.mongoThrottle(key),
    KEY.onlineSince(key),
    KEY.statusPrint(key),
    KEY.activeTrip(key),
  );
  emitToAdmins(S2C_EVENTS.DRIVER_STATUS_CHANGED, {
    driverId: key,
    isOnline: false,
    at: nowMs(),
  });
}

/** Drop the cached active-trip lookup so the next write re-reads Mongo. */
export async function invalidateDriverTripCache(driverId) {
  if (!driverId) return;
  await deleteKeys(KEY.activeTrip(String(driverId)), KEY.statusPrint(String(driverId)));
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
 */
export function isLiveLocationReady() {
  return isFirebaseReady();
}

/*
 * MERGE NOTE: `recordDriverLocationHttp` from `main` lived here.
 *
 * It has been superseded by `driverLocationIngest.service.js`, which does the
 * same job and more: it takes a batch instead of one fix, dedupes replays with
 * a watermark that is safe across instances, and keeps its throttle in Redis
 * rather than a per-process Map. Its guards — suspended or deleted accounts
 * must stop transmitting, not merely stop being dispatched — were kept and now
 * live in `trackingDirective()`.
 *
 * Recover the original with:  git show 758cd11 -- backend/src/services/driverLocation.service.js
 */
