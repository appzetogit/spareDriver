/**
 * Outstation return-lifecycle helpers (phase derivation + snapshot).
 *
 * Extend nudges / auto-complete / overtime now run via in-process timers
 * in `bookingRideEndTimeout.service.js` (same path as hourly). Redis
 * `outstation-return-*` jobs are cancelled no-ops for backward compat.
 */

import Booking from '../models/booking.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  BOOKING_STATUS,
  BOOKING_TYPE,
} from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { getScheduledBookingQueue } from '../queues/scheduledBooking.queue.js';

export const OUTSTATION_RETURN_PHASE = Object.freeze({
  NONE: 'none',
  APPROACHING: 'approaching',
  REACHED: 'reached',
  GRACE: 'grace',
  AWAITING_DECISION: 'awaiting_decision',
});

const DEFAULT_REMINDER_MINUTES = 120;
const DEFAULT_GRACE_MINUTES = 30;
const DEFAULT_PROMPT_REPEAT_MINUTES = 30;

function isOutstationBooking(booking) {
  return (
    booking?.serviceType === SERVICE_TYPES.OUTSTATION ||
    booking?.bookingType === BOOKING_TYPE.OUTSTATION
  );
}

function expectedReturnMs(booking) {
  const src =
    booking?.outstation?.expectedReturnAt || booking?.outstation?.endDate;
  if (!src) return null;
  const ms = new Date(src).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function resolveReturnConfig(booking) {
  const o = booking?.outstation || {};
  const bd = booking?.fareSnapshot?.breakdown || {};
  return {
    reminderMinutes: numOr(
      o.returnReminderMinutes ?? bd.returnReminderMinutes,
      DEFAULT_REMINDER_MINUTES,
    ),
    graceMinutes: numOr(
      o.returnGraceMinutes ?? bd.returnGraceMinutes,
      DEFAULT_GRACE_MINUTES,
    ),
    promptRepeatMinutes: numOr(
      o.returnPromptRepeatMinutes ?? bd.returnPromptRepeatMinutes,
      DEFAULT_PROMPT_REPEAT_MINUTES,
    ),
  };
}

/**
 * Derive the current return phase for FE / analytics.
 */
export function deriveOutstationReturnPhase(booking, nowMs = Date.now()) {
  if (!isOutstationBooking(booking)) return OUTSTATION_RETURN_PHASE.NONE;
  if (booking.status !== BOOKING_STATUS.STARTED) {
    return OUTSTATION_RETURN_PHASE.NONE;
  }
  const endMs = expectedReturnMs(booking);
  if (endMs == null) return OUTSTATION_RETURN_PHASE.NONE;

  const cfg = resolveReturnConfig(booking);
  const reminderAt = endMs - cfg.reminderMinutes * 60_000;
  const graceEndsAt = endMs + cfg.graceMinutes * 60_000;

  if (nowMs < reminderAt) return OUTSTATION_RETURN_PHASE.NONE;
  if (nowMs < endMs) return OUTSTATION_RETURN_PHASE.APPROACHING;
  if (nowMs < graceEndsAt) return OUTSTATION_RETURN_PHASE.GRACE;
  if (booking.outstation?.returnReachedPromptedAt) {
    return OUTSTATION_RETURN_PHASE.AWAITING_DECISION;
  }
  return OUTSTATION_RETURN_PHASE.REACHED;
}

function returnJobId(kind, bookingId) {
  return `outstation-${kind}-${String(bookingId)}`;
}

async function removeReturnJobs(bookingId) {
  const queue = await getScheduledBookingQueue();
  if (!queue) return;
  const id = String(bookingId);
  const ids = [
    returnJobId('return-approaching', id),
    returnJobId('return-reached', id),
    returnJobId('return-prompt', id),
  ];
  await Promise.all(
    ids.map(async (jobId) => {
      try {
        const job = await queue.getJob(jobId);
        if (job) await job.remove();
      } catch {
        /* ignore */
      }
    }),
  );
}

/**
 * Arm (or re-arm) return lifecycle jobs for a STARTED outstation booking.
 * @deprecated Outstation extend/ride-end now uses in-process timers in
 * `bookingRideEndTimeout.service.js` (same as hourly). This cancels any
 * leftover Redis jobs and returns false.
 */
export async function scheduleOutstationReturnJobs(booking) {
  if (booking?._id) await removeReturnJobs(String(booking._id));
  return false;
}

export async function rescheduleOutstationReturnJobs(booking) {
  return scheduleOutstationReturnJobs(booking);
}

export async function cancelOutstationReturnJobs(bookingId) {
  await removeReturnJobs(bookingId);
}

/**
 * Snapshot return knobs onto the booking at trip start so later admin
 * edits don't change an in-flight trip's lifecycle.
 */
export function snapshotOutstationReturnConfig(booking, pricingOutstation = {}) {
  if (!booking?.outstation) return;
  const o = pricingOutstation || {};
  const bd = booking.fareSnapshot?.breakdown || {};
  booking.outstation.returnReminderMinutes = numOr(
    booking.outstation.returnReminderMinutes ??
      bd.returnReminderMinutes ??
      o.returnReminderMinutes,
    DEFAULT_REMINDER_MINUTES,
  );
  booking.outstation.returnGraceMinutes = numOr(
    booking.outstation.returnGraceMinutes ??
      bd.returnGraceMinutes ??
      o.returnGraceMinutes,
    DEFAULT_GRACE_MINUTES,
  );
  booking.outstation.returnPromptRepeatMinutes = numOr(
    booking.outstation.returnPromptRepeatMinutes ??
      bd.returnPromptRepeatMinutes ??
      o.returnPromptRepeatMinutes,
    DEFAULT_PROMPT_REPEAT_MINUTES,
  );
  booking.outstation.returnAutoCompleteHours = numOr(
    booking.outstation.returnAutoCompleteHours ??
      bd.returnAutoCompleteHours ??
      o.returnAutoCompleteHours,
    0,
  );
  // Clear decline when (re)snapshotting at start so a fresh trip can prompt.
  booking.outstation.extensionPromptDeclinedAt = null;
}

/** Worker: legacy Redis job — outstation extend now uses in-process timers. */
export async function handleOutstationReturnApproaching(bookingId) {
  await removeReturnJobs(bookingId);
  return { skipped: true, reason: 'deprecated_use_ride_end_timers' };
}

/** Worker: legacy Redis job — outstation extend now uses in-process timers. */
export async function handleOutstationReturnReached(bookingId) {
  await removeReturnJobs(bookingId);
  return { skipped: true, reason: 'deprecated_use_ride_end_timers' };
}

/** Worker: legacy Redis job — outstation extend now uses in-process timers. */
export async function handleOutstationReturnPromptRepeat(bookingId) {
  await removeReturnJobs(bookingId);
  return { skipped: true, reason: 'deprecated_use_ride_end_timers' };
}

/**
 * Customer acknowledges "continue as planned" on the approaching prompt.
 * Does not complete the trip — only acknowledges the reminder.
 */
export async function acknowledgeOutstationReturnPromptService(
  userId,
  bookingId,
  { action = 'continue' } = {},
) {
  const booking = await Booking.findOne({
    _id: bookingId,
    userId,
    isDeleted: false,
  });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!isOutstationBooking(booking)) {
    throw new ApiError(400, 'Return prompts apply only to outstation trips');
  }
  if (booking.status !== BOOKING_STATUS.STARTED) {
    throw new ApiError(400, 'Trip is not in progress');
  }

  // "continue" on approaching is a no-op beyond ack; extend is handled
  // by the existing extension endpoints.
  return {
    bookingId: String(booking._id),
    action,
    returnPhase: deriveOutstationReturnPhase(booking),
    expectedReturnAt: booking.outstation?.expectedReturnAt,
  };
}

/** Attach derived returnPhase onto a booking object for API responses. */
export function attachOutstationReturnPhase(bookingObj) {
  if (!bookingObj || !isOutstationBooking(bookingObj)) return bookingObj;
  bookingObj.returnPhase = deriveOutstationReturnPhase(bookingObj);
  return bookingObj;
}
