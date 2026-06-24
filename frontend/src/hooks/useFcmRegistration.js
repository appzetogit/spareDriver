import { useEffect } from 'react';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { getFirebaseApp } from '../config/firebase';
import api from '../utils/api';

/**
 * Registers the web FCM token with the backend after login.
 * Mobile (Flutter wrapper) should POST the same endpoint with platform: 'mobile'.
 */
export function useFcmRegistration({ enabled = false, audience = 'user' }) {
  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

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

        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
          return;
        }

        const messaging = getMessaging(app);
        const token = await getToken(messaging, { vapidKey });
        if (!token || cancelled) return;

        const path = audience === 'driver' ? '/driver/fcm-token' : '/auth/fcm-token';
        await api.post(path, { token, platform: 'web' });
      } catch (err) {
        console.warn('[fcm] web token registration failed:', err?.message || err);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, audience]);
}
