/**
 * Builds the shareable referral link served by the backend (`GET /r/:code`),
 * which redirects to the Play Store / App Store with the code attached.
 * Override the origin with VITE_REFERRAL_LINK_BASE (e.g. https://sparedriver.in).
 */
function linkBase() {
  const explicit = import.meta.env.VITE_REFERRAL_LINK_BASE;
  if (explicit) return String(explicit).replace(/\/$/, '');
  const api = import.meta.env.VITE_API_URL || 'http://localhost:9000/api/v1';
  return String(api).replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
}

export function buildReferralLink(code, role = 'user') {
  if (!code || code === '—') return '';
  return `${linkBase()}/r/${encodeURIComponent(code)}${role === 'driver' ? '?role=driver' : ''}`;
}

const STORAGE_KEY = 'sd_pending_referral';

/** Read `?ref=` from the URL, remember it, and return the pending code (or ''). */
export function captureReferralFromUrl(search = window.location.search) {
  try {
    const ref = new URLSearchParams(search).get('ref');
    if (ref && /^[A-Za-z0-9_-]{3,32}$/.test(ref)) {
      localStorage.setItem(STORAGE_KEY, ref.toUpperCase());
    }
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function clearPendingReferral() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
