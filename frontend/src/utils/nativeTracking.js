/**
 * Bridge to the Flutter wrapper's background location service.
 *
 * The web app decides *when* to track — it is what knows whether the driver is
 * online and whether a trip is running. Native decides *how*, because only it
 * can keep a GPS stream alive once the app leaves the foreground.
 *
 * In a plain browser every call here is a no-op returning `null`, and the
 * caller falls back to `navigator.geolocation`. Nothing needs a UA sniff.
 */

/** Cadence names — must match `TrackingMode` in the Flutter wrapper. */
export const TRACKING_MODE = Object.freeze({
  ON_TRIP: 'onTrip',
  IDLE: 'idle',
});

function bridge() {
  const handler = globalThis.flutter_inappwebview?.callHandler;
  return typeof handler === 'function' ? handler : null;
}

/** True when running inside the Flutter wrapper. */
export function hasNativeTracking() {
  return bridge() !== null;
}

async function call(name, ...args) {
  const handler = bridge();
  if (!handler) return null;
  try {
    return await handler(name, ...args);
  } catch (err) {
    if (import.meta.env.DEV) console.warn(`[nativeTracking] ${name} failed`, err);
    return null;
  }
}

/**
 * Start (or re-aim) background tracking.
 *
 * @param {'onTrip'|'idle'} mode
 * @returns {Promise<null | { tracking: boolean, mode: string, failure: string }>}
 *   `null` outside the wrapper. Inside it, `tracking: false` means native
 *   refused — usually a permission the driver has to grant — and the caller
 *   should keep the browser watch running rather than assume coverage.
 */
export function startNativeTracking(mode = TRACKING_MODE.IDLE) {
  return call('startTracking', mode);
}

export function stopNativeTracking() {
  return call('stopTracking');
}

/** Diagnostics: `{ tracking, mode, hasToken, bufferedFixes, platform }`. */
export function nativeTrackingStatus() {
  return call('trackingStatus');
}

/**
 * Last native fix, if the wrapper exposes it.
 * Shape: `{ lat, lng, accuracy?, heading?, speed?, timestamp? }` or null.
 */
export function getNativeLastLocation() {
  return call('lastLocation');
}
