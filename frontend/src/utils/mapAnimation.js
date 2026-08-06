/**
 * Shared animation helpers for live-map camera + marker interpolation.
 * Kept framework-agnostic so hooks and overlays can share the same curves.
 */

/** Soft accel + decel — default for marker glides. */
export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

/** Ease-out for camera settle (snappy start, soft finish). */
export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/** Exponential smoothing factor for RAF loops. `lambda` ≈ responsiveness. */
export function expSmooth(dtSec, lambda = 6) {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return 0;
  return 1 - Math.exp(-lambda * dtSec);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpLatLng(from, to, t) {
  if (!from || !to) return to || from || null;
  return {
    lat: lerp(from.lat, to.lat, t),
    lng: lerp(from.lng, to.lng, t),
  };
}

/** Shortest-arc heading interpolation → `[0, 360)`. */
export function lerpHeading(from, to, t) {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return (((from + delta * t) % 360) + 360) % 360;
}

export function nearlySameLatLng(a, b, epsilon = 1e-7) {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < epsilon && Math.abs(a.lng - b.lng) < epsilon;
}
