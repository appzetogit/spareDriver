import { create } from 'zustand';
import api from '../../utils/api';

/**
 * Realtime-ish emergency pool badge for admin sidebar.
 * Seeded once via GET /admin/emergency-pool/count; bumped on
 * ADMIN_ALERT (emergency_pool_entered) / BOOKING_UPDATED without polling.
 *
 * Prefer useAdminSidebarCountsStore for new work — it includes this
 * count plus SOS / support / drivers / kit-order badges.
 */
const useAdminEmergencyPoolStore = create((set, get) => ({
  count: 0,

  setCount(count) {
    set({ count: Math.max(0, Number(count) || 0) });
  },

  async fetchCount() {
    try {
      const res = await api.get('/admin/emergency-pool/count');
      const count = res?.data?.data?.count ?? 0;
      set({ count: Number(count) || 0 });
      return get().count;
    } catch {
      return get().count;
    }
  },

  /** Optimistic bump when a booking enters the pool over socket. */
  bump(delta = 1) {
    set({ count: Math.max(0, get().count + delta) });
  },

  /** Called after admin assigns a booking out of the pool. */
  decrement() {
    set({ count: Math.max(0, get().count - 1) });
  },
}));

export default useAdminEmergencyPoolStore;
