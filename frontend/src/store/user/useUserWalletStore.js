import { create } from 'zustand';
import api from '../../utils/api';

/**
 * User wallet store.
 *
 * Single source of truth for the customer's in-app wallet (balance,
 * lifetime credits/debits, paginated transaction history). Everything
 * is keyed off the authenticated user — no userId in the signatures
 * because the backend always reads `req.user._id`.
 *
 *   GET  /auth/wallet                → balance snapshot + limits
 *   GET  /auth/wallet/transactions    → paginated ledger
 *   POST /auth/wallet/topup           → Razorpay order
 *   POST /auth/wallet/topup/verify    → credit on signature OK
 *
 * Pages should call `fetchWallet` on mount and `refresh()` (or use the
 * value returned by mutators) afterwards — we don't poll.
 */

const EMPTY_WALLET = {
  balance: 0,
  // Portion of `balance` reserved against active bookings' waiting buffer.
  // Subtract this from `balance` to get the truly spendable amount.
  heldRupees: 0,
  availableRupees: 0,
  totalCredited: 0,
  totalSpent: 0,
  currency: 'INR',
};

/** In-flight dedupe across home / account / confirm concurrent mounts. */
let walletInflight = null;

// Normalise the server's wallet shape into a fully-defaulted object so
// every consumer (top-bar badge, confirm screen, wallet page) can rely
// on the held/available fields existing even on old API responses.
// Partial patches that omit `heldRupees` keep the previous hold so we
// never flash gross `balance` as spendable after a top-up.
const normaliseWallet = (wallet, prev = EMPTY_WALLET) => {
  const w = wallet || {};
  const balance = Number(w.balance) || 0;
  const heldRupees =
    w.heldRupees != null
      ? Number(w.heldRupees) || 0
      : Number(prev.heldRupees) || 0;
  const available =
    w.availableRupees != null
      ? Number(w.availableRupees) || 0
      : Math.max(0, Math.round((balance - heldRupees) * 100) / 100);
  return {
    balance,
    heldRupees,
    availableRupees: available,
    totalCredited:
      w.totalCredited != null
        ? Number(w.totalCredited) || 0
        : Number(prev.totalCredited) || 0,
    totalSpent:
      w.totalSpent != null
        ? Number(w.totalSpent) || 0
        : Number(prev.totalSpent) || 0,
    currency: w.currency || prev.currency || 'INR',
  };
};

const useUserWalletStore = create((set, get) => ({
  wallet: EMPTY_WALLET,
  limits: { MIN_TOPUP_RUPEES: 10, MAX_TOPUP_RUPEES: 100_000 },
  transactions: [],
  page: 1,
  hasMore: false,
  loading: false,
  fetched: false,
  topupLoading: false,
  error: null,

  /** Replace the wallet snapshot wholesale (used after a verified top-up). */
  applyWallet(wallet) {
    if (!wallet) return;
    set((state) => ({ wallet: normaliseWallet(wallet, state.wallet) }));
  },

  async fetchWallet({ force = false } = {}) {
    // Reuse a fresh snapshot — home, account, and confirm screens all call
    // this on mount; StrictMode + tab switches must not spam the API.
    if (!force && get().fetched && !get().loading) {
      return get().wallet;
    }
    if (walletInflight) return walletInflight;

    set({ loading: true, error: null });
    walletInflight = (async () => {
      try {
        const res = await api.get('/auth/wallet');
        const wallet = res?.data?.data?.wallet || EMPTY_WALLET;
        const limits = res?.data?.data?.limits || get().limits;
        set((state) => ({
          wallet: normaliseWallet(wallet, state.wallet),
          limits,
          loading: false,
          fetched: true,
        }));
        return wallet;
      } catch (err) {
        const message =
          err?.response?.data?.message || err?.message || 'Failed to load wallet';
        set({ loading: false, error: message });
        throw err;
      } finally {
        walletInflight = null;
      }
    })();

    return walletInflight;
  },

  async fetchTransactions({ page = 1, limit = 20, append = false } = {}) {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/auth/wallet/transactions', {
        params: { page, limit },
      });
      const data = res?.data?.data || {};
      const next = Array.isArray(data.transactions) ? data.transactions : [];
      set((state) => ({
        transactions: append ? [...state.transactions, ...next] : next,
        page,
        hasMore: next.length === limit && page * limit < (data.total || 0),
        loading: false,
      }));
      return data;
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to load transactions';
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Kick off a Razorpay top-up order for `amount` rupees. Returns the
   * `{ keyId, orderId, amount, currency, name, description, prefill }`
   * shape the Razorpay checkout helper expects.
   */
  async createTopupOrder(amount) {
    set({ topupLoading: true, error: null });
    try {
      const res = await api.post('/auth/wallet/topup', { amount });
      const order = res?.data?.data?.razorpay || null;
      set({ topupLoading: false });
      return order;
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to start top-up';
      set({ topupLoading: false, error: message });
      throw err;
    }
  },

  /**
   * Verify a Razorpay payment signature. On success the server credits
   * the wallet atomically and returns the fresh balance + the matching
   * transaction row — we mirror both into local state so the UI updates
   * without a follow-up GET.
   */
  async verifyTopup({ orderId, paymentId, signature }) {
    set({ topupLoading: true, error: null });
    try {
      const res = await api.post('/auth/wallet/topup/verify', {
        orderId,
        paymentId,
        signature,
      });
      const data = res?.data?.data || {};
      if (data.wallet) get().applyWallet(data.wallet);
      if (data.transaction) {
        set((state) => ({
          transactions: [data.transaction, ...state.transactions],
        }));
      }
      set({ topupLoading: false });
      return data;
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Top-up verification failed';
      set({ topupLoading: false, error: message });
      throw err;
    }
  },

  reset() {
    set({
      wallet: EMPTY_WALLET,
      transactions: [],
      page: 1,
      hasMore: false,
      loading: false,
      fetched: false,
      topupLoading: false,
      error: null,
    });
  },
}));

export default useUserWalletStore;
