/**
 * Open a URL in the device default browser — not inside the Flutter WebView.
 *
 * Prefers `window.SpareDriverNative.openExternalUrl` (Flutter injects this),
 * then common WebView bridges, then Android intent / window.open fallbacks.
 */

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
  const targetUrl = String(url || '').trim();
  if (!targetUrl) return false;

  if (callSpareDriverNative(targetUrl)) return true;
  if (callFlutterInAppWebView(targetUrl)) return true;
  if (postJavascriptChannel(targetUrl)) return true;

  const inNativeShell = Boolean(globalThis.SpareDriverNative?.platform === 'mobile');

  // Android WebView: Chrome intent often escapes the wrapper when no JS bridge exists.
  if (inNativeShell && isAndroidUa()) {
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
