import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

/**
 * Live driver profile fetched from `GET /driver/profile`.
 *
 * The auth store persists the driver snapshot from login into localStorage,
 * but that copy is frozen the moment the driver signed in and drifts the
 * second any backend write happens (kit approved, training completed, new
 * vehicle added, etc).
 *
 * This store keeps the account page honest by re-fetching the canonical doc
 * — including `wallet`, `todaySummary`, `kitEligibility`, license, bank
 * details, and approval state. Other surfaces that need a single field can
 * still read from the auth store; this one is for "show me everything".
 */
export const useDriverProfileStore = createQueryStore(async () => {
  const res = await api.get('/driver/profile');
  return res.data?.data ?? null;
});
