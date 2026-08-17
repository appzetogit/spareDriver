import Booking from '../models/booking.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  BOOKING_TYPE,
  PAYMENT_MODE,
  PAYMENT_POLICY,
} from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToDriver,
  emitToBooking,
  emitToAdmins,
} from '../utils/socketEmitters.js';
import {
  settleWaitingBuffer,
  clearPendingExtensionsOnTerminate,
  settleDriverEarning,
} from './bookingExtension.service.js';
import { recordCompletedTripPlatformRevenue } from './platformRevenue.service.js';
import { incrementCouponUsageService } from './coupon.service.js';
import {
  notifyUserTripCompleted,
  notifyUserRideEndingSoon,
  notifyDriverEarningsCredited,
} from '../utils/notificationDispatch.js';
import { queueBookingInvoiceEmail } from './bookingInvoiceEmail.service.js';
import { debitWalletService } from './wallet.service.js';
import { WALLET_TXN_SOURCE } from '../models/walletTransaction.model.js';

/**
 * Hourly + outstation ride-end / extend nudge (in-process timers).
 *
 * Hourly / scheduled-hourly:
 *   - Lead: PAYMENT_POLICY.EXTENSION_PROMPT_LEAD_SECONDS
 *   - Grace: PAYMENT_POLICY.RIDE_END_EXTENSION_GRACE_SECONDS
 *   - Always auto-completes after grace
 *
 * Outstation (admin Return lifecycle snapshotted on the booking):
 *   - returnReminderMinutes → first extend push/popup before return
 *   - returnPromptRepeatMinutes → re-prompt BEFORE return until user declines
 *   - returnGraceMinutes → no overtime during grace after return
 *   - returnAutoCompleteHours → 0 = off (minute overtime billing);
 *     >0 = auto-complete after grace
 *
 * Same FCM (`ride_ending_soon`) + socket (`BOOKING_EXTENSION_OFFERED`)
 * as hourly. Redis/BullMQ is not used.
 *
 * Restart drops timers; `resumeRideEndScheduleIfNeeded` re-attaches
 * from booking fetch paths.
 */

/** bookingId → { handle, autoCompleteAt, promptHandle, overtimeHandle, endsAt } */
const rideEndTimers = new Map();

/**
 * Ends-at timestamps we already nudged for (hourly one-shot).
 * Outstation repeats until declined; tracked separately on the booking.
 */
const promptSentForEndsAt = new Map();

const DEFAULT_OUTSTATION_REMINDER_MINUTES = 120;
const DEFAULT_OUTSTATION_GRACE_MINUTES = 30;
const DEFAULT_OUTSTATION_PROMPT_REPEAT_MINUTES = 30;
const OVERTIME_TICK_MS = 60_000;

