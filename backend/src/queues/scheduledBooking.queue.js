import { getRedisConnection } from '../config/redis.js';
import { SCHEDULED_BOOKING } from '../constants/bookingStatus.js';

/**
 * BullMQ queue for the scheduled-ride flow.
 *
 * Job kinds:
 *
 *   assign         (single, fires LONG_LEAD_HOURS / LEAD_SCHEDULE_HOUR
 *                  before pickup — see `decideScheduleTier`)
 *     → flips PENDING_ASSIGNMENT → SEARCHING and broadcasts the open
 *       inbox to every matching driver. Skipped (delay = 0) for morning
 *       + short-window tiers because they already searched at create.
 *
 *   reminder-{m}   (one per offset in REMINDER_OFFSETS_MINUTES)
 *     → emits a NOTIFICATION over socket so the user/driver app can
 *       toast. ONLY enqueued AFTER a driver has been assigned.
 *
 *   escalate-batch (repeatable, every EMERGENCY_POOL_BATCH_INTERVAL_MINUTES)
 *     → scans for unmatched scheduled bookings past escalateAt and
 *       moves them into the admin emergency pool. Worst-case lag into
 *       the pool ≈ one batch interval after cutoff.
 *
 * Legacy (still handled by the worker for in-flight / drain):
 *   retry-{n}, escalate (per-booking) — no longer enqueued for new
 *   bookings; handlers no-op or drain safely.
 *
 * Job IDs are deterministic so re-creates are idempotent and cancelling
 * a booking can target & remove jobs by ID without scanning.
 *
 * Falls back to a no-op when Redis is not configured.
 */

export const SCHEDULED_BOOKING_QUEUE_NAME = 'scheduled-booking';

export const SCHEDULED_JOB_NAMES = Object.freeze({
  ASSIGN: 'assign',
  RETRY: 'retry',
  REMINDER: 'reminder',
  ESCALATE: 'escalate',
  ESCALATE_BATCH: 'escalate-batch',
});

export const ESCALATE_BATCH_JOB_ID = 'escalate-batch-recurring';

let queueInstance = null;
let dynamicBullmq = null;

/**
 * Lazily build (and cache) the singleton Queue. Returns `null` when Redis
 * is not available, in which case the rest of the module degrades to no-ops.
 */
export async function getScheduledBookingQueue() {
  if (queueInstance) return queueInstance;
  const connection = await getRedisConnection();
  if (!connection) return null;
  try {
    if (!dynamicBullmq) {
      dynamicBullmq = await import('bullmq');
    }
    queueInstance = new dynamicBullmq.Queue(SCHEDULED_BOOKING_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    });
    return queueInstance;
  } catch (err) {
    console.warn('[scheduledBooking] failed to create queue:', err?.message || err);
    return null;
  }
}

function jobIdFor(kind, bookingId, qualifier) {
  if (kind === SCHEDULED_JOB_NAMES.ASSIGN) return `assign-${String(bookingId)}`;
  if (kind === SCHEDULED_JOB_NAMES.ESCALATE) return `escalate-${String(bookingId)}`;
  if (kind === SCHEDULED_JOB_NAMES.RETRY) {
    return `retry-${Number(qualifier) || 0}-${String(bookingId)}`;
  }
  return `reminder-${qualifier}-${String(bookingId)}`;
}

async function loadDispatchConfig(serviceType) {
  if (!serviceType) return { ...SCHEDULED_BOOKING };
  try {
    const { default: ServicePricing } = await import('../models/servicePricing.model.js');
    const pricing = await ServicePricing.findOne({ serviceType })
      .select('scheduledDispatch')
      .lean();
    if (pricing?.scheduledDispatch) {
      return { ...SCHEDULED_BOOKING, ...pricing.scheduledDispatch };
    }
  } catch (err) {
    console.warn(
      '[scheduledBooking] failed to fetch pricing for dispatch config, using defaults:',
      err?.message,
    );
  }
  return { ...SCHEDULED_BOOKING };
}

