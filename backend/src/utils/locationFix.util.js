import {
  LOCATION_BATCH,
  MAX_ACCEPTED_ACCURACY_M,
  MAX_PLAUSIBLE_SPEED_MPS,
} from '../constants/driverTracking.js';

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance in metres between two `{ lat, lng }` points. */
function haversineMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Pure helpers for the location batch pipeline.
 *
 * Kept free of model imports so the normalisation rules — which decide what a
 * driver's trace actually contains — can be unit tested without a database.
 */

export function isFiniteNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function optionalNum(n) {
  return isFiniteNum(n) ? n : null;
}

/** Accepts an ISO string or epoch milliseconds; returns ms, or NaN. */
export function toEpochMs(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Drop anything that must not reach the watermark, and sort what is left
 * oldest-first.
 *
 * Rejected: unparseable or out-of-range `capturedAt`, non-finite or
 * out-of-bounds coordinates, and exact `(capturedAt, lat, lng)` repeats within
 * the same batch — a retrying uploader that appends before it acks can send
 * the same fix twice in one payload.
 *
 * Two quality gates run after that, and they are counted separately so the
 * logs say *why* a driver went quiet rather than just that they did:
 *
 *   - `rejectedAccuracy` — the fix is a tower lookup, not GPS. See
 *     `MAX_ACCEPTED_ACCURACY_M`. A fix with no `accuracy` at all is
 *     kept: older clients do not send one, and refusing them would be a
 *     silent outage on upgrade day.
 *
 *   - `rejectedJump` — the fix is plausible on its own but implies an
 *     impossible speed from the previous accepted one. Each fix is compared
 *     against the last one *kept*, so a single wild outlier is dropped instead
 *     of dragging the rest of the batch out with it.
 *
 * @param {Array<object>} rawFixes
 * @param {number} now epoch ms
 * @returns {{ fixes: Array<object>, rejected: number, duplicates: number,
 *             rejectedAccuracy: number, rejectedJump: number }}
 */
export function normalizeFixes(rawFixes, now) {
  const oldestAllowed = now - LOCATION_BATCH.MAX_AGE_MS;
  const newestAllowed = now + LOCATION_BATCH.MAX_FUTURE_SKEW_MS;

  const seen = new Set();
  const candidates = [];
  let rejected = 0;
  let duplicates = 0;
  let rejectedAccuracy = 0;
  let rejectedJump = 0;

  for (const fix of Array.isArray(rawFixes) ? rawFixes : []) {
    const capturedAt = toEpochMs(fix?.capturedAt);
    if (!Number.isFinite(capturedAt) || capturedAt < oldestAllowed || capturedAt > newestAllowed) {
      rejected += 1;
      continue;
    }
    if (!isFiniteNum(fix.lat) || !isFiniteNum(fix.lng)) {
      rejected += 1;
      continue;
    }
    if (fix.lat < -90 || fix.lat > 90 || fix.lng < -180 || fix.lng > 180) {
      rejected += 1;
      continue;
    }

    const accuracy = optionalNum(fix.accuracy);
    if (accuracy != null && accuracy > MAX_ACCEPTED_ACCURACY_M) {
      rejectedAccuracy += 1;
      continue;
    }

    const key = `${capturedAt}:${fix.lat}:${fix.lng}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);

    candidates.push({
      lat: fix.lat,
      lng: fix.lng,
      accuracy,
      heading: optionalNum(fix.heading),
      speed: optionalNum(fix.speed),
      capturedAt,
    });
  }

  // Sort before the jump check: the buffer is a queue, not a guarantee of
  // order, and "impossible speed" only means anything along a timeline.
  candidates.sort((a, b) => a.capturedAt - b.capturedAt);

  const out = [];
  let previous = null;
  for (const fix of candidates) {
    if (previous) {
      const elapsedSec = (fix.capturedAt - previous.capturedAt) / 1000;
      if (elapsedSec > 0) {
        const impliedMps = haversineMeters(previous, fix) / elapsedSec;
        if (impliedMps > MAX_PLAUSIBLE_SPEED_MPS) {
          rejectedJump += 1;
          continue;
        }
      }
    }
    out.push(fix);
    previous = fix;
  }

  return { fixes: out, rejected, duplicates, rejectedAccuracy, rejectedJump };
}

/**
 * The server's answer to "should I still be running?". The uploader reads this
 * off every response, so toggling offline on one device stands the background
 * service down on the others without waiting for a push.
 *
 * The approval and deletion checks came from the `main` side of the location
 * merge: a driver whose account is suspended or pending re-approval must stop
 * transmitting immediately, not merely stop being dispatched.
 *
 * @param {{ isOnline?: boolean, isOnTrip?: boolean, approvalStatus?: string,
 *           isDeleted?: boolean } | null} driver
 */
export function trackingDirective(driver) {
  if (!driver) return { stopTracking: true, mode: 'stopped' };
  if (driver.isDeleted) return { stopTracking: true, mode: 'stopped' };
  if (driver.approvalStatus && driver.approvalStatus !== 'approved') {
    return { stopTracking: true, mode: 'stopped' };
  }
  if (driver.isOnTrip) return { stopTracking: false, mode: 'onTrip' };
  if (driver.isOnline) return { stopTracking: false, mode: 'idle' };
  return { stopTracking: true, mode: 'stopped' };
}
