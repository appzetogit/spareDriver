import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

/**
 * Live driver profile fetched from `GET /driver/profile`.
 *
 * Auth store keeps a thin in-memory session snapshot from login/bootstrap.
 * This store re-fetches the canonical doc (wallet, kitEligibility, etc.)
 * for account surfaces that need the full profile.
 */
export const useDriverProfileStore = createQueryStore(async () => {
  const res = await api.get('/driver/profile');
  return res.data?.data ?? null;
});