/**
 * Enqueue the assignment kickoff for a scheduled booking. Idempotent.
 * Reminder jobs are queued later via `enqueueReminderJobsForBooking`.
 * Escalation is handled by the recurring `escalate-batch` job — not
 * per-booking delayed escalate jobs.
 *
 * @param {{ _id: any, serviceType: string, hourly?: { scheduledStartAt: Date|string|null } }} booking
 * @returns {Promise<boolean>} true if at least one job was enqueued
 */
export async function enqueueScheduledBookingJobs(booking) {
  const queue = await getScheduledBookingQueue();
  if (!queue) return false;
  const bookingId = String(booking?._id || '');
  const { resolveBookingSearchStartAt } = await import(
    '../utils/bookingInbox.js'
  );
  const startAt = resolveBookingSearchStartAt(booking);
  const start = startAt ? startAt.getTime() : 0;
  if (!bookingId || !start) return false;
  const now = Date.now();

  const config = await loadDispatchConfig(booking.serviceType);

  const { decideScheduleTier } = await import(
    '../services/bookingScheduled.service.js'
  );
  const decision = decideScheduleTier(new Date(start), new Date(now), config);
  const assignDelay = decision.immediate
    ? 0
    : Math.max(0, new Date(decision.assignAt).getTime() - now);

  try {
    await queue.add(
      SCHEDULED_JOB_NAMES.ASSIGN,
      { bookingId, scheduledStartAt: new Date(start).toISOString() },
      {
        jobId: jobIdFor(SCHEDULED_JOB_NAMES.ASSIGN, bookingId),
        delay: assignDelay,
      },
    );
    return true;
  } catch (err) {
    console.warn(
      '[scheduledBooking] failed to enqueue jobs for booking',
      bookingId,
      err?.message || err,
    );
    return false;
  }
}

/**
 * Ensure the recurring emergency-pool batch escalate job exists.
 * Called once at worker boot. Interval comes from SCHEDULED_BOOKING
 * (and optionally a future ServicePricing platform override).
 *
 * @returns {Promise<boolean>}
 */
export async function ensureEscalateBatchScheduler() {
  const queue = await getScheduledBookingQueue();
  if (!queue) return false;

  const intervalMinutes = Math.max(
    5,
    Number(SCHEDULED_BOOKING.EMERGENCY_POOL_BATCH_INTERVAL_MINUTES) || 45,
  );
  const everyMs = intervalMinutes * 60_000;

  try {
    // BullMQ v4+/v5: upsertJobScheduler is preferred; fall back to
    // repeatable add for older clients.
    if (typeof queue.upsertJobScheduler === 'function') {
      await queue.upsertJobScheduler(
        ESCALATE_BATCH_JOB_ID,
        { every: everyMs },
        {
          name: SCHEDULED_JOB_NAMES.ESCALATE_BATCH,
          data: { kind: 'escalate-batch' },
          opts: {
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 100 },
          },
        },
      );
    } else {
      // Remove prior repeatable definitions with the same key, then add.
      const repeatables = await queue.getRepeatableJobs();
      for (const job of repeatables) {
        if (
          job.name === SCHEDULED_JOB_NAMES.ESCALATE_BATCH
          || job.id === ESCALATE_BATCH_JOB_ID
          || job.key?.includes(ESCALATE_BATCH_JOB_ID)
        ) {
          await queue.removeRepeatableByKey(job.key).catch(() => {});
        }
      }
      await queue.add(
        SCHEDULED_JOB_NAMES.ESCALATE_BATCH,
        { kind: 'escalate-batch' },
        {
          jobId: ESCALATE_BATCH_JOB_ID,
          repeat: { every: everyMs },
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 100 },
        },
      );
    }
    console.log(
      `[scheduledBooking] escalate-batch scheduler armed (every ${intervalMinutes}m)`,
    );
    return true;
  } catch (err) {
    console.warn(
      '[scheduledBooking] failed to arm escalate-batch scheduler:',
      err?.message || err,
    );
    return false;
  }
}

