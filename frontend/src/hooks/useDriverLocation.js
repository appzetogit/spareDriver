import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import { C2S_EVENTS } from '../constants/socketEvents';

/**
 * Driver-side GPS streamer.
 *
 * Pipeline:
 *   1. `navigator.geolocation.watchPosition` fires ~1/sec on most devices.
 *   2. We throttle emits to the backend to one every `MIN_EMIT_INTERVAL_MS`.
 *   3. Each accepted emit travels over Socket.IO to the backend, which writes
 *      to Firebase + (throttled) Mongo.
 */

const MIN_EMIT_INTERVAL_MS = 5_000;

const GEO_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
});

const PERMISSION = Object.freeze({
  UNKNOWN: 'unknown',
  GRANTED: 'granted',
  DENIED: 'denied',
  UNSUPPORTED: 'unsupported',
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

  const watchIdRef = useRef(null);
  const lastEmitRef = useRef(0);
  const hasFirstEmitRef = useRef(false);
  const pendingPayloadRef = useRef(null);

  /* ---- permission probe ------------------------------------------- */

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setPermission(PERMISSION.UNSUPPORTED);
      setError('Geolocation is not supported on this device.');
      return undefined;
    }

    if (!navigator.permissions?.query) return undefined;
    let active = true;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (!active) return;
        setPermission(status.state);
        const onChange = () => {
          if (active) setPermission(status.state);
        };
        status.addEventListener?.('change', onChange);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  /* ---- emit helper ------------------------------------------------- */

  const emitLocation = useCallback(
    (position, { force = false } = {}) => {
      const now = Date.now();
      if (!force && hasFirstEmitRef.current && now - lastEmitRef.current < MIN_EMIT_INTERVAL_MS) {
        return false;
      }

      const { latitude, longitude, accuracy, heading, speed } = position.coords;
      const payload = {
        lat: latitude,
        lng: longitude,
        accuracy: Number.isFinite(accuracy) ? accuracy : null,
        heading: Number.isFinite(heading) ? heading : null,
        speed: Number.isFinite(speed) ? speed : null,
      };

      if (!isConnected) {
        pendingPayloadRef.current = payload;
        return false;
      }

      lastEmitRef.current = now;
      hasFirstEmitRef.current = true;
      pendingPayloadRef.current = null;

      const sent = emit(C2S_EVENTS.DRIVER_LOCATION_UPDATE, payload, (ack) => {
        if (ack?.ok === false && ack.reason !== 'throttled') {
          if (import.meta.env.DEV) console.warn('[location] backend rejected:', ack.reason);
        }
      });
      if (sent) setLastEmittedAt(now);
      return sent;
    },
    [emit, isConnected],
  );

  /* ---- flush pending coords once the socket connects -------------- */

  useEffect(() => {
    if (!enabled || !isConnected || !pendingPayloadRef.current) return;
    const pending = pendingPayloadRef.current;
    emitLocation(
      {
        coords: {
          latitude: pending.lat,
          longitude: pending.lng,
          accuracy: pending.accuracy,
          heading: pending.heading,
          speed: pending.speed,
        },
        timestamp: Date.now(),
      },
      { force: true },
    );
    emit(C2S_EVENTS.DRIVER_ONLINE);
  }, [enabled, isConnected, emit, emitLocation]);

  /* ---- main effect: start/stop the GPS watch ---------------------- */

  useEffect(() => {
    if (!enabled) return undefined;
    if (permission === PERMISSION.UNSUPPORTED || permission === PERMISSION.DENIED) return undefined;

    const onSuccess = (position) => {
      setError(null);
      setPermission(PERMISSION.GRANTED);
      setCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        ts: position.timestamp,
      });
      emitLocation(position, { force: !hasFirstEmitRef.current });
    };

    const onError = (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        setPermission(PERMISSION.DENIED);
        setError('Location permission denied. Enable it in your browser settings to go online.');
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        setError('GPS signal unavailable. Move to an open area and try again.');
      } else if (err.code === err.TIMEOUT) {
        setError('Could not get a location fix in time. Retrying…');
      } else {
        setError(err.message || 'Could not read location');
      }
    };

    navigator.geolocation.getCurrentPosition(onSuccess, () => {}, GEO_OPTIONS);
    const id = navigator.geolocation.watchPosition(onSuccess, onError, GEO_OPTIONS);
    watchIdRef.current = id;

    if (isConnected) {
      emit(C2S_EVENTS.DRIVER_ONLINE);
    }

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      hasFirstEmitRef.current = false;
      pendingPayloadRef.current = null;
    };
  }, [enabled, permission, isConnected, emit, emitLocation]);

  /* ---- socket disconnect = stop sharing ---------------------------- */

  useEffect(() => {
    if (!socket) return undefined;
    const onDisconnect = () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    socket.on('disconnect', onDisconnect);
    return () => socket.off('disconnect', onDisconnect);
  }, [socket]);

  const isSharing = enabled && permission === PERMISSION.GRANTED && coords != null;

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
