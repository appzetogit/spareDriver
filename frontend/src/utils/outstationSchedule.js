/**
 * Shared outstation duration math used by the variant + duration pages
 * and the review/confirm displays. Keep this in lockstep with the
 * backend's `computeOutstationDuration` in `booking.service.js` —
 * server is the source of truth, but the UI re-derives the same
 * numbers locally so the provisional fare matches what the server
 * will return.
 *
 *   Days  = number of DISTINCT calendar dates the trip spans
 *           (local time). Same-day = 1, overnight = 2, etc.
 *   Nights = days − 1 (one less night than days, since the customer
 *           is back home on the final day).
 *
 * Returns `{ days: 1, nights: 0 }` for missing / invalid / inverted
 * inputs so caller math never blows up.
 */
export function computeOutstationDuration(pickupAt, expectedReturnAt) {
  if (!pickupAt || !expectedReturnAt) return { days: 1, nights: 0 };
  const start = new Date(pickupAt);
  const end = new Date(expectedReturnAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { days: 1, nights: 0 };
  }
  if (end.getTime() <= start.getTime()) return { days: 1, nights: 0 };

  const startMidnight = new Date(start);
  startMidnight.setHours(0, 0, 0, 0);
  const endMidnight = new Date(end);
  endMidnight.setHours(0, 0, 0, 0);
  const calendarSpan = Math.round(
    (endMidnight.getTime() - startMidnight.getTime()) / 86_400_000,
  );
  const days = Math.max(1, calendarSpan + 1);
  return { days, nights: Math.max(0, days - 1) };
}

/**
 * Pad a number with a leading zero — used to build values accepted
 * by `<input type="datetime-local">` (YYYY-MM-DDTHH:mm).
 */
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
 *
 * Returns a value formatted for `<input type="datetime-local">` (local
 * time, no timezone suffix).
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
 * and preserves a sensible default clock time (09:00) so the picker
 * lands on a valid datetime-local value.
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
 * next whole hour. Falls back to "1 hour from now" when lead is
 * unspecified so the picker still lands on a usable value before the
 * pricing payload arrives.
 */
export function defaultPickupInputValue(leadHours = 1) {
  const safeLead = Math.max(0, Number(leadHours) || 0);
  const d = new Date(Date.now() + safeLead * 60 * 60 * 1000);
  // Round UP to the next whole hour so the picker doesn't show a stale
  // minute value (matters when `lead` is fractional, e.g. 1.5h).
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
 * Default return datetime — same time, next day. Sensible "1-day
 * overnight" starting point that the user can adjust either way.
 */
export function defaultReturnInputValue(pickupInputValue) {
  const base = pickupInputValue
    ? new Date(pickupInputValue)
    : new Date(Date.now() + 60 * 60 * 1000);
  if (Number.isNaN(base.getTime())) return defaultPickupInputValue();
  const d = new Date(base.getTime() + 24 * 60 * 60 * 1000);
  return formatLocalDateTimeInput(d);
}
