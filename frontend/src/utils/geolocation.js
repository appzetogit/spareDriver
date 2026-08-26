/**
 * Shared browser geolocation helpers for SpareDriver (incl. Flutter WebView).
 *
 * Used by `useGeolocation` (one-shot / cascade) and `useDriverLocation` (watch).
 * Keeps cache, error classification, and options in one place so homes don't
 * each invent different getCurrentPosition settings.
 */

export const GEO_ERROR = Object.freeze({
  PERMISSION_DENIED: 'permission_denied',
  POSITION_UNAVAILABLE: 'position_unavailable',
  TIMEOUT: 'timeout',
  UNSUPPORTED: 'unsupported',
  UNKNOWN: 'unknown',
});

/** Default cache: recent + not wildly inaccurate. */
export const LOCATION_CACHE_TTL_MS = 45_000;
export const LOCATION_CACHE_MAX_ACCURACY_M = 150;

/** Home / display: treat ≤150m as usable enough to show on the map. */
export const HOME_ACCEPTABLE_ACCURACY_M = 150;

/** Arrival / pickup-critical: prefer ≤100m when available. */
export const STRICT_ACCEPTABLE_ACCURACY_M = 100;

const FAST_OPTIONS = Object.freeze({
  enableHighAccuracy: false,
  maximumAge: 20_000,
  timeout: 6_000,
});

const HIGH_ACCURACY_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 12_000,
});

const HIGH_ACCURACY_RETRY_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15_000,
});

/** First driver UI pin — network/OS cache so the map is not blank for 12s. */
export const DRIVER_UI_FIRST_FIX_OPTIONS = Object.freeze({
  enableHighAccuracy: false,
  maximumAge: 30_000,
  timeout: 6_000,
});

/** First driver fix — allow a short-lived OS cache so indoor cold-start is faster. */
export const DRIVER_FIRST_FIX_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  maximumAge: 20_000,
  timeout: 12_000,
});

/** Continuous driver watch after the first fix. */
export const DRIVER_WATCH_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  maximumAge: 2_000,
  timeout: 20_000,
});

let cache = null;

const PERSIST_KEY = 'sd.geo.lastCoords';
const PERSIST_MAX_AGE_MS = 30 * 60_000;

function isDev() {
  return Boolean(import.meta.env?.DEV);
}

function readPersistedLocation() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
    const age = Date.now() - (parsed.fetchedAt || 0);
    if (age > PERSIST_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedLocation(coords) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PERSIST_KEY, JSON.stringify(coords));
  } catch {
    // quota / private mode
  }
}

export function logGeo(event, detail) {
  if (!isDev()) return;
  if (detail === undefined) {
    console.debug(`[geo] ${event}`);
    return;
  }
  console.debug(`[geo] ${event}`, detail);
}

export function readCoords(position) {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
    speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
    fetchedAt: Date.now(),
    timestamp: position.timestamp ?? Date.now(),
  };
}

export function classifyAccuracy(meters) {
  if (!Number.isFinite(meters)) return 'unknown';
  if (meters <= 50) return 'excellent';
  if (meters <= 100) return 'usable';
  if (meters <= 150) return 'acceptable';
  return 'poor';
}

export function isAccuracyAcceptable(meters, { maxMeters = HOME_ACCEPTABLE_ACCURACY_M } = {}) {
  if (!Number.isFinite(meters)) return true; // unknown accuracy — still usable
  return meters <= maxMeters;
}

export function classifyGeoError(err) {
  if (!err) return GEO_ERROR.UNKNOWN;
  if (err.kind && Object.values(GEO_ERROR).includes(err.kind)) return err.kind;
  const code = err.code;
  if (code === 1 || code === err.PERMISSION_DENIED) return GEO_ERROR.PERMISSION_DENIED;
  if (code === 2 || code === err.POSITION_UNAVAILABLE) return GEO_ERROR.POSITION_UNAVAILABLE;
  if (code === 3 || code === err.TIMEOUT) return GEO_ERROR.TIMEOUT;
  if (err.kind === GEO_ERROR.UNSUPPORTED) return GEO_ERROR.UNSUPPORTED;
  return GEO_ERROR.UNKNOWN;
}

export function geoErrorMessage(kind) {
  switch (kind) {
    case GEO_ERROR.PERMISSION_DENIED:
      return 'Location permission is required';
    case GEO_ERROR.POSITION_UNAVAILABLE:
      return 'Unable to detect your location';
    case GEO_ERROR.TIMEOUT:
      return 'Location is taking longer than expected';
    case GEO_ERROR.UNSUPPORTED:
      return 'Location is not available on this device';
    default:
      return 'Unable to get your location';
  }
}

export function makeGeoError(errOrKind, message) {
  const kind =
    typeof errOrKind === 'string' ? errOrKind : classifyGeoError(errOrKind);
  const error = new Error(message || geoErrorMessage(kind));
  error.kind = kind;
  error.code =
    kind === GEO_ERROR.PERMISSION_DENIED
      ? 1
      : kind === GEO_ERROR.POSITION_UNAVAILABLE
        ? 2
        : kind === GEO_ERROR.TIMEOUT
          ? 3
          : 0;
  return error;
}

export function getCachedLocation({
  maxAgeMs = LOCATION_CACHE_TTL_MS,
  maxAccuracyM = LOCATION_CACHE_MAX_ACCURACY_M,
} = {}) {
  if (!cache) return null;
  if (Date.now() - cache.fetchedAt > maxAgeMs) return null;
  if (Number.isFinite(cache.accuracy) && cache.accuracy > maxAccuracyM) return null;
  return cache;
}

