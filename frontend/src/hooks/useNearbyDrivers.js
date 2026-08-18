import { useMemo } from 'react';
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
 * This used to also subscribe to Firebase and overlay second-resolution GPS.
 * It no longer does, for two reasons: a customer browsing the home screen has
 * no business holding a live feed of the fleet's positions, and the database
 * rules now deny that read anyway. The REST snapshot is at most ~60s stale,
 * which is well inside what a "drivers near you" widget needs — the pins are
 * an availability hint, not a tracking view.
 *
 * Live second-by-second position is scoped to the ride the customer actually
 * booked. See `useTripDriverLocation`.
 *
 * Drivers that are outside the requested `radiusMeters` get filtered out —
 * the radius is the contract for the consumer.
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

  const drivers = useMemo(() => {
    if (!center?.lat || !center?.lng) return [];
    const list = Array.isArray(seed?.drivers) ? seed.drivers : [];
    const merged = list.map((d) => {
      const distanceMeters = haversineMeters(
        { lat: center.lat, lng: center.lng },
        { lat: d.lat, lng: d.lng },
      );
      return {
        ...d,
        heading: null,
        speed: null,
        updatedAt: d.lastLocationAt ?? null,
        live: false,
        distanceMeters,
      };
    });

    return merged
      .filter((d) => Number.isFinite(d.distanceMeters) && d.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [seed?.drivers, center, radiusMeters]);

  return {
    drivers,
    loading,
    error,
    refresh,
    radiusMeters: seed?.radiusMeters || radiusMeters,
    liveLocationReady: !!seed?.liveLocationReady,
  };
}
