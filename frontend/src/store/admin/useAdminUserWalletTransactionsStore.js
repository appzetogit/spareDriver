import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminUserWalletTransactionsStore = createQueryStore(
  async ({ userId, page, limit, direction, source, from, to, search }) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (direction) params.append('direction', direction);
    if (source) params.append('source', source);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (search) params.append('search', search);

    const res = await api.get(`/admin/users/${userId}/wallet-transactions?${params.toString()}`);
    const payload = res.data?.data ?? {};
    return {
      user: payload.user ?? null,
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
