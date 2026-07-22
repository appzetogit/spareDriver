import { create } from 'zustand';
import api from '../../utils/api';

/**
 * Source of truth for the user's currently-active booking on the client.
 *
 * Reads:
 *   - GET /auth/bookings/active     → initial hydration on page load
 *   - Socket S2C_EVENTS.BOOKING_UPDATED → live patches over the socket
 *
 * Writes (helpers that page components call):
 *   - createBooking      → POST /auth/bookings + replace local state
 *   - cancelBooking      → POST /auth/bookings/:id/cancel
 *   - createPaymentOrder → POST /auth/bookings/:id/pay
 *   - verifyPayment      → POST /auth/bookings/:id/verify-payment
 *
 * Pages should treat `applyUpdate` and `setBooking` as the only mutators of
 * `booking` — keeps the socket and REST paths consistent.
 */

const useUserActiveBookingStore = create((set, get) => ({
  booking: null,
  loading: false,
  error: null,
  paymentRequiredAt: null,

  setBooking(booking) {
    set({ booking, paymentRequiredAt: null });
  },

  clear() {
    set({ booking: null, loading: false, error: null, paymentRequiredAt: null });
  },

  /**
   * Apply a partial server patch (BOOKING_UPDATED socket payload).
   *
   * Fields we explicitly know how to merge are listed below. Everything we
   * don't recognise is ignored on purpose — we never blindly spread the
   * payload onto `booking` because some patches deliberately omit
   * user-private fields like `rideStartOtp.code` when they originate from
   * the booking room.
   */
  applyUpdate(patch = {}) {
    const current = get().booking;
    if (!current) return;
    if (patch.bookingId && String(patch.bookingId) !== String(current._id)) return;
    const merged = { ...current };
    if (patch.status) merged.status = patch.status;
    if (patch.paymentStatus) merged.paymentStatus = patch.paymentStatus;
    if (patch.paymentMode) merged.paymentMode = patch.paymentMode;
    if (patch.paymentMethod) merged.paymentMethod = patch.paymentMethod;
    // `driverId` can legitimately go from a value back to `null` (driver
    // bailed → booking back to SEARCHING). Honour an explicit `null` in
    // the patch instead of only forwarding truthy ids.
    //
    // Critical: socket patches send `driverId` as a bare id string (see
    // backend `buildUpdatePayload`). If we blindly assigned that, we'd
    // clobber the already-populated driver object the REST fetch put on
    // the booking, and the UI would collapse to "Driver" / "Assigning
    // driver…" the next time *any* transition (e.g. trip STARTED) fires.
    // So when the patch is a bare id matching the currently-populated
    // driver, keep the object; only replace when the driver actually
    // changes (or when the patch explicitly clears it).
    if ('driverId' in patch) {
      const next = patch.driverId;
      if (next === null || next === undefined) {
        merged.driverId = next;
      } else if (typeof next === 'object') {
        merged.driverId = next;
      } else {
        const cur = current.driverId;
        const curId =
          cur && typeof cur === 'object'
            ? cur._id
              ? String(cur._id)
              : null
            : cur
              ? String(cur)
              : null;
        merged.driverId = curId && curId === String(next) ? cur : next;
      }
    }
    if (patch.dispatch) {
      merged.dispatch = { ...(current.dispatch || {}), ...patch.dispatch };
    }
    if (patch.timeline) {
      merged.timeline = { ...(current.timeline || {}), ...patch.timeline };
    }
    // Same null-handling rule for `cancellation`. The re-dispatch flow
    // sends `cancellation: null` once a new driver accepts so the
    // "driver bailed" popup goes away.
    if ('cancellation' in patch) {
      merged.cancellation = patch.cancellation
        ? { ...(current.cancellation || {}), ...patch.cancellation }
        : null;
    }
    if (patch.cancellationPreview) {
      merged.cancellationPreview = patch.cancellationPreview;
    }
    if (patch.refund) {
      // Lightweight refund summary attached on a cancellation socket
      // patch — the FE renders the amount in the cancellation toast.
      merged.refund = patch.refund;
    }
    if (patch.rideStartOtp) {
      merged.rideStartOtp = {
        ...(current.rideStartOtp || {}),
        ...patch.rideStartOtp,
      };
    }
    if (Array.isArray(patch.extensions)) {
      merged.extensions = patch.extensions;
    }
    // Rating patches flow back via BOOKING_UPDATED after either side
    // submits their post-trip stars. We merge so a customer-only patch
    // doesn't clobber the driver-side rating (and vice versa) when it
    // arrives later.
    if (patch.rating) {
      merged.rating = {
        ...(current.rating || {}),
        ...patch.rating,
      };
    }
    if (typeof patch.amountDue === 'number') merged.amountDue = patch.amountDue;
    if (typeof patch.effectiveTotal === 'number') merged.effectiveTotal = patch.effectiveTotal;
    // Scheduled-ride metadata can change mid-flight (e.g. the worker
    // stamps `assignmentStartedAt` when it flips PENDING_ASSIGNMENT →
    // SEARCHING, or the escalator stamps `escalatedAt` + populates
    // `emergencyPool` when the booking enters the manual queue).
    if (patch.scheduled) {
      merged.scheduled = { ...(current.scheduled || {}), ...patch.scheduled };
    }
    // The pickup-time field can land alone on the patch from reminders
    // or escalation events; surface it so the UI countdown stays
    // accurate if the server adjusts it.
    if (patch.scheduledStartAt && merged.hourly) {
      merged.hourly = {
        ...(current.hourly || {}),
        scheduledStartAt: patch.scheduledStartAt,
      };
    }
    set({ booking: merged });
  },

  notePaymentRequired(meta) {
    set({ paymentRequiredAt: { ...meta, at: Date.now() } });
  },

  async fetchActive() {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/auth/bookings/active');
      const booking = res?.data?.data?.booking || null;
      set({ booking, loading: false });
      return booking;
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Failed to load booking';
      set({ error: message, loading: false });
      throw err;
    }
  },

  /**
   * Fetch a specific booking by id and put it in the store. Use this
   * on tracking pages that have the id in the URL (e.g.
   * `/user/book/assigned/:id`) so a hard refresh continues to render
   * the same booking — `/active` alone would return whichever booking
   * the backend ranks highest, which is wrong when the user has
   * several active bookings.
   */
  async fetchById(bookingId) {
    if (!bookingId) return null;
    set({ loading: true, error: null });
    try {
      const res = await api.get(`/auth/bookings/${bookingId}`);
      const booking = res?.data?.data?.booking || null;
      set({ booking, loading: false });
      return booking;
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to load booking';
      set({ error: message, loading: false });
      throw err;
    }
  },

  /**
   * Refresh whichever booking the store currently holds (by id) or
   * fall back to `/active` when the store is empty. Used by pages
   * that don't have the id in the URL — they rely on whatever the
   * navigator put in the store. Prefer the URL-driven `fetchById`
   * when possible because it survives a hard refresh.
   */
  async refreshCurrentOrActive() {
    const currentId = get().booking?._id;
    if (!currentId) {
      try {
        return await get().fetchActive();
      } catch {
        return null;
      }
    }
    try {
      return await get().fetchById(currentId);
    } catch {
      return null;
    }
  },

  async createBooking(payload) {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/auth/bookings', payload);
      const booking = res?.data?.data?.booking || null;
      const reused = !!res?.data?.data?.reused;
      set({ booking, loading: false });
      return { booking, reused };
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Booking failed';
      set({ error: message, loading: false });
      throw err;
    }
  },

  async cancelBooking(reason = 'cancelled_by_user') {
    const id = get().booking?._id;
    if (!id) return null;
    try {
      const res = await api.post(`/auth/bookings/${id}/cancel`, { reason });
      const booking = res?.data?.data?.booking || null;
      set({ booking });
      return booking;
    } catch (err) {
      // Driver cancel / no-drivers / payment timeout may have already
      // closed the booking. Re-fetch so the UI can redirect instead of
      // stranding the user on a cancel error toast.
      const msg = err?.response?.data?.message || '';
      if (err?.response?.status === 400 && /no longer cancellable/i.test(msg)) {
        try {
          const res = await api.get(`/auth/bookings/${id}`);
          const booking = res?.data?.data?.booking || null;
          if (booking) {
            set({ booking });
            return booking;
          }
        } catch {
          /* fall through */
        }
        set({ booking: null });
        const syncErr = new Error(msg || 'This booking is no longer cancellable');
        syncErr.code = 'BOOKING_ALREADY_TERMINAL';
        syncErr.alreadyTerminal = true;
        throw syncErr;
      }
      throw err;
    }
  },

  async createPaymentOrder() {
    const id = get().booking?._id;
    if (!id) throw new Error('No active booking');
    const res = await api.post(`/auth/bookings/${id}/pay`);
    return res?.data?.data?.razorpay;
  },

  async verifyPayment({ orderId, paymentId, signature }) {
    const id = get().booking?._id;
    if (!id) throw new Error('No active booking');
    const res = await api.post(`/auth/bookings/${id}/verify-payment`, {
      orderId,
      paymentId,
      signature,
    });
    const booking = res?.data?.data?.booking || null;
    set({ booking });
    return booking;
  },

  /**
   * Phase 1 of the extension handshake. Server generates the OTP, hands
   * it to the driver via socket, and returns the fareDelta locked in
   * for the rest of the flow. Returns `{ booking, extension, breakdown }`.
   *
   * `amount` is interpreted by the backend based on the booking's
   * serviceType — hourly bookings pass `{ additionalHours }`,
   * outstation bookings pass `{ additionalDays }`. The store decides
   * the field name by reading the live booking's `serviceType`.
   */
  async initiateExtension(amount) {
    const booking = get().booking;
    const id = booking?._id;
    if (!id) throw new Error('No active booking');
    const isOutstation = booking?.serviceType === 'outstation';
    const body = isOutstation
      ? { additionalDays: Number(amount) }
      : { additionalHours: Number(amount) };
    const res = await api.post(`/auth/bookings/${id}/extensions/initiate`, body);
    const data = res?.data?.data || {};
    if (data.booking) set({ booking: data.booking });
    return data;
  },

  /**
   * Phase 2 of the extension handshake. Customer enters the 4-digit
   * code the driver read out to them.
   */
  async verifyExtensionOtp({ extensionId, otp }) {
    const id = get().booking?._id;
    if (!id) throw new Error('No active booking');
    const res = await api.post(`/auth/bookings/${id}/extensions/verify-otp`, {
      extensionId,
      otp,
    });
    const data = res?.data?.data || {};
    if (data.booking) set({ booking: data.booking });
    return data;
  },

  /**
   * Phase 3 of the extension handshake. Customer confirms and pays the
   * fareDelta from their wallet.
   */
  async payExtension({ extensionId }) {
    const id = get().booking?._id;
    if (!id) throw new Error('No active booking');
    const res = await api.post(`/auth/bookings/${id}/extensions/pay`, {
      extensionId,
    });
    const data = res?.data?.data || {};
    if (data.booking) set({ booking: data.booking });
    return data;
  },

  /**
   * Discard an open extension intent (used by "Change hours" or when
   * the user wants to abandon a verified-but-unpaid extension). After
   * this the next initiate is allowed.
   */
  async cancelExtension({ extensionId }) {
    const id = get().booking?._id;
    if (!id) throw new Error('No active booking');
    const res = await api.post(`/auth/bookings/${id}/extensions/cancel`, {
      extensionId,
    });
    const data = res?.data?.data || {};
    if (data.booking) set({ booking: data.booking });
    return data;
  },

  /**
   * Customer's answer to the "are you coming?" no-show prompt. Posts
   * to the backend which either reschedules the prompt (Yes) or
   * auto-completes the ride (No).
   *   response: 'on_my_way' | 'not_coming'
   */
  async respondToNoShow(response) {
    const id = get().booking?._id;
    if (!id) throw new Error('No active booking');
    await api.post(`/auth/bookings/${id}/noshow/respond`, { response });
  },

  /**
   * Customer submits a 1–5 star rating + optional review for the
   * driver after the trip completes. The server stores the rating on
   * the booking and rolls it into the driver's running average. A
   * second submit will hit 409 from the service.
   */
  async rateDriver({ stars, review = '' } = {}) {
    const id = get().booking?._id;
    if (!id) throw new Error('No active booking');
    const res = await api.post(`/auth/bookings/${id}/rate-driver`, {
      stars,
      review,
    });
    const data = res?.data?.data || {};
    if (data.booking) set({ booking: data.booking });
    return data;
  },

  async downloadInvoicePdf() {
    const booking = get().booking;
    const id = booking?._id;
    if (!id) throw new Error('No active booking');
    const res = await api.get(`/auth/bookings/${id}/invoice/pdf`, {
      responseType: 'blob',
    });
    const invoiceRef = booking.invoiceNumber || booking.bookingNumber || id;
    const filenameSafe = String(invoiceRef).replace(/[^a-zA-Z0-9-_]/g, '-');
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${filenameSafe}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  },
}));

export default useUserActiveBookingStore;
