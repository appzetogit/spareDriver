import { useEffect } from 'react';
import { getMessaging, onMessage } from 'firebase/messaging';
import { getFirebaseApp } from '../config/firebase';
import api from '../utils/api';
import { acquireFcmToken, getFcmPlatform } from '../utils/fcmTokenClient';
import useDriverIncomingOfferStore from '../store/driver/useDriverIncomingOfferStore';
import {
  applyDriverOfferFcmAction,
  parseDriverOfferFcmData,
} from '../utils/fcmOfferPayload';

async function postToken(path, token, platform) {
  await api.post(path, { token, platform });
}

function fcmTokenPath(audience) {
  if (audience === 'driver') return '/driver/fcm-token';
  if (audience === 'admin') return '/admin/fcm-token';
  return '/auth/fcm-token';
}

function handleDriverFcmPayload(payload) {
  const data = payload?.data || {};
  const action = parseDriverOfferFcmData(data);
  if (!action) return false;
  return applyDriverOfferFcmAction(useDriverIncomingOfferStore, action);
}

/**
 * Registers FCM token with backend after login.
 * Handles foreground messages and periodic token refresh.
 * Driver audience also hydrates booking offers from FCM (socket fallback).
 */
export function useFcmRegistration({ enabled = false, audience = 'user' }) {
  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let refreshTimer;
    let unsubscribeOnMessage;

    const path = fcmTokenPath(audience);
    const platform = getFcmPlatform();

    (async () => {
      try {
        const app = getFirebaseApp();
        if (!app) return;

        const token = await acquireFcmToken();
        if (!token || cancelled) return;

        await postToken(path, token, platform);

        const messaging = getMessaging(app);
        // Foreground: hydrate offers from FCM data. Do not call `new Notification` —
        // socket toasts already cover in-app alerts; a second system push looks like a duplicate.
        unsubscribeOnMessage = onMessage(messaging, (payload) => {
          if (audience === 'driver') {
            handleDriverFcmPayload(payload);
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
      if (typeof unsubscribeOnMessage === 'function') unsubscribeOnMessage();
    };
  }, [enabled, audience]);
}

/** Call before logout to clear server-side FCM token for this device. */
export async function unregisterFcmToken(audience = 'user') {
  const path = fcmTokenPath(audience);
  try {
    await api.delete(path, { data: { platform: 'all' } });
  } catch {
    // best-effort
  }
}
