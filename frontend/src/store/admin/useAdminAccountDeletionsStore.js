import { create } from 'zustand';
import api from '../../utils/api';

const initialState = {
  requests: [],
  loading: false,
  updatingId: null,
  error: null,
  page: 1,
  limit: 20,
  total: 0,
  filters: { status: '', subjectType: '', search: '' },
};

const useAdminAccountDeletionsStore = create((set, get) => ({
  ...initialState,

  reset() {
    set(initialState);
  },

  setPage(page) {
    set({ page });
    return get().fetchRequests();
  },

  setFilter(key, value) {
    const filters = { ...get().filters, [key]: value };
    set({ filters, page: 1 });
    return get().fetchRequests();
  },

  async fetchRequests() {
    set({ loading: true, error: null });
    try {
      const { page, limit, filters } = get();
      const res = await api.get('/admin/account-deletions', {
        params: {
          page,
          limit,
          status: filters.status || undefined,
          subjectType: filters.subjectType || undefined,
          search: filters.search || undefined,
        },
      });
      const data = res?.data?.data || {};
      set({
        requests: data.requests || [],
        total: data.total || 0,
        loading: false,
      });
      return data;
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to load account deletions';
      set({ error: message, loading: false });
      throw err;
    }
  },

  async markInProgress(id) {
    set({ updatingId: id });
    try {
      const res = await api.patch(`/admin/account-deletions/${id}/in-progress`);
      get().fetchRequests();
      return res?.data?.data?.request;
    } finally {
      set({ updatingId: null });
    }
  },

  async rejectRequest(id, payload) {
    set({ updatingId: id });
    try {
      const res = await api.patch(`/admin/account-deletions/${id}/reject`, payload);
      get().fetchRequests();
      return res?.data?.data?.request;
    } finally {
      set({ updatingId: null });
    }
  },

  async completeRequest(id, payload = {}) {
    set({ updatingId: id });
    try {
      const res = await api.post(`/admin/account-deletions/${id}/complete`, payload);
      get().fetchRequests();
      return res?.data?.data?.request;
    } finally {
      set({ updatingId: null });
    }
  },

  async fetchBlockers(id) {
    const res = await api.get(`/admin/account-deletions/${id}/blockers`);
    return res?.data?.data || { blockers: [], canDelete: false };
  },

  async settleUserWallet(id, payload) {
    set({ updatingId: id });
    try {
      const res = await api.post(`/admin/account-deletions/${id}/settle-wallet`, payload);
      return res?.data?.data;
    } finally {
      set({ updatingId: null });
    }
  },
}));

export default useAdminAccountDeletionsStore;
