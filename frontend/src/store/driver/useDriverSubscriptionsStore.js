import { create } from 'zustand';
import api from '../../utils/api';

/**
 * Dedicated-driver subscriptions assigned to the signed-in driver.
 */
const useDriverSubscriptionsStore = create((set, get) => ({
  subscriptions: [],
  count: 0,
  loading: false,
  error: null,
  detail: null,
  detailLoading: false,
  detailError: null,

  async fetchAssigned() {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/driver/subscriptions');
      const data = res?.data?.data || {};
      const subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];
      const count = data.count != null ? Number(data.count) : subscriptions.length;
      set({ subscriptions, count, loading: false });
      return { subscriptions, count };
    } catch (err) {
      set({
        loading: false,
        error: err?.response?.data?.message || err.message || 'Failed to load',
      });
      throw err;
    }
  },

  async fetchDetail(subscriptionId) {
    if (!subscriptionId) return null;
    set({ detailLoading: true, detailError: null });
    try {
      const res = await api.get(`/driver/subscriptions/${subscriptionId}`);
      const subscription = res?.data?.data?.subscription || null;
      set({ detail: subscription, detailLoading: false });
      return subscription;
    } catch (err) {
      set({
        detail: null,
        detailLoading: false,
        detailError: err?.response?.data?.message || err.message || 'Failed to load',
      });
      throw err;
    }
  },

  clearDetail() {
    set({ detail: null, detailError: null, detailLoading: false });
  },
}));

export default useDriverSubscriptionsStore;
