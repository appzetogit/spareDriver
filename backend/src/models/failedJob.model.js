import mongoose from 'mongoose';

export const FAILED_JOB_STATUS = Object.freeze({
  PENDING: 'pending',
  RETRYING: 'retrying',
  RESOLVED: 'resolved',
  ESCALATED: 'escalated',
});

const failedJobSchema = new mongoose.Schema(
  {
    jobName: { type: String, required: true, trim: true, index: true },
    queueName: { type: String, default: 'scheduled-booking', trim: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    error: { type: String, default: '', trim: true },
    retryCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: Object.values(FAILED_JOB_STATUS),
      default: FAILED_JOB_STATUS.PENDING,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
      index: true,
    },
    resolvedAt: { type: Date, default: null },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    resolutionNote: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

failedJobSchema.index({ status: 1, createdAt: -1 });

const FailedJob =
  mongoose.models.FailedJob || mongoose.model('FailedJob', failedJobSchema);

export default FailedJob;
