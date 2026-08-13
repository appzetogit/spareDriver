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

/**
 * Browser-displayed FCM notifications nest custom data under FCM_MSG.
 * Our own showNotification() puts fields at the top level.
 */
function normalizeNotificationData(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const nested = base.FCM_MSG && typeof base.FCM_MSG === 'object' ? base.FCM_MSG : null;
  const nestedData = nested && nested.data && typeof nested.data === 'object' ? nested.data : {};
  return Object.assign({}, nestedData, base, {
    kind: nestedData.kind || base.kind || (nested && nested.data && nested.data.kind) || '',
  });
}

function resolveNotificationOpenUrl(data) {
  const path = typeof data.path === 'string' ? data.path.trim() : '';
  const kind = data.kind || '';
  const bookingId = data.bookingId ? String(data.bookingId) : '';
  if (path.startsWith('/')) {
    if (kind === 'trip_chat_message' && path.indexOf('chat=') === -1) {
      return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'chat=1';
    }
    return path;
  }
  if (kind === 'booking_offer' || kind === 'new_booking_request') {
    return '/driver/home';
  }
  if (kind === 'inbox_offer') {
    return '/driver/trips?tab=incoming';
  }
  if (kind === 'trip_chat_message' && bookingId) {
    const chatQuery = (data.channel ? '&channel=' + encodeURIComponent(data.channel) : '');
    if (data.recipientRole === 'driver') return '/driver/trip/' + bookingId + '?chat=1' + chatQuery;
    if (data.recipientRole === 'admin') {
      return '/admin/bookings?bookingId=' + bookingId + '&chat=1' + chatQuery;
    }
    return '/user/book/assigned/' + bookingId + '?chat=1' + chatQuery;
  }
  if (bookingId && (
    kind === 'noshow_prompt'
    || kind === 'driver_arrived'
    || kind === 'driver_assigned'
    || kind === 'driver_accepted'
    || kind === 'trip_started'
    || kind === 'ride_ending_soon'
  )) {
    return '/user/book/assigned/' + bookingId;
  }
  if (bookingId && kind === 'order_assigned') {
    return '/driver/trip/' + bookingId;
  }
  return '/';
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = normalizeNotificationData(event.notification.data || {});
  const openUrl = resolveNotificationOpenUrl(data);
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      client.postMessage({ type: 'SD_BOOKING_OFFER_FCM', payload: data });
      client.postMessage({ type: 'SD_NOTIFICATION_OPEN', payload: data, url: openUrl });
      if ('focus' in client) {
        await client.focus();
        if (openUrl && openUrl !== '/' && typeof client.navigate === 'function') {
          try {
            const current = new URL(client.url);
            const targetPath = openUrl.split('?')[0];
            const currentFull = current.pathname + current.search;
            if (current.pathname !== targetPath || currentFull !== openUrl) {
              await client.navigate(openUrl);
            }
          } catch (_) { /* soft-nav via postMessage */ }
        }
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
