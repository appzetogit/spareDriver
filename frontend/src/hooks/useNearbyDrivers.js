import { useMemo } from 'react';
import { useFirebaseDriverLocations } from './useFirebaseDriverLocations';
import { haversineMeters } from '../utils/geo';
import { useDebouncedValue } from './useDebouncedValue';
import { useCachedQuery } from './useCachedQuery';
import { buildCacheKey } from '../store/lib/buildCacheKey';
import { useNearbyDriversStore } from '../store/user/useNearbyDriversStore';

/** Debounce centre changes from map pan / GPS jitter. */
const CENTER_DEBOUNCE_MS = 600;
/** Snap coords onto a ~220 m grid so remounts with GPS jitter hit the same cache. */
const SNAP_DEGREES = 0.002;

function snapCenter(center) {
  if (!center?.lat || !center?.lng) return null;
  return {
    lat: Number((Math.round(Number(center.lat) / SNAP_DEGREES) * SNAP_DEGREES).toFixed(3)),
    lng: Number((Math.round(Number(center.lng) / SNAP_DEGREES) * SNAP_DEGREES).toFixed(3)),
  };
}

/**
 * Reusable "drivers near a point" hook.
 *
 * Combines two data sources so every consumer (home screen card, booking
 * pickup screen, dispatch debug view, …) gets identity *plus* real-time
 * positions without re-implementing the merge:
 *
 *   1. Mongo seed     — `GET /auth/drivers/nearby` returns driver name,
 *                       photo, rating, vehicle type, and a coarse position.
 *                       Cached in Zustand so route remounts reuse the
 *                       snapshot; refetched when the snapped centre cell
 *                       changes or the caller forces `refresh()`.
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
 */
export function useNearbyDrivers({
  center,
  radiusMeters = 2000,
  limit = 8,
  enabled = true,
} = {}) {
  const debouncedCenter = useDebouncedValue(center, CENTER_DEBOUNCE_MS);
  const fetchCenter = useMemo(() => snapCenter(debouncedCenter), [debouncedCenter]);

  const queryParams = useMemo(
    () =>
      fetchCenter
        ? {
            lat: fetchCenter.lat,
            lng: fetchCenter.lng,
            radius: radiusMeters,
            limit,
          }
        : null,
    [fetchCenter, radiusMeters, limit],
  );

  const cacheKey = queryParams
    ? buildCacheKey('nearby-drivers', queryParams)
    : '';

  const {
    data: seed,
    loading,
    error,
    refresh,
  } = useCachedQuery(useNearbyDriversStore, cacheKey, queryParams, {
    // Only hit the API once we have a snapped lat/lng — otherwise the
    // backend 400 ("lat and lng query params are required") surfaces on home.
    enabled: enabled && !!queryParams,
  });

  const { map: firebaseMap } = useFirebaseDriverLocations({ enabled });

  const drivers = useMemo(() => {
    if (!center?.lat || !center?.lng) return [];
    const list = Array.isArray(seed?.drivers) ? seed.drivers : [];
    const merged = list.map((d) => {
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
  }, [seed?.drivers, firebaseMap, center, radiusMeters]);

  return {
    drivers,
    loading,
    error,
    refresh,
    radiusMeters: seed?.radiusMeters || radiusMeters,
    liveLocationReady: !!seed?.liveLocationReady,
  };
}
