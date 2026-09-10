import {
  LOCATION_STALE_AFTER_MS,
  LOCATION_BATCH,
} from '../constants/driverTracking.js';

/**
 * Decide which position the arrival proximity check should believe.
 *
 * The check used to run entirely on `driverCoords` from the request body,
 * while its own comment claimed to be "the server-side enforcement so a
 * scripted request can't bypass it". It was not: a modified client simply
 * posts the pickup's own coordinates and arrival is granted from anywhere.
 * The reported `accuracy` came from the same place and widened the radius,
 * so the bypass did not even need to be precise.
 *
 * The server already holds a better answer. The tracking pipeline writes
 * `Driver.location` on every accepted fix, and while a driver is EN_ROUTE
 * they are in on-trip mode — a fix every 5s, uploaded every 10s, and
 * anything looser than `LOCATION_ACCURACY.ON_TRIP_M` rejected before it is
 * stored. So a fresh snapshot is both trustworthy and genuinely current.
 *
 * The rule is therefore: prefer the server's own fix, and fall back to the
 * client's only when the server has nothing recent.
 *
 * That fallback is the deliberate part. Making a stale snapshot fatal would
 * block a driver standing at the pickup whose uploader is wedged or whose
 * phone has dropped off the network — which is the exact class of wedge this
 * codebase keeps having to build recovery for. Falling back leaves the
 * pre-existing weakness in place for that narrow case rather than trading a
 * fraud risk for a stuck-booking risk, and the caller records which source
 * decided so client-trusted arrivals stay auditable.
 */

/** How far into the future a fix's timestamp may sit before we distrust it. */
const FUTURE_SKEW_TOLERANCE_MS = LOCATION_BATCH.MAX_FUTURE_SKEW_MS;

function isUsableCoords(c) {
  return (
    !!c
    && Number.isFinite(Number(c.lat))
    && Number.isFinite(Number(c.lng))
    // [0,0] is the model default for a driver who has never reported —
    // treating it as a real position would place everyone off West Africa.
    && !(Number(c.lat) === 0 && Number(c.lng) === 0)
  );
}

/**
 * @param {object} params
 * @param {{lat:number,lng:number}|null} params.serverCoords  from Driver.location
 * @param {Date|string|number|null} params.serverFixAt         Driver.lastLocationAt
 * @param {{lat:number,lng:number,accuracy?:number}|null} params.clientCoords
 * @param {number} [params.now]
 * @param {number} [params.staleAfterMs]
 * @returns {{source:'server'|'client', coords:object, serverAgeMs:number|null}|null}
 *   null when neither source offers a usable position.
 */
export function chooseArrivalFix({
  serverCoords,
  serverFixAt,
  clientCoords,
  now = Date.now(),
  staleAfterMs = LOCATION_STALE_AFTER_MS,
} = {}) {
  const fixMs = serverFixAt ? new Date(serverFixAt).getTime() : NaN;
  const serverAgeMs = Number.isFinite(fixMs) ? now - fixMs : null;

  const serverFresh =
    isUsableCoords(serverCoords)
    && serverAgeMs !== null
    && serverAgeMs <= staleAfterMs
    && serverAgeMs >= -FUTURE_SKEW_TOLERANCE_MS;

  if (serverFresh) {
    return {
      source: 'server',
      coords: { lat: Number(serverCoords.lat), lng: Number(serverCoords.lng) },
      serverAgeMs,
    };
  }

  if (isUsableCoords(clientCoords)) {
    return {
      source: 'client',
      coords: {
        lat: Number(clientCoords.lat),
        lng: Number(clientCoords.lng),
        accuracy: Number(clientCoords.accuracy),
      },
      serverAgeMs,
    };
  }

  return null;
}

/**
 * Read `Driver.location` (GeoJSON `[lng, lat]`) as a plain `{lat, lng}`.
 * Returns null for the unset default rather than a point in the ocean.
 */
export function coordsFromDriverLocation(location) {
  const c = location?.coordinates;
  if (!Array.isArray(c) || c.length !== 2) return null;
  const [lng, lat] = c.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}
