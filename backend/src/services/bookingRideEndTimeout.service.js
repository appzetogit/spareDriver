import Booking from '../models/booking.model.js';
import {
  BOOKING_STATUS,
  PAYMENT_POLICY,
} from '../constants/bookingStatus.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToBooking,
} from '../utils/socketEmitters.js';
import { notifyUserRideEndingSoon } from '../utils/notificationDispatch.js';
import { tickOvertimeQuote } from './bookingOvertime.service.js';
import {
  isOutstationRideEndBooking,
  isHourlyRideEndBooking,
  isRideEndEligibleBooking,
  resolveOutstationRideEndConfig,
  bookedRideDurationMs,
  rideEndsAtMs,
  rideExtensionPromptAtMs,
  rideGraceEndsAtMs,
  rideOvertimeStartsAtMs,
  rideAutoCompleteAtMs,
} from './bookingRideWindow.js';

export {
  isOutstationRideEndBooking,
  isHourlyRideEndBooking,
  isRideEndEligibleBooking,
  resolveOutstationRideEndConfig,
  bookedRideDurationMs,
  rideEndsAtMs,
  rideExtensionPromptAtMs,
  rideGraceEndsAtMs,
  rideOvertimeStartsAtMs,
  rideAutoCompleteAtMs,
};

/**
 * Hourly + outstation ride-end / extend nudge (in-process timers).
 *
 * Hourly / scheduled-hourly:
 *   - Lead: PAYMENT_POLICY.EXTENSION_PROMPT_LEAD_SECONDS
 *   - Grace: PAYMENT_POLICY.RIDE_END_EXTENSION_GRACE_SECONDS
 *   - After grace: overtime payment required (does NOT auto-complete)
 *
 * Outstation:
 *   - returnReminderMinutes → first extend push before return
 *   - returnPromptRepeatMinutes → re-prompt BEFORE return until declined
 *   - returnGraceMinutes → no overtime during grace
 *   - After grace: same overtime payment path as hourly
 *
 * Redis/BullMQ is not used. Restart drops timers;
 * `resumeRideEndScheduleIfNeeded` re-attaches from booking fetch paths.
 */

/** bookingId → { handle, overtimeAt, promptHandle, overtimeHandle, endsAt } */
const rideEndTimers = new Map();

/**
 * Ends-at timestamps we already nudged for (hourly one-shot).
 * Outstation repeats until declined; tracked separately on the booking.
 */
const promptSentForEndsAt = new Map();

const OVERTIME_TICK_MS = 60_000;

function key(id) {
  return String(id);
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

  const overtimeAt = rideOvertimeStartsAtMs(booking);
  if (overtimeAt != null && overtimeAt <= Date.now()) return;

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

async function sendRideEndingSoonPrompt(bookingId) {
  const k = key(bookingId);
  const entry = rideEndTimers.get(k);
  if (entry) entry.promptHandle = null;

  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.STARTED) return;
  if (!isRideEndEligibleBooking(booking)) return;

  if (isOutstationRideEndBooking(booking) && extensionPromptDeclined(booking)) {
    return;
  }

  const endsAt = rideEndsAtMs(booking);
  const promptAt = rideExtensionPromptAtMs(booking);
  if (endsAt == null || promptAt == null) return;

  if (promptAt > Date.now() + 1_000) {
    if (entry) scheduleExtensionPrompt(booking, entry);
    else scheduleRideEndTimer(booking);
    return;
  }

  if (isOutstationRideEndBooking(booking) && Date.now() >= endsAt) return;

  const overtimeAt = rideOvertimeStartsAtMs(booking);
  if (overtimeAt != null && overtimeAt <= Date.now()) return;

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
  const overtimeAt = rideOvertimeStartsAtMs(booking);
  if (overtimeAt == null) return;

  clearOvertimeHandle(entry);
  const delay = Math.max(0, overtimeAt - Date.now());
  const bookingId = booking._id;
  entry.overtimeHandle = setTimeout(() => {
    runOvertimeTick(bookingId).catch((err) =>
      console.warn('[rideEnd] overtime tick failed:', err?.message),
    );
  }, delay);
}

async function runOvertimeTick(bookingId) {
  const k = key(bookingId);
  const entry = rideEndTimers.get(k);

  const result = await tickOvertimeQuote(bookingId);
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status !== BOOKING_STATUS.STARTED) {
    clearOvertimeHandle(entry);
    return result;
  }
  if (booking.overtime?.paymentStatus === 'paid') {
    clearOvertimeHandle(entry);
    return result;
  }

  if (entry) {
    entry.overtimeHandle = setTimeout(() => {
      runOvertimeTick(bookingId).catch(() => null);
    }, OVERTIME_TICK_MS);
  }
  return result;
}

/**
 * @deprecated Wallet overtime ticks are retired. Recalculates the live
 * quote instead. Kept so older call sites compile.
 */
export async function settleOutstationOvertimeTick(bookingId, { final = false } = {}) {
  if (final) return { skipped: true, reason: 'wallet_overtime_retired' };
  return tickOvertimeQuote(bookingId);
}

/**
 * Schedule (or replace) ride-end timers for a STARTED hourly or
 * outstation booking. Safe after start and after every accepted extension.
 */
export function scheduleRideEndTimer(booking) {
  if (!booking?._id) return;
  if (booking.status !== BOOKING_STATUS.STARTED) return;
  if (!isRideEndEligibleBooking(booking)) return;

  const endsAt = rideEndsAtMs(booking);
  if (endsAt == null) return;

  const k = key(booking._id);
  const prev = rideEndTimers.get(k);
  if (prev?.handle) clearTimeout(prev.handle);
  clearPromptHandle(prev);
  clearOvertimeHandle(prev);

  const overtimeAt = rideOvertimeStartsAtMs(booking);
  const entry = {
    handle: null,
    overtimeAt,
    promptHandle: null,
    overtimeHandle: null,
    endsAt,
  };
  rideEndTimers.set(k, entry);

  scheduleOvertimeTicker(booking, entry);
  scheduleExtensionPrompt(booking, entry);
}

export function resumeRideEndScheduleIfNeeded(booking) {
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.STARTED) return;
  if (rideEndTimers.has(key(booking._id))) return;
  if (rideEndsAtMs(booking) == null) return;
  scheduleRideEndTimer(booking);
}

/**
 * Customer declined the extend popup — stop pre-end repeats.
 * Does not affect overtime after return/grace.
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

/** Dev-only: fire the extend nudge immediately (skips lead-time wait). */
export async function triggerExtensionPromptNow(bookingId) {
  await sendRideEndingSoonPrompt(bookingId);
  return { ok: true };
}

/** Dev-only: enter overtime (no auto-complete). */
export async function triggerAutoCompleteNow(bookingId) {
  const { triggerOvertimeNow } = await import('./bookingOvertime.service.js');
  return triggerOvertimeNow(bookingId);
}