function key(id) {
  return String(id);
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function isOutstationRideEndBooking(booking) {
  return (
    booking?.serviceType === SERVICE_TYPES.OUTSTATION
    || booking?.bookingType === BOOKING_TYPE.OUTSTATION
  );
}

function isHourlyBooking(booking) {
  return booking?.serviceType === SERVICE_TYPES.HOURLY;
}

export function resolveOutstationRideEndConfig(booking) {
  const o = booking?.outstation || {};
  const bd = booking?.fareSnapshot?.breakdown || {};
  return {
    reminderMinutes: numOr(
      o.returnReminderMinutes ?? bd.returnReminderMinutes,
      DEFAULT_OUTSTATION_REMINDER_MINUTES,
    ),
    graceMinutes: numOr(
      o.returnGraceMinutes ?? bd.returnGraceMinutes,
      DEFAULT_OUTSTATION_GRACE_MINUTES,
    ),
    promptRepeatMinutes: numOr(
      o.returnPromptRepeatMinutes ?? bd.returnPromptRepeatMinutes,
      DEFAULT_OUTSTATION_PROMPT_REPEAT_MINUTES,
    ),
    autoCompleteHours: numOr(
      o.returnAutoCompleteHours ?? bd.returnAutoCompleteHours,
      0,
    ),
  };
}

const hourlyGraceMs = () =>
  Math.max(0, Number(PAYMENT_POLICY.RIDE_END_EXTENSION_GRACE_SECONDS) || 0) *
  1000;

const hourlyPromptLeadMs = () =>
  Math.max(0, Number(PAYMENT_POLICY.EXTENSION_PROMPT_LEAD_SECONDS) || 0) *
  1000;

/** Booked length in ms (base hours + accepted extensions). Hourly only. */
export function bookedRideDurationMs(booking) {
  const base = Number(booking?.hourly?.durationHours) || 0;
  if (base <= 0) return 0;
  const extra = (booking?.extensions || []).reduce(
    (sum, ext) =>
      sum + (ext?.status === 'accepted' ? Number(ext.additionalHours) || 0 : 0),
    0,
  );
  return (base + extra) * 3_600_000;
}

/** Wall-clock booked-end instant (before grace), or null. */
export function rideEndsAtMs(booking) {
  if (!booking) return null;

  if (isOutstationRideEndBooking(booking)) {
    const src =
      booking.outstation?.expectedReturnAt || booking.outstation?.endDate;
    if (!src) return null;
    const ms = new Date(src).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (!isHourlyBooking(booking)) return null;
  const startedAtMs = booking.timeline?.startedAt
    ? new Date(booking.timeline.startedAt).getTime()
    : NaN;
  const durationMs = bookedRideDurationMs(booking);
  if (!Number.isFinite(startedAtMs) || durationMs <= 0) return null;
  return startedAtMs + durationMs;
}

/** When the first extend push should fire = booked end − lead time. */
export function rideExtensionPromptAtMs(booking) {
  const endsAt = rideEndsAtMs(booking);
  if (endsAt == null) return null;
  if (isOutstationRideEndBooking(booking)) {
    const { reminderMinutes } = resolveOutstationRideEndConfig(booking);
    if (reminderMinutes <= 0) return endsAt;
    return endsAt - reminderMinutes * 60_000;
  }
  return endsAt - hourlyPromptLeadMs();
}

export function rideGraceEndsAtMs(booking) {
  const endsAt = rideEndsAtMs(booking);
  if (endsAt == null) return null;
  if (isOutstationRideEndBooking(booking)) {
    const { graceMinutes } = resolveOutstationRideEndConfig(booking);
    return endsAt + graceMinutes * 60_000;
  }
  return endsAt + hourlyGraceMs();
}

/**
 * When auto-complete fires. Outstation: null when auto-complete is off
 * (returnAutoCompleteHours === 0).
 */
export function rideAutoCompleteAtMs(booking) {
  const graceEnds = rideGraceEndsAtMs(booking);
  if (graceEnds == null) return null;
  if (isOutstationRideEndBooking(booking)) {
    const { autoCompleteHours } = resolveOutstationRideEndConfig(booking);
    if (autoCompleteHours <= 0) return null;
    return graceEnds;
  }
  return graceEnds;
}

function outstationOvertimePerMinuteRupees(booking) {
  const bd = booking?.fareSnapshot?.breakdown || {};
  const hourly =
    Number(bd.outstationExtraHourCharge)
    || Number(bd.extraHourChargeRate)
    || Number(bd.extraHourCharge)
    || 0;
  if (!(hourly > 0)) return 0;
  return round2(hourly / 60);
}

function clearPromptHandle(entry) {
  if (entry?.promptHandle) clearTimeout(entry.promptHandle);
  if (entry) entry.promptHandle = null;
}

function clearOvertimeHandle(entry) {
  if (entry?.overtimeHandle) clearTimeout(entry.overtimeHandle);
  if (entry) entry.overtimeHandle = null;
}

export function cancelRideEndSchedule(bookingId) {
  const k = key(bookingId);
  const entry = rideEndTimers.get(k);
  if (entry?.handle) clearTimeout(entry.handle);
  clearPromptHandle(entry);
  clearOvertimeHandle(entry);
  rideEndTimers.delete(k);
  promptSentForEndsAt.delete(k);
}

function extensionPromptDeclined(booking) {
  return Boolean(booking?.outstation?.extensionPromptDeclinedAt);
}

function scheduleExtensionPrompt(booking, entry, { forceAt = null } = {}) {
  const endsAt = rideEndsAtMs(booking);
  const promptAt = forceAt != null ? forceAt : rideExtensionPromptAtMs(booking);
  if (endsAt == null || promptAt == null) return;

  clearPromptHandle(entry);

  if (isOutstationRideEndBooking(booking) && extensionPromptDeclined(booking)) {
    return;
  }

  const sentFor = promptSentForEndsAt.get(key(booking._id));
  if (sentFor != null && sentFor !== endsAt) {
    promptSentForEndsAt.delete(key(booking._id));
  }

  const autoCompleteAt = rideAutoCompleteAtMs(booking);
  if (autoCompleteAt != null && autoCompleteAt <= Date.now()) return;

  // Outstation: stop pre-end repeats once return time is reached.
  if (isOutstationRideEndBooking(booking) && Date.now() >= endsAt) return;

  const delay = Math.max(0, promptAt - Date.now());
  const bookingId = booking._id;
  entry.promptHandle = setTimeout(
    () =>
      sendRideEndingSoonPrompt(bookingId).catch((err) =>
        console.warn('[rideEnd] extension prompt failed:', err?.message),
      ),
    delay,
  );
  entry.endsAt = endsAt;
}

/**
 * Push + socket nudge so the customer can open the extend flow even
 * when the app is backgrounded (or the local timer was missed).
 */
async function sendRideEndingSoonPrompt(bookingId) {
  const k = key(bookingId);
  const entry = rideEndTimers.get(k);
  if (entry) entry.promptHandle = null;

  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.STARTED) return;
  if (!isHourlyBooking(booking) && !isOutstationRideEndBooking(booking)) return;

  if (isOutstationRideEndBooking(booking) && extensionPromptDeclined(booking)) {
    return;
  }

  const endsAt = rideEndsAtMs(booking);
  const promptAt = rideExtensionPromptAtMs(booking);
  if (endsAt == null || promptAt == null) return;

  // Extension accepted after we were scheduled — push the nudge out.
  if (promptAt > Date.now() + 1_000) {
    if (entry) scheduleExtensionPrompt(booking, entry);
    else scheduleRideEndTimer(booking);
    return;
  }

  // Outstation: only nudge before booked return.
  if (isOutstationRideEndBooking(booking) && Date.now() >= endsAt) return;

  const autoCompleteAt = rideAutoCompleteAtMs(booking);
  if (autoCompleteAt != null && autoCompleteAt <= Date.now()) return;

  const isOutstation = isOutstationRideEndBooking(booking);
  if (!isOutstation) {
    if (promptSentForEndsAt.get(k) === endsAt) return;
    promptSentForEndsAt.set(k, endsAt);
  } else {
    booking.outstation = booking.outstation || {};
    booking.outstation.lastReturnPromptAt = new Date();
    if (!booking.outstation.returnReminderSentAt) {
      booking.outstation.returnReminderSentAt = booking.outstation.lastReturnPromptAt;
    }
    await booking.save();
  }

  const graceEnds = rideGraceEndsAtMs(booking);
  const graceSeconds =
    graceEnds != null && endsAt != null
      ? Math.max(0, Math.round((graceEnds - endsAt) / 1000))
      : Number(PAYMENT_POLICY.RIDE_END_EXTENSION_GRACE_SECONDS) || 0;

  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    endsAt: new Date(endsAt).toISOString(),
    graceSeconds,
    serviceType: booking.serviceType,
  };

  notifyUserRideEndingSoon(booking.userId, booking).catch(() => null);
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_EXTENSION_OFFERED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_EXTENSION_OFFERED, payload);

  // Outstation: re-prompt before return until user declines.
  if (isOutstation && entry) {
    const { promptRepeatMinutes } = resolveOutstationRideEndConfig(booking);
    if (promptRepeatMinutes > 0) {
      const nextAt = Date.now() + promptRepeatMinutes * 60_000;
      if (nextAt < endsAt) {
        scheduleExtensionPrompt(booking, entry, { forceAt: nextAt });
      }
    }
  }
}

