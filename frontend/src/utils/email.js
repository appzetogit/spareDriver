/**
 * Strict ASCII email used on registration / email OTP (keep in sync with
 * backend `utils/email.util.js`).
 */
export const USER_EMAIL_PATTERN =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

const PLACEHOLDER_EMAIL_SUFFIX = '@phone.sparedriver.local';

export function normalizeUserEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidUserEmail(email) {
  const normalized = normalizeUserEmail(email);
  if (!normalized || normalized.length > 254) return false;
  if (normalized.includes('..')) return false;
  if (normalized.endsWith(PLACEHOLDER_EMAIL_SUFFIX)) return false;
  return USER_EMAIL_PATTERN.test(normalized);
}

/** Strip whitespace only — do not rewrite invalid characters (that would hide typos). */
export function sanitizeEmailInput(value) {
  return String(value || '').replace(/\s/g, '');
}
