import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminDriverWithdrawalsStore = createQueryStore(
  async ({ driverId, page, limit, status, from, to }) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (status) params.append('status', status);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    const res = await api.get(`/admin/drivers/${driverId}/withdrawals?${params.toString()}`);
    const payload = res.data?.data ?? {};
    return {
      driver: payload.driver ?? null,
      items: payload.items ?? [],
      pagination: {
        total: payload.total || 0,
        pages: payload.pages || 1,
        page: payload.page || 1,
        limit: payload.limit || 10,
      },
    };
  },
);
