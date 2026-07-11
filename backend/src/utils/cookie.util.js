export const COOKIE_NAMES = Object.freeze({
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
});

const ACCESS_MAX_MS = 15 * 60 * 1000;
const REFRESH_MAX_MS = 7 * 24 * 60 * 60 * 1000;

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Cookie attributes are tuned for the typical Vercel + standalone API
 * deployment, where the SPA (e.g. `https://app.example.com`) and the API
 * (e.g. `https://api.example.com`) live on *different* origins. Browsers will
 * only persist a cross-site cookie when it is both `Secure` and
 * `SameSite=None`, and a credentialed XHR/fetch will only attach it back to
 * the API when the same pair is set. Locally we fall back to `SameSite=Lax`
 * and `Secure=false` so the cookie still sticks on http://localhost.
 *
 * Optional `COOKIE_DOMAIN` env var lets you scope the cookie to a shared
 * parent domain (e.g. `.example.com`) when the API and SPA share one.
 */
export function getBaseCookieOptions() {
  const prod = isProduction();
  return {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'none' : 'lax',
    path: '/',
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

/**
 * Sets httpOnly auth cookies (browser). Tokens are also returned in JSON
 * for WebView / Flutter clients that store them in localStorage.
 * @param {import('express').Response} res
 * @param {{ accessToken: string; refreshToken: string }} tokens
 */
export function setAuthCookies(res, { accessToken, refreshToken }) {
  const base = getBaseCookieOptions();
  res.cookie(COOKIE_NAMES.accessToken, accessToken, { ...base, maxAge: ACCESS_MAX_MS });
  res.cookie(COOKIE_NAMES.refreshToken, refreshToken, { ...base, maxAge: REFRESH_MAX_MS });
}

/**
 * Clears both auth cookies. The browser only honours the clear when the
 * options (secure, sameSite, path, domain) match the original `Set-Cookie`,
 * so we reuse the exact same base options.
 * @param {import('express').Response} res
 */
export function clearAuthCookies(res) {
  const base = getBaseCookieOptions();
  res.clearCookie(COOKIE_NAMES.accessToken, base);
  res.clearCookie(COOKIE_NAMES.refreshToken, base);
}
