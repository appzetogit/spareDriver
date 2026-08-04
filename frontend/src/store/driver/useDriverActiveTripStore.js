import { create } from 'zustand';
import api from '../../utils/api';
import {
  useDriverHomeSummaryStore,
  useDriverTripsListStore,
  useDriverEarningsStore,
  useDriverEarningsLedgerStore,
} from './useDriverTripsStore';
import { BOOKING_STATUS } from '../../constants/bookingStatus';

/**
 * Wipe every dashboard cache that depends on trip-history. Called whenever
 * a trip terminates so the next render of Home / Trips / Earnings sees the
 * fresh aggregate without the user having to pull-to-refresh.
 *
 * The earnings ledger is the only one without a `createQueryStore`
 * cache key (it owns its own pagination state), so we just kick it
 * back to page-1 instead of invalidating a key.
 */
export function invalidateDriverDashboardCaches() {
  useDriverHomeSummaryStore.getState().invalidate('driver-home-summary');
  useDriverTripsListStore.getState().invalidate('driver-trips-list');
  useDriverEarningsStore.getState().invalidate('driver-earnings');
  // Best-effort: a refresh failure here just means the page-level
  // re-mount will catch up. Never wedges the cancel/complete flow.
  useDriverEarningsLedgerStore.getState().refresh().catch(() => {});
}

/** Statuses where this driver no longer owns an active trip. */
const DRIVER_TRIP_ENDED_STATUSES = new Set([
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.SEARCHING,
  BOOKING_STATUS.PENDING_ASSIGNMENT,
  BOOKING_STATUS.NO_DRIVERS_FOUND,
  BOOKING_STATUS.IN_EMERGENCY_POOL,
]);

/**
 * Source of truth for the driver's currently-active booking on the client.
 *
 * Mirrors `useUserActiveBookingStore` shape so pages can reach for the same
 * `applyUpdate` / `fetchActive` patterns. The two stores intentionally live
 * apart — drivers and users never share an authenticated session, and
 * keeping them split avoids any chance of cross-contamination if both
 * tokens were ever present on the same device during dev.
 *
 * Reads:
 *   - GET /driver/bookings/active       → initial hydration
 *   - GET /driver/bookings/:id          → page-level direct fetch
 *   - Socket S2C_EVENTS.BOOKING_UPDATED → live patches
 *
 * Writes (REST helpers called from the driver active-trip page):
 *   - markEnRoute       POST /driver/bookings/:id/en-route
 *   - markArrived       POST /driver/bookings/:id/arrived
 *   - startTrip         POST /driver/bookings/:id/start
 *   - completeTrip      POST /driver/bookings/:id/complete
 *   - cancelTrip        POST /driver/bookings/:id/cancel
 */

