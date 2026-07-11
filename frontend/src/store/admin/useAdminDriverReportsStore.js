import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';
import { buildReportQueryString } from './reportQueryHelpers';

export const useAdminDriverReportsStore = createQueryStore(async (params) => {
  const qs = buildReportQueryString(params);
  const res = await api.get(`/admin/reports/drivers${qs ? `?${qs}` : ''}`);
  return res.data?.data ?? null;
});
