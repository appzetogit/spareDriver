import { getAccessToken, getRefreshToken } from './authTokens';

/**
 * Tell the Flutter wrapper to run native GPS while the WebView is frozen.
 *
 * Flutter MUST only POST while the app is backgrounded. Foreground location
 * still goes over Socket.IO from this WebView.
 *
 * Handler names (first match wins):
 *   window.SpareDriverNative.setBackgroundLocation(jsonString | object)
 *   window.flutter_inappwebview.callHandler('setBackgroundLocation', payload)
 *   window.BackgroundLocation.postMessage(jsonString)
 *   window.webkit.messageHandlers.setBackgroundLocation.postMessage(payload)
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:9000/api/v1';
const INTERVAL_MS = 15_000;

function postToNative(payload) {
  const native = globalThis.SpareDriverNative;
  if (typeof native?.setBackgroundLocation === 'function') {
    try {
      native.setBackgroundLocation(JSON.stringify(payload));
      return true;
    } catch {
      try {
        native.setBackgroundLocation(payload);
        return true;
      } catch {
        // try next bridge
      }
    }
  }

  const handler = globalThis.flutter_inappwebview?.callHandler;
  if (typeof handler === 'function') {
    try {
      handler('setBackgroundLocation', payload);
      return true;
    } catch {
      // try next
    }
  }

  const channel = globalThis.BackgroundLocation;
  if (typeof channel?.postMessage === 'function') {
    try {
      channel.postMessage(JSON.stringify(payload));
      return true;
    } catch {
      // try next
    }
  }

  const wk = globalThis.webkit?.messageHandlers?.setBackgroundLocation;
  if (typeof wk?.postMessage === 'function') {
    try {
      wk.postMessage(payload);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * @param {{ enabled: boolean; driverId?: string | null }} opts
 */
export function syncNativeBackgroundLocation({ enabled, driverId }) {
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();
  const shouldRun = Boolean(enabled && driverId && accessToken);

  if (!shouldRun) {
    postToNative({ type: 'backgroundLocation', enabled: false });
    return;
  }

  postToNative({
    type: 'backgroundLocation',
    enabled: true,
    driverId: String(driverId),
    accessToken,
    refreshToken: refreshToken || null,
    apiBaseUrl: API_BASE,
    intervalMs: INTERVAL_MS,
    locationPath: '/driver/location',
    refreshPath: '/auth/refresh-token',
  });
}