/** Last known coords even if stale/poor — for UI keep-alive, not for "fresh". */
export function getLastKnownLocation() {
  if (cache) return cache;
  const persisted = readPersistedLocation();
  if (persisted) {
    cache = persisted;
    return cache;
  }
  return null;
}

export function setCachedLocation(coords) {
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return;
  cache = {
    ...coords,
    fetchedAt: coords.fetchedAt ?? Date.now(),
  };
  writePersistedLocation(cache);
}

export function invalidateLocationCache() {
  cache = null;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(PERSIST_KEY);
    } catch {
      // ignore
    }
  }
  logGeo('cache invalidated');
}

export function isGeolocationSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

/**
 * One-shot position. Resolves with serialisable coords; rejects with makeGeoError.
 */
export function getLocationOnce(options = {}) {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject(makeGeoError(GEO_ERROR.UNSUPPORTED));
      return;
    }

    const opts = {
      enableHighAccuracy: false,
      timeout: 8_000,
      maximumAge: 30_000,
      ...options,
    };

    logGeo('getLocationOnce start', {
      enableHighAccuracy: opts.enableHighAccuracy,
      timeout: opts.timeout,
      maximumAge: opts.maximumAge,
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = readCoords(position);
        setCachedLocation(coords);
        logGeo('getLocationOnce success', {
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy,
          quality: classifyAccuracy(coords.accuracy),
        });
        resolve(coords);
      },
      (err) => {
        const kind = classifyGeoError(err);
        logGeo('getLocationOnce error', { kind, message: err?.message });
        reject(makeGeoError(kind));
      },
      opts,
    );
  });
}

/**
 * Continuous watch. Returns an unsubscribe function.
 */
export function watchLocation(onSuccess, onError, options = DRIVER_WATCH_OPTIONS) {
  if (!isGeolocationSupported()) {
    onError?.(makeGeoError(GEO_ERROR.UNSUPPORTED));
    return () => {};
  }

  logGeo('watchLocation start', {
    enableHighAccuracy: options.enableHighAccuracy,
    timeout: options.timeout,
    maximumAge: options.maximumAge,
  });

  const id = navigator.geolocation.watchPosition(
    (position) => {
      const coords = readCoords(position);
      setCachedLocation(coords);
      logGeo('watchLocation update', {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
        quality: classifyAccuracy(coords.accuracy),
      });
      onSuccess?.(coords, position);
    },
    (err) => {
      const kind = classifyGeoError(err);
      logGeo('watchLocation error', { kind, message: err?.message });
      onError?.(makeGeoError(kind));
    },
    options,
  );

  return () => {
    logGeo('watchLocation stop');
    navigator.geolocation.clearWatch(id);
  };
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeGeoError(GEO_ERROR.UNKNOWN, 'Location request cancelled'));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(makeGeoError(GEO_ERROR.UNKNOWN, 'Location request cancelled'));
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

/**
 * Fast → high-accuracy → high-accuracy retry.
 * Stops early when accuracy is acceptable for home display.
 */
export async function fetchLocationWithCascade({
  signal,
  onAttempt,
  /** Called as soon as any fix arrives so UI can leave "Getting location…". */
  onProgress,
  acceptableAccuracyM = HOME_ACCEPTABLE_ACCURACY_M,
} = {}) {
  const attempts = [
    { label: 'fast', options: FAST_OPTIONS, delayMs: 0 },
    { label: 'high', options: HIGH_ACCURACY_OPTIONS, delayMs: 300 },
    { label: 'high-retry', options: HIGH_ACCURACY_RETRY_OPTIONS, delayMs: 500 },
  ];

  let lastError = null;
  let bestCoords = null;

  for (let i = 0; i < attempts.length; i += 1) {
    if (signal?.aborted) {
      throw makeGeoError(GEO_ERROR.UNKNOWN, 'Location request cancelled');
    }

    const attempt = attempts[i];
    if (attempt.delayMs > 0) {
      try {
        await sleep(attempt.delayMs, signal);
      } catch (e) {
        throw e;
      }
    }

    onAttempt?.(i + 1, attempt.label);
    logGeo('cascade attempt', { attempt: i + 1, label: attempt.label });

    try {
      const coords = await getLocationOnce(attempt.options);
      if (
        !bestCoords ||
        (Number.isFinite(coords.accuracy) &&
          (!Number.isFinite(bestCoords.accuracy) || coords.accuracy < bestCoords.accuracy))
      ) {
        bestCoords = coords;
      }

      // Surface the first usable fix immediately (even if we keep improving).
      onProgress?.(coords);

      if (isAccuracyAcceptable(coords.accuracy, { maxMeters: acceptableAccuracyM })) {
        logGeo('cascade accepted', {
          attempt: i + 1,
          accuracy: coords.accuracy,
          quality: classifyAccuracy(coords.accuracy),
        });
        return coords;
      }

      logGeo('cascade poor accuracy, continuing', {
        attempt: i + 1,
        accuracy: coords.accuracy,
      });
    } catch (err) {
      lastError = err;
      const kind = classifyGeoError(err);
      // Permission denied will not improve on retry.
      if (kind === GEO_ERROR.PERMISSION_DENIED || kind === GEO_ERROR.UNSUPPORTED) {
        throw err;
      }
    }
  }

  if (bestCoords) {
    logGeo('cascade returning best-effort coords', {
      accuracy: bestCoords.accuracy,
      quality: classifyAccuracy(bestCoords.accuracy),
    });
    return bestCoords;
  }

  throw lastError || makeGeoError(GEO_ERROR.UNKNOWN);
}
