import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { getFirebaseApp } from '../config/firebase';

export function getFcmPlatform() {
  return typeof window !== 'undefined' && window.SpareDriverNative?.platform === 'mobile'
    ? 'mobile'
    : 'web';
}

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

/** Best-effort FCM token for signup/login (does not POST to backend). */
export async function acquireFcmToken() {
  try {
    const supported = await isSupported();
    if (!supported) return null;

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) return null;

    const app = getFirebaseApp();
    if (!app) return null;

    await registerServiceWorker();

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      return null;
    }

    const messaging = getMessaging(app);
    const swReg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swReg || undefined,
    });
    return token || null;
  } catch {
    return null;
  }
}

/** Merge FCM fields into an auth request body when a token is available. */
export async function withFcmAuthPayload(payload = {}) {
  const fcmToken = await acquireFcmToken();
  if (!fcmToken) return payload;
  return { ...payload, fcmToken, platform: getFcmPlatform() };
}