const useDriverActiveTripStore = create((set, get) => ({
  booking: null,
  loading: false,
  error: null,
  /** Tracks which transition is currently in-flight so the UI can show a spinner. */
  busy: null,

  setBooking(booking) {
    set({ booking, error: null });
  },

  clear() {
    set({ booking: null, loading: false, error: null, busy: null });
  },

  /**
   * Apply a partial server patch (BOOKING_UPDATED socket payload).
   *
   * Driver patches deliberately omit `paymentMode` / `paymentStatus` /
   * `rideStartOtp.code` — the driver is not informed of those. We do
   * surface `otpRequired` so the UI can swap the Start CTA for an OTP
   * entry sheet.
   */
  applyUpdate(patch = {}) {
    const current = get().booking;
    if (!current) {
      // Still refresh home tiles when a cancel/complete arrives while
      // the driver is on /driver/home (no in-memory active booking).
      if (patch.status && DRIVER_TRIP_ENDED_STATUSES.has(patch.status)) {
        invalidateDriverDashboardCaches();
      }
      return;
    }
    if (patch.bookingId && String(patch.bookingId) !== String(current._id)) return;
    const merged = { ...current };
    if (patch.status) merged.status = patch.status;
    if (patch.timeline) {
      merged.timeline = { ...(current.timeline || {}), ...patch.timeline };
    }
    if (patch.cancellation) {
      merged.cancellation = { ...(current.cancellation || {}), ...patch.cancellation };
    }
    if (patch.cancellationPreview) {
      merged.cancellationPreview = patch.cancellationPreview;
    }
    if (typeof patch.otpRequired === 'boolean') {
      merged.otpRequired = patch.otpRequired;
    }
    if (Array.isArray(patch.extensions)) {
      merged.extensions = patch.extensions;
    }
    if (patch.outstation) {
      merged.outstation = { ...(current.outstation || {}), ...patch.outstation };
    }
    // Rating patch — surfaced when the customer rates this driver so
    // the driver app can show "Customer rated you ⭐ 5" badges without
    // a refetch. Merged shallow so a customer-only patch doesn't drop
    // any driver-side rating already on the booking.
    if (patch.rating) {
      merged.rating = {
        ...(current.rating || {}),
        ...patch.rating,
      };
    }
    set({ booking: merged });

    // Customer/admin cancel (or outstation re-dispatch) must drop the
    // home "Active trips" tile immediately — otherwise the cached
    // summary keeps showing the pre-cancel DRIVER_ASSIGNED row.
    if (patch.status && DRIVER_TRIP_ENDED_STATUSES.has(patch.status)) {
      invalidateDriverDashboardCaches();
    }
  },

  async fetchActive() {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/driver/bookings/active');
      const booking = res?.data?.data?.booking || null;
      set({ booking, loading: false });
      return booking;
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Failed to load trip';
      set({ error: message, loading: false });
      throw err;
    }
  },

  async fetchById(bookingId) {
    if (!bookingId) return null;
    set({ loading: true, error: null });
    try {
      const res = await api.get(`/driver/bookings/${bookingId}`);
      const booking = res?.data?.data?.booking || null;
      set({ booking, loading: false });
      return booking;
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Failed to load trip';
      set({ error: message, loading: false });
      throw err;
    }
  },

  /**
   * Generic transition runner — the only thing that varies between the
   * five trip transitions is the HTTP path. Centralising the busy/error
   * bookkeeping here keeps the page handler code one-liners.
   */
  async _runTransition(label, path, body = undefined) {
    const id = get().booking?._id;
    if (!id) throw new Error('No active trip');
    set({ busy: label, error: null });
    try {
      const res = await api.post(`/driver/bookings/${id}/${path}`, body);
      const booking = res?.data?.data?.booking || null;
      if (booking) set({ booking });
      set({ busy: null });
      return booking;
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || `Failed to ${label}`;
      set({ busy: null, error: message });
      throw err;
    }
  },

  markEnRoute() {
    return get()._runTransition('en-route', 'en-route');
  },
  /**
   * Driver taps "I have arrived". We forward the driver's current GPS
   * coords so the backend can enforce the proximity guard — the server
   * rejects the request when the driver is further than
   * `ARRIVAL_PROXIMITY_METERS` from the pickup, which prevents drivers
   * from harvesting the arrival fee from across town.
   */
  markArrived(driverCoords) {
    const body = driverCoords
      ? { driverCoords: { lat: driverCoords.lat, lng: driverCoords.lng } }
      : undefined;
    return get()._runTransition('arrived', 'arrived', body);
  },
  /**
   * Verify the start-of-ride OTP the customer reads out, then transition
   * the booking to `started`. The server treats `otp` as required and
   * surfaces a clean 400 if it's blank or wrong.
   */
  startTrip(otp) {
    return get()._runTransition('start', 'start', { otp });
  },
  async completeTrip() {
    const booking = await get()._runTransition('complete', 'complete');
    invalidateDriverDashboardCaches();
    return booking;
  },
  async cancelTrip(reason = 'cancelled_by_driver') {
    const booking = await get()._runTransition('cancel', 'cancel', { reason });
    invalidateDriverDashboardCaches();
    return booking;
  },
  /**
   * Driver dismisses a pending customer extension (the OTP banner's
   * Dismiss button). Backend marks the extension declined +
   * `dismissedByDriver=true` and emits a socket event the customer
   * can react to.
   */
  dismissExtension(extensionId) {
    if (!extensionId) throw new Error('extensionId is required');
    return get()._runTransition(
      'dismiss-extension',
      'extensions/dismiss',
      { extensionId },
    );
  },

  /**
   * Driver submits a 1–5 star rating + optional review for the
   * customer they just drove. Once-only — a second submit hits 409
   * from the backend. The store keeps the response booking around so
   * the rating page can display the captured value.
   */
  async rateCustomer({ stars, review = '' } = {}) {
    const id = get().booking?._id;
    if (!id) throw new Error('No active trip');
    const res = await api.post(`/driver/bookings/${id}/rate-customer`, {
      stars,
      review,
    });
    const data = res?.data?.data || {};
    if (data.booking) set({ booking: data.booking });
    return data;
  },
}));

export default useDriverActiveTripStore;
