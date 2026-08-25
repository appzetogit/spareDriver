import { useEffect, useRef, useState } from 'react';
import { onValue, ref, off } from 'firebase/database';
import { getRealtimeDb, isFirebaseConfigured } from '../config/firebase';
import { ensureFirebaseAuth } from '../config/firebaseAuth';
import { useSocketEvent } from './useSocket';
import { S2C_EVENTS } from '../constants/socketEvents';

/**
 * Subscribe to every driver entry under `/drivers` in Firebase Realtime DB,
 * with a Socket.IO overlay so the admin live map keeps moving when RTDB is
 * down or a background HTTP ingest arrives before Firebase replicates.
 *
 * STAFF ONLY. The database rules grant this path to `role: 'staff'` and nobody
 * else, because the payload is the whole fleet's live positions plus the
 * `activeTrip` block carrying customer names and phone numbers.
 *
 * Customer surfaces must use `useTripDriverLocation`, which is scoped to the
 * one booking they are watching.
 *
 * Returns a list of driver presence objects keyed by driverId, plus a
 * readiness flag. When Firebase isn't configured, or the caller is not staff,
 * socket updates still populate the map so the dashboard is not dark.
 */

function coordsFromPayload(payload) {
  if (!payload) return null;
  const lat = Number.isFinite(payload.lat) ? payload.lat : payload.latitude;
  const lng = Number.isFinite(payload.lng) ? payload.lng : payload.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function useFirebaseDriverLocations({ enabled = true } = {}) {
  const [drivers, setDrivers] = useState({});
  const [error, setError] = useState(null);
  const socketNewerRef = useRef({});

  useEffect(() => {
    if (!enabled) return undefined;
    if (!isFirebaseConfigured()) return undefined;

    let cancelled = false;
    let detach = null;

    const handler = (snapshot) => {
      const raw = snapshot.val() || {};
      const next = {};
      for (const [driverId, value] of Object.entries(raw)) {
        const loc = value?.location;
        const status = value?.status;
        if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue;
        const socketFix = socketNewerRef.current[driverId];
        const useSocket =
          socketFix
          && socketFix.updatedAt
          && (!loc.updatedAt || socketFix.updatedAt >= loc.updatedAt);
        next[driverId] = {
          driverId,
          lat: useSocket ? socketFix.lat : loc.lat,
          lng: useSocket ? socketFix.lng : loc.lng,
          accuracy: (useSocket ? socketFix.accuracy : loc.accuracy) ?? null,
          heading: (useSocket ? socketFix.heading : loc.heading) ?? null,
          speed: (useSocket ? socketFix.speed : loc.speed) ?? null,
          updatedAt: useSocket ? socketFix.updatedAt : loc.updatedAt || null,
          isOnline: status?.isOnline ?? true,
          isOnTrip: status?.isOnTrip ?? Boolean(socketFix?.tripId),
          name: status?.name || null,
          driverNumber: status?.driverNumber || '',
          activeTrip: status?.activeTrip ?? null,
        };
      }
      setDrivers((prev) => {
        const merged = { ...next };
        for (const [id, fix] of Object.entries(socketNewerRef.current)) {
          if (!merged[id]) {
            merged[id] = {
              driverId: id,
              ...fix,
              isOnline: true,
              isOnTrip: Boolean(fix.tripId),
              name: prev[id]?.name || null,
              driverNumber: prev[id]?.driverNumber || '',
              activeTrip: prev[id]?.activeTrip ?? null,
            };
          }
        }
        return merged;
      });
    };

    const errorHandler = (err) => {
      setError(err.message || 'Firebase subscription error');
    };

    (async () => {
      // The rules require a staff claim; without a session the read is denied.
      const authed = await ensureFirebaseAuth('admin');
      if (cancelled) return;
      if (!authed) {
        setError('Not authorised for the live driver feed');
        return;
      }

      const db = getRealtimeDb();
      if (!db) return;

      const driversRef = ref(db, 'drivers');
      onValue(driversRef, handler, errorHandler);
      detach = () => off(driversRef, 'value', handler);
    })();

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [enabled]);

  useSocketEvent(S2C_EVENTS.DRIVER_LOCATION_UPDATE, (payload) => {
    if (!enabled) return;
    const coords = coordsFromPayload(payload);
    const driverId = payload?.driverId ? String(payload.driverId) : '';
    if (!coords || !driverId) return;
    const updatedAt =
      typeof payload.updatedAt === 'number' ? payload.updatedAt : Date.now();
    const patch = {
      lat: coords.lat,
      lng: coords.lng,
      accuracy: payload.accuracy ?? null,
      heading: Number.isFinite(payload.heading) ? payload.heading : null,
      speed: Number.isFinite(payload.speed) ? payload.speed : null,
      updatedAt,
      tripId: payload.tripId || payload.bookingId || null,
    };
    const current = socketNewerRef.current[driverId];
    if (current?.updatedAt && updatedAt < current.updatedAt) return;
    socketNewerRef.current[driverId] = patch;
    setDrivers((prev) => ({
      ...prev,
      [driverId]: {
        ...(prev[driverId] || { driverId, name: null, driverNumber: '', activeTrip: null }),
        driverId,
        ...patch,
        isOnline: prev[driverId]?.isOnline ?? true,
        isOnTrip: prev[driverId]?.isOnTrip || Boolean(patch.tripId),
      },
    }));
  });

  const list = Object.values(drivers);

  return {
    drivers: list,
    map: drivers,
    error,
    disabled: !isFirebaseConfigured() && list.length === 0,
  };
}

