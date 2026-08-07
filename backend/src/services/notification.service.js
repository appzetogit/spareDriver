import mongoose from 'mongoose';
import Notification from '../models/notification.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  NOTIFICATION_AUDIENCE,
  NOTIFICATION_RETENTION_DAYS,
} from '../constants/notificationTypes.js';
import {
  isSuperAdmin,
  isSubAdmin,
  isTeamMember,
} from '../constants/staffPermissions.js';

export function notificationRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function normalizeZoneObjectIds(zoneIds = []) {
  return (zoneIds || [])
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Admin inbox visibility:
 *   - super admin                    → every admin row
 *   - sub_admin / team_member        → rows whose zoneIds overlap assignedZones
 */
export function buildAdminNotificationFilter(staff, { isRead } = {}) {
  const filter = {
    audience: NOTIFICATION_AUDIENCE.ADMIN,
    createdAt: { $gte: notificationRetentionCutoff() },
  };
  if (typeof isRead === 'boolean') filter.isRead = isRead;

  if (isSuperAdmin(staff)) return filter;

  if (isSubAdmin(staff) || isTeamMember(staff)) {
    const zones = normalizeZoneObjectIds(staff.assignedZones);
    if (!zones.length) {
      filter._id = { $in: [] };
      return filter;
    }
    filter.zoneIds = { $in: zones };
    return filter;
  }

  filter._id = { $in: [] };
  return filter;
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
  zoneIds = [],
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
    zoneIds: normalizeZoneObjectIds(zoneIds),
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

export async function listAdminNotificationsService({
  staff,
  page = 1,
  limit = 20,
} = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const filter = buildAdminNotificationFilter(staff);
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

export async function markAdminNotificationReadService(notificationId, staff) {
  const scoped = buildAdminNotificationFilter(staff);
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, ...scoped },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true },
  ).lean();
  if (!updated) throw new ApiError(404, 'Notification not found');
  return updated;
}

export async function markAllAdminNotificationsReadService(staff) {
  const filter = buildAdminNotificationFilter(staff, { isRead: false });
  const result = await Notification.updateMany(filter, {
    $set: { isRead: true, readAt: new Date() },
  });
  return { modifiedCount: result.modifiedCount || 0 };
}
