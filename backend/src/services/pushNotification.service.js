import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { getFirebaseAdmin, isFirebaseReady } from '../config/firebase.js';
import { emitNotification, emitAdminAlert } from '../utils/socketEmitters.js';
import { collectFcmTokens } from './fcmToken.service.js';
import { createNotificationRecord } from './notification.service.js';
import {
  NOTIFICATION_AUDIENCE,
  NOTIFICATION_SEVERITY,
  ADMIN_PERSISTED_NOTIFICATION_TYPES,
} from '../constants/notificationTypes.js';

const INVALID_FCM_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

async function loadFcmDoc({ userId, driverId }) {
  if (userId) {
    return User.findById(userId)
      .select('fcmToken fcmTokenWeb fcmTokenMobile')
      .lean();
  }
  if (driverId) {
    return Driver.findById(driverId)
      .select('fcmToken fcmTokenWeb fcmTokenMobile')
      .lean();
  }
  return null;
}

async function pruneInvalidToken(target, token) {
  const updates = { fcmTokenWeb: '', fcmTokenMobile: '', fcmToken: '' };
  if (target.userId) {
    const doc = await User.findById(target.userId).select('fcmToken fcmTokenWeb fcmTokenMobile').lean();
    if (!doc) return;
    const patch = {};
    if (doc.fcmTokenWeb === token) patch.fcmTokenWeb = '';
    if (doc.fcmTokenMobile === token) patch.fcmTokenMobile = '';
    if (doc.fcmToken === token) patch.fcmToken = '';
    if (Object.keys(patch).length) {
      await User.findByIdAndUpdate(target.userId, { $set: patch });
    }
    return;
  }
  if (target.driverId) {
    const doc = await Driver.findById(target.driverId).select('fcmToken fcmTokenWeb fcmTokenMobile').lean();
    if (!doc) return;
    const patch = {};
    if (doc.fcmTokenWeb === token) patch.fcmTokenWeb = '';
    if (doc.fcmTokenMobile === token) patch.fcmTokenMobile = '';
    if (doc.fcmToken === token) patch.fcmToken = '';
    if (Object.keys(patch).length) {
      await Driver.findByIdAndUpdate(target.driverId, { $set: patch });
    }
  }
}

function stringifyData(data = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

async function persistUserDriverNotification(target, payload) {
  const audience = target.userId
    ? NOTIFICATION_AUDIENCE.USER
    : NOTIFICATION_AUDIENCE.DRIVER;
  try {
    await createNotificationRecord({
      audience,
      userId: target.userId || null,
      driverId: target.driverId || null,
      title: payload.title,
      body: payload.body || '',
      type: payload.data?.kind || payload.type || 'general',
      severity: payload.severity || NOTIFICATION_SEVERITY.INFO,
      data: payload.data || {},
    });
  } catch (err) {
    console.warn('[push] failed to persist notification:', err?.message);
  }
}

async function sendFcmToTarget(target, { title, body, data }) {
  if (!isFirebaseReady()) return;

  const doc = await loadFcmDoc(target);
  const tokens = collectFcmTokens(doc);
  if (!tokens.length) return;

  const admin = getFirebaseAdmin();
  const messageBase = {
    notification: { title, body },
    data: stringifyData(data),
    android: { priority: data?.priority === 'high' ? 'high' : 'normal' },
    apns: {
      headers: data?.priority === 'high' ? { 'apns-priority': '10' } : {},
      payload: { aps: { sound: 'default' } },
    },
  };

  await Promise.all(
    tokens.map(async (token) => {
      try {
        await admin.messaging().send({ token, ...messageBase });
      } catch (err) {
        const code = err?.code || err?.errorInfo?.code;
        if (INVALID_FCM_CODES.has(code)) {
          await pruneInvalidToken(target, token);
        }
        console.warn('[push] FCM send failed:', err?.message || err);
      }
    }),
  );
}

/**
 * User/driver notification: Socket.IO toast + FCM push + DB record.
 */
export async function sendPushNotification(
  target,
  { title, body = '', severity = 'info', data = {}, type } = {},
) {
  const payload = {
    title,
    body,
    severity,
    data: { ...data, kind: data?.kind || type || 'general' },
    type: data?.kind || type || 'general',
  };

  if (target.userId) {
    emitNotification({ userId: target.userId }, payload);
  } else if (target.driverId) {
    emitNotification({ driverId: target.driverId }, payload);
  }

  await persistUserDriverNotification(target, payload);
  await sendFcmToTarget(target, payload);
}

/**
 * Admin inbox notification: Socket.IO always; DB only for actionable types.
 * Powers the admin panel bell icon.
 */
export async function sendAdminNotification({
  title,
  body = '',
  type,
  severity = 'info',
  data = {},
  persist,
}) {
  const payload = {
    title,
    body,
    severity,
    data: { ...data, kind: type },
  };

  emitAdminAlert({
    kind: type,
    severity: severity === 'error' ? 'critical' : severity,
    message: body || title,
    data: payload.data,
  });
  emitNotification({ admin: true }, payload);

  const shouldPersist =
    typeof persist === 'boolean'
      ? persist
      : ADMIN_PERSISTED_NOTIFICATION_TYPES.has(type);

  if (!shouldPersist) return;

  try {
    await createNotificationRecord({
      audience: NOTIFICATION_AUDIENCE.ADMIN,
      title,
      body,
      type: type || 'admin_alert',
      severity,
      data: payload.data,
    });
  } catch (err) {
    console.warn('[push] failed to persist admin notification:', err?.message);
  }
}
