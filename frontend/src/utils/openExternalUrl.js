/**
 * Open a URL in the device default browser — not inside the Flutter WebView.
 *
 * Prefers `window.SpareDriverNative.openExternalUrl` (Flutter injects this),
 * then common WebView bridges, then Android intent / window.open fallbacks.
 *
 * `flutter_inappwebview.callHandler` exists even when no handler is
 * registered, so it is fired but never treated as exclusive success.
 */

const BLOCKED_SCHEMES = /^(javascript|data|vbscript):/i;

/**
 * Accept http(s)/mailto/tel, or a bare domain (prefix https://).
 * Returns '' when the value is empty or an unsafe scheme.
 */
export function normalizeExternalUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed || BLOCKED_SCHEMES.test(trimmed)) return '';
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(trimmed)) return `https://${trimmed}`;
  return '';
}

function toAndroidIntentUrl(url) {
  try {
    const hostAndPath = String(url).replace(/^https?:\/\//i, '');
    return `intent://${hostAndPath}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  } catch {
    return url;
  }
}

function isAndroidUa() {
  return /Android/i.test(String(globalThis.navigator?.userAgent || ''));
}

function callSpareDriverNative(url) {
  const native = globalThis.SpareDriverNative;
  if (!native) return false;

  const payload = { type: 'openExternalUrl', url };
  const methods = ['openExternalUrl', 'openUrl', 'openExternal'];

  for (const name of methods) {
    if (typeof native[name] !== 'function') continue;
    try {
      native[name](url);
      return true;
    } catch {
      try {
        native[name](payload);
        return true;
      } catch {
        // try next method
      }
    }
  }
  return false;
}

function callFlutterInAppWebView(url) {
  const handler = globalThis.flutter_inappwebview?.callHandler;
  if (typeof handler !== 'function') return false;
  try {
    handler('openExternalUrl', url);
    return true;
  } catch {
    return false;
  }
}

function inNativeShell() {
  return Boolean(
    globalThis.SpareDriverNative?.platform === 'mobile'
    || globalThis.flutter_inappwebview,
  );
}

function postJavascriptChannel(url) {
  const names = ['openExternalUrl', 'ExternalNavigation', 'AppBridge'];
  for (const name of names) {
    const channel = globalThis[name];
    if (typeof channel?.postMessage !== 'function') continue;
    try {
      channel.postMessage(JSON.stringify({ type: 'openExternalUrl', url }));
      return true;
    } catch {
      try {
        channel.postMessage(url);
        return true;
      } catch {
        // try next
      }
    }
  }

  const webkitHandler = globalThis.webkit?.messageHandlers?.openExternalUrl;
  if (typeof webkitHandler?.postMessage === 'function') {
    try {
      webkitHandler.postMessage({ type: 'openExternalUrl', url });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function openViaAnchor(url) {
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} url
 * @returns {boolean} true if an open attempt was made
 */
export function openExternalUrl(url) {
  const targetUrl = normalizeExternalUrl(url);
  if (!targetUrl) return false;

  if (callSpareDriverNative(targetUrl)) return true;
  if (postJavascriptChannel(targetUrl)) return true;

  // Ping the InAppWebView handler, but do not treat it as success — the
  // object is injected even when `openExternalUrl` was never registered.
  const flutterPinged = callFlutterInAppWebView(targetUrl);

  // Android intent fallback only when no Flutter bridge object exists
  // (otherwise we can open Maps/Chrome twice).
  if (!flutterPinged && inNativeShell() && isAndroidUa()) {
    try {
      globalThis.location.href = toAndroidIntentUrl(targetUrl);
      return true;
    } catch {
      // fall through
    }
  }

  try {
    const popup = globalThis.open?.(targetUrl, '_blank', 'noopener,noreferrer');
    if (popup) return true;
  } catch {
    // fall through
  }

  return openViaAnchor(targetUrl);
}
