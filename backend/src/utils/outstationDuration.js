/**
 * Outstation calendar-day / night / exact-duration helpers.
 *
 * Business timezone is always Asia/Kolkata — never the server local TZ
 * (production may run in UTC).
 *
 * Billable days = distinct local calendar dates touched by
 *   pickupAt → expectedReturnAt
 * Nights     = local midnights crossed (= billableDays − 1 when end > start)
 *
 * Exact duration (ms / minutes / hours) is calculated separately and must
 * NOT replace calendar-day fare billing.
 */

export const OUTSTATION_BUSINESS_TZ = 'Asia/Kolkata';

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

/**
 * @param {Date|string|number} value
 * @param {string} [timeZone]
 * @returns {{ year: number, month: number, day: number } | null}
 */
export function getZonedYmd(value, timeZone = OUTSTATION_BUSINESS_TZ) {
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

/** UTC day-serial for a Y-M-D triple (timezone-independent day math). */
function ymdDayIndex({ year, month, day }) {
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/**
 * Full outstation trip metrics from pickup → expected return.
 *
 * @param {Date|string|number} pickupAt
 * @param {Date|string|number} expectedReturnAt
 * @param {{ soft?: boolean, timeZone?: string }} [opts]
 *   soft=true → never throw; return safe defaults for invalid input
 *   soft=false (default) → throw Error with code for invalid input
 * @returns {{
 *   days: number,
 *   nights: number,
 *   durationMs: number,
 *   durationMinutes: number,
 *   durationHours: number,
 *   timeZone: string,
 * }}
 */
export function computeOutstationTripMetrics(
  pickupAt,
  expectedReturnAt,
  { soft = false, timeZone = OUTSTATION_BUSINESS_TZ } = {},
) {
  const fallback = {
    days: 1,
    nights: 0,
    durationMs: 0,
    durationMinutes: 0,
    durationHours: 0,
    timeZone,
  };

  if (pickupAt == null || expectedReturnAt == null) {
    if (soft) return fallback;
    const err = new Error('Outstation: pickupAt and expectedReturnAt are required');
    err.code = 'OUTSTATION_BOUNDS_REQUIRED';
    throw err;
  }

  const start = pickupAt instanceof Date ? pickupAt : new Date(pickupAt);
  const end =
    expectedReturnAt instanceof Date
      ? expectedReturnAt
      : new Date(expectedReturnAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    if (soft) return fallback;
    const err = new Error(
      'Outstation: pickupAt and expectedReturnAt must be valid datetimes',
    );
    err.code = 'OUTSTATION_BOUNDS_INVALID';
    throw err;
  }

  if (end.getTime() <= start.getTime()) {
    if (soft) return fallback;
    const err = new Error('Outstation: expectedReturnAt must be after pickupAt');
    err.code = 'OUTSTATION_RETURN_BEFORE_PICKUP';
    throw err;
  }

  const startYmd = getZonedYmd(start, timeZone);
  const endYmd = getZonedYmd(end, timeZone);
  if (!startYmd || !endYmd) {
    if (soft) return fallback;
    const err = new Error('Outstation: could not resolve calendar dates');
    err.code = 'OUTSTATION_CALENDAR_UNRESOLVED';
    throw err;
  }

  const span = ymdDayIndex(endYmd) - ymdDayIndex(startYmd);
  const days = Math.max(1, span + 1);
  const nights = Math.max(0, span);

  const durationMs = end.getTime() - start.getTime();
  const durationMinutes = Math.floor(durationMs / MS_PER_MINUTE);
  const durationHours = durationMinutes / 60;

  return {
    days,
    nights,
    durationMs,
    durationMinutes,
    durationHours,
    timeZone,
  };
}

/**
 * Backward-compatible shape used across booking create / reschedule.
 * Soft by default so legacy callers never throw on null math.
 */
export function computeOutstationDuration(pickupAt, expectedReturnAt) {
  const m = computeOutstationTripMetrics(pickupAt, expectedReturnAt, {
    soft: true,
  });
  return { days: m.days, nights: m.nights };
}

/**
 * Enforce admin minDays / maxDays (maxDays === 0 → unlimited).
 * @throws Error with code OUTSTATION_BELOW_MIN_DAYS | OUTSTATION_ABOVE_MAX_DAYS
 */
export function assertOutstationDaysWithinLimits(
  billableDays,
  { minDays = 1, maxDays = 0 } = {},
) {
  const days = Math.max(0, Math.floor(Number(billableDays) || 0));
  const min = Math.max(1, Math.floor(Number(minDays) || 1));
  const max = Math.max(0, Math.floor(Number(maxDays) || 0));

  if (days < min) {
    const err = new Error(
      `Outstation trips require at least ${min} day${min === 1 ? '' : 's'}`,
    );
    err.code = 'OUTSTATION_BELOW_MIN_DAYS';
    err.details = { days, minDays: min, maxDays: max };
    throw err;
  }
  if (max > 0 && days > max) {
    const err = new Error(
      `Outstation trips cannot exceed ${max} day${max === 1 ? '' : 's'}`,
    );
    err.code = 'OUTSTATION_ABOVE_MAX_DAYS';
    err.details = { days, minDays: min, maxDays: max };
    throw err;
  }
  return { days, minDays: min, maxDays: max };
}
