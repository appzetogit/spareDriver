import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminTeamMemberAnalyticsStore = createQueryStore(
  async ({ memberId, from, to }) => {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const qs = params.toString();
    const res = await api.get(
      `/admin/team/${memberId}/analytics${qs ? `?${qs}` : ''}`,
    );
    return res.data?.data ?? null;
  },
);
