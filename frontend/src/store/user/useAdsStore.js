import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

/** Active promotional ads for the user home / trip screens. */
export const useAdsStore = createQueryStore(async () => {
  const res = await api.get('/common/ads');
  return Array.isArray(res?.data?.data) ? res.data.data : [];
});