function scheduleOvertimeTicker(booking, entry) {
  if (!isOutstationRideEndBooking(booking)) return;
  const { autoCompleteHours } = resolveOutstationRideEndConfig(booking);
  if (autoCompleteHours > 0) return;

  const graceEnds = rideGraceEndsAtMs(booking);
  if (graceEnds == null) return;

  clearOvertimeHandle(entry);
  const delay = Math.max(0, graceEnds - Date.now());
  const bookingId = booking._id;
  entry.overtimeHandle = setTimeout(() => {
    settleOutstationOvertimeTick(bookingId).catch((err) =>
      console.warn('[rideEnd] overtime tick failed:', err?.message),
    );
  }, delay === 0 ? OVERTIME_TICK_MS : delay);
}

/**
 * Bill unpaid minutes past grace (auto-complete off) and debit wallet.
 * Safe to call repeatedly; also used at trip complete.
 */
export async function settleOutstationOvertimeTick(bookingId, { final = false } = {}) {
  const k = key(bookingId);
  const entry = rideEndTimers.get(k);

  const booking = await Booking.findById(bookingId);
  if (!booking) return { skipped: true, reason: 'missing' };
  if (!isOutstationRideEndBooking(booking)) return { skipped: true, reason: 'not_outstation' };
  if (booking.status !== BOOKING_STATUS.STARTED && !final) {
    return { skipped: true, reason: 'not_started' };
  }

  const { autoCompleteHours, graceMinutes } = resolveOutstationRideEndConfig(booking);
  if (autoCompleteHours > 0) {
    clearOvertimeHandle(entry);
    return { skipped: true, reason: 'auto_complete_on' };
  }

  const endsAt = rideEndsAtMs(booking);
  const graceEnds = rideGraceEndsAtMs(booking);
  if (endsAt == null || graceEnds == null) {
    return { skipped: true, reason: 'no_window' };
  }

  const nowMs = final && booking.timeline?.completedAt
    ? new Date(booking.timeline.completedAt).getTime()
    : Date.now();

  if (nowMs < graceEnds) {
    if (!final && entry) scheduleOvertimeTicker(booking, entry);
    return { skipped: true, reason: 'in_grace' };
  }

  const perMin = outstationOvertimePerMinuteRupees(booking);
  if (!(perMin > 0)) {
    if (!final && booking.status === BOOKING_STATUS.STARTED && entry) {
      entry.overtimeHandle = setTimeout(() => {
        settleOutstationOvertimeTick(bookingId).catch(() => null);
      }, OVERTIME_TICK_MS);
    }
    return { skipped: true, reason: 'no_rate' };
  }

  const totalOvertimeMinutes = Math.max(
    0,
    Math.floor((nowMs - graceEnds) / 60_000),
  );
  const already = Math.max(0, Number(booking.outstation?.overtimeSettledMinutes) || 0);
  const deltaMinutes = totalOvertimeMinutes - already;
  if (deltaMinutes <= 0) {
    if (!final && booking.status === BOOKING_STATUS.STARTED && entry) {
      entry.overtimeHandle = setTimeout(() => {
        settleOutstationOvertimeTick(bookingId).catch(() => null);
      }, OVERTIME_TICK_MS);
    }
    return { ok: true, charged: 0, deltaMinutes: 0 };
  }

  const charge = round2(deltaMinutes * perMin);
  if (!(charge > 0)) {
    return { ok: true, charged: 0, deltaMinutes };
  }

  try {
    await debitWalletService({
      userId: booking.userId,
      amount: charge,
      source: WALLET_TXN_SOURCE.BOOKING_OVERTIME_CHARGE,
      description: `Outstation overtime ${deltaMinutes} min (after ${graceMinutes}m grace)`,
      refType: 'Booking',
      refId: String(booking._id),
    });
  } catch (err) {
    // Keep ticking so a later top-up can settle; surface via socket.
    emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, {
      bookingId: String(booking._id),
      status: booking.status,
      overtimeWalletError: err?.message || 'Insufficient wallet for overtime',
      overtimePendingRupees: charge,
    });
    if (!final && booking.status === BOOKING_STATUS.STARTED && entry) {
      entry.overtimeHandle = setTimeout(() => {
        settleOutstationOvertimeTick(bookingId).catch(() => null);
      }, OVERTIME_TICK_MS);
    }
    return { ok: false, reason: 'wallet', charge, err: err?.message };
  }

  booking.outstation = booking.outstation || {};
  booking.outstation.overtimeSettledMinutes = already + deltaMinutes;
  booking.outstation.overtimeBillableMinutes = totalOvertimeMinutes;
  booking.outstation.overtimeChargeRupees = round2(
    (Number(booking.outstation.overtimeChargeRupees) || 0) + charge,
  );
  booking.outstation.overtimeLastSettledAt = new Date();

  if (booking.fareSnapshot) {
    booking.fareSnapshot.total = round2(
      (Number(booking.fareSnapshot.total) || 0) + charge,
    );
    const bd = booking.fareSnapshot.breakdown || {};
    bd.overtimeChargeRupees = booking.outstation.overtimeChargeRupees;
    bd.overtimeBillableMinutes = totalOvertimeMinutes;
    booking.fareSnapshot.breakdown = bd;
    booking.markModified('fareSnapshot');
  }

  await booking.save();

  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, {
    bookingId: String(booking._id),
    status: booking.status,
    outstation: {
      overtimeChargeRupees: booking.outstation.overtimeChargeRupees,
      overtimeBillableMinutes: booking.outstation.overtimeBillableMinutes,
      overtimeSettledMinutes: booking.outstation.overtimeSettledMinutes,
    },
    fareSnapshot: booking.fareSnapshot,
  });

  if (!final && booking.status === BOOKING_STATUS.STARTED && entry) {
    entry.overtimeHandle = setTimeout(() => {
      settleOutstationOvertimeTick(bookingId).catch(() => null);
    }, OVERTIME_TICK_MS);
  }

  return { ok: true, charged: charge, deltaMinutes };
}

