const PLACEHOLDER_EMAIL_SUFFIX = '@phone.sparedriver.local';

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
