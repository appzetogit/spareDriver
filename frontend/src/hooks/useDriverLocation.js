import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSocket } from './useSocket';
import { C2S_EVENTS } from '../constants/socketEvents';
import {
  DRIVER_FIRST_FIX_OPTIONS,
  DRIVER_WATCH_OPTIONS,
  classifyAccuracy,
  geoErrorMessage,
  getLocationOnce,
  isGeolocationSupported,
  logGeo,
  watchLocation,
  GEO_ERROR,
  classifyGeoError,
} from '../utils/geolocation';

/**
 * Driver-side GPS streamer.
 *
 * Pipeline:
 *   1. Fast first fix (`maximumAge` allowed) → then one `watchPosition`.
 *   2. Throttle emits to the backend to one every `MIN_EMIT_INTERVAL_MS`.
 *   3. Socket.IO carries accepted emits → Firebase + throttled Mongo.
 *
 * GPS is independent of Socket.IO: disconnect only buffers the latest point;
 * it never clears the watch.
 */

const MIN_EMIT_INTERVAL_MS = 5_000;

const locationStatusListeners = new Set();
let locationStatusSnapshot = {
  permission: 'unknown',
  error: null,
  coords: null,
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
 * @param {{ enabled: boolean }} opts
 */
export function useDriverLocation({ enabled }) {
  const { socket, isConnected, emit } = useSocket();
  const [permission, setPermission] = useState(PERMISSION.UNKNOWN);
  const [coords, setCoords] = useState(null);
  const [lastEmittedAt, setLastEmittedAt] = useState(null);
  const [error, setError] = useState(null);

  const lastEmitRef = useRef(0);
  const hasFirstEmitRef = useRef(false);
  const pendingPayloadRef = useRef(null);
  const latestPayloadRef = useRef(null);

  // Keep socket emit path stable so the GPS watch effect does not restart.
  const emitRef = useRef(emit);
  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    emitRef.current = emit;
  }, [emit]);
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

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
    latestPayloadRef.current = payload;

    const now = Date.now();
    if (!force && hasFirstEmitRef.current && now - lastEmitRef.current < MIN_EMIT_INTERVAL_MS) {
      pendingPayloadRef.current = payload;
      return false;
    }

    if (!isConnectedRef.current) {
      pendingPayloadRef.current = payload;
      logGeo('driver location buffered (socket down)', {
        lat: payload.lat,
        lng: payload.lng,
        accuracy: payload.accuracy,
      });
      return false;
    }

    lastEmitRef.current = now;
    hasFirstEmitRef.current = true;
    pendingPayloadRef.current = null;

    console.log('[liveLocation] driver sending location', {
      lat: payload.lat,
      lng: payload.lng,
      heading: payload.heading ?? null,
      speed: payload.speed ?? null,
      accuracy: payload.accuracy ?? null,
      force,
    });

    const sent = emitRef.current(C2S_EVENTS.DRIVER_LOCATION_UPDATE, payload, (ack) => {
      console.log('[liveLocation] driver server ack', {
        ok: ack?.ok,
        reason: ack?.reason || null,
        firebase: ack?.firebase ?? null,
        mongoSnapshot: ack?.mongoSnapshot ?? null,
      });
      if (ack?.ok === false && ack.reason !== 'throttled') {
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
    };
  }, []);

  /* ---- flush latest on socket reconnect --------------------------- */

  useEffect(() => {
    if (!enabled || !isConnected) return;

    const pending = pendingPayloadRef.current || latestPayloadRef.current;
    if (pending) {
      logGeo('driver socket reconnect — flushing latest location');
      emitLocationPayload(pending, { force: true });
    }

    emitRef.current(C2S_EVENTS.DRIVER_ONLINE);
  }, [enabled, isConnected, emitLocationPayload]);

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
      setCoords({
        lat: next.lat,
        lng: next.lng,
        accuracy: next.accuracy,
        ts: next.timestamp ?? next.fetchedAt ?? Date.now(),
      });
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

    logGeo('driver GPS pipeline start', {
      firstFix: DRIVER_FIRST_FIX_OPTIONS,
      watch: DRIVER_WATCH_OPTIONS,
    });

    // First fix: allow recent OS cache for a faster cold start (esp. indoors).
    getLocationOnce(DRIVER_FIRST_FIX_OPTIONS)
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
