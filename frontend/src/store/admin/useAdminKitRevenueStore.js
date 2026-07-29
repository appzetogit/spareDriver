import { create } from 'zustand';
import api from '../../utils/api';

/**
 * Admin "Account → Kit Revenue" store.
 *
 * Backend: GET /admin/kit-revenue
 * Filters: search, adminStatus, fulfillmentStatus, paymentStatus, from, to
 */

const initialState = {
  rows: [],
  totals: {
    totalAmount: 0,
    paidCount: 0,
    refundedAmount: 0,
    refundedCount: 0,
    netAmount: 0,
    totalCount: 0,
    byAdminStatus: {},
  },
  loading: false,
  error: null,
  page: 1,
  limit: 20,
  total: 0,
  filters: {
    search: '',
    adminStatus: '',
    fulfillmentStatus: '',
    paymentStatus: '',
    from: '',
    to: '',
  },
};

const useAdminKitRevenueStore = create((set, get) => ({
  ...initialState,

  reset() {
    set(initialState);
  },

  setPage(page) {
    set({ page });
    return get().fetchRevenue();
  },

  setFilter(key, value) {
    const filters = { ...get().filters, [key]: value };
    set({ filters, page: 1 });
    return get().fetchRevenue();
  },

  async fetchRevenue() {
    set({ loading: true, error: null });
    try {
      const { page, limit, filters } = get();
      const res = await api.get('/admin/kit-revenue', {
        params: {
          page,
          limit,
          search: filters.search || undefined,
          adminStatus: filters.adminStatus || undefined,
          fulfillmentStatus: filters.fulfillmentStatus || undefined,
          paymentStatus: filters.paymentStatus || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
        },
      });
      const data = res?.data?.data || {};
      set({
        rows: data.rows || [],
        total: data.total || 0,
        totals: data.totals || initialState.totals,
        loading: false,
      });
      return data;
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to load kit revenue';
      set({ error: message, loading: false });
      throw err;
    }
  },
}));

export default useAdminKitRevenueStore;
