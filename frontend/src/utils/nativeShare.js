/**
 * Open the OS share sheet (WhatsApp, Instagram, Messages, …).
 *
 * Flutter InAppWebView does not implement `navigator.share`, so the wrapper
 * must handle this natively (`share_plus` / ACTION_SEND / UIActivityViewController).
 * In a plain browser this falls through to the Web Share API, then clipboard.
 */

function payload({ title, text, url } = {}) {
  return {
    title: title ? String(title) : undefined,
    text: text ? String(text) : '',
    url: url ? String(url) : undefined,
  };
}

function shareBody(data) {
  return [data.text, data.url].filter(Boolean).join('\n');
}

async function callSpareDriverNative(data) {
  const native = globalThis.SpareDriverNative;
  if (!native) return null;

  const methods = ['share', 'shareText', 'openShare'];
  for (const name of methods) {
    if (typeof native[name] !== 'function') continue;
    try {
      const result = await native[name](data);
      if (result === false) continue;
      return { ok: true, via: 'native' };
    } catch {
      try {
        native[name](shareBody(data));
        return { ok: true, via: 'native' };
      } catch {
        // try next method
      }
    }
  }
  return null;
}

async function callFlutterHandler(data) {
  const handler = globalThis.flutter_inappwebview?.callHandler;
  if (typeof handler !== 'function') return null;
  try {
    const result = await handler('share', data);
    if (result === false) return null;
    return { ok: true, via: 'native' };
  } catch {
    return null;
  }
}

function postJavascriptChannel(data) {
  const names = ['share', 'Share', 'AppBridge'];
  for (const name of names) {
    const channel = globalThis[name];
    if (typeof channel?.postMessage !== 'function') continue;
    try {
      channel.postMessage(JSON.stringify({ type: 'share', ...data }));
      return { ok: true, via: 'native' };
    } catch {
      try {
        channel.postMessage(shareBody(data));
        return { ok: true, via: 'native' };
      } catch {
        // try next
      }
    }
  }

  const webkitHandler = globalThis.webkit?.messageHandlers?.share;
  if (typeof webkitHandler?.postMessage === 'function') {
    try {
      webkitHandler.postMessage(data);
      return { ok: true, via: 'native' };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {{ title?: string, text?: string, url?: string }} opts
 * @returns {Promise<{ ok: boolean, via?: 'native'|'web'|'clipboard', reason?: 'empty'|'cancelled'|'failed' }>}
 */
export async function shareText(opts = {}) {
  const data = payload(opts);
  if (!data.text && !data.url) return { ok: false, reason: 'empty' };

  const native =
    (await callSpareDriverNative(data))
    || (await callFlutterHandler(data))
    || postJavascriptChannel(data);
  if (native) return native;

  if (typeof navigator.share === 'function') {
    try {
      const webPayload = {};
      if (data.title) webPayload.title = data.title;
      if (data.text) webPayload.text = data.text;
      if (data.url) webPayload.url = data.url;
      await navigator.share(webPayload);
      return { ok: true, via: 'web' };
    } catch (err) {
      if (err?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
    }
  }

  try {
    await navigator.clipboard.writeText(shareBody(data));
    return { ok: true, via: 'clipboard' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
