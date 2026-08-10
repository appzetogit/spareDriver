import { create } from 'zustand';
import api from '../../utils/api';

const initialState = {
  transactions: [],
  totals: { totalAmount: 0, totalCount: 0, byStatus: {} },
  loading: false,
  error: null,
  page: 1,
  limit: 20,
  total: 0,
  filters: {
    status: '',
    purpose: '',
    subjectType: '',
    search: '',
    from: '',
    to: '',
  },
};

const useAdminOnlineTransactionsStore = create((set, get) => ({
  ...initialState,

  reset() {
    set(initialState);
  },

  setPage(page) {
    set({ page });
    return get().fetchTransactions();
  },

  setFilter(key, value) {
    const filters = { ...get().filters, [key]: value };
    set({ filters, page: 1 });
    return get().fetchTransactions();
  },

  async fetchTransactions() {
    set({ loading: true, error: null });
    try {
      const { page, limit, filters } = get();
      const res = await api.get('/admin/online-transactions', {
        params: {
          page,
          limit,
          status: filters.status || undefined,
          purpose: filters.purpose || undefined,
          subjectType: filters.subjectType || undefined,
          search: filters.search || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
        },
      });
      const data = res?.data?.data || {};
      set({
        transactions: data.transactions || [],
        total: data.total || 0,
        totals: data.totals || initialState.totals,
        loading: false,
      });
      return data;
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to load transactions';
      set({ error: message, loading: false });
      throw err;
    }
  },
}));

export default useAdminOnlineTransactionsStore;
