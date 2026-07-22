import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

/**
 * Mongo seed for "drivers near a point". Live Firebase positions are merged
 * in `useNearbyDrivers` — this store only caches the identity snapshot so
 * navigating away from /user/home and back does not re-hit the API.
 */
export const useNearbyDriversStore = createQueryStore(
  async ({ lat, lng, radius, limit }) => {
    const res = await api.get('/auth/drivers/nearby', {
      params: { lat, lng, radius, limit },
    });
    const data = res?.data?.data || {};
    return {
      drivers: Array.isArray(data.drivers) ? data.drivers : [],
      radiusMeters: data.radiusMeters || radius,
      liveLocationReady: !!data.liveLocationReady,
    };
  },
);
