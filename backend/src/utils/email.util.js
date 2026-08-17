const PLACEHOLDER_EMAIL_SUFFIX = '@phone.sparedriver.local';

/**
 * Strict ASCII email: local@domain.tld
 * Rejects spaces, braces, quotes, missing TLD, consecutive dots.
 */
export const USER_EMAIL_PATTERN =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

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

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isPlaceholderUserEmail(email) {
  if (!email || typeof email !== 'string') return true;
  const normalized = email.trim().toLowerCase();
  return !normalized || normalized.endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

export function userNeedsEmail(user) {
  if (!user) return false;
  if (user.isEmailVerified && !isPlaceholderUserEmail(user.email)) return false;
  return true;
}

export function getClientOrigin() {
  const raw = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  return raw.split(',')[0].trim().replace(/\/$/, '');
}
