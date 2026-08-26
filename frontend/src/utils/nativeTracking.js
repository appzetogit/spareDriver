/**
 * Bridge to the Flutter wrapper's background location service.
 *
 * The web app decides *when* to track — it is what knows whether the driver is
 * online and whether a trip is running. Native decides *how*, because only it
 * can keep a GPS stream alive once the app leaves the foreground (lock screen,
 * Google Maps, another app). Browser `watchPosition` dies the moment the
 * WebView is frozen; never rely on it for an in-progress trip.
 *
 * Call order, matching what the wrapper injects as `window.LocationBridge`:
 *
 *   online          → startTracking('idle')     (or CustomEvent 'driverOnline')
 *   accept / start  → startTracking('onTrip')   (or CustomEvent 'startTrip')
 *   Navigate        → startTracking('onTrip') THEN openNavigation(dest)
 *   trip complete   → startTracking('idle')
 *   offline / logout → stopTracking()
 *
 * `stopTracking` must NOT run on WebView pause/unmount. Android will treat
 * that as "the ride is over" and kill the foreground service.
 *
 * In a plain browser every call here is a no-op returning `null`, and the
 * caller falls back to `navigator.geolocation`. Nothing needs a UA sniff.
 */

/** Cadence names — must match `TrackingMode` in the Flutter wrapper. */
export const TRACKING_MODE = Object.freeze({
  ON_TRIP: 'onTrip',
  IDLE: 'idle',
});

/** Last mode we asked native for — used so CustomEvents fire on transitions. */
let lastIssuedMode = null;

function locationBridge() {
  const bridge = globalThis.LocationBridge;
  if (!bridge || typeof bridge !== 'object') return null;
  return bridge;
}

function flutterHandler() {
  const handler = globalThis.flutter_inappwebview?.callHandler;
  return typeof handler === 'function' ? handler : null;
}

/** True when `window.LocationBridge` has been injected. */
export function hasLocationBridge() {
  const loc = locationBridge();
  return Boolean(
    loc
    && (typeof loc.startTracking === 'function' || typeof loc.openNavigation === 'function'),
  );
}

/** True when running inside the Flutter wrapper. */
export function hasNativeTracking() {
  return hasLocationBridge() || flutterHandler() !== null;
}

function dispatchWindowEvent(name, detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    /* jsdom / non-DOM */
  }
}

/**
 * Flutter may listen to CustomEvents instead of LocationBridge methods.
 * Re-fires on `force` so a Navigate / pagehide can re-assert the service
 * even when we already think we are in that mode.
 */
function emitModeEvents(mode, force = false) {
  if (!force && mode === lastIssuedMode) return;
  lastIssuedMode = mode;

  if (mode === TRACKING_MODE.ON_TRIP) {
    dispatchWindowEvent('startTrip', { mode });
    return;
  }
  if (mode === TRACKING_MODE.IDLE) {
    dispatchWindowEvent('driverOnline', { mode });
  }
}

async function invokeNative(name, ...args) {
  const loc = locationBridge();
  if (typeof loc?.[name] === 'function') {
    try {
      return await loc[name](...args);
    } catch (err) {
      if (import.meta.env.DEV) console.warn(`[nativeTracking] LocationBridge.${name} failed`, err);
    }
  }

  const handler = flutterHandler();
  if (!handler) return null;
  try {
    return await handler(name, ...args);
  } catch (err) {
    if (import.meta.env.DEV) console.warn(`[nativeTracking] ${name} failed`, err);
    return null;
  }
}

/**
 * Whether native accepted a startTracking call.
 *
 * Only an explicit success counts. A void/null return from an incomplete
 * Flutter handler must NOT look like coverage — that used to suppress the
 * WebView socket GPS, so the backend received nothing while the driver
 * still had the app open.
 */
export function nativeTrackingStarted(result) {
  if (result === true) return true;
  if (result && typeof result === 'object' && result.tracking === true) return true;
  return false;
}

/**
 * Start (or re-aim) background tracking.
 *
 * @param {'onTrip'|'idle'} mode
 * @param {{ forceEvent?: boolean }} [opts]
 * @returns {Promise<null | { tracking: boolean, mode: string, failure: string }>}
 *   `null` outside the wrapper. Inside it, `tracking: false` means native
 *   refused — usually a permission the driver has to grant — and the caller
 *   should keep the browser watch running rather than assume coverage.
 */
export function startNativeTracking(mode = TRACKING_MODE.IDLE, opts = {}) {
  const next = mode === TRACKING_MODE.ON_TRIP ? TRACKING_MODE.ON_TRIP : TRACKING_MODE.IDLE;
  emitModeEvents(next, Boolean(opts.forceEvent));
  return invokeNative('startTracking', next);
}

export function stopNativeTracking() {
  lastIssuedMode = null;
  return invokeNative('stopTracking');
}

/**
 * Address string, `"lat,lng"`, or `{ lat, lng }` — whatever the Navigate
 * button has. Flutter's `openNavigation` turns this into a Google Maps
 * intent and switches the uploader to high-accuracy on-trip cadence.
 */
export function serializeNavDestination(destination) {
  if (destination == null) return '';
  if (typeof destination === 'string') return destination.trim();
  if (typeof destination === 'object') {
    const lat = Number(destination.lat ?? destination.latitude);
    const lng = Number(destination.lng ?? destination.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return `${lat},${lng}`;
    const address = destination.address ?? destination.destQuery;
    if (address) return String(address).trim();
  }
  return String(destination).trim();
}

/**
 * Open Google Maps via the Flutter wrapper so background GPS keeps running
 * while the driver is in another app.
 *
 * Tracking is started *before* the activity switch. Awaiting openNavigation
 * first backgrounds the WebView and the startTracking call never runs.
 *
 * @returns {Promise<boolean>} true when native accepted the request
 */
export async function openNativeNavigation(destination) {
  const dest = serializeNavDestination(destination);
  if (!dest) return false;

  const startPromise = startNativeTracking(TRACKING_MODE.ON_TRIP, { forceEvent: true });
  // Give Flutter a beat to promote the foreground service before Maps takes over.
  await Promise.race([
    startPromise,
    new Promise((resolve) => setTimeout(resolve, 300)),
  ]);

  const loc = locationBridge();
  if (typeof loc?.openNavigation === 'function') {
    try {
      await loc.openNavigation(dest);
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[nativeTracking] LocationBridge.openNavigation failed', err);
    }
  }

  const viaHandler = await invokeNative('openNavigation', dest);
  return viaHandler != null;
}

/** Diagnostics: `{ tracking, mode, hasToken, bufferedFixes, platform }`. */
export function nativeTrackingStatus() {
  return invokeNative('trackingStatus');
}

/**
 * Last native fix, if the wrapper exposes it.
 * Shape: `{ lat, lng, accuracy?, heading?, speed?, timestamp? }` or null.
 */
export function getNativeLastLocation() {
  return invokeNative('lastLocation');
}
