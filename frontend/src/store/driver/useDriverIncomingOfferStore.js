import { create } from 'zustand';
import api from '../../utils/api';

/**
 * Tracks the single in-flight booking offer a driver may currently hold.
 *
 * The dispatcher only ever offers ONE booking at a time to a driver, so we
 * keep the state as a flat object rather than a queue.
 *
 * Drives `BookingOfferModal` which is mounted globally inside the driver
 * dashboard layout so the prompt appears regardless of which page the
 * driver was on when the offer landed.
 *
 * Sources that may call `hydrateOffer`:
 *   - Socket BOOKING_OFFERED
 *   - FCM foreground / service-worker click
 *   - GET /driver/bookings/pending-offer on resume
 */

let expiryTimer = null;

function clearExpiryTimer() {
  if (expiryTimer != null) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}

function isOfferExpired(offer) {
  if (!offer?.offerExpiresAt) return false;
  const ms = new Date(offer.offerExpiresAt).getTime();
  return Number.isFinite(ms) && ms <= Date.now();
}

function scheduleExpiry(offer, clearOffer) {
  clearExpiryTimer();
  if (!offer?.offerExpiresAt) return;
  const ms = new Date(offer.offerExpiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return;
  if (ms <= 0) {
    clearOffer();
    return;
  }
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    const current = useDriverIncomingOfferStore.getState().offer;
    if (current?.bookingId === offer.bookingId) {
      clearOffer();
    }
  }, ms + 50);
}

const useDriverIncomingOfferStore = create((set, get) => ({
  offer: null,
  /** Tracks both accept and reject so the modal can show a loading state. */
  busy: null,
  error: null,
  /** The driver's currently assigned booking once they accept. */
  activeBooking: null,

  setOffer(offer) {
    get().hydrateOffer(offer);
  },

  /**
   * Idempotent offer ingest. Returns true when an offer is now showing.
   */
  hydrateOffer(offer) {
    if (!offer?.bookingId) return false;
    if (isOfferExpired(offer)) {
      get().clearOffer();
      return false;
    }

    const current = get().offer;
    const next =
      current?.bookingId === String(offer.bookingId)
        ? { ...current, ...offer, bookingId: String(offer.bookingId) }
        : { ...offer, bookingId: String(offer.bookingId) };

    set({ offer: next, error: null });
    scheduleExpiry(next, () => get().clearOffer());
    return true;
  },

  clearOffer() {
    clearExpiryTimer();
    set({ offer: null, busy: null, error: null });
  },

  /** Drop the offer if wall-clock says it expired (e.g. after tab freeze). */
  syncExpiry() {
    const offer = get().offer;
    if (!offer) return;
    if (isOfferExpired(offer)) get().clearOffer();
  },

  setActiveBooking(booking) {
    set({ activeBooking: booking });
  },

  clearActiveBooking() {
    set({ activeBooking: null });
  },

  async fetchActive() {
    try {
      const res = await api.get('/driver/bookings/active');
      const booking = res?.data?.data?.booking || null;
      set({ activeBooking: booking });
      return booking;
    } catch {
      return null;
    }
  },

  /** Restore a still-valid wave offer after reconnect / app resume. */
  async fetchPendingOffer() {
    try {
      const res = await api.get('/driver/bookings/pending-offer');
      const offer = res?.data?.data?.offer || null;
      if (!offer) {
        // Only clear when we thought we still had something — avoids
        // wiping a brand-new socket offer that raced this fetch.
        const current = get().offer;
        if (current && isOfferExpired(current)) get().clearOffer();
        return null;
      }
      get().hydrateOffer(offer);
      return offer;
    } catch {
      return null;
    }
  },

  async accept() {
    const offer = get().offer;
    if (!offer) return null;
    set({ busy: 'accept', error: null });
    try {
      await api.post(`/driver/bookings/${offer.bookingId}/accept`);
      get().clearOffer();
      // The server already broadcasts BOOKING_UPDATED, but we proactively
      // refetch the active booking so the driver lands on the dashboard
      // already showing the trip.
      const booking = await get().fetchActive();
      return booking;
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Failed to accept';
      set({ busy: null, error: message });
      throw err;
    }
  },

  async reject() {
    const offer = get().offer;
    if (!offer) return null;
    set({ busy: 'reject', error: null });
    try {
      await api.post(`/driver/bookings/${offer.bookingId}/reject`);
      get().clearOffer();
      return true;
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Failed to reject';
      set({ busy: null, error: message });
      throw err;
    }
  },
}));

export default useDriverIncomingOfferStore;
