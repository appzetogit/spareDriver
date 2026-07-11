import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../utils/api';
import { useFirebaseDriverLocations } from './useFirebaseDriverLocations';
import { haversineMeters } from '../utils/geo';
import { useDebouncedValue } from './useDebouncedValue';

/** Don't refetch the Mongo seed until the centre moves at least this far. */
const MIN_CENTER_MOVE_METERS = 250;
/** Debounce centre changes from map pan / GPS jitter. */
const CENTER_DEBOUNCE_MS = 600;

/**
 * Reusable "drivers near a point" hook.
 *
 * Combines two data sources so every consumer (home screen card, booking
 * pickup screen, dispatch debug view, …) gets identity *plus* real-time
 * positions without re-implementing the merge:
 *
 *   1. Mongo seed     — `GET /auth/drivers/nearby` returns driver name,
 *                       photo, rating, vehicle type, and a coarse position.
 *                       Refetched whenever the centre lat/lng changes
 *                       enough to make the snapshot stale.
 *   2. Firebase live  — `useFirebaseDriverLocations` overrides the position
 *                       with the second-resolution GPS feed. We recompute
 *                       the distance client-side so pin-to-pin distances
 *                       stay correct even when the driver moves.
 *
 * Drivers that are outside the requested `radiusMeters` based on their
 * latest live position get filtered out — the radius is the contract for
 * the consumer.
 *
 * @param {object} params
 * @param {{ lat:number, lng:number } | null} params.center
 * @param {number} [params.radiusMeters=2000]
 * @param {number} [params.limit=8]
 * @param {boolean} [params.enabled=true]
 * @param {number} [params.refetchMs]   Optional polling interval for the seed.
 */
export function useNearbyDrivers({
  center,
  radiusMeters = 2000,
  limit = 8,
  enabled = true,
  refetchMs,
} = {}) {
  const [seed, setSeed] = useState({ drivers: [], radiusMeters, liveLocationReady: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);
  const lastFetchedCenterRef = useRef(null);

  const debouncedCenter = useDebouncedValue(center, CENTER_DEBOUNCE_MS);

  const fetchCenter = useMemo(() => {
    if (!debouncedCenter?.lat || !debouncedCenter?.lng) return null;
    const prev = lastFetchedCenterRef.current;
    if (
      prev &&
      haversineMeters(prev, debouncedCenter) < MIN_CENTER_MOVE_METERS
    ) {
      return prev;
    }
    return debouncedCenter;
  }, [debouncedCenter]);

  const fetchSeed = useCallback(async () => {
    if (!enabled || !fetchCenter?.lat || !fetchCenter?.lng) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/auth/drivers/nearby', {
        params: {
          lat: fetchCenter.lat,
          lng: fetchCenter.lng,
          radius: radiusMeters,
          limit,
        },
      });
      if (cancelledRef.current) return;
      lastFetchedCenterRef.current = fetchCenter;
      const data = res?.data?.data || {};
      setSeed({
        drivers: Array.isArray(data.drivers) ? data.drivers : [],
        radiusMeters: data.radiusMeters || radiusMeters,
        liveLocationReady: !!data.liveLocationReady,
      });
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err?.response?.data?.message || 'Could not load nearby drivers');
      setSeed({ drivers: [], radiusMeters, liveLocationReady: false });
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [enabled, fetchCenter, radiusMeters, limit]);

  // Mount / refetch when the input changes.
  useEffect(() => {
    cancelledRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical fetch-on-mount
    fetchSeed();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchSeed]);

  // Optional polling so the seed doesn't go too stale (e.g. driver coming
  // online but Firebase isn't enabled).
  useEffect(() => {
    if (!enabled || !refetchMs || !fetchCenter?.lat || !fetchCenter?.lng) return undefined;
    const id = setInterval(() => fetchSeed(), refetchMs);
    return () => clearInterval(id);
  }, [enabled, refetchMs, fetchSeed, fetchCenter]);

  // Live overrides via Firebase.
  const { map: firebaseMap } = useFirebaseDriverLocations({ enabled });

  const drivers = useMemo(() => {
    if (!center?.lat || !center?.lng) return [];
    const merged = seed.drivers.map((d) => {
      const live = firebaseMap[String(d._id)];
      const lat = live?.lat ?? d.lat;
      const lng = live?.lng ?? d.lng;
      const distanceMeters = haversineMeters(
        { lat: center.lat, lng: center.lng },
        { lat, lng },
      );
      return {
        ...d,
        lat,
        lng,
        heading: live?.heading ?? null,
        speed: live?.speed ?? null,
        updatedAt: live?.updatedAt ?? d.lastLocationAt ?? null,
        isOnTrip: live?.isOnTrip ?? d.isOnTrip,
        live: !!live,
        distanceMeters,
      };
    });

    return merged
      .filter((d) => Number.isFinite(d.distanceMeters) && d.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [seed.drivers, firebaseMap, center, radiusMeters]);

  return {
    drivers,
    loading,
    error,
    refresh: fetchSeed,
    radiusMeters: seed.radiusMeters,
    liveLocationReady: seed.liveLocationReady,
  };
}
