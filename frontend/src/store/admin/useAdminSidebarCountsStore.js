import { create } from 'zustand';
import api from '../../utils/api';

const EMPTY = {
  emergencyPool: 0,
  pendingDrivers: 0,
  pendingKitOrders: 0,
  activeSos: 0,
  openSupportTickets: 0,
};

/**
 * Badge counts for the admin sidebar.
 * Seeded via GET /admin/sidebar-counts; refreshed on ADMIN_ALERT /
 * BOOKING_UPDATED without polling.
 */
const useAdminSidebarCountsStore = create((set, get) => ({
  ...EMPTY,

  setCounts( partial = {}) {
    const next = { ...get() };
    for (const key of Object.keys(EMPTY)) {
      if (partial[key] !== undefined) {
        next[key] = Math.max(0, Number(partial[key]) || 0);
      }
    }
    set(next);
  },

  reset() {
    set({ ...EMPTY });
  },

  async fetchCounts() {
    try {
      const res = await api.get('/admin/sidebar-counts');
      const data = res?.data?.data || {};
      set({
        emergencyPool: Number(data.emergencyPool) || 0,
        pendingDrivers: Number(data.pendingDrivers) || 0,
        pendingKitOrders: Number(data.pendingKitOrders) || 0,
        activeSos: Number(data.activeSos) || 0,
        openSupportTickets: Number(data.openSupportTickets) || 0,
      });
      return get();
    } catch {
      return get();
    }
  },

  bump(key, delta = 1) {
    if (!(key in EMPTY)) return;
    set({ [key]: Math.max(0, (get()[key] || 0) + delta) });
  },
}));

export default useAdminSidebarCountsStore;
