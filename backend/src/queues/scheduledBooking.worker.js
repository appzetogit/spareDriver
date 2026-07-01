import { getRedisConnection } from '../config/redis.js';
import {
  SCHEDULED_BOOKING_QUEUE_NAME,
  SCHEDULED_JOB_NAMES,
} from './scheduledBooking.queue.js';
import {
  kickoffScheduledAssignment,
  runScheduledRetry,
  sendScheduledReminder,
} from '../services/bookingScheduled.service.js';

/**
 * BullMQ worker for the scheduled-booking queue.
 *
 * Started once at server boot from `server.js`. If Redis isn't configured
 * the worker is skipped entirely (with a warning) so dev/CI can still run.
 *
 * Handlers are intentionally tiny — they delegate to
 * `bookingScheduled.service.js` / `bookingEmergencyPool.service.js` which
 * own the business logic.
 *
 * Errors thrown from a handler bubble up to BullMQ, which respects the
 * queue's `attempts` + `backoff` config. We log inline to make ops
 * triage easier.
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
        const { bookingId, minutesAhead } = job.data || {};
        if (!bookingId) {
          throw new Error('scheduledBooking job missing bookingId');
        }
        switch (job.name) {
          case SCHEDULED_JOB_NAMES.ASSIGN:
            await kickoffScheduledAssignment(bookingId);
            return { ok: true, kind: 'assign' };
          case SCHEDULED_JOB_NAMES.RETRY:
            await runScheduledRetry(bookingId);
            return {
              ok: true,
              kind: 'retry',
              attempt: job.data?.attemptNumber || null,
            };
          case SCHEDULED_JOB_NAMES.REMINDER:
            await sendScheduledReminder(bookingId, Number(minutesAhead) || 0);
            return { ok: true, kind: 'reminder', minutesAhead };
          case SCHEDULED_JOB_NAMES.ESCALATE: {
            // Dynamic import keeps `bookingEmergencyPool.service.js` and
            // `scheduledBooking.queue.js` out of the same module boot cycle
            // (the queue file is imported at the top, the service imports
            // the queue back for cleanup).
            const { escalateToEmergencyPool } = await import(
              '../services/bookingEmergencyPool.service.js'
            );
            await escalateToEmergencyPool(bookingId);
            return { ok: true, kind: 'escalate' };
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
          escalateBooking: job?.name === SCHEDULED_JOB_NAMES.ASSIGN
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
      console.log(
        `[scheduledBooking] ${job.name} completed for booking ${data.bookingId}` +
          (data.minutesAhead != null ? ` (-${data.minutesAhead}m)` : ''),
      );
    });

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
