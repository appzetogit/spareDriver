/**
 * Camera targeting helpers for live trip tracking.
 * Pure functions — the RAF loop lives in `useSmoothCamera`.
 */

/** Speed → zoom bands (Uber/Rapido-style). */
export function targetZoomFromSpeed(speedKmh) {
  const v = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  if (v < 10) {
    // 0–10 km/h → zoom 19–20 (slower = closer)
    return 20 - (v / 10) * 1;
  }
  if (v < 30) return 18;
  if (v < 60) return 17;
  return 16;
}

/**
 * Destination proximity overrides speed-based zoom when approaching.
 * <100 m → 20, <300 m → 19. Otherwise returns null (no override).
 */
export function targetZoomFromApproach(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) return null;
  if (distanceMeters < 100) return 20;
  if (distanceMeters < 300) return 19;
  return null;
}

/**
 * Resolve final zoom: approach override wins when closer than speed zoom would be.
 */
export function resolveFollowZoom(speedKmh, distanceToDestination) {
  const speedZoom = targetZoomFromSpeed(speedKmh);
  const approachZoom = targetZoomFromApproach(distanceToDestination);
  if (approachZoom == null) return speedZoom;
  // Prefer the tighter of the two when approaching.
  return Math.max(speedZoom, approachZoom);
}

/** Minimum metres the driver must move before the camera retargets. */
export const CAMERA_MOVE_THRESHOLD_M = 2.5;

/** Minimum zoom delta before calling setZoom (avoids micro-jitter). */
export const CAMERA_ZOOM_EPSILON = 0.02;

/**
 * Pixel offset that places the driver slightly below viewport centre
 * (Google Maps navigation style). Positive Y → driver lower on screen.
 */
export const CAMERA_FOLLOW_OFFSET_Y = 72;
