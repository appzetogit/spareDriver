import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';
import { buildReportQueryString } from './reportQueryHelpers';

export const useAdminRevenueReportsStore = createQueryStore(async (params) => {
  const qs = buildReportQueryString(params);
  const res = await api.get(`/admin/reports/revenue${qs ? `?${qs}` : ''}`);
  return res.data?.data ?? null;
});
