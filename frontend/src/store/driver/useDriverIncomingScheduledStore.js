import { create } from 'zustand';
import api from '../../utils/api';
import { BOOKING_TYPE } from '../../constants/bookingStatus';

/**
 * Open scheduled inbox requests for the signed-in driver.
 *
 * Unlike `useDriverIncomingOfferStore` (one timed instant offer), this
 * holds a multi-item list with a badge count. Sources:
 *   - GET /driver/bookings/incoming-scheduled (+ /count)
 *   - Socket BOOKING_OFFERED with bookingType=scheduled / inbox=true
 *   - Socket BOOKING_OFFER_WITHDRAWN / BOOKING_UPDATED
 */

function isScheduledInboxOffer(payload) {
  if (!payload?.bookingId && !payload?.subscriptionId) return false;
  if (
    payload.inbox === true
    || payload.inbox === '1'
    || payload.inbox === 'true'
    || payload.kind === 'inbox_offer'
  ) {
    return true;
  }
  if (payload.kind === 'subscription' || payload.bookingType === 'subscription') {
    return true;
  }
  if (
    (payload.bookingType === BOOKING_TYPE.SCHEDULED
      || payload.bookingType === BOOKING_TYPE.OUTSTATION)
    && !payload.offerExpiresAt
  ) {
    return true;
  }
  return (
    payload.bookingType === BOOKING_TYPE.SCHEDULED
    || payload.bookingType === BOOKING_TYPE.OUTSTATION
  );
}

const useDriverIncomingScheduledStore = create((set, get) => ({
  requests: [],
  count: 0,
  loading: false,
  error: null,
  busyId: null,

  setCount(count) {
    set({ count: Math.max(0, Number(count) || 0) });
  },

  async fetchCount() {
    try {
      const res = await api.get('/driver/bookings/incoming-scheduled/count');
      const count = res?.data?.data?.count ?? 0;
      set({ count: Number(count) || 0 });
      return get().count;
    } catch {
      return get().count;
    }
  },

  async fetchList() {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/driver/bookings/incoming-scheduled');
      const data = res?.data?.data || {};
      const requests = Array.isArray(data.requests) ? data.requests : [];
      const count = data.count != null ? Number(data.count) : requests.length;
      set({ requests, count, loading: false });
      return { requests, count };
    } catch (err) {
      set({
        loading: false,
        error: err?.response?.data?.message || err.message || 'Failed to load',
      });
      throw err;
    }
  },

  /** Upsert a socket-broadcast inbox request into the local list. */
  upsertFromOffer(payload) {
    if (!isScheduledInboxOffer(payload)) return false;
    const key = payload.subscriptionId
      ? `sub:${payload.subscriptionId}`
      : String(payload.bookingId);
    const prev = get().requests;
    const idx = prev.findIndex((r) => {
      if (payload.subscriptionId) {
        return String(r.subscriptionId) === String(payload.subscriptionId);
      }
      return String(r.bookingId) === String(payload.bookingId) && !r.subscriptionId;
    });
    let next;
    if (idx >= 0) {
      next = [...prev];
      next[idx] = { ...next[idx], ...payload, _inboxKey: key };
    } else {
      next = [{ ...payload, _inboxKey: key }, ...prev];
    }
    set({ requests: next, count: next.length });
    return true;
  },

  removeByBookingId(bookingId, { reason } = {}) {
    if (!bookingId) return;
    const id = String(bookingId);
    const next = get().requests.filter(
      (r) => String(r.bookingId) !== id && String(r.subscriptionId) !== id,
    );
    if (next.length === get().requests.length) {
      // Still refresh count in case list wasn't hydrated yet.
      if (reason) get().fetchCount().catch(() => {});
      return;
    }
    set({ requests: next, count: next.length });
  },

  async accept(bookingId, { subscriptionId } = {}) {
    const id = String(subscriptionId || bookingId);
    set({ busyId: id, error: null });
    try {
      if (subscriptionId) {
        await api.post(`/driver/subscriptions/${subscriptionId}/accept`);
        get().removeByBookingId(subscriptionId);
        set({ busyId: null });
        return { kind: 'subscription', subscriptionId };
      }
      await api.post(`/driver/bookings/${id}/accept`);
      get().removeByBookingId(id);
      const activeRes = await api.get('/driver/bookings/active');
      const booking = activeRes?.data?.data?.booking || null;
      set({ busyId: null });
      return booking;
    } catch (err) {
      set({
        busyId: null,
        error: err?.response?.data?.message || err.message || 'Accept failed',
      });
      // Stale offer — drop it.
      if (err?.response?.status === 409) {
        get().removeByBookingId(id);
      }
      throw err;
    }
  },

  async reject(bookingId, { subscriptionId } = {}) {
    const id = String(subscriptionId || bookingId);
    set({ busyId: id, error: null });
    try {
      if (subscriptionId) {
        await api.post(`/driver/subscriptions/${subscriptionId}/reject`);
      } else {
        await api.post(`/driver/bookings/${id}/reject`);
      }
      get().removeByBookingId(id);
      set({ busyId: null });
      return true;
    } catch (err) {
      set({
        busyId: null,
        error: err?.response?.data?.message || err.message || 'Reject failed',
      });
      if (err?.response?.status === 409) {
        get().removeByBookingId(id);
      }
      throw err;
    }
  },
}));

export { isScheduledInboxOffer };
export default useDriverIncomingScheduledStore;
