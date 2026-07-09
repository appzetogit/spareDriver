import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminDriverAnalyticsStore = createQueryStore(
  async ({ driverId, period, from, to, serviceType, status }) => {
    const params = new URLSearchParams();
    if (period) params.append('period', period);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (serviceType) params.append('serviceType', serviceType);
    if (status) params.append('status', status);

    const qs = params.toString();
    const res = await api.get(
      `/admin/drivers/${driverId}/analytics${qs ? `?${qs}` : ''}`,
    );
    return res.data?.data ?? null;
  },
);
