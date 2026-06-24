import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { getFirebaseAdmin, isFirebaseReady } from '../config/firebase.js';
import { emitNotification } from '../utils/socketEmitters.js';
import { collectFcmTokens } from './fcmToken.service.js';

async function loadFcmTokens({ userId, driverId }) {
  if (userId) {
    const user = await User.findById(userId)
      .select('fcmToken fcmTokenWeb fcmTokenMobile')
      .lean();
    return collectFcmTokens(user);
  }
  if (driverId) {
    const driver = await Driver.findById(driverId)
      .select('fcmToken fcmTokenWeb fcmTokenMobile')
      .lean();
    return collectFcmTokens(driver);
  }
  return [];
}

function stringifyData(data = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

/**
 * Delivers an in-app toast (Socket.IO) and, when configured, FCM push
 * to all registered device tokens (web + mobile).
 */
export async function sendPushNotification(
  target,
  { title, body = '', severity = 'info', data = {} } = {},
) {
  const payload = { title, body, severity, data };

  if (target.userId) {
    emitNotification({ userId: target.userId }, payload);
  } else if (target.driverId) {
    emitNotification({ driverId: target.driverId }, payload);
  }

  if (!isFirebaseReady()) return;

  const tokens = await loadFcmTokens(target);
  if (!tokens.length) return;

  const admin = getFirebaseAdmin();
  const messageBase = {
    notification: { title, body },
    data: stringifyData(data),
  };

  await Promise.all(
    tokens.map(async (token) => {
      try {
        await admin.messaging().send({ token, ...messageBase });
      } catch (err) {
        console.warn('[push] FCM send failed:', err?.message || err);
      }
    }),
  );
}
