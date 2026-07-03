import { useEffect, useState } from 'react';
import { onValue, ref, off } from 'firebase/database';
import { getRealtimeDb, isFirebaseConfigured } from '../config/firebase';

/**
 * Subscribe to every driver entry under `/drivers` in Firebase Realtime DB.
 *
 * Returns a stable list of driver presence objects keyed by driverId, plus a
 * readiness flag. When Firebase isn't configured (Phase 2 dev mode), this
 * hook silently returns an empty list and `disabled: true` so the consumer
 * can render a "live map disabled" hint instead of an empty page.
 */
export function useFirebaseDriverLocations({ enabled = true } = {}) {
  const [drivers, setDrivers] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!isFirebaseConfigured()) return undefined;

    const db = getRealtimeDb();
    if (!db) return undefined;

    const driversRef = ref(db, 'drivers');
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

    onValue(driversRef, handler, errorHandler);

    return () => {
      off(driversRef, 'value', handler);
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
