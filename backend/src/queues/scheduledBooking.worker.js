import { getRedisConnection } from '../config/redis.js';
import {
  SCHEDULED_BOOKING_QUEUE_NAME,
  SCHEDULED_JOB_NAMES,
  ensureEscalateBatchScheduler,
} from './scheduledBooking.queue.js';
import {
  kickoffScheduledAssignment,
  runScheduledRetry,
  sendScheduledReminder,
  runScheduledInboxBatchJob,
} from '../services/bookingScheduled.service.js';

/**
 * BullMQ worker for the scheduled-booking queue.
 *
 * Started once at server boot from `server.js`. If Redis isn't configured
 * the worker is skipped entirely (with a warning) so dev/CI can still run.
 *
 * On start we also arm the recurring `escalate-batch` scheduler so overdue
 * unmatched scheduled bookings enter the emergency pool without
 * per-booking delayed escalate jobs.
 */

let workerInstance = null;
let dynamicBullmq = null;

export async function startScheduledBookingWorker() {
  if (workerInstance) return workerInstance;
  const connection = await getRedisConnection();
  if (!connection) {
    console.warn(
      '[scheduledBooking] worker disabled — Redis not configured. ' +
        'Scheduled rides will not auto-dispatch until REDIS_URL is set.',
    );
    return null;
  }
  try {
    if (!dynamicBullmq) {
      dynamicBullmq = await import('bullmq');
    }
    workerInstance = new dynamicBullmq.Worker(
      SCHEDULED_BOOKING_QUEUE_NAME,
      async (job) => {
        switch (job.name) {
          case SCHEDULED_JOB_NAMES.ESCALATE_BATCH:
            return runScheduledInboxBatchJob();
          case SCHEDULED_JOB_NAMES.ASSIGN: {
            const { bookingId } = job.data || {};
            if (!bookingId) throw new Error('scheduledBooking assign missing bookingId');
            await kickoffScheduledAssignment(bookingId);
            return { ok: true, kind: 'assign' };
          }
          case SCHEDULED_JOB_NAMES.RETRY: {
            // Legacy drain — new bookings no longer enqueue retries.
            const { bookingId } = job.data || {};
            if (!bookingId) throw new Error('scheduledBooking retry missing bookingId');
            await runScheduledRetry(bookingId);
            return {
              ok: true,
              kind: 'retry',
              attempt: job.data?.attemptNumber || null,
              drained: true,
            };
          }
          case SCHEDULED_JOB_NAMES.REMINDER: {
            const { bookingId, minutesAhead } = job.data || {};
            if (!bookingId) throw new Error('scheduledBooking reminder missing bookingId');
            await sendScheduledReminder(bookingId, Number(minutesAhead) || 0);
            return { ok: true, kind: 'reminder', minutesAhead };
          }
          case SCHEDULED_JOB_NAMES.ESCALATE: {
            // Legacy per-booking escalate — still safe for in-flight jobs;
            // new bookings rely on escalate-batch instead.
            const { bookingId } = job.data || {};
            if (!bookingId) throw new Error('scheduledBooking escalate missing bookingId');
            const { escalateToEmergencyPool } = await import(
              '../services/bookingEmergencyPool.service.js'
            );
            await escalateToEmergencyPool(bookingId);
            return { ok: true, kind: 'escalate', legacy: true };
          }
          default:
            throw new Error(`Unknown scheduledBooking job name: ${job.name}`);
        }
      },
      { connection, concurrency: 5 },
    );

    workerInstance.on('failed', async (job, err) => {
      console.warn(
        '[scheduledBooking] job failed:',
        job?.name,
        job?.data?.bookingId,
        err?.message || err,
      );
      try {
        const { recordFailedJobService } = await import('../services/failedJob.service.js');
        await recordFailedJobService({
          jobName: job?.name || 'unknown',
          queueName: SCHEDULED_BOOKING_QUEUE_NAME,
          payload: job?.data || {},
          error: err?.message || String(err),
          bookingId: job?.data?.bookingId || null,
          escalateBooking:
            job?.name === SCHEDULED_JOB_NAMES.ASSIGN
            || job?.name === SCHEDULED_JOB_NAMES.RETRY,
        });
      } catch (recordErr) {
        console.warn('[scheduledBooking] failed to record failed job:', recordErr?.message);
      }
    });
    workerInstance.on('error', (err) => {
      console.warn('[scheduledBooking] worker error:', err?.message || err);
    });
    workerInstance.on('completed', (job) => {
      const data = job?.data || {};
      if (job?.name === SCHEDULED_JOB_NAMES.ESCALATE_BATCH) {
        console.log('[scheduledBooking] escalate-batch completed', job.returnvalue || {});
        return;
      }
      console.log(
        `[scheduledBooking] ${job.name} completed for booking ${data.bookingId}` +
          (data.minutesAhead != null ? ` (-${data.minutesAhead}m)` : ''),
      );
    });

    await ensureEscalateBatchScheduler();

    console.log('[scheduledBooking] worker started');
    return workerInstance;
  } catch (err) {
    console.warn('[scheduledBooking] failed to start worker:', err?.message || err);
    return null;
  }
}

export async function stopScheduledBookingWorker() {
  if (!workerInstance) return;
  try {
    await workerInstance.close();
  } catch {
    // ignore — close can throw if the connection is already torn down
  } finally {
    workerInstance = null;
  }
}
