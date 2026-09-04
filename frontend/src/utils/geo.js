/**
 * Small set of geo helpers used by the map / nearby-driver layer.
 * Everything here is pure and framework-agnostic.
 */

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

function isValidLatLng(p) {
  return (
    !!p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng)
  );
}

/**
 * Great-circle distance between two lat/lng points (haversine formula).
 *
 * @param {{ lat:number, lng:number }} a
 * @param {{ lat:number, lng:number }} b
 * @returns {number} distance in metres, or `NaN` if either point is invalid
 */
export function haversineMeters(a, b) {
  if (!isValidLatLng(a) || !isValidLatLng(b)) return NaN;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Initial bearing (forward azimuth) from A→B in degrees, normalised to `[0, 360)`.
 */
export function bearingDegrees(a, b) {
  if (!isValidLatLng(a) || !isValidLatLng(b)) return NaN;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Ground speed in km/h between two samples given the elapsed time in ms.
 */
export function speedKmhBetween(a, b, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const meters = haversineMeters(a, b);
  if (!Number.isFinite(meters)) return 0;
  return (meters / 1000) / (elapsedMs / 3_600_000);
}

/**
 * Approximate distance from a point to a polyline path (metres).
 * Samples consecutive segments; fine for off-route checks on city routes.
 */
export function distanceToPathMeters(point, path) {
  if (!isValidLatLng(point) || !Array.isArray(path) || path.length < 2) return NaN;

  let min = Infinity;
  // Stride longer paths so we stay cheap on multi-km polylines.
  const stride = path.length > 400 ? 3 : path.length > 200 ? 2 : 1;
  for (let i = 0; i < path.length - 1; i += stride) {
    const a = path[i];
    const b = path[Math.min(i + stride, path.length - 1)];
    if (!isValidLatLng(a) || !isValidLatLng(b)) continue;
    // Project onto the segment in a local equirectangular plane.
    const x = point.lng;
    const y = point.lat;
    const x1 = a.lng;
    const y1 = a.lat;
    const x2 = b.lng;
    const y2 = b.lat;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((x - x1) * dx + (y - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const proj = { lat: y1 + t * dy, lng: x1 + t * dx };
    const d = haversineMeters(point, proj);
    if (Number.isFinite(d) && d < min) min = d;
  }
  return min === Infinity ? NaN : min;
}

/**
 * Human-friendly distance label: "320 m" / "1.2 km" / "—".
 */
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/**
 * The same label, but allowed to say it does not know.
 *
 * A distance is always computable from two coordinates, which is exactly the
 * trap: a frozen or vague position still yields a confident "1.2 km" that
 * nobody can tell apart from a good one. When the fix behind the number cannot
 * carry it, say so instead — a customer reads "Locating…" as a system working
 * on it, and reads a wrong number as a system that is lying.
 *
 * Under `NEARBY_METERS` the exact figure stops being useful and starts being
 * noise, because at that range GPS error is the same size as the answer.
 *
 * @param {number|null} meters
 * @param {{ isReliable?: boolean }} [opts]
 */
export function formatTripDistance(meters, { isReliable = true } = {}) {
  if (!Number.isFinite(meters)) return 'Locating…';
  if (!isReliable) return 'Nearby';
  if (meters <= NEARBY_METERS) return 'Nearby';
  return formatDistance(meters);
}

/** Below this, GPS error and the distance itself are the same magnitude. */
export const NEARBY_METERS = 60;

/**
 * Estimate ETA from straight-line distance assuming an average urban speed
 * of 25 km/h. Good enough for nearby-driver chips; routing-based ETAs come
 * from Google Directions later.
 */
export function estimateEtaMinutes(meters, avgKmh = 25) {
  if (!Number.isFinite(meters) || meters <= 0) return null;
  const hours = meters / 1000 / avgKmh;
  return Math.max(1, Math.round(hours * 60));
}
