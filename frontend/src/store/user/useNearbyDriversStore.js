import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

/**
 * Mongo seed for "drivers near a point". Live Firebase positions are merged
 * in `useNearbyDrivers` — this store only caches the identity snapshot so
 * navigating away from /user/home and back does not re-hit the API.
 */
export const useNearbyDriversStore = createQueryStore(
  async ({ lat, lng, radius, limit } = {}) => {
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      // Caller should set enabled=false until coords exist; guard anyway so
      // a stale refresh never hits the API without query params.
      return { drivers: [], radiusMeters: radius, liveLocationReady: false };
    }
    const res = await api.get('/auth/drivers/nearby', {
      params: { lat: latN, lng: lngN, radius, limit },
    });
    const data = res?.data?.data || {};
    return {
      drivers: Array.isArray(data.drivers) ? data.drivers : [],
      radiusMeters: data.radiusMeters || radius,
      liveLocationReady: !!data.liveLocationReady,
    };
  },
);
