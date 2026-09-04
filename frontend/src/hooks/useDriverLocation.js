import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSocket } from './useSocket';
import { C2S_EVENTS } from '../constants/socketEvents';
import api from '../utils/api';
import {
  DRIVER_UI_FIRST_FIX_OPTIONS,
  DRIVER_WATCH_OPTIONS,
  classifyAccuracy,
  geoErrorMessage,
  getCachedLocation,
  getLastKnownLocation,
  getLocationOnce,
  isGeolocationSupported,
  logGeo,
  setCachedLocation,
  watchLocation,
  MAX_PUBLISH_ACCURACY_M,
  GEO_ERROR,
  classifyGeoError,
} from '../utils/geolocation';

/**
 * Driver-side GPS streamer.
 *
 * Pipeline:
 *   1. Seed last-known coords so trip maps are not blank on remount.
 *   2. Fast first fix (`maximumAge` allowed) → then one `watchPosition`.
 *   3. Throttle emits to the backend to one every `MIN_EMIT_INTERVAL_MS`.
 *   4. Socket.IO carries accepted emits → Firebase + throttled Mongo.
 *
 * When native (Flutter) is uploading, `publish` is false: the watch still
 * feeds the driver UI (pin, arrival geofence) but does not double-post.
 *
 * GPS is independent of Socket.IO: disconnect only buffers the latest point;
 * it never clears the watch.
 */

const MIN_EMIT_INTERVAL_MS = 5_000;

/**
 * Server-side "no thanks" answers that are routine rather than faults.
 *
 * `native_preferred` means the Flutter uploader is alive and owns the stream —
 * the expected steady state inside the wrapper, not an error. `stale_fix` means
 * a newer fix already landed. Neither deserves console noise; anything else
 * does.
 */
const EXPECTED_REJECTIONS = new Set(['throttled', 'native_preferred', 'stale_fix']);

function toStatusCoords(c) {
  if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return null;
  return {
    lat: c.lat,
    lng: c.lng,
    accuracy: Number.isFinite(c.accuracy) ? c.accuracy : null,
    heading: Number.isFinite(c.heading) ? c.heading : null,
    speed: Number.isFinite(c.speed) ? c.speed : null,
    ts: c.timestamp ?? c.fetchedAt ?? c.ts ?? Date.now(),
  };
}

function readSeededCoords() {
  return toStatusCoords(getCachedLocation() || getLastKnownLocation());
}

const locationStatusListeners = new Set();
let locationStatusSnapshot = {
  permission: 'unknown',
  error: null,
  coords: readSeededCoords(),
  isSharing: false,
};

function emitLocationStatus(patch) {
  locationStatusSnapshot = { ...locationStatusSnapshot, ...patch };
  locationStatusListeners.forEach((fn) => fn());
}

function subscribeLocationStatus(fn) {
  locationStatusListeners.add(fn);
  return () => locationStatusListeners.delete(fn);
}

function getLocationStatusSnapshot() {
  return locationStatusSnapshot;
}

/** Read-only shared GPS stream status (safe from any driver screen). */
export function useDriverLocationStatus() {
  return useSyncExternalStore(subscribeLocationStatus, getLocationStatusSnapshot, getLocationStatusSnapshot);
}

const PERMISSION = Object.freeze({
  UNKNOWN: 'unknown',
  GRANTED: 'granted',
  DENIED: 'denied',
  UNSUPPORTED: 'unsupported',
  PROMPT: 'prompt',
});

/**
 * Push a fix into the shared driver-GPS store (browser watch, native callback,
 * or last-known seed). Trip screens read this; they never talk to the OS.
 *
 * @param {object} raw
 * @param {{ source?: string }} [opts]
 * @returns {boolean}
 */
export function reportDriverLocation(raw, { source = 'browser' } = {}) {
  const coords = toStatusCoords(raw);
  if (!coords) return false;
  setCachedLocation({ ...coords, fetchedAt: coords.ts });
  logGeo('driver location report', {
    source,
    lat: coords.lat,
    lng: coords.lng,
    accuracy: coords.accuracy,
  });
  emitLocationStatus({
    coords,
    error: null,
    permission: PERMISSION.GRANTED,
    isSharing: true,
  });
  return true;
}

if (typeof window !== 'undefined') {
  window.__sdOnDriverLocation = (fix) => reportDriverLocation(fix, { source: 'native' });
}

