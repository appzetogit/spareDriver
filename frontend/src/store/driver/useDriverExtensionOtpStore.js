import { create } from 'zustand';

function toMs(value) {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(n) ? n : 0;
}

function parseMaybeJson(value) {
  if (value == null || value === '') return value;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Normalise a socket / FCM / booking-extension payload into the banner
 * shape the driver UI renders.
 */
export function bannerFromExtensionPayload(payload = {}, fallbackStage = 'otp') {
  const otp = String(payload.otp ?? payload.code ?? payload?.otp?.code ?? '').trim();
  const expiresAt = toMs(
    payload.expiresAt
    || payload.otp?.expiresAt
    || 0,
  );
  const extensionId = payload.extensionId || payload._id || payload.extension?._id;
  const bookingId = payload.bookingId || payload.booking?._id;
  if (!extensionId && !otp) return null;
  return {
    bookingId: bookingId ? String(bookingId) : null,
    extensionId: extensionId ? String(extensionId) : null,
    otp,
    additionalHours: Number(parseMaybeJson(payload.additionalHours)) || 0,
    additionalDays: Number(parseMaybeJson(payload.additionalDays)) || 0,
    serviceType: payload.serviceType || null,
    driverEarning: Number(parseMaybeJson(payload.driverEarning)) || 0,
    expiresAt: expiresAt || Date.now() + 5 * 60 * 1000,
    stage: payload.stage || fallbackStage,
  };
}

/**
 * Pick the open extension handshake off a driver-sanitized booking so
 * we can resume the OTP banner after a refresh / missed socket.
 */
export function bannerFromBooking(booking) {
  if (!booking) return null;
  const list = booking.extensions || [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const ext = list[i];
    if (ext?.status === 'pending_otp') {
      const expiresAt = toMs(ext.otp?.expiresAt);
      if (expiresAt && expiresAt <= Date.now()) continue;
      const code = String(ext.otp?.code || '').trim();
      if (!code) continue;
      return bannerFromExtensionPayload({
        bookingId: booking._id,
        extensionId: ext._id,
        otp: code,
        additionalHours: ext.additionalHours,
        additionalDays: ext.additionalDays,
        driverEarning: ext.driverEarning,
        expiresAt: ext.otp?.expiresAt,
        serviceType: booking.serviceType,
      }, 'otp');
    }
    if (ext?.status === 'pending_payment') {
      return bannerFromExtensionPayload({
        bookingId: booking._id,
        extensionId: ext._id,
        otp: ext.otp?.code || '',
        additionalHours: ext.additionalHours,
        additionalDays: ext.additionalDays,
        driverEarning: ext.driverEarning,
        expiresAt: ext.otp?.expiresAt,
        serviceType: booking.serviceType,
      }, 'verified');
    }
  }
  return null;
}

const useDriverExtensionOtpStore = create((set, get) => ({
  banner: null,

  applyOtpPayload(payload) {
    const next = bannerFromExtensionPayload(payload, 'otp');
    if (!next?.otp) return null;
    set({ banner: { ...next, stage: 'otp' } });
    return next;
  },

  applyResolved(payload) {
    if (!payload) return;
    const current = get().banner;
    if (
      current
      && payload.extensionId
      && String(current.extensionId) !== String(payload.extensionId)
    ) {
      return;
    }
    if (payload.stage === 'otp_verified') {
      if (!current) return;
      set({ banner: { ...current, stage: 'verified' } });
      return;
    }
    if (payload.stage === 'cancelled' || payload.stage === 'dismissed_by_driver') {
      if (!current) return;
      set({ banner: null });
    }
  },

  applyPaid(payload) {
    const current = get().banner;
    const paidId = payload?.extension?._id || payload?.extensionId;
    if (!current) return;
    if (paidId && String(current.extensionId) !== String(paidId)) return;
    set({ banner: { ...current, stage: 'paid' } });
    setTimeout(() => {
      const still = get().banner;
      if (still && still.stage === 'paid' && String(still.extensionId) === String(current.extensionId)) {
        set({ banner: null });
      }
    }, 2500);
  },

  /**
   * Resume from REST. Does not clobber a live `paid` celebration, and
   * does not wipe a socket banner that the booking payload omitted
   * (older sanitizer without `otp.code`).
   */
  hydrateFromBooking(booking) {
    const fromBooking = bannerFromBooking(booking);
    const current = get().banner;
    if (fromBooking) {
      if (current?.stage === 'paid' && String(current.extensionId) === String(fromBooking.extensionId)) {
        return;
      }
      set({ banner: fromBooking });
      return;
    }
    if (!current) return;
    if (current.stage === 'paid') return;
    if (booking?._id && current.bookingId && String(current.bookingId) !== String(booking._id)) {
      return;
    }
    const open = (booking?.extensions || []).some(
      (ext) => ext?.status === 'pending_otp' || ext?.status === 'pending_payment',
    );
    if (booking && Array.isArray(booking.extensions) && !open) {
      set({ banner: null });
    }
  },

  clear() {
    set({ banner: null });
  },
}));

export default useDriverExtensionOtpStore;
