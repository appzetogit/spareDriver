/**
 * Outstation scheduling helpers + V2 duration billing re-exports.
 * Calendar-date billing (V1) lives only on the backend for legacy bookings.
 */

export {
  computeOutstationTripMetrics,
  computeOutstationDuration,
  formatOutstationDurationLabel,
} from './outstationDurationBilling.js';
import { formatOutstationDurationLabel } from './outstationDurationBilling.js';

export const OUTSTATION_BUSINESS_TZ = 'Asia/Kolkata';

/** Alias for formatOutstationDurationLabel */
export function formatOutstationExactDuration(durationMinutes) {
  return formatOutstationDurationLabel(durationMinutes);
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

/** Never allow a pickup floor earlier than the current clock. */
export function notBeforeNow(date, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return date || new Date();
  if (!date) return new Date(nowMs);
  const ms = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (!Number.isFinite(ms)) return new Date(nowMs);
  return ms < nowMs ? new Date(nowMs) : date instanceof Date ? date : new Date(ms);
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
