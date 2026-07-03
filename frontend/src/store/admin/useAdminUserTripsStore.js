import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminUserTripsStore = createQueryStore(
  async ({
    userId,
    page,
    limit,
    search,
    status,
    serviceType,
    bookingType,
    paymentStatus,
    from,
    to,
  }) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    if (serviceType) params.append('serviceType', serviceType);
    if (bookingType) params.append('bookingType', bookingType);
    if (paymentStatus) params.append('paymentStatus', paymentStatus);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    const res = await api.get(`/admin/users/${userId}/trips?${params.toString()}`);
    const payload = res.data?.data ?? {};
    return {
      user: payload.user ?? null,
      items: payload.items ?? [],
      stats: payload.stats ?? { total: 0, active: 0, completed: 0, cancelled: 0, searching: 0 },
      pagination: {
        total: payload.total || 0,
        pages: payload.pages || 1,
        page: payload.page || 1,
        limit: payload.limit || 15,
      },
    };
  },
);
