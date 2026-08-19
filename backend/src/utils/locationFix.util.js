import { LOCATION_BATCH } from '../constants/driverTracking.js';

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
 * @param {Array<object>} rawFixes
 * @param {number} now epoch ms
 * @returns {{ fixes: Array<object>, rejected: number, duplicates: number }}
 */
export function normalizeFixes(rawFixes, now) {
  const oldestAllowed = now - LOCATION_BATCH.MAX_AGE_MS;
  const newestAllowed = now + LOCATION_BATCH.MAX_FUTURE_SKEW_MS;

  const seen = new Set();
  const out = [];
  let rejected = 0;
  let duplicates = 0;

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

    const key = `${capturedAt}:${fix.lat}:${fix.lng}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);

    out.push({
      lat: fix.lat,
      lng: fix.lng,
      accuracy: optionalNum(fix.accuracy),
      heading: optionalNum(fix.heading),
      speed: optionalNum(fix.speed),
      capturedAt,
    });
  }

  out.sort((a, b) => a.capturedAt - b.capturedAt);
  return { fixes: out, rejected, duplicates };
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
