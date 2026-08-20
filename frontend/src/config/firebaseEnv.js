/** Single map of Firebase client config keys → VITE_* env var names. */
export const FIREBASE_ENV_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  databaseURL: 'VITE_FIREBASE_DATABASE_URL',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

/** FCM service worker uses the web-app subset (no Realtime Database URL). */
const FCM_SW_CONFIG_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

export function resolveFirebaseConfig(getEnvValue) {
  const config = {};
  const missing = [];
  for (const [key, envName] of Object.entries(FIREBASE_ENV_KEYS)) {
    const value = getEnvValue(envName);
    if (!value) {
      missing.push(key);
    }
    config[key] = value ?? '';
  }
  return { config, missing };
}

/** Service workers cannot read import.meta.env — Vite serves this at /firebase-messaging-sw.js. */
export function buildFcmMessagingSwSource(config) {
  const fcmConfig = Object.fromEntries(
    FCM_SW_CONFIG_KEYS.map((key) => [key, config[key] ?? '']),
  );
  return `/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(fcmConfig, null, 2)});

const messaging = firebase.messaging();

async function closeTaggedNotifications(tag) {
  if (!tag || !self.registration.getNotifications) return;
  const list = await self.registration.getNotifications({ tag });
  for (const n of list) n.close();
}

messaging.onBackgroundMessage(async (payload) => {
  const data = payload?.data || {};
  const kind = data.kind || '';
  const tag = data.fcmTag || (data.bookingId ? 'booking_offer_' + data.bookingId : undefined);

  if (kind === 'booking_offer_withdrawn') {
    if (tag) await closeTaggedNotifications(tag);
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      client.postMessage({ type: 'SD_BOOKING_OFFER_FCM', payload: data });
    }
    return;
  }

  // Messages with a \`notification\` payload are already shown by the browser.
  // Calling showNotification again duplicates the push — only re-show when we
  // need web-specific options (sticky booking offers).
  const needsCustomUi = kind === 'booking_offer' || kind === 'inbox_offer';
  if (payload?.notification && !needsCustomUi) {
    return;
  }
  if (payload?.notification && needsCustomUi && tag) {
    await closeTaggedNotifications(tag);
  }

  const title = payload?.notification?.title || data.title || 'SpareDriver';
  const options = {
    body: payload?.notification?.body || data.body || '',
    data,
    tag,
    renotify: Boolean(tag),
    requireInteraction: kind === 'booking_offer' || kind === 'inbox_offer',
  };
  await self.registration.showNotification(title, options);
});

function resolveNotificationOpenUrl(data) {
  const path = typeof data.path === 'string' ? data.path.trim() : '';
  if (path.startsWith('/')) {
    if (data.kind === 'trip_chat_message' && !path.includes('chat=')) {
      return path + (path.includes('?') ? '&' : '?') + 'chat=1';
    }
    return path;
  }
  if (data.kind === 'booking_offer' || data.kind === 'new_booking_request') {
    return '/driver/home';
  }
  if (data.kind === 'inbox_offer') {
    return '/driver/trips?tab=incoming';
  }
  if (data.kind === 'trip_chat_message' && data.bookingId) {
    const chatQuery = data.channel ? '&channel=' + encodeURIComponent(data.channel) : '';
    if (data.recipientRole === 'driver') {
      return '/driver/trip/' + data.bookingId + '?chat=1' + chatQuery;
    }
    if (data.recipientRole === 'admin') {
      return '/admin/bookings?bookingId=' + data.bookingId + '&chat=1' + chatQuery;
    }
    return '/user/book/assigned/' + data.bookingId + '?chat=1' + chatQuery;
  }
  if (data.bookingId && (
    data.kind === 'noshow_prompt'
    || data.kind === 'driver_arrived'
    || data.kind === 'driver_assigned'
    || data.kind === 'trip_started'
    || data.kind === 'ride_ending_soon'
    || data.kind === 'trip_overtime_started'
    || data.kind === 'overtime_payment_failed'
  )) {
    return '/user/book/assigned/' + data.bookingId;
  }
  return '/';
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const openUrl = resolveNotificationOpenUrl(data);
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      client.postMessage({ type: 'SD_BOOKING_OFFER_FCM', payload: data });
      client.postMessage({ type: 'SD_NOTIFICATION_OPEN', payload: data, url: openUrl });
      if ('focus' in client) {
        await client.focus();
        return;
      }
    }
    if (self.clients.openWindow) {
      const win = await self.clients.openWindow(openUrl);
      if (win && data) {
        try {
          await win.postMessage({ type: 'SD_BOOKING_OFFER_FCM', payload: data });
          await win.postMessage({ type: 'SD_NOTIFICATION_OPEN', payload: data, url: openUrl });
        } catch (_) { /* ignore */ }
      }
    }
  })());
});
`;
}
