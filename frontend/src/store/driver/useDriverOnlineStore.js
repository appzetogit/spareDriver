import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';
import { buildCacheKey } from '../lib/buildCacheKey';

/**
 * Namespace for the driver's online/eligibility status.
 *
 * `invalidate()` matches on prefix, so passing this clears every entry in the
 * namespace whatever params they were fetched with.
 */
export const DRIVER_ONLINE_NAMESPACE = 'driver-online-status';

/**
 * The one cache key this status is ever stored under.
 *
 * It exists because it was previously written two different ways: the home
 * page used `buildCacheKey('driver-online-status', {})` — which appends a
 * serialised param object — while `DriverLocationBridge` and the toggle hook
 * used the bare namespace. `fetch` and `refresh` match the key exactly, so
 * those were two independent cache entries fed by two independent requests.
 *
 * The consequences were not cosmetic. `refreshStatus()` returned an entry the
 * UI never rendered, every mount and resume made the same call twice, and the
 * tracking bridge could believe the driver was offline while the screen showed
 * them online. Anything reading this status must import this constant.
 */
export const DRIVER_ONLINE_CACHE_KEY = buildCacheKey(DRIVER_ONLINE_NAMESPACE, {});

export const useDriverOnlineStore = createQueryStore(async () => {
  const res = await api.get('/driver/online/status');
  return res.data?.data ?? null;
});
