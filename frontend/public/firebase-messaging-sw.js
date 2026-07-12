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

  const title = payload?.notification?.title || 'SpareDriver';
  const options = {
    body: payload?.notification?.body || '',
    data,
    tag,
    renotify: Boolean(tag),
    requireInteraction: kind === 'booking_offer',
  };
  await self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      client.postMessage({ type: 'SD_BOOKING_OFFER_FCM', payload: data });
      if ('focus' in client) {
        await client.focus();
        return;
      }
    }
    if (self.clients.openWindow) {
      const url = data.kind === 'booking_offer' || data.kind === 'new_booking_request'
        ? '/driver/home'
        : '/';
      const win = await self.clients.openWindow(url);
      if (win && data) {
        // Cold start: stash for the app to pick up on boot.
        try {
          await win.postMessage({ type: 'SD_BOOKING_OFFER_FCM', payload: data });
        } catch (_) { /* ignore */ }
      }
    }
  })());
});
