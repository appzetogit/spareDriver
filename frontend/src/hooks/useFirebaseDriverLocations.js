import { useEffect, useState } from 'react';
import { onValue, ref, off } from 'firebase/database';
import { getRealtimeDb, isFirebaseConfigured } from '../config/firebase';
import { ensureFirebaseAuth } from '../config/firebaseAuth';

/**
 * Subscribe to every driver entry under `/drivers` in Firebase Realtime DB.
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
 * this returns an empty list so the consumer can render a "live map disabled"
 * hint instead of an empty page.
 */
export function useFirebaseDriverLocations({ enabled = true } = {}) {
  const [drivers, setDrivers] = useState({});
  const [error, setError] = useState(null);

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
        next[driverId] = {
          driverId,
          lat: loc.lat,
          lng: loc.lng,
          accuracy: loc.accuracy ?? null,
          heading: loc.heading ?? null,
          speed: loc.speed ?? null,
          updatedAt: loc.updatedAt || null,
          isOnline: status?.isOnline ?? true,
          isOnTrip: status?.isOnTrip ?? false,
          activeTrip: status?.activeTrip ?? null,
        };
      }
      setDrivers(next);
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

  const list = Object.values(drivers);

  return {
    drivers: list,
    map: drivers,
    error,
    disabled: !isFirebaseConfigured(),
  };
}
