/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
  "apiKey": "AIzaSyAEWOflMUIV1tg2x0EqBA13ijdrI79Ard4",
  "authDomain": "sparedriver-d05e7.firebaseapp.com",
  "projectId": "sparedriver-d05e7",
  "storageBucket": "sparedriver-d05e7.firebasestorage.app",
  "messagingSenderId": "635960012035",
  "appId": "1:635960012035:web:1b707672afd8434f2f8d36"
});

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

  // Messages with a `notification` payload are already shown by the browser.
  // Calling showNotification again duplicates the push — only re-show when we
  // need web-specific options (sticky booking offers).
  const needsCustomUi = kind === 'booking_offer';
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
    requireInteraction: kind === 'booking_offer',
  };
  await self.registration.showNotification(title, options);
});

function resolveNotificationOpenUrl(data) {
  const path = typeof data.path === 'string' ? data.path.trim() : '';
  if (path.startsWith('/')) return path;
  if (data.kind === 'booking_offer' || data.kind === 'new_booking_request') {
    return '/driver/home';
  }
  if (data.bookingId && (
    data.kind === 'noshow_prompt'
    || data.kind === 'driver_arrived'
    || data.kind === 'driver_assigned'
    || data.kind === 'trip_started'
    || data.kind === 'ride_ending_soon'
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