/**
 * Schedule (or replace) ride-end timers for a STARTED hourly or
 * outstation booking. Safe after start and after every accepted extension.
 */
export function scheduleRideEndTimer(booking) {
  if (!booking?._id) return;
  if (booking.status !== BOOKING_STATUS.STARTED) return;
  if (!isHourlyBooking(booking) && !isOutstationRideEndBooking(booking)) return;

  const endsAt = rideEndsAtMs(booking);
  if (endsAt == null) return;

  const k = key(booking._id);
  const prev = rideEndTimers.get(k);
  if (prev?.handle) clearTimeout(prev.handle);
  clearPromptHandle(prev);
  clearOvertimeHandle(prev);

  const entry = {
    handle: null,
    autoCompleteAt: null,
    promptHandle: null,
    overtimeHandle: null,
    endsAt,
  };
  rideEndTimers.set(k, entry);

  const autoCompleteAt = rideAutoCompleteAtMs(booking);
  if (autoCompleteAt != null) {
    entry.autoCompleteAt = autoCompleteAt;
    const delay = Math.max(0, autoCompleteAt - Date.now());
    const bookingId = booking._id;
    entry.handle = setTimeout(
      () =>
        autoCompleteExpiredRide(bookingId).catch((err) =>
          console.warn('[rideEnd] auto-complete failed:', err?.message),
        ),
      delay,
    );
  } else if (isOutstationRideEndBooking(booking)) {
    scheduleOvertimeTicker(booking, entry);
  }

  scheduleExtensionPrompt(booking, entry);
}

