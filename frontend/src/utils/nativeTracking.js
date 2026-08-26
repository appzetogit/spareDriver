/**
 * Bridge to the Flutter wrapper's background location service.
 *
 * The web app decides *when* to track — it is what knows whether the driver is
 * online and whether a trip is running. Native decides *how*, because only it
 * can keep a GPS stream alive once the app leaves the foreground (lock screen,
 * Google Maps, another app).
 *
 * Call order, matching what the wrapper injects as `window.LocationBridge`:
 *
 *   online          → startTracking('idle')     (or CustomEvent 'driverOnline')
 *   accept / start  → startTracking('onTrip')   (or CustomEvent 'startTrip')
 *   Navigate        → openNavigation(dest)      (starts high-accuracy tracking)
 *   trip complete   → startTracking('idle')
 *   offline / logout → stopTracking()
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
 * Only fire on a real transition so token-refresh re-aims don't look like
 * a fresh go-online / trip-start to native.
 */
function emitModeEvents(mode) {
  if (mode === lastIssuedMode) return;
  const prev = lastIssuedMode;
  lastIssuedMode = mode;

  if (mode === TRACKING_MODE.ON_TRIP) {
    dispatchWindowEvent('startTrip', { mode });
    return;
  }
  if (mode === TRACKING_MODE.IDLE && prev !== TRACKING_MODE.ON_TRIP) {
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
 * Start (or re-aim) background tracking.
 *
 * @param {'onTrip'|'idle'} mode
 * @returns {Promise<null | { tracking: boolean, mode: string, failure: string }>}
 *   `null` outside the wrapper. Inside it, `tracking: false` means native
 *   refused — usually a permission the driver has to grant — and the caller
 *   should keep the browser watch running rather than assume coverage.
 */
export function startNativeTracking(mode = TRACKING_MODE.IDLE) {
  const next = mode === TRACKING_MODE.ON_TRIP ? TRACKING_MODE.ON_TRIP : TRACKING_MODE.IDLE;
  emitModeEvents(next);
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
 * @returns {Promise<boolean>} true when native accepted the request
 */
export async function openNativeNavigation(destination) {
  const dest = serializeNavDestination(destination);
  if (!dest) return false;

  const loc = locationBridge();
  if (typeof loc?.openNavigation === 'function') {
    try {
      await loc.openNavigation(dest);
      void startNativeTracking(TRACKING_MODE.ON_TRIP);
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[nativeTracking] LocationBridge.openNavigation failed', err);
    }
  }

  const viaHandler = await invokeNative('openNavigation', dest);
  // Always ask for on-trip cadence — even if Maps is opened by the web
  // fallback, native still has to upload while the WebView is backgrounded.
  void startNativeTracking(TRACKING_MODE.ON_TRIP);
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