/**
 * @deprecated Scheduled dispatch no longer retries empty rounds.
 * Kept as a no-op-safe export for any leftover callers.
 */
export async function enqueueAssignmentRetry(bookingId, opts = {}) {
  console.warn(
    '[scheduledBooking] enqueueAssignmentRetry is deprecated — ignoring',
    String(bookingId),
    opts?.attemptNumber,
  );
  return false;
}

/**
 * Queue the reminder toasts for a freshly-assigned scheduled booking.
 */
export async function enqueueReminderJobsForBooking(booking) {
  const queue = await getScheduledBookingQueue();
  if (!queue) return false;
  const bookingId = String(booking?._id || '');
  const { resolveBookingSearchStartAt } = await import(
    '../utils/bookingInbox.js'
  );
  const startAt = resolveBookingSearchStartAt(booking);
  const start = startAt ? startAt.getTime() : 0;
  if (!bookingId || !start) return false;
  const now = Date.now();

  const config = await loadDispatchConfig(booking.serviceType);
  const reminderOffsets = Array.isArray(config.REMINDER_OFFSETS_MINUTES)
    ? config.REMINDER_OFFSETS_MINUTES
    : SCHEDULED_BOOKING.REMINDER_OFFSETS_MINUTES;

  const tasks = [];
  for (const minutesAhead of reminderOffsets) {
    const offset = Number(minutesAhead);
    if (!Number.isFinite(offset) || offset <= 0) continue;
    const fireAt = start - offset * 60_000;
    if (fireAt <= now) continue;
    tasks.push(
      queue.add(
        SCHEDULED_JOB_NAMES.REMINDER,
        {
          bookingId,
          minutesAhead: offset,
          scheduledStartAt: new Date(start).toISOString(),
        },
        {
          jobId: jobIdFor(SCHEDULED_JOB_NAMES.REMINDER, bookingId, offset),
          delay: fireAt - now,
        },
      ),
    );
  }

  if (!tasks.length) return false;
  try {
    await Promise.all(tasks);
    return true;
  } catch (err) {
    console.warn(
      '[scheduledBooking] failed to enqueue reminders for booking',
      bookingId,
      err?.message || err,
    );
    return false;
  }
}

/**
 * Snapshot of jobs in the scheduled-booking BullMQ queue for the admin
 * Queue module. Hides legacy leftovers (`assign`, `escalate`, `retry`) —
 * the live surface is reminders + escalate-batch only.
 *
 * @param {{ limit?: number, state?: string, name?: string, includeLegacy?: boolean }} [opts]
 */
