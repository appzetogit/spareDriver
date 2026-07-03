import FailedJob, { FAILED_JOB_STATUS } from '../models/failedJob.model.js';
import { ApiError } from '../utils/apiError.js';
import { sendAdminNotification } from './pushNotification.service.js';
import { ADMIN_NOTIFICATION } from '../constants/notificationTypes.js';
import { escalateToEmergencyPool } from './bookingEmergencyPool.service.js';

/**
 * Record a failed scheduler/cron job, notify admins, and optionally
 * escalate the related booking to the emergency pool.
 */
export async function recordFailedJobService({
  jobName,
  queueName = 'scheduled-booking',
  payload = {},
  error = '',
  bookingId = null,
  escalateBooking = false,
}) {
  const doc = await FailedJob.create({
    jobName,
    queueName,
    payload,
    error: String(error || '').slice(0, 2000),
    bookingId,
    retryCount: 0,
    status: FAILED_JOB_STATUS.PENDING,
  });

  await sendAdminNotification({
    title: 'Scheduled job failed',
    body: `${jobName} failed: ${String(error || 'unknown error').slice(0, 120)}`,
    type: ADMIN_NOTIFICATION.SCHEDULER_JOB_FAILED,
    severity: 'error',
    data: {
      failedJobId: String(doc._id),
      jobName,
      bookingId: bookingId ? String(bookingId) : null,
      payload,
    },
  });

  if (escalateBooking && bookingId) {
    try {
      await escalateToEmergencyPool(bookingId);
      doc.status = FAILED_JOB_STATUS.ESCALATED;
      await doc.save();
    } catch (err) {
      console.warn('[failedJob] emergency pool escalation failed:', err?.message);
    }
  }

  return doc;
}

export async function listFailedJobsService({ page = 1, limit = 20, status } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const filter = {};
  if (status) filter.status = status;
  const [jobs, total] = await Promise.all([
    FailedJob.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    FailedJob.countDocuments(filter),
  ]);
  return { jobs, total, page: safePage, limit: safeLimit };
}

export async function retryFailedJobService(jobId, admin = null) {
  const job = await FailedJob.findById(jobId);
  if (!job) throw new ApiError(404, 'Failed job not found');
  if (job.status === FAILED_JOB_STATUS.RESOLVED) {
    throw new ApiError(400, 'Job already resolved');
  }

  job.retryCount += 1;
  job.status = FAILED_JOB_STATUS.RETRYING;
  await job.save();

  const bookingId = job.bookingId || job.payload?.bookingId;
  if (bookingId) {
    const { kickoffScheduledAssignment, runScheduledRetry } = await import(
      './bookingScheduled.service.js'
    );
    if (job.jobName === 'assign') {
      await kickoffScheduledAssignment(bookingId);
    } else if (job.jobName === 'retry') {
      await runScheduledRetry(bookingId);
    } else if (job.jobName === 'escalate') {
      await escalateToEmergencyPool(bookingId);
    }
  }

  job.status = FAILED_JOB_STATUS.RESOLVED;
  job.resolvedAt = new Date();
  job.resolvedBy = admin?._id || null;
  job.resolutionNote = 'Retried manually by admin';
  await job.save();
  return job;
}

export async function resolveFailedJobService(jobId, { note = '' } = {}, admin = null) {
  const job = await FailedJob.findById(jobId);
  if (!job) throw new ApiError(404, 'Failed job not found');
  job.status = FAILED_JOB_STATUS.RESOLVED;
  job.resolvedAt = new Date();
  job.resolvedBy = admin?._id || null;
  job.resolutionNote = String(note || 'Manually resolved').slice(0, 500);
  await job.save();
  return job;
}
