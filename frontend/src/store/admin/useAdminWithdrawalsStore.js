import { create } from 'zustand';
import api from '../../utils/api';

const initialState = {
  withdrawals: [],
  totals: { totalCount: 0, byStatus: {} },
  loading: false,
  updatingId: null,
  error: null,
  page: 1,
  limit: 20,
  total: 0,
  filters: { status: '', search: '' },
};

const useAdminWithdrawalsStore = create((set, get) => ({
  ...initialState,

  reset() {
    set(initialState);
  },

  setPage(page) {
    set({ page });
    return get().fetchWithdrawals();
  },

  setFilter(key, value) {
    const filters = { ...get().filters, [key]: value };
    set({ filters, page: 1 });
    return get().fetchWithdrawals();
  },

  async fetchWithdrawals() {
    set({ loading: true, error: null });
    try {
      const { page, limit, filters } = get();
      const res = await api.get('/admin/withdrawals', {
        params: {
          page,
          limit,
          status: filters.status || undefined,
          search: filters.search || undefined,
        },
      });
      const data = res?.data?.data || {};
      set({
        withdrawals: data.withdrawals || [],
        total: data.total || 0,
        totals: data.totals || initialState.totals,
        loading: false,
      });
      return data;
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to load withdrawals';
      set({ error: message, loading: false });
      throw err;
    }
  },

  async rejectWithdrawal(id, reason) {
    set({ updatingId: id });
    try {
      const res = await api.patch(`/admin/withdrawals/${id}/reject`, { reason });
      const updated = res?.data?.data?.withdrawal;
      if (updated) {
        set((s) => ({
          withdrawals: s.withdrawals.map((w) => (w._id === updated._id ? { ...w, ...updated } : w)),
        }));
        get().fetchWithdrawals();
      }
      return updated;
    } finally {
      set({ updatingId: null });
    }
  },

  async processWithdrawal(id, formData) {
    set({ updatingId: id });
    try {
      const res = await api.post(`/admin/withdrawals/${id}/process`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const updated = res?.data?.data?.withdrawal;
      if (updated) {
        set((s) => ({
          withdrawals: s.withdrawals.map((w) => (w._id === updated._id ? { ...w, ...updated } : w)),
        }));
        get().fetchWithdrawals();
      }
      return res?.data?.data;
    } finally {
      set({ updatingId: null });
    }
  },
}));

export default useAdminWithdrawalsStore;