/**
 * Cold-start / fetch-path resume. Re-attaches the timer when the
 * in-process Map was cleared by a restart.
 */
export function resumeRideEndScheduleIfNeeded(booking) {
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.STARTED) return;
  if (rideEndTimers.has(key(booking._id))) return;
  if (rideEndsAtMs(booking) == null) return;
  scheduleRideEndTimer(booking);
}

/**
 * Customer declined the extend popup — stop pre-end repeats.
 * Does not affect auto-complete / overtime after return.
 */
export async function declineExtensionPromptService(userId, bookingId) {
  const booking = await Booking.findOne({
    _id: bookingId,
    userId,
    isDeleted: false,
  });
  if (!booking) {
    const { ApiError } = await import('../utils/apiError.js');
    throw new ApiError(404, 'Booking not found');
  }
  if (booking.status !== BOOKING_STATUS.STARTED) {
    return { ok: true, skipped: true };
  }

  if (isOutstationRideEndBooking(booking)) {
    booking.outstation = booking.outstation || {};
    booking.outstation.extensionPromptDeclinedAt = new Date();
    await booking.save();
  }

  const entry = rideEndTimers.get(key(booking._id));
  clearPromptHandle(entry);

  return {
    ok: true,
    bookingId: String(booking._id),
    declinedAt: booking.outstation?.extensionPromptDeclinedAt || null,
  };
}

