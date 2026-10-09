/**
 * Tokens are stored per app (user / driver / admin) so one browser can be
 * signed in to all three at once without them overwriting each other.
 * The app is picked from the URL: /driver/* -> driver, /admin/* -> admin,
 * everything else -> user.
 */
const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

const STAFF_ROLES = ['admin', 'sub_admin', 'team_member', 'developer'];

const tokenListeners = new Set();

/** Subscribe to access/refresh token writes (used to push JWT to Flutter). */
export function onAuthTokensChanged(fn) {
  tokenListeners.add(fn);
  return () => tokenListeners.delete(fn);
}

function emitAuthTokensChanged() {
  tokenListeners.forEach((fn) => fn());
}

/** Which app the current page belongs to. */
export function getAuthAudience() {
  if (typeof window === 'undefined') return 'user';
  const path = window.location.pathname;
  if (path === '/driver' || path.startsWith('/driver/')) return 'driver';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  return 'user';
}

const keyFor = (base, audience = getAuthAudience()) => `${base}:${audience}`;

export function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(keyFor(ACCESS_KEY));
}

export function getRefreshToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(keyFor(REFRESH_KEY));
}

export function setAuthTokens({ accessToken, refreshToken } = {}) {
  if (typeof window === 'undefined') return;
  if (accessToken) localStorage.setItem(keyFor(ACCESS_KEY), accessToken);
  if (refreshToken) localStorage.setItem(keyFor(REFRESH_KEY), refreshToken);
  emitAuthTokensChanged();
}

export function clearAuthTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(keyFor(ACCESS_KEY));
  localStorage.removeItem(keyFor(REFRESH_KEY));
  // Legacy shared keys from before tokens were stored per app.
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  emitAuthTokensChanged();
}

function isJwtLike(value) {
  return typeof value === 'string' && value.split('.').length === 3 && value.length > 20;
}

/** Which app a JWT was issued for, from its (unverified) role claim. */
function audienceOfToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64));
    if (claims.accountType === 'driver' || claims.role === 'driver') return 'driver';
    if (STAFF_ROLES.includes(claims.role)) return 'admin';
    return 'user';
  } catch {
    return null;
  }
}

/**
 * Persist tokens when an auth response includes them. Tokens issued for a
 * different app (e.g. a shared refresh cookie answering for another login)
 * are ignored so they can't overwrite this app's session.
 */
export function persistTokensFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return;
  const audience = getAuthAudience();
  const accessToken = isJwtLike(payload.accessToken) ? payload.accessToken : undefined;
  const refreshToken = isJwtLike(payload.refreshToken) ? payload.refreshToken : undefined;
  const matches = (t) => !t || audienceOfToken(t) === audience;
  if (!matches(accessToken) || !matches(refreshToken)) return;
  if (!accessToken && !refreshToken) return;
  setAuthTokens({ accessToken, refreshToken });
}
