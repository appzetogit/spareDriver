/**
 * Outstation-only return lifecycle.
 *
 * Phases (derived — not top-level booking statuses):
 *   none → approaching → reached → grace → awaiting_decision
 *
 * Jobs live on the scheduled-booking BullMQ queue under dedicated
 * job names so hourly reminder / ride-end behaviour is untouched.
 *
 * Rules:
 *   - Never auto-charge overtime
 *   - Never auto-complete by default (returnAutoCompleteHours = 0)
 *   - Return reminder is idempotent via returnReminderSentAt
 *   - Return-reached prompt is idempotent via returnReachedPromptedAt
 *   - After grace, re-prompt on returnPromptRepeatMinutes
 */

import Booking from '../models/booking.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  BOOKING_STATUS,
  BOOKING_TYPE,
} from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToBooking,
  emitToDriver,
} from '../utils/socketEmitters.js';
import {
  notifyUserOutstationReturnApproaching,
  notifyUserOutstationReturnReached,
  notifyDriverOutstationReturnReached,
} from '../utils/notificationDispatch.js';
import {
  SCHEDULED_JOB_NAMES,
  getScheduledBookingQueue,
} from '../queues/scheduledBooking.queue.js';

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
 * Idempotent — replaces existing delayed jobs for this booking.
 */
export async function scheduleOutstationReturnJobs(booking) {
  if (!isOutstationBooking(booking)) return false;
  if (booking.status !== BOOKING_STATUS.STARTED) return false;

  const queue = await getScheduledBookingQueue();
  if (!queue) return false;

  const bookingId = String(booking._id);
  const endMs = expectedReturnMs(booking);
  if (endMs == null) return false;

  const cfg = resolveReturnConfig(booking);
  const now = Date.now();

  await removeReturnJobs(bookingId);

  const tasks = [];

  if (!booking.outstation?.returnReminderSentAt && cfg.reminderMinutes > 0) {
    const fireAt = endMs - cfg.reminderMinutes * 60_000;
    const delay = Math.max(0, fireAt - now);
    // Skip enqueue if already past the approaching window — fire reached instead.
    if (fireAt > now) {
      tasks.push(
        queue.add(
          SCHEDULED_JOB_NAMES.OUTSTATION_RETURN_APPROACHING,
          { bookingId },
          {
            jobId: returnJobId('return-approaching', bookingId),
            delay,
            removeOnComplete: true,
            removeOnFail: { count: 50 },
          },
        ),
      );
    }
  }

  if (!booking.outstation?.returnReachedPromptedAt) {
    const delay = Math.max(0, endMs - now);
    tasks.push(
      queue.add(
        SCHEDULED_JOB_NAMES.OUTSTATION_RETURN_REACHED,
        { bookingId },
        {
          jobId: returnJobId('return-reached', bookingId),
          delay,
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      ),
    );
  } else if (cfg.promptRepeatMinutes > 0) {
    const last =
      booking.outstation?.lastReturnPromptAt ||
      booking.outstation?.returnReachedPromptedAt;
    const lastMs = last ? new Date(last).getTime() : now;
    const nextAt = lastMs + cfg.promptRepeatMinutes * 60_000;
    const delay = Math.max(0, nextAt - now);
    tasks.push(
      queue.add(
        SCHEDULED_JOB_NAMES.OUTSTATION_RETURN_PROMPT,
        { bookingId },
        {
          jobId: returnJobId('return-prompt', bookingId),
          delay,
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      ),
    );
  }

  if (!tasks.length) return false;
  await Promise.all(tasks);
  return true;
}

export async function rescheduleOutstationReturnJobs(booking) {
  return scheduleOutstationReturnJobs(booking);
}

export async function cancelOutstationReturnJobs(bookingId) {
  await removeReturnJobs(bookingId);
}

function buildReturnPayload(booking, phase) {
  const endMs = expectedReturnMs(booking);
  const cfg = resolveReturnConfig(booking);
  return {
    bookingId: String(booking._id),
    serviceType: booking.serviceType,
    bookingType: booking.bookingType,
    status: booking.status,
    returnPhase: phase,
    expectedReturnAt: endMs ? new Date(endMs).toISOString() : null,
    returnGraceMinutes: cfg.graceMinutes,
    returnPromptRepeatMinutes: cfg.promptRepeatMinutes,
    returnReminderMinutes: cfg.reminderMinutes,
    outstation: {
      pickupAt: booking.outstation?.pickupAt,
      expectedReturnAt: booking.outstation?.expectedReturnAt,
      days: booking.outstation?.days,
      nights: booking.outstation?.nights,
      durationMinutes: booking.outstation?.durationMinutes,
      returnReminderSentAt: booking.outstation?.returnReminderSentAt,
      returnReachedPromptedAt: booking.outstation?.returnReachedPromptedAt,
      lastReturnPromptAt: booking.outstation?.lastReturnPromptAt,
    },
  };
}

function emitReturnPrompt(booking, phase) {
  const payload = buildReturnPayload(booking, phase);
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_OUTSTATION_RETURN, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_OUTSTATION_RETURN, payload);
  if (booking.driverId) {
    emitToDriver(booking.driverId, S2C_EVENTS.BOOKING_OUTSTATION_RETURN, payload);
  }
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, {
    bookingId: String(booking._id),
    status: booking.status,
    returnPhase: phase,
    outstation: payload.outstation,
  });
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
}

