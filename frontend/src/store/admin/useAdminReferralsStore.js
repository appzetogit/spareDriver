import { createQueryStore } from '../lib/createQueryStore';
import api from '../../utils/api';

export const useAdminReferralsStore = createQueryStore(async (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') qs.set(key, String(val));
  });
  const res = await api.get(`/admin/referrals?${qs.toString()}`);
  const payload = res.data?.data || res.data;
  return {
    referrals: payload?.referrals || [],
    pagination: payload?.pagination || { total: 0, pages: 1 },
    stats: payload?.stats || {},
  };
});
