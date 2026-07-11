import { useEffect } from 'react';
import { getMessaging, onMessage } from 'firebase/messaging';
import { getFirebaseApp } from '../config/firebase';
import api from '../utils/api';
import { acquireFcmToken, getFcmPlatform } from '../utils/fcmTokenClient';

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
    const platform = getFcmPlatform();

    (async () => {
      try {
        const app = getFirebaseApp();
        if (!app) return;

        const token = await acquireFcmToken();
        if (!token || cancelled) return;

        await postToken(path, token, platform);

        const messaging = getMessaging(app);
        onMessage(messaging, (payload) => {
          const title = payload?.notification?.title || 'SpareDriver';
          const body = payload?.notification?.body || '';
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(title, { body, data: payload?.data });
          }
        });

        refreshTimer = setInterval(async () => {
          try {
            const refreshed = await acquireFcmToken();
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
