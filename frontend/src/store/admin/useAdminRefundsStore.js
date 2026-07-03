import { create } from 'zustand';
import api from '../../utils/api';

/**
 * Admin "Account → Refunds" store.
 *
 * Backend endpoints:
 *   GET   /admin/refunds       (server-paginated list, filters)
 *   PATCH /admin/refunds/:id   (mark a refund processed / failed; the
 *                               admin moves the money on Razorpay
 *                               manually and PATCHes the result back)
 *
 * Pagination + filters live in the store so a follow-up navigation
 * preserves the admin's last-used view without us threading state
 * through React Router.
 */

const initialState = {
  refunds: [],
  totals: { totalAmount: 0, totalCount: 0, byStatus: {} },
  loading: false,
  updatingId: null,
  creatingRefund: false,
  error: null,
  // Pagination + filters
  page: 1,
  limit: 20,
  total: 0,
  filters: {
    status: '',
    search: '',
    from: '',
    to: '',
  },
};

const useAdminRefundsStore = create((set, get) => ({
  ...initialState,

  /** Reset to defaults (used on logout / unmount). */
  reset() {
    set(initialState);
  },

  setPage(page) {
    set({ page });
    return get().fetchRefunds();
  },

  setFilter(key, value) {
    const filters = { ...get().filters, [key]: value };
    set({ filters, page: 1 });
    return get().fetchRefunds();
  },

  async fetchRefunds() {
    set({ loading: true, error: null });
    try {
      const { page, limit, filters } = get();
      const res = await api.get('/admin/refunds', {
        params: {
          page,
          limit,
          status: filters.status || undefined,
          search: filters.search || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
        },
      });
      const data = res?.data?.data || {};
      set({
        refunds: data.refunds || [],
        total: data.total || 0,
        totals: data.totals || initialState.totals,
        loading: false,
      });
      return data;
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to load refunds';
      set({ error: message, loading: false });
      throw err;
    }
  },

  /**
   * Mark a refund as `processed` (admin moved money on Razorpay) or
   * `failed` (admin couldn't process it).
   *
   *   @param refundId
   *   @param payload  { status, razorpayRefundId?, error? }
   */
  async updateRefundStatus(refundId, payload) {
    set({ updatingId: refundId });
    try {
      const res = await api.patch(`/admin/refunds/${refundId}`, payload);
      const updated = res?.data?.data?.refund;
      if (updated) {
        set((s) => ({
          refunds: s.refunds.map((r) => (r._id === updated._id ? updated : r)),
        }));
        // Re-fetch totals — the aggregate cards on the top of the page
        // shift whenever a refund flips state.
        get().fetchRefunds();
      }
      return updated;
    } finally {
      set({ updatingId: null });
    }
  },

  async fetchSubjectWallet(subjectType, subjectId) {
    const res = await api.get(`/admin/refunds/subject-wallet/${subjectType}/${subjectId}`);
    return res?.data?.data;
  },

  async createManualRefund(payload) {
    set({ creatingRefund: true });
    try {
      const res = await api.post('/admin/refunds/manual', payload);
      const data = res?.data?.data;
      await get().fetchRefunds();
      return data;
    } finally {
      set({ creatingRefund: false });
    }
  },
}));

export default useAdminRefundsStore;
