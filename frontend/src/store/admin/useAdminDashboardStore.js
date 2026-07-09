import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminDashboardStore = createQueryStore(async () => {
  const res = await api.get('/admin/dashboard');
  return res.data?.data ?? null;
});
