import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';
import { buildReportQueryString } from './reportQueryHelpers';

export const useAdminReportsOverviewStore = createQueryStore(async (params) => {
  const qs = buildReportQueryString(params);
  const res = await api.get(`/admin/reports/overview${qs ? `?${qs}` : ''}`);
  return res.data?.data ?? null;
});
