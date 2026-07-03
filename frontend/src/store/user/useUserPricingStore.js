import { create } from 'zustand';
import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

/** Active service-pricing rows visible to the booking flow. */
export const useUserServicePricingsStore = createQueryStore(async () => {
  const res = await api.get('/auth/pricing/services');
  return res.data?.data ?? [];
});

/** Active subscription plans shown on the home banner + subscriptions page. */
export const useUserSubscriptionPlansStore = createQueryStore(async () => {
  const res = await api.get('/auth/pricing/subscriptions');
  return res.data?.data ?? [];
});

export const useUserSubscriptionStore = create((set, get) => ({
  mySubscriptions: [],
  mySubscription: null,
  loading: false,
  purchaseLoading: false,
  subscriptionTerms: null,
  termsLoading: false,

  async fetchSubscriptionTerms() {
    set({ termsLoading: true });
    try {
      const res = await api.get('/auth/legal/subscription-terms');
      const subscriptionTerms = res?.data?.data || null;
      set({ subscriptionTerms, termsLoading: false });
      return subscriptionTerms;
    } catch (err) {
      set({ termsLoading: false });
      throw err;
    }
  },

  async fetchMySubscription() {
    set({ loading: true });
    try {
      const res = await api.get('/auth/subscriptions/me');
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      set({
        mySubscriptions: list,
        mySubscription: list[0] || null,
        loading: false,
      });
      return list;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  async createPurchaseOrder(planId, zoneId, carId, { termsAccepted = false, dailyPickup, dailyDropoff, couponCode } = {}) {
    set({ purchaseLoading: true });
    try {
      const res = await api.post('/auth/subscriptions/purchase', {
        planId,
        zoneId,
        carId,
        termsAccepted,
        dailyPickup,
        dailyDropoff,
        couponCode: couponCode || undefined,
      });
      const order = res?.data?.data || null;
      set({ purchaseLoading: false });
      return order;
    } catch (err) {
      set({ purchaseLoading: false });
      throw err;
    }
  },

  async verifyPurchase({ orderId, paymentId, signature }) {
    set({ purchaseLoading: true });
    try {
      const res = await api.post('/auth/subscriptions/verify-payment', {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });
      const data = res?.data?.data || {};
      if (data.subscription) {
        const prev = get().mySubscriptions || [];
        const next = [
          data.subscription,
          ...prev.filter((s) => String(s._id) !== String(data.subscription._id)),
        ];
        set({
          mySubscriptions: next,
          mySubscription: next[0] || data.subscription,
          purchaseLoading: false,
        });
      } else {
        await get().fetchMySubscription();
        set({ purchaseLoading: false });
      }
      return data;
    } catch (err) {
      set({ purchaseLoading: false });
      throw err;
    }
  },
}));
