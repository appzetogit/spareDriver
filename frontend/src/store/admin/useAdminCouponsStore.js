import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminCouponsStore = createQueryStore(async () => {
  const res = await api.get('/admin/coupons');
  return res.data?.data ?? [];
});
