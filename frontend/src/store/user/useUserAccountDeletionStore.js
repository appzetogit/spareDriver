import { create } from 'zustand';
import api from '../../utils/api';

const useUserAccountDeletionStore = create((set) => ({
  request: null,
  loading: false,
  submitting: false,

  async fetchRequest() {
    set({ loading: true });
    try {
      const res = await api.get('/auth/account/deletion-request');
      const request = res?.data?.data?.request || null;
      set({ request, loading: false });
      return request;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  async submitRequest({ reason }) {
    set({ submitting: true });
    try {
      const res = await api.post('/auth/account/deletion-request', { reason });
      const request = res?.data?.data?.request || null;
      set({ request, submitting: false });
      return request;
    } catch (err) {
      set({ submitting: false });
      throw err;
    }
  },
}));

export default useUserAccountDeletionStore;
