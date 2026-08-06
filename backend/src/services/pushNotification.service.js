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
  ADMIN_FCM_NOTIFICATION_TYPES,
} from '../constants/notificationTypes.js';
import { STAFF_ROLES } from '../constants/staffPermissions.js';
import { USER_ROLES } from '../constants/roles.js';

const HAS_FCM_FILTER = {
  $or: [
    { fcmTokenWeb: { $exists: true, $nin: [null, ''] } },
    { fcmTokenMobile: { $exists: true, $nin: [null, ''] } },
    { fcmToken: { $exists: true, $nin: [null, ''] } },
  ],
};

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
    if (key === 'fcmTag' || key === 'fcmChannelId' || key === 'fcmSilent') continue;
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

/**
 * @param {object} target
 * @param {{ title?: string, body?: string, data?: object }} payload
 * @param {{ silent?: boolean }} [opts]
 */
async function sendFcmToTarget(target, { title, body, data }, opts = {}) {
  if (!isFirebaseReady()) return;

  const doc = await loadFcmDoc(target);
  const tokens = collectFcmTokens(doc);
  if (!tokens.length) return;

  const admin = getFirebaseAdmin();
  const high = data?.priority === 'high';
  const tag = data?.fcmTag ? String(data.fcmTag) : undefined;
  const channelId = data?.fcmChannelId ? String(data.fcmChannelId) : undefined;
  const silent = Boolean(opts.silent || data?.fcmSilent);

  const dataPayload = stringifyData(data);
  // Keep tag in data so web SW / Flutter can cancel matching notifs.
  if (tag) dataPayload.fcmTag = tag;
  if (channelId) dataPayload.fcmChannelId = channelId;

  const android = { priority: high ? 'high' : 'normal' };
  if (tag) android.collapseKey = tag;
  if (!silent) {
    android.notification = {
      sound: 'default',
      ...(tag ? { tag } : {}),
      ...(channelId ? { channelId } : {}),
    };
  }

  const apns = {
    headers: high ? { 'apns-priority': '10' } : {},
    payload: {
      aps: silent
        ? { 'content-available': 1 }
        : { sound: 'default', ...(tag ? { threadId: tag } : {}) },
    },
  };

  const webpush = {
    headers: high ? { Urgency: 'high' } : {},
  };
  if (!silent) {
    webpush.notification = {
      ...(tag ? { tag } : {}),
      renotify: Boolean(tag),
    };
  }

  const messageBase = {
    data: dataPayload,
    android,
    apns,
    webpush,
  };

  if (!silent && title) {
    messageBase.notification = { title, body: body || '' };
  }

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
 *
 * @param {object} target
 * @param {object} options
 * @param {boolean} [options.persist=true]
 * @param {boolean} [options.emitSocket=true]
 * @param {boolean} [options.fcmSilent=false]  data-oriented FCM (withdraw/cancel)
 */
export async function sendPushNotification(
  target,
  {
    title,
    body = '',
    severity = 'info',
    data = {},
    type,
    persist = true,
    emitSocket = true,
    fcmSilent = false,
  } = {},
) {
  const payload = {
    title,
    body,
    severity,
    data: { ...data, kind: data?.kind || type || 'general' },
    type: data?.kind || type || 'general',
  };

  if (emitSocket) {
    if (target.userId) {
      emitNotification({ userId: target.userId }, payload);
    } else if (target.driverId) {
      emitNotification({ driverId: target.driverId }, payload);
    }
  }

  if (persist) {
    await persistUserDriverNotification(target, payload);
  }
  await sendFcmToTarget(target, payload, { silent: fcmSilent });
}

/**
 * Active staff docs that have an FCM token.
 * When `zoneIds` is provided, team_members are limited to overlapping
 * assignedZones; admin / sub_admin always receive the push.
 */
async function loadStaffFcmRecipients(zoneIds) {
  const zones = (zoneIds || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  const filter = {
    role: { $in: STAFF_ROLES },
    isActive: true,
    isDeleted: { $ne: true },
  };

  if (zones.length) {
    filter.$and = [
      HAS_FCM_FILTER,
      {
        $or: [
          { role: { $in: [USER_ROLES.ADMIN, USER_ROLES.SUB_ADMIN] } },
          {
            role: USER_ROLES.TEAM_MEMBER,
            assignedZones: { $in: zones },
          },
        ],
      },
    ];
  } else {
    Object.assign(filter, HAS_FCM_FILTER);
  }

  return User.find(filter)
    .select('_id fcmToken fcmTokenWeb fcmTokenMobile')
    .lean();
}

async function sendFcmToStaff(payload, { zoneIds } = {}) {
  if (!isFirebaseReady()) return;
  const staff = await loadStaffFcmRecipients(zoneIds);
  if (!staff.length) return;

  await Promise.all(
    staff.map((doc) =>
      sendFcmToTarget(
        { userId: doc._id },
        {
          title: payload.title,
          body: payload.body,
          data: {
            ...payload.data,
            priority: 'high',
            fcmTag: payload.data?.kind
              ? `admin_${payload.data.kind}`
              : 'admin_alert',
            fcmChannelId: 'admin_alerts',
          },
        },
      ),
    ),
  );
}

/**
 * Admin inbox notification: Socket.IO always; DB for actionable types;
 * FCM for ADMIN_FCM_NOTIFICATION_TYPES (e.g. emergency pool).
 */
export async function sendAdminNotification({
  title,
  body = '',
  type,
  severity = 'info',
  data = {},
  persist,
  zoneIds,
  sendFcm,
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

  if (shouldPersist) {
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

  const shouldSendFcm =
    typeof sendFcm === 'boolean'
      ? sendFcm
      : ADMIN_FCM_NOTIFICATION_TYPES.has(type);

  if (shouldSendFcm) {
    try {
      await sendFcmToStaff(payload, { zoneIds });
    } catch (err) {
      console.warn('[push] admin FCM fan-out failed:', err?.message);
    }
  }
}
