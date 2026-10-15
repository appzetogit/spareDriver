import api from './api';

/**
 * Invite links, pending-code storage and iOS deferred-link recovery.
 *
 *   https://<app-domain>/r/<CODE>[?role=driver]
 *
 * Storage rules: first-touch attribution (a later invite link never replaces
 * a code already saved) and a 30-day TTL.
 */

const STORAGE_KEY = 'sd_pending_referral';
const DEFERRED_TRIED_KEY = 'sd_deferred_referral_tried';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

export const REFERRAL_RECOVERED_EVENT = 'sd:referral-recovered';

export function buildReferralLink(code, role = 'user') {
  if (!code || code === '—') return '';
  const base = String(import.meta.env.VITE_REFERRAL_LINK_BASE || window.location.origin).replace(/\/$/, '');
  return `${base}/r/${encodeURIComponent(code)}${role === 'driver' ? '?role=driver' : ''}`;
}

export function isValidReferralCode(code) {
  return CODE_RE.test(String(code || ''));
}

function readStored() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw?.code || Date.now() - raw.savedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/** Save a code unless a live one already exists (first touch wins). */
export function savePendingReferral(code, role = 'user') {
  if (!isValidReferralCode(code)) return;
  try {
    if (readStored()) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ code: String(code).toUpperCase(), role, savedAt: Date.now() }),
    );
  } catch { /* storage unavailable */ }
}

/** Pending code for this role ('' when none or saved for the other app). */
export function getPendingReferral(role = 'user') {
  const stored = readStored();
  return stored && stored.role === role ? stored.code : '';
}

export function clearPendingReferral() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** Read `?ref=` from the URL into storage and return the pending code. */
export function captureReferralFromUrl(role = 'user', search = window.location.search) {
  try {
    const ref = new URLSearchParams(search).get('ref');
    if (ref) savePendingReferral(ref, role);
  } catch { /* ignore */ }
  return getPendingReferral(role);
}

/* ---------------------------- platform detection --------------------------- */

const ua = () => String(globalThis.navigator?.userAgent || '');

export const isAndroidDevice = () => /Android/i.test(ua());
export const isIosDevice = () => /iPhone|iPad|iPod/i.test(ua());

/** The Flutter shell: injected bridges, or an iOS WKWebView (UA has no "Safari"). */
export function isNativeWebView() {
  if (globalThis.flutter_inappwebview || globalThis.SpareDriverNative) return true;
  if (isIosDevice() && !/Safari/i.test(ua())) return true;
  return isAndroidDevice() && /; wv\)/.test(ua());
}

export const isIosAppWebView = () => isIosDevice() && isNativeWebView();

/* ------------------------------ deferred links ----------------------------- */

function deviceSignals() {
  const dpr = globalThis.devicePixelRatio || 1;
  const w = Math.round((globalThis.screen?.width || 0) * dpr);
  const h = Math.round((globalThis.screen?.height || 0) * dpr);
  const os = ua().match(/OS (\d+)[_.](\d+)/);
  return {
    screen: `${w}x${h}`,
    tzOffset: new Date().getTimezoneOffset(),
    language: (globalThis.navigator?.language || '').toLowerCase(),
    osVersion: os ? `${os[1]}.${os[2]}` : '',
  };
}

/** iOS Safari, before the App Store redirect: remember who clicked. */
export async function recordReferralClick(code, role = 'user') {
  try {
    await api.post('/common/referral/deferred/click', { code, role, ...deviceSignals() }, { timeout: 4000 });
  } catch { /* never block the redirect */ }
}

/**
 * iOS app first launch: ask the backend whether a recent invite click came
 * from this device. Runs once per install; saves and announces any hit.
 */
export async function recoverDeferredReferral() {
  try {
    if (localStorage.getItem(DEFERRED_TRIED_KEY)) return '';
    localStorage.setItem(DEFERRED_TRIED_KEY, '1');
  } catch { return ''; }
  if (readStored()) return '';

  try {
    const res = await api.post('/common/referral/deferred/match', deviceSignals());
    const { code, role = 'user' } = res.data?.data || {};
    if (!code) return '';
    savePendingReferral(code, role);
    window.dispatchEvent(new CustomEvent(REFERRAL_RECOVERED_EVENT, { detail: { code, role } }));
    return code;
  } catch {
    return '';
  }
}
