import mongoose from 'mongoose';

const sosAuditLogSchema = new mongoose.Schema(
  {
    sosId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SosAlert',
      required: true,
      index: true,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    actorType: {
      type: String,
      enum: ['user', 'driver', 'staff', 'system'],
      default: 'system',
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    action: { type: String, required: true, trim: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

sosAuditLogSchema.index({ sosId: 1, createdAt: -1 });

const SosAuditLog =
  mongoose.models.SosAuditLog || mongoose.model('SosAuditLog', sosAuditLogSchema);

export default SosAuditLog;
