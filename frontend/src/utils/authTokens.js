const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

const tokenListeners = new Set();

/** Subscribe to access/refresh token writes (used to push JWT to Flutter). */
export function onAuthTokensChanged(fn) {
  tokenListeners.add(fn);
  return () => tokenListeners.delete(fn);
}

function emitAuthTokensChanged() {
  tokenListeners.forEach((fn) => fn());
}

export function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setAuthTokens({ accessToken, refreshToken } = {}) {
  if (typeof window === 'undefined') return;
  if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  emitAuthTokensChanged();
}

export function clearAuthTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  emitAuthTokensChanged();
}

function isJwtLike(value) {
  return typeof value === 'string' && value.split('.').length === 3 && value.length > 20;
}

/** Persist tokens when an auth response includes them. */
export function persistTokensFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return;
  const accessToken = isJwtLike(payload.accessToken) ? payload.accessToken : undefined;
  const refreshToken = isJwtLike(payload.refreshToken) ? payload.refreshToken : undefined;
  if (!accessToken && !refreshToken) return;
  setAuthTokens({ accessToken, refreshToken });
}
