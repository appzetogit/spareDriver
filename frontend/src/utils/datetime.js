/**
 * Centralised date/time formatters for the user-facing UI.
 *
 * We never want to ship 24-hour timestamps in product copy: the app's
 * customers think in AM/PM, so every screen should use the helpers
 * here instead of calling `Date.toLocaleString()` directly.
 *
 *   formatPickupDateTime(iso)  "Wed, 3 Jun · 4:30 PM"
 *   formatDateTime12(iso)      "3 Jun 2026, 4:30 PM"
 *   formatTimeOfDay(iso)       "4:30 PM"
 *   formatDateShort(iso)       "3 Jun"
 *
 * All helpers accept an `iso` string, a `Date`, a number (ms epoch),
 * or `null`/`undefined` (returns the supplied fallback or "—").
 */

const LOCALE = 'en-IN';

function toDate(input) {
  if (input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Pretty pickup-style stamp: short weekday + day/month + 12h time.
 *
 *   "Wed, 3 Jun · 4:30 PM"
 *
 * Use this on any screen that shows a "ride starts at" / "pickup time"
 * value — the dot keeps the time visually distinct from the date.
 */
export function formatPickupDateTime(input, fallback = '—') {
  const d = toDate(input);
  if (!d) return fallback;
  const date = d.toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = d.toLocaleTimeString(LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date} \u00b7 ${time}`;
}

/**
 * Full date + 12h time, suitable for booking summaries / receipts.
 *
 *   "3 Jun 2026, 4:30 PM"
 */
export function formatDateDDMMYYYY(input, fallback = '—') {
  const d = toDate(input);
  if (!d) return fallback;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTime12(input, fallback = '—') {
  const d = toDate(input);
  if (!d) return fallback;
  const date = formatDateDDMMYYYY(d);
  const time = d.toLocaleTimeString(LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date}, ${time}`;
}

/**
 * Just the time portion in 12h AM/PM, no date.
 *
 *   "4:30 PM"
 */
export function formatTimeOfDay(input, fallback = '—') {
  const d = toDate(input);
  if (!d) return fallback;
  return d.toLocaleTimeString(LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Short date with no year, useful for cards that show "today / this
 * week" pickup info.
 *
 *   "3 Jun"
 */
export function formatDateShort(input, fallback = '—') {
  const d = toDate(input);
  if (!d) return fallback;
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}