/**
 * Complete a STARTED ride once booked end + grace have elapsed
 * without a further extension. Mirrors `completeTripService`
 * side-effects without the driver auth gate.
 */
async function autoCompleteExpiredRide(bookingId) {
  const k = key(bookingId);
  const entry = rideEndTimers.get(k);
  clearPromptHandle(entry);
  clearOvertimeHandle(entry);
  rideEndTimers.delete(k);
  promptSentForEndsAt.delete(k);

  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.STARTED) return;
  if (!isHourlyBooking(booking) && !isOutstationRideEndBooking(booking)) return;

  if (isOutstationRideEndBooking(booking)) {
    const { autoCompleteHours } = resolveOutstationRideEndConfig(booking);
    if (autoCompleteHours <= 0) return;
  }

  const autoCompleteAt = rideAutoCompleteAtMs(booking);
  if (autoCompleteAt == null) return;
  // Extension accepted (or clock skew) after we were scheduled —
  // push the timer out.
  if (autoCompleteAt > Date.now() + 1_000) {
    scheduleRideEndTimer(booking);
    return;
  }

  booking.status = BOOKING_STATUS.COMPLETED;
  booking.timeline.completedAt = new Date();

  if (
    booking.paymentMode === PAYMENT_MODE.POST_RIDE &&
    booking.paymentStatus === BOOKING_PAYMENT_STATUS.NOT_DUE_YET
  ) {
    booking.paymentStatus = BOOKING_PAYMENT_STATUS.PENDING;
  }

  await settleWaitingBuffer(booking);
  await clearPendingExtensionsOnTerminate(booking, 'ride_end_auto_complete');
  await booking.save();

  if (booking.driverId) {
    Driver.updateOne({ _id: booking.driverId }, { $set: { isOnTrip: false } }).catch(
      (err) =>
        console.warn(
          '[rideEnd] failed to clear driver.isOnTrip:',
          err?.message,
        ),
    );
  }

  recordCompletedTripPlatformRevenue(booking).catch((err) =>
    console.warn('[rideEnd] revenue write failed:', err?.message),
  );

  const snap = booking.fareSnapshot || {};
  if (snap.couponId) {
    incrementCouponUsageService(snap.couponId).catch((err) =>
      console.warn('[rideEnd] coupon usage increment failed:', err?.message),
    );
  }

  await settleDriverEarning(booking).catch((err) =>
    console.warn('[rideEnd] driver earning settle failed:', err?.message),
  );

  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    reason: 'ride_end_auto_complete',
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);
  if (booking.driverId) {
    emitToDriver(booking.driverId, S2C_EVENTS.BOOKING_UPDATED, payload);
  }

  notifyUserTripCompleted(booking.userId, booking).catch(() => null);
  queueBookingInvoiceEmail(booking);

  if (booking.driverId) {
    const earning =
      Number(booking.fareSnapshot?.breakdown?.driverEarning) || 0;
    if (earning > 0) {
      notifyDriverEarningsCredited(booking.driverId, {
        amountRupees: earning,
        bookingId: booking._id,
      }).catch(() => null);
    }
  }
}

/** Dev-only: fire the extend nudge immediately (skips lead-time wait). */
export async function triggerExtensionPromptNow(bookingId) {
  await sendRideEndingSoonPrompt(bookingId);
  return { ok: true };
}

/** Dev-only: run auto-complete settlement immediately if past grace. */
export async function triggerAutoCompleteNow(bookingId) {
  await autoCompleteExpiredRide(bookingId);
  const booking = await Booking.findById(bookingId).lean();
  return { ok: true, status: booking?.status || null };
}
