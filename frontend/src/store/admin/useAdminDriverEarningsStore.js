import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminDriverEarningsStore = createQueryStore(
  async ({ driverId, page, limit }) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    const res = await api.get(`/admin/drivers/${driverId}/earnings?${params.toString()}`);
    const payload = res.data?.data ?? {};
    return {
      items: payload.items ?? [],
      totals: payload.totals ?? {},
      pagination: {
        total: payload.total || 0,
        pages: payload.pages || 1,
        page: payload.page || 1,
        limit: payload.limit || 10,
      },
    };
  },
);
