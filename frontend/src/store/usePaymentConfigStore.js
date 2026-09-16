import { create } from 'zustand';
import api from '../utils/api';

/**
 * Which payment rails the platform currently offers.
 *
 * Read from the public `GET /common/payment-methods` endpoint and shared
 * by the user app, the driver app and the landing pages — every Razorpay
 * entry point checks this before rendering, so an admin can hide the
 * rail entirely (for an App Store review) without a redeploy.
 *
 * The defaults below are what we assume BEFORE the fetch resolves. They
 * deliberately mirror the server defaults (Razorpay on, COD off) so a
 * slow network shows the normal app rather than briefly flashing a
 * cash-only UI at every user.
 *
 * Enforcement is server-side regardless — this store only decides what
 * to draw.
 */
const DEFAULT_CONFIG = Object.freeze({
  razorpayEnabled: true,
  codEnabled: false,
  walletTopupEnabled: true,
  booking: { wallet: true, razorpay: true, cod: false },
  subscriptionCheckout: { razorpay: true, cod: false },
  driverKit: { razorpay: true, cod: false },
  cod: {
    serviceTypes: ['hourly'],
    allowInstant: true,
    allowScheduled: true,
    maxBookingValueRupees: 0,
  },
  duesSettlement: { razorpay: true, adminManual: true },
});

const usePaymentConfigStore = create((set, get) => ({
  config: DEFAULT_CONFIG,
  loading: false,
  isFetched: false,
  error: null,

  /**
   * Fetch once per session unless `force` is passed. Callers can fire
   * this freely on mount — repeat calls after the first are a no-op.
   */
  async fetchConfig({ force = false } = {}) {
    if (!force && (get().isFetched || get().loading)) return get().config;
    set({ loading: true, error: null });
    try {
      const res = await api.get('/common/payment-methods');
      const data = res?.data?.data;
      // Merge onto the defaults so a server that predates a newly added
      // flag still yields a fully-shaped config instead of undefined.
      const config = data ? { ...DEFAULT_CONFIG, ...data } : DEFAULT_CONFIG;
      set({ config, loading: false, isFetched: true });
      return config;
    } catch (err) {
      // Keep the last-known (or default) config — a failed fetch must
      // not lock users out of paying.
      set({
        loading: false,
        isFetched: true,
        error: err?.response?.data?.message || err?.message || 'Could not load payment config',
      });
      return get().config;
    }
  },
}));

export default usePaymentConfigStore;

/* ------------------------------------------------------------------ */
/* Selectors — keep the `config.a.b` shape out of components           */
/* ------------------------------------------------------------------ */

export const selectRazorpayEnabled = (s) => Boolean(s.config.razorpayEnabled);
export const selectWalletTopupEnabled = (s) => Boolean(s.config.walletTopupEnabled);
export const selectBookingCodEnabled = (s) => Boolean(s.config.booking?.cod);
export const selectBookingRazorpayEnabled = (s) => Boolean(s.config.booking?.razorpay);
export const selectSubscriptionRails = (s) => s.config.subscriptionCheckout || {};
export const selectDriverKitRails = (s) => s.config.driverKit || {};
export const selectCodPolicy = (s) => s.config.cod || {};
