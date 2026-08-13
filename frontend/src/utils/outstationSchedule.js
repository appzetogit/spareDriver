/**
 * Shared outstation duration math used by the variant + duration pages
 * and the review/confirm displays. Keep this in lockstep with the
 * backend's `computeOutstationTripMetrics` in
 * `backend/src/utils/outstationDuration.js`.
 *
 * Business timezone for billable days/nights: Asia/Kolkata.
 */

export const OUTSTATION_BUSINESS_TZ = 'Asia/Kolkata';

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

function getZonedYmd(value, timeZone = OUTSTATION_BUSINESS_TZ) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function ymdDayIndex({ year, month, day }) {
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/**
 * Full metrics. Soft defaults for missing/invalid input.
 */
export function computeOutstationTripMetrics(pickupAt, expectedReturnAt) {
  const fallback = {
    days: 1,
    nights: 0,
    durationMs: 0,
    durationMinutes: 0,
    durationHours: 0,
  };
  if (!pickupAt || !expectedReturnAt) return fallback;
  const start = new Date(pickupAt);
  const end = new Date(expectedReturnAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return fallback;
  }
  if (end.getTime() <= start.getTime()) return fallback;

  const startYmd = getZonedYmd(start);
  const endYmd = getZonedYmd(end);
  if (!startYmd || !endYmd) return fallback;

  const span = ymdDayIndex(endYmd) - ymdDayIndex(startYmd);
  const days = Math.max(1, span + 1);
  const nights = Math.max(0, span);
  const durationMs = end.getTime() - start.getTime();
  const durationMinutes = Math.floor(durationMs / MS_PER_MINUTE);
  return {
    days,
    nights,
    durationMs,
    durationMinutes,
    durationHours: durationMinutes / 60,
  };
}

/**
 * Returns `{ days, nights }` for missing / invalid / inverted inputs
 * so caller math never blows up.
 */
export function computeOutstationDuration(pickupAt, expectedReturnAt) {
  const m = computeOutstationTripMetrics(pickupAt, expectedReturnAt);
  return { days: m.days, nights: m.nights };
}

/** Human label for exact duration (e.g. "59 hours", "1h 30m"). */
export function formatOutstationExactDuration(durationMinutes) {
  const mins = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${hours}h ${rem}m`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Convert an ISO string / Date to the format `<input type="datetime-local">`
 * expects (no timezone suffix, local time). Returns null when the
 * input can't be parsed.
 */
export function toDateTimeInputValue(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatLocalDateTimeInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Earliest pickup the customer is allowed to pick, given the
 * admin-configured outstation lead time (`scheduledDispatch
 * .MIN_SCHEDULED_LEAD_HOURS` on the outstation `ServicePricing` doc).
 * Prefer `minPickupInputValueFromDays` for the day-based outstation
 * knobs; this hour helper remains for any transitional callers.
 */
export function minPickupInputValue(leadHours = 1) {
  const safeLead = Math.max(0, Number(leadHours) || 0);
  const d = new Date(Date.now() + safeLead * 60 * 60 * 1000);
  return formatLocalDateTimeInput(d);
}

export function startOfLocalDay(date = new Date()) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addCalendarDays(day, n) {
  const base = startOfLocalDay(day);
  if (!base) return null;
  const out = new Date(base);
  out.setDate(out.getDate() + Number(n || 0));
  return out;
}

export function isOutstationLocationRevealed(pickupAt, now = new Date()) {
  const tripDay = startOfLocalDay(pickupAt);
  if (!tripDay) return false;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return false;
  return nowMs >= tripDay.getTime();
}

/**
 * Earliest pickup datetime for day-based outstation lead
 * (`MIN_OUTSTATION_LEAD_DAYS`). Uses local midnight of (today + N days)
 * and preserves a sensible default clock time (09:00).
 */
export function minPickupInputValueFromDays(leadDays = 8, hour = 9, minute = 0) {
  const days = Math.max(0, Number(leadDays) || 0);
  const d = addCalendarDays(new Date(), days);
  if (!d) return minPickupInputValue(0);
  d.setHours(Number(hour) || 0, Number(minute) || 0, 0, 0);
  return formatLocalDateTimeInput(d);
}

/**
 * Default pickup datetime — `leadHours` from now, rounded to the
 * next whole hour.
 */
export function defaultPickupInputValue(leadHours = 1) {
  const safeLead = Math.max(0, Number(leadHours) || 0);
  const d = new Date(Date.now() + safeLead * 60 * 60 * 1000);
  if (d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  } else {
    d.setMinutes(0, 0, 0);
  }
  return formatLocalDateTimeInput(d);
}

/** Default outstation pickup: min lead day at 09:00 local. */
export function defaultPickupInputValueFromDays(leadDays = 8) {
  return minPickupInputValueFromDays(leadDays, 9, 0);
}

/**
 * Default return datetime — same time, next day.
 */
export function defaultReturnInputValue(pickupInputValue) {
  const base = pickupInputValue
    ? new Date(pickupInputValue)
    : new Date(Date.now() + 60 * 60 * 1000);
  if (Number.isNaN(base.getTime())) return defaultPickupInputValue();
  const d = new Date(base.getTime() + 24 * 60 * 60 * 1000);
  return formatLocalDateTimeInput(d);
}
