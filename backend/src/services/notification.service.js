import Notification from '../models/notification.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  NOTIFICATION_AUDIENCE,
  NOTIFICATION_RETENTION_DAYS,
} from '../constants/notificationTypes.js';

export function notificationRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function buildFilter({ audience, userId, driverId, isRead }) {
  const filter = {
    audience,
    createdAt: { $gte: notificationRetentionCutoff() },
  };
  if (userId) filter.userId = userId;
  if (driverId) filter.driverId = driverId;
  if (typeof isRead === 'boolean') filter.isRead = isRead;
  return filter;
}

/** Delete notifications older than the retention window (all audiences). */
export async function purgeExpiredNotificationsService() {
  const cutoff = notificationRetentionCutoff();
  const [expired, noisyAdmin] = await Promise.all([
    Notification.deleteMany({ createdAt: { $lt: cutoff } }),
    // Drop historically persisted admin noise we no longer keep.
    Notification.deleteMany({
      audience: NOTIFICATION_AUDIENCE.ADMIN,
      type: {
        $in: [
          'new_user_registration',
          'new_vendor_registration',
          'scheduled_dispatch_retry',
        ],
      },
    }),
  ]);
  return {
    deletedCount: (expired.deletedCount || 0) + (noisyAdmin.deletedCount || 0),
  };
}

export async function createNotificationRecord({
  audience,
  userId = null,
  driverId = null,
  title,
  body = '',
  type,
  severity = 'info',
  data = {},
}) {
  return Notification.create({
    audience,
    userId,
    driverId,
    title,
    body,
    type,
    severity,
    data,
    isRead: false,
  });
}

export async function listNotificationsService({
  audience,
  userId,
  driverId,
  page = 1,
  limit = 20,
} = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const filter = buildFilter({ audience, userId, driverId });
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, isRead: false }),
  ]);
  return { notifications, total, unreadCount, page: safePage, limit: safeLimit };
}

export async function listUnreadNotificationsService({ audience, userId, driverId } = {}) {
  const filter = buildFilter({ audience, userId, driverId, isRead: false });
  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return { notifications, unreadCount: notifications.length };
}

export async function markNotificationReadService(notificationId, { audience, userId, driverId }) {
  const filter = { _id: notificationId, audience };
  if (userId) filter.userId = userId;
  if (driverId) filter.driverId = driverId;
  const updated = await Notification.findOneAndUpdate(
    filter,
    { $set: { isRead: true, readAt: new Date() } },
    { new: true },
  ).lean();
  if (!updated) throw new ApiError(404, 'Notification not found');
  return updated;
}

export async function markAllNotificationsReadService({ audience, userId, driverId }) {
  const filter = buildFilter({ audience, userId, driverId, isRead: false });
  const result = await Notification.updateMany(filter, {
    $set: { isRead: true, readAt: new Date() },
  });
  return { modifiedCount: result.modifiedCount || 0 };
}

export async function listAdminNotificationsService({ page = 1, limit = 20 } = {}) {
  return listNotificationsService({
    audience: NOTIFICATION_AUDIENCE.ADMIN,
    page,
    limit,
  });
}