/**
 * @param {{ enabled: boolean, publish?: boolean }} opts
 *   `publish` — when false, still watch GPS for the driver UI but do not
 *   emit on the socket (native is already uploading).
 */
export function useDriverLocation({ enabled, publish = true }) {
  const { isConnected, emit } = useSocket();
  const [permission, setPermission] = useState(PERMISSION.UNKNOWN);
  const [coords, setCoords] = useState(() => readSeededCoords());
  const [lastEmittedAt, setLastEmittedAt] = useState(null);
  const [error, setError] = useState(null);

  const lastEmitRef = useRef(0);
  const hasFirstEmitRef = useRef(false);
  const pendingPayloadRef = useRef(null);
  const latestPayloadRef = useRef(null);
  const publishRef = useRef(publish);

  // Keep socket emit path stable so the GPS watch effect does not restart.
  const emitRef = useRef(emit);
  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    emitRef.current = emit;
  }, [emit]);
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);
  useEffect(() => {
    publishRef.current = publish;
  }, [publish]);

  /* ---- permission probe ------------------------------------------- */

  useEffect(() => {
    if (!isGeolocationSupported()) {
      setPermission(PERMISSION.UNSUPPORTED);
      setError(geoErrorMessage(GEO_ERROR.UNSUPPORTED));
      return undefined;
    }

    if (!navigator.permissions?.query) return undefined;
    let active = true;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (!active) return;
        setPermission(status.state);
        logGeo('driver permission', { state: status.state });
        const onChange = () => {
          if (active) {
            setPermission(status.state);
            logGeo('driver permission change', { state: status.state });
          }
        };
        status.addEventListener?.('change', onChange);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  /* ---- emit helper (refs only — safe from watch callbacks) -------- */

  const emitLocationPayload = useCallback((payload, { force = false } = {}) => {
    if (!payload) return false;
    if (!publishRef.current) return false;

    // A coarse fix still paints this driver's own map — `reportDriverLocation`
    // has already taken it — but it must not reach the server, where it would
    // become the customer's "1 km away" and the arrival check's input. `force`
    // does not override this: the first fix is exactly the coarse one, and
    // rushing a wrong position out is worse than showing none for a few
    // seconds.
    if (
      Number.isFinite(payload.accuracy)
      && payload.accuracy > MAX_PUBLISH_ACCURACY_M
    ) {
      logGeo('driver location withheld (accuracy)', {
        accuracy: payload.accuracy,
        limit: MAX_PUBLISH_ACCURACY_M,
      });
      return false;
    }

    latestPayloadRef.current = payload;

    const now = Date.now();
    if (!force && hasFirstEmitRef.current && now - lastEmitRef.current < MIN_EMIT_INTERVAL_MS) {
      pendingPayloadRef.current = payload;
      return false;
    }

    if (!isConnectedRef.current) {
      pendingPayloadRef.current = payload;
      lastEmitRef.current = now;
      hasFirstEmitRef.current = true;
      logGeo('driver location buffered (socket down)', {
        lat: payload.lat,
        lng: payload.lng,
        accuracy: payload.accuracy,
      });
      // Socket dies as soon as the WebView backgrounds. Native is the real
      // uploader, but while JS is still scheduled post over HTTP so a brief
      // pause does not freeze the customer map.
      api.post('/driver/location', payload).catch(() => {});
      return false;
    }

    lastEmitRef.current = now;
    hasFirstEmitRef.current = true;
    pendingPayloadRef.current = null;

    logGeo('driver location emit', {
      lat: payload.lat,
      lng: payload.lng,
      accuracy: payload.accuracy,
      force,
    });

    const sent = emitRef.current(C2S_EVENTS.DRIVER_LOCATION_UPDATE, payload, (ack) => {
      if (ack?.ok === false && !EXPECTED_REJECTIONS.has(ack.reason)) {
        if (import.meta.env.DEV) console.warn('[location] backend rejected:', ack.reason);
      }
    });
    if (sent) setLastEmittedAt(now);
    return sent;
  }, []);

  const coordsToPayload = useCallback((c) => {
    if (!c) return null;
    return {
      lat: c.lat,
      lng: c.lng,
      accuracy: Number.isFinite(c.accuracy) ? c.accuracy : null,
      heading: Number.isFinite(c.heading) ? c.heading : null,
      speed: Number.isFinite(c.speed) ? c.speed : null,
      // When the OS produced this fix. The server orders the browser and
      // native streams against each other on this value, so sending send-time
      // here (which is what the HTTP fallback used to do) lets a stale
      // buffered fix outrank a fresh native one.
      capturedAt: c.timestamp ?? c.fetchedAt ?? Date.now(),
    };
  }, []);

  /* ---- flush latest on socket reconnect --------------------------- */

  useEffect(() => {
    if (!enabled || !isConnected) return;

    if (publish) {
      const pending = pendingPayloadRef.current || latestPayloadRef.current;
      if (pending) {
        logGeo('driver socket reconnect — flushing latest location');
        emitLocationPayload(pending, { force: true });
      }
    }

    emitRef.current(C2S_EVENTS.DRIVER_ONLINE);
  }, [enabled, isConnected, publish, emitLocationPayload]);

  /* ---- GPS watch: depends on enabled + blocked permission only ---- */

  const gpsBlocked =
    permission === PERMISSION.UNSUPPORTED || permission === PERMISSION.DENIED;

  useEffect(() => {
    if (!enabled || gpsBlocked) return undefined;
    if (!isGeolocationSupported()) {
      setPermission(PERMISSION.UNSUPPORTED);
      setError(geoErrorMessage(GEO_ERROR.UNSUPPORTED));
      return undefined;
    }

    let stopped = false;
    let stopWatch = null;

    const onCoords = (next, { forceEmit = false } = {}) => {
      if (stopped) return;
      setError(null);
      setPermission((prev) => (prev === PERMISSION.GRANTED ? prev : PERMISSION.GRANTED));
      const statusCoords = toStatusCoords(next);
      setCoords(statusCoords);
      reportDriverLocation(next, { source: 'browser' });
      const payload = coordsToPayload(next);
      emitLocationPayload(payload, { force: forceEmit || !hasFirstEmitRef.current });
    };

    const onError = (err) => {
      if (stopped) return;
      const kind = classifyGeoError(err);
      if (kind === GEO_ERROR.PERMISSION_DENIED) {
        setPermission(PERMISSION.DENIED);
        setError(geoErrorMessage(kind));
      } else if (kind === GEO_ERROR.POSITION_UNAVAILABLE) {
        setError(geoErrorMessage(kind));
      } else if (kind === GEO_ERROR.TIMEOUT) {
        setError('Could not get a location fix in time. Retrying…');
      } else {
        setError(geoErrorMessage(kind));
      }
      // Do not clear coords — keep last valid fix on transient GPS errors.
    };

    const seeded = readSeededCoords();
    if (seeded) {
      setCoords(seeded);
      emitLocationStatus({ coords: seeded, error: null });
    }

    logGeo('driver GPS pipeline start', {
      firstFix: DRIVER_UI_FIRST_FIX_OPTIONS,
      watch: DRIVER_WATCH_OPTIONS,
      seeded: Boolean(seeded),
    });

    // Fast first pin from the OS cache / network, then high-accuracy watch.
    getLocationOnce(DRIVER_UI_FIRST_FIX_OPTIONS)
      .then((c) => {
        if (stopped) return;
        logGeo('driver first fix', {
          accuracy: c.accuracy,
          quality: classifyAccuracy(c.accuracy),
        });
        onCoords(c, { forceEmit: true });
      })
      .catch((err) => {
        if (!stopped) onError(err);
      });

    stopWatch = watchLocation(
      (c) => onCoords(c, { forceEmit: false }),
      onError,
      DRIVER_WATCH_OPTIONS,
    );

    return () => {
      stopped = true;
      stopWatch?.();
      hasFirstEmitRef.current = false;
      pendingPayloadRef.current = latestPayloadRef.current;
      logGeo('driver GPS pipeline stop');
    };
  }, [enabled, gpsBlocked, emitLocationPayload, coordsToPayload]);

  // Intentionally NO clearWatch on socket disconnect — GPS stays alive.

  const isSharing = enabled && permission === PERMISSION.GRANTED && coords != null;

  useEffect(() => {
    emitLocationStatus({
      permission,
      error,
      coords,
      isSharing,
    });
  }, [permission, error, coords, isSharing]);

  return {
    isSharing,
    isConnected,
    permission,
    coords,
    lastEmittedAt,
    error,
  };
}

useDriverLocation.PERMISSION = PERMISSION;
