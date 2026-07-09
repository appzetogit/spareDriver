import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminUserAnalyticsStore = createQueryStore(
  async ({ userId, period, from, to, serviceType, status, subscriptionStatus }) => {
    const params = new URLSearchParams();
    if (period) params.append('period', period);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (serviceType) params.append('serviceType', serviceType);
    if (status) params.append('status', status);
    if (subscriptionStatus) params.append('subscriptionStatus', subscriptionStatus);

    const qs = params.toString();
    const res = await api.get(
      `/admin/users/${userId}/analytics${qs ? `?${qs}` : ''}`,
    );
    return res.data?.data ?? null;
  },
);
