import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminDriverTripsStore = createQueryStore(
  async ({ driverId, page, limit, search, status, serviceType, from, to }) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    if (serviceType) params.append('serviceType', serviceType);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    const res = await api.get(`/admin/drivers/${driverId}/trips?${params.toString()}`);
    const payload = res.data?.data ?? {};
    return {
      driver: payload.driver ?? null,
      items: payload.items ?? [],
      pagination: {
        total: payload.total || 0,
        pages: payload.pages || 1,
        page: payload.page || 1,
        limit: payload.limit || 15,
      },
    };
  },
);
