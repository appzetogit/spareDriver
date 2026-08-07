import mongoose from 'mongoose';
import {
  NOTIFICATION_AUDIENCE,
  NOTIFICATION_SEVERITY,
} from '../constants/notificationTypes.js';

const notificationSchema = new mongoose.Schema(
  {
    audience: {
      type: String,
      enum: Object.values(NOTIFICATION_AUDIENCE),
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
      index: true,
    },
    /**
     * Zone scope for admin-audience rows. Empty = platform-wide (super
     * admin only). Non-empty = visible to admin/sub_admin + team_members
     * whose assignedZones overlap.
     */
    zoneIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Zone' }],
      default: [],
      index: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '', trim: true },
    type: { type: String, required: true, trim: true, index: true },
    severity: {
      type: String,
      enum: Object.values(NOTIFICATION_SEVERITY),
      default: NOTIFICATION_SEVERITY.INFO,
    },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ audience: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ driverId: 1, isRead: 1, createdAt: -1 });
// Auto-delete after 7 days (Mongo TTL sweeper runs ~every 60s).
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 },
);

const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

export default Notification;
