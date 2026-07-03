import { create } from 'zustand';
import api from '../../utils/api';

const useDriverAccountDeletionStore = create((set) => ({
  request: null,
  loading: false,
  submitting: false,

  async fetchRequest() {
    set({ loading: true });
    try {
      const res = await api.get('/driver/account/deletion-request');
      const request = res?.data?.data?.request || null;
      set({ request, loading: false });
      return request;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  async submitRequest({ reason, withdrawAmount, qrFile }) {
    set({ submitting: true });
    try {
      const formData = new FormData();
      formData.append('reason', reason);
      if (withdrawAmount != null) formData.append('withdrawAmount', String(withdrawAmount));
      if (qrFile) formData.append('qrImage', qrFile);

      const res = await api.post('/driver/account/deletion-request', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res?.data?.data || {};
      set({ request: data.request || null, submitting: false });
      return data;
    } catch (err) {
      set({ submitting: false });
      throw err;
    }
  },
}));

export default useDriverAccountDeletionStore;