/** Worker: ~2h before expected return. */
export async function handleOutstationReturnApproaching(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.isDeleted) return { skipped: true, reason: 'missing' };
  if (!isOutstationBooking(booking)) return { skipped: true, reason: 'not_outstation' };
  if (booking.status !== BOOKING_STATUS.STARTED) {
    return { skipped: true, reason: 'not_started' };
  }
  if (booking.outstation?.returnReminderSentAt) {
    return { skipped: true, reason: 'already_sent' };
  }

  const endMs = expectedReturnMs(booking);
  if (endMs == null) return { skipped: true, reason: 'no_return' };
  // If return already passed, let the reached handler own the UX.
  if (Date.now() >= endMs) {
    return handleOutstationReturnReached(bookingId);
  }

  booking.outstation.returnReminderSentAt = new Date();
  await booking.save();

  const phase = OUTSTATION_RETURN_PHASE.APPROACHING;
  emitReturnPrompt(booking, phase);
  notifyUserOutstationReturnApproaching(booking.userId, booking).catch(() => null);

  return { ok: true, phase };
}

/** Worker: at expectedReturnAt. */
export async function handleOutstationReturnReached(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.isDeleted) return { skipped: true, reason: 'missing' };
  if (!isOutstationBooking(booking)) return { skipped: true, reason: 'not_outstation' };
  if (booking.status !== BOOKING_STATUS.STARTED) {
    return { skipped: true, reason: 'not_started' };
  }

  const now = new Date();
  const firstPrompt = !booking.outstation?.returnReachedPromptedAt;
  if (firstPrompt) {
    booking.outstation.returnReachedPromptedAt = now;
  }
  booking.outstation.lastReturnPromptAt = now;
  await booking.save();

  const cfg = resolveReturnConfig(booking);
  const endMs = expectedReturnMs(booking) || now.getTime();
  const graceEndsAt = endMs + cfg.graceMinutes * 60_000;
  const phase =
    Date.now() < graceEndsAt
      ? OUTSTATION_RETURN_PHASE.GRACE
      : OUTSTATION_RETURN_PHASE.AWAITING_DECISION;

  emitReturnPrompt(booking, phase);
  notifyUserOutstationReturnReached(booking.userId, booking, { phase }).catch(
    () => null,
  );
  if (booking.driverId) {
    notifyDriverOutstationReturnReached(booking.driverId, booking).catch(
      () => null,
    );
  }

  // Schedule repeat prompt after grace / repeat interval.
  if (cfg.promptRepeatMinutes > 0) {
    const queue = await getScheduledBookingQueue();
    if (queue) {
      const delay = cfg.promptRepeatMinutes * 60_000;
      await queue.add(
        SCHEDULED_JOB_NAMES.OUTSTATION_RETURN_PROMPT,
        { bookingId: String(booking._id) },
        {
          jobId: returnJobId('return-prompt', booking._id),
          delay,
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      );
    }
  }

  return { ok: true, phase, firstPrompt };
}

/** Worker: repeat prompt after grace — still no auto-charge / complete. */
export async function handleOutstationReturnPromptRepeat(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.isDeleted) return { skipped: true, reason: 'missing' };
  if (!isOutstationBooking(booking)) return { skipped: true, reason: 'not_outstation' };
  if (booking.status !== BOOKING_STATUS.STARTED) {
    return { skipped: true, reason: 'not_started' };
  }

  const endMs = expectedReturnMs(booking);
  if (endMs == null) return { skipped: true, reason: 'no_return' };

  const cfg = resolveReturnConfig(booking);
  const graceEndsAt = endMs + cfg.graceMinutes * 60_000;
  if (Date.now() < graceEndsAt) {
    // Still in grace — wait until grace ends before repeating.
    const queue = await getScheduledBookingQueue();
    if (queue) {
      await queue.add(
        SCHEDULED_JOB_NAMES.OUTSTATION_RETURN_PROMPT,
        { bookingId: String(booking._id) },
        {
          jobId: returnJobId('return-prompt', booking._id),
          delay: Math.max(0, graceEndsAt - Date.now()),
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      );
    }
    return { skipped: true, reason: 'still_in_grace' };
  }

  booking.outstation.lastReturnPromptAt = new Date();
  if (!booking.outstation.returnReachedPromptedAt) {
    booking.outstation.returnReachedPromptedAt = booking.outstation.lastReturnPromptAt;
  }
  await booking.save();

  const phase = OUTSTATION_RETURN_PHASE.AWAITING_DECISION;
  emitReturnPrompt(booking, phase);
  notifyUserOutstationReturnReached(booking.userId, booking, { phase }).catch(
    () => null,
  );

  if (cfg.promptRepeatMinutes > 0) {
    const queue = await getScheduledBookingQueue();
    if (queue) {
      await queue.add(
        SCHEDULED_JOB_NAMES.OUTSTATION_RETURN_PROMPT,
        { bookingId: String(booking._id) },
        {
          jobId: returnJobId('return-prompt', booking._id),
          delay: cfg.promptRepeatMinutes * 60_000,
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      );
    }
  }

  return { ok: true, phase };
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
