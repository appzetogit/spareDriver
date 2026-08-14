/**
 * Detect addresses that are raw lat/lng fallbacks (e.g. "28.63150, 77.21670").
 * These should never be shown as human-readable locations in the UI.
 */
const COORD_ADDRESS_RE = /^-?\d{1,3}(?:\.\d+)?,\s*-?\d{1,3}(?:\.\d+)?$/;

export function isCoordinateAddress(value) {
  if (typeof value !== 'string') return false;
  return COORD_ADDRESS_RE.test(value.trim());
}

/**
 * Return a display-safe location label, or `fallback` when missing / coords-only.
 */
export function formatLocationLabel(value, fallback = null) {
  if (value == null || typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed || isCoordinateAddress(trimmed)) return fallback;
  return trimmed;
}