export async function listScheduledBookingJobs({
  limit = 200,
  state = null,
  name = null,
  includeLegacy = false,
} = {}) {
  const queue = await getScheduledBookingQueue();
  if (!queue) {
    return {
      enabled: false,
      counts: {},
      jobs: [],
      total: 0,
    };
  }

  /** Per-booking leftovers from the old wave/escalate flow — never shown by default. */
  const LEGACY_JOB_NAMES = new Set([
    SCHEDULED_JOB_NAMES.ASSIGN,
    SCHEDULED_JOB_NAMES.ESCALATE,
    SCHEDULED_JOB_NAMES.RETRY,
  ]);

  const cap = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const states = ['delayed', 'waiting', 'active', 'failed', 'completed'];
  const stateFilter = state && states.includes(String(state)) ? String(state) : null;

  try {
    const counts = await queue.getJobCounts(...states);
    const perState = Math.min(cap, 100);
    const buckets = await Promise.all(
      (stateFilter ? [stateFilter] : states).map((s) =>
        queue.getJobs([s], 0, perState - 1, true),
      ),
    );

    const rows = [];
    const usedStates = stateFilter ? [stateFilter] : states;
    usedStates.forEach((st, idx) => {
      for (const job of buckets[idx]) {
        if (!includeLegacy && LEGACY_JOB_NAMES.has(job.name)) continue;
        if (name && job.name !== name) continue;

        const ts = job.timestamp || 0;
        const delay = Number(job.delay || 0);
        const nextRunAt = st === 'delayed' ? new Date(ts + delay) : null;
        rows.push({
          id: job.id,
          name: job.name,
          state: st,
          bookingId: job.data?.bookingId || null,
          minutesAhead: job.data?.minutesAhead ?? null,
          scheduledStartAt: job.data?.scheduledStartAt || null,
          createdAt: ts ? new Date(ts).toISOString() : null,
          nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
          processedOn: job.processedOn
            ? new Date(job.processedOn).toISOString()
            : null,
          finishedOn: job.finishedOn
            ? new Date(job.finishedOn).toISOString()
            : null,
          attemptsMade: job.attemptsMade || 0,
          failedReason: job.failedReason || null,
          delay,
        });
      }
    });

    rows.sort((a, b) => {
      if (a.state === 'delayed' && b.state === 'delayed') {
        return new Date(a.nextRunAt || 0) - new Date(b.nextRunAt || 0);
      }
      if (a.state === 'delayed') return -1;
      if (b.state === 'delayed') return 1;
      const aT = new Date(a.finishedOn || a.processedOn || a.createdAt || 0).getTime();
      const bT = new Date(b.finishedOn || b.processedOn || b.createdAt || 0).getTime();
      return bT - aT;
    });

    // Counts: when excluding legacy, recount from filtered rows for accuracy
    // of the visible set (raw Redis counts still include leftovers).
    const visibleCounts = {
      delayed: 0,
      waiting: 0,
      active: 0,
      failed: 0,
      completed: 0,
    };
    for (const row of rows) {
      if (visibleCounts[row.state] != null) visibleCounts[row.state] += 1;
    }

    return {
      enabled: true,
      counts: includeLegacy
        ? {
            delayed: counts.delayed || 0,
            waiting: counts.waiting || 0,
            active: counts.active || 0,
            failed: counts.failed || 0,
            completed: counts.completed || 0,
          }
        : visibleCounts,
      rawCounts: {
        delayed: counts.delayed || 0,
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        failed: counts.failed || 0,
        completed: counts.completed || 0,
      },
      jobs: rows.slice(0, cap),
      total: rows.length,
    };
  } catch (err) {
    console.warn(
      '[scheduledBooking] failed to list jobs:',
      err?.message || err,
    );
    return { enabled: true, counts: {}, jobs: [], total: 0, error: err.message };
  }
}

/**
 * Remove every queued job for a booking. Best-effort.
 */
export async function removeScheduledBookingJobs(bookingId) {
  const queue = await getScheduledBookingQueue();
  if (!queue || !bookingId) return false;
  const bid = String(bookingId);
  try {
    const fixed = [
      jobIdFor(SCHEDULED_JOB_NAMES.ASSIGN, bid),
      jobIdFor(SCHEDULED_JOB_NAMES.ESCALATE, bid),
    ];
    await Promise.all(
      fixed.map(async (id) => {
        const job = await queue.getJob(id);
        if (job) await job.remove();
      }),
    );

    const pending = await queue.getJobs(
      ['delayed', 'waiting', 'active'],
      0,
      500,
      true,
    );
    await Promise.all(
      pending
        .filter((j) => String(j?.data?.bookingId || '') === bid)
        .map((j) => j.remove().catch(() => {})),
    );
    return true;
  } catch (err) {
    console.warn(
      '[scheduledBooking] failed to remove jobs for booking',
      String(bookingId),
      err?.message || err,
    );
    return false;
  }
}
