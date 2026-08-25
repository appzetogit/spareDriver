/**
 * Bridge to the Flutter wrapper's background location service.
 *
 * The web app decides *when* to track — it is what knows whether the driver is
 * online and whether a trip is running. Native decides *how*, because only it
 * can keep a GPS stream alive once the app leaves the foreground (lock screen,
 * Google Maps, another app).
 *
 * Flutter injects `window.LocationBridge` with:
 *   startTracking(mode)   mode = 'idle' | 'onTrip'
 *   stopTracking()
 *   openNavigation(dest)  dest = "lat,lng" or an address string
 *
 * Older wrappers expose the same names via `flutter_inappwebview.callHandler`.
 * Custom events (`driverOnline`, `startTrip`) are dispatched as a fallback
 * for shells that listen on `window` instead of injecting the object.
 *
 * In a plain browser every call here is a no-op returning `null`, and the
 * caller falls back to `navigator.geolocation`. Nothing needs a UA sniff.
 */

/** Cadence names — must match `TrackingMode` in the Flutter wrapper. */
export const TRACKING_MODE = Object.freeze({
  ON_TRIP: 'onTrip',
  IDLE: 'idle',
});

function locationBridge() {
  const lb = globalThis.LocationBridge;
  return lb && typeof lb === 'object' ? lb : null;
}

function inAppHandler() {
  const handler = globalThis.flutter_inappwebview?.callHandler;
  return typeof handler === 'function' ? handler : null;
}

/** True when running inside a wrapper that can keep GPS alive in the background. */
export function hasNativeTracking() {
  const lb = locationBridge();
  if (lb && (typeof lb.startTracking === 'function' || typeof lb.postMessage === 'function')) {
    return true;
  }
  return inAppHandler() !== null;
}

function dispatchTrackingEvent(name, detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // CustomEvent missing in very old webviews — ignore.
  }
}

async function invokeLocationBridge(name, ...args) {
  const lb = locationBridge();
  if (!lb) return undefined;

  const fn = lb[name];
  if (typeof fn === 'function') {
    return fn(...args);
  }
  if (typeof fn?.postMessage === 'function') {
    fn.postMessage(args.length <= 1 ? (args[0] ?? '') : JSON.stringify(args));
    return { tracking: name !== 'stopTracking', via: 'LocationBridge.postMessage' };
  }
  if (typeof lb.postMessage === 'function') {
    lb.postMessage(JSON.stringify({ type: name, args }));
    return { tracking: name !== 'stopTracking', via: 'LocationBridge.postMessage' };
  }
  return undefined;
}

/**
 * @returns {Promise<null | object>}
 *   `null` outside the wrapper. A successful LocationBridge call that returns
 *   void is normalised to `{ tracking: true }` so the web app can drop the
 *   browser `watchPosition` instead of running two GPS consumers.
 */
async function call(name, ...args) {
  try {
    const fromBridge = await invokeLocationBridge(name, ...args);
    if (fromBridge !== undefined) {
      if (fromBridge && typeof fromBridge === 'object') return fromBridge;
      if (fromBridge === true || fromBridge === false) {
        return { tracking: fromBridge === true, via: 'LocationBridge' };
      }
      return { tracking: name !== 'stopTracking', via: 'LocationBridge', result: fromBridge };
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn(`[nativeTracking] LocationBridge.${name} failed`, err);
  }

  const handler = inAppHandler();
  if (!handler) return null;
  try {
    return await handler(name, ...args);
  } catch (err) {
    if (import.meta.env.DEV) console.warn(`[nativeTracking] ${name} failed`, err);
    return null;
  }
}

function normalizeStartResult(result, mode) {
  if (result == null) return null;
  if (result.tracking === false) return result;
  return { tracking: true, mode, ...result };
}

/**
 * Start (or re-aim) background tracking.
 *
 * @param {'onTrip'|'idle'} mode
 * @returns {Promise<null | { tracking: boolean, mode: string, failure?: string }>}
 *   `null` outside the wrapper. Inside it, `tracking: false` means native
 *   refused — usually a permission the driver has to grant — and the caller
 *   should keep the browser watch running rather than assume coverage.
 */
export function startNativeTracking(mode = TRACKING_MODE.IDLE) {
  const next = mode === TRACKING_MODE.ON_TRIP ? TRACKING_MODE.ON_TRIP : TRACKING_MODE.IDLE;
  if (next === TRACKING_MODE.ON_TRIP) {
    dispatchTrackingEvent('startTrip', { mode: next });
  } else {
    dispatchTrackingEvent('driverOnline', { mode: next });
  }
  return call('startTracking', next).then((result) => normalizeStartResult(result, next));
}

export function stopNativeTracking() {
  dispatchTrackingEvent('driverOffline', { mode: 'stopped' });
  return call('stopTracking');
}

/** Coords object, `"lat,lng"` string, or a street address. */
export function formatNavigationDestination(destination) {
  if (destination == null) return '';
  if (typeof destination === 'string') return destination.trim();
  if (typeof destination === 'object') {
    const lat = Number(destination.lat ?? destination.latitude);
    const lng = Number(destination.lng ?? destination.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return `${lat},${lng}`;
    const address = destination.address || destination.destQuery || destination.query;
    if (typeof address === 'string' && address.trim()) return address.trim();
  }
  return '';
}

/**
 * Open Google Maps via the native wrapper so high-accuracy background
 * tracking starts before the WebView is backgrounded.
 *
 * @returns {Promise<boolean>} true when native handled navigation
 */
export async function openNativeNavigation(destination) {
  const dest = formatNavigationDestination(destination);
  if (!dest) return false;

  try {
    const fromBridge = await invokeLocationBridge('openNavigation', dest);
    if (fromBridge !== undefined) {
      await startNativeTracking(TRACKING_MODE.ON_TRIP);
      return true;
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[nativeTracking] openNavigation failed', err);
  }

  const handler = inAppHandler();
  if (handler) {
    try {
      await handler('openNavigation', dest);
      await startNativeTracking(TRACKING_MODE.ON_TRIP);
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[nativeTracking] callHandler openNavigation failed', err);
    }
  }

  return false;
}

/**
 * Navigate in Google Maps, preferring native so background GPS stays alive.
 * Falls back to opening the Maps URL in the system browser.
 *
 * @param {{ dest?: object|string, destQuery?: string, mapsUrl?: string }} opts
 * @returns {Promise<boolean>}
 */
export async function openDriverMapsNavigation({ dest, destQuery, mapsUrl } = {}) {
  const destination = dest || destQuery || '';
  if (await openNativeNavigation(destination)) return true;

  // No dedicated nav method: start high-accuracy tracking first, then hand
  // Maps to the existing external-URL path so the WebView freeze doesn't
  // kill the GPS stream.
  await startNativeTracking(TRACKING_MODE.ON_TRIP);

  if (!mapsUrl) return false;
  try {
    const { openExternalUrl } = await import('./openExternalUrl.js');
    return openExternalUrl(mapsUrl);
  } catch {
    return false;
  }
}

/** Diagnostics: `{ tracking, mode, hasToken, bufferedFixes, platform }`. */
export function nativeTrackingStatus() {
  return call('trackingStatus');
}
