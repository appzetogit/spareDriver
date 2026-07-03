import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminUserSubscriptionsStore = createQueryStore(
  async ({ userId, page, limit, search, status, from, to }) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    const res = await api.get(`/admin/users/${userId}/subscriptions?${params.toString()}`);
    const payload = res.data?.data ?? {};
    return {
      user: payload.user ?? null,
      items: payload.items ?? [],
      stats: payload.stats ?? {
        total: 0,
        active: 0,
        pendingPayment: 0,
        expired: 0,
        cancelled: 0,
      },
      pagination: {
        total: payload.total || 0,
        pages: payload.pages || 1,
        page: payload.page || 1,
        limit: payload.limit || 15,
      },
    };
  },
);
