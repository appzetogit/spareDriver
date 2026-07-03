import { useEffect } from 'react';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { getFirebaseApp } from '../config/firebase';
import api from '../utils/api';

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (existing) return existing;
    return navigator.serviceWorker.register('/firebase-messaging-sw.js');
  } catch (err) {
    console.warn('[fcm] service worker registration failed:', err?.message || err);
    return null;
  }
}

async function postToken(path, token, platform) {
  await api.post(path, { token, platform });
}

/**
 * Registers FCM token with backend after login.
 * Handles foreground messages and periodic token refresh.
 */
export function useFcmRegistration({ enabled = false, audience = 'user' }) {
  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let refreshTimer;

    const path = audience === 'driver' ? '/driver/fcm-token' : '/auth/fcm-token';
    const platform = typeof window !== 'undefined' && window.SpareDriverNative?.platform === 'mobile'
      ? 'mobile'
      : 'web';

    (async () => {
      try {
        const supported = await isSupported();
        if (!supported) return;

        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        if (!vapidKey) {
          console.warn('[fcm] VITE_FIREBASE_VAPID_KEY is not set');
          return;
        }

        const app = getFirebaseApp();
        if (!app) return;

        await registerServiceWorker();

        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
          return;
        }

        const messaging = getMessaging(app);
        const swReg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
        const token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: swReg || undefined,
        });
        if (!token || cancelled) return;

        await postToken(path, token, platform);

        onMessage(messaging, (payload) => {
          const title = payload?.notification?.title || 'SpareDriver';
          const body = payload?.notification?.body || '';
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(title, { body, data: payload?.data });
          }
        });

        refreshTimer = setInterval(async () => {
          try {
            const refreshed = await getToken(messaging, {
              vapidKey,
              serviceWorkerRegistration: swReg || undefined,
            });
            if (refreshed && !cancelled) {
              await postToken(path, refreshed, platform);
            }
          } catch {
            // ignore refresh errors
          }
        }, 60 * 60 * 1000);
      } catch (err) {
        console.warn('[fcm] token registration failed:', err?.message || err);
      }
    })();

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [enabled, audience]);
}

/** Call before logout to clear server-side FCM token for this device. */
export async function unregisterFcmToken(audience = 'user') {
  const path = audience === 'driver' ? '/driver/fcm-token' : '/auth/fcm-token';
  try {
    await api.delete(path, { data: { platform: 'all' } });
  } catch {
    // best-effort
  }
}
