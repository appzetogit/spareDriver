/**
 * Outstation V2 duration-based billing (24h blocks + fractional extra hours).
 *
 * Calendar-date counting lives in `outstationDuration.js` (V1 only).
 * Hourly services must never import billing logic from here.
 */

export const MINUTES_PER_DAY = 1440;
const MS_PER_MINUTE = 60_000;

/**
 * Exact wall-clock duration between pickup and return.
 * @throws Error with code when soft=false and bounds invalid
 */
export function computeOutstationExactDuration(
  pickupAt,
  expectedReturnAt,
  { soft = false } = {},
) {
  const fallback = {
    durationMs: 0,
    durationMinutes: 0,
    durationHours: 0,
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

  const durationMs = end.getTime() - start.getTime();
  const durationMinutes = Math.floor(durationMs / MS_PER_MINUTE);
  const durationHours = durationMinutes / 60;

  return { durationMs, durationMinutes, durationHours };
}

/**
 * Derive billable 24h blocks + remainder from duration minutes.
 * Does not validate min/max trip length.
 */
export function computeOutstationBillingUnits(
  durationMinutes,
  { minDays = 1 } = {},
) {
  const mins = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  const fullDays = Math.floor(mins / MINUTES_PER_DAY);
  const remainingMinutes = mins % MINUTES_PER_DAY;
  const remainingHours = remainingMinutes / 60;

  let billableFullDays;
  let billableExtraHours;

  if (fullDays === 0) {
    // Under one 24h block: minimum one service-day charge (minDays
    // validation happens separately via assertOutstationDurationWithinLimits).
    billableFullDays = Math.max(1, Math.floor(Number(minDays) || 1) > 1 ? 1 : 1);
    billableExtraHours = 0;
  } else {
    billableFullDays = fullDays;
    billableExtraHours = remainingHours;
  }

  // Stay: only when trip spans ≥ 24h — short midnight crossings excluded.
  const billableNights = fullDays >= 1 ? fullDays : 0;
  const foodServiceDays = billableFullDays;

  return {
    durationMinutes: mins,
    durationHours: mins / 60,
    fullDays,
    remainingMinutes,
    remainingHours,
    billableFullDays,
    billableExtraHours,
    billableNights,
    foodServiceDays,
  };
}

/**
 * Full V2 metrics from pickup → return datetimes.
 */
export function computeOutstationDurationBilling(
  pickupAt,
  expectedReturnAt,
  { minDays = 1, soft = false } = {},
) {
  const duration = computeOutstationExactDuration(pickupAt, expectedReturnAt, {
    soft,
  });
  if (soft && duration.durationMinutes === 0 && duration.durationMs === 0) {
    return {
      ...duration,
      fullDays: 0,
      remainingMinutes: 0,
      remainingHours: 0,
      billableFullDays: 1,
      billableExtraHours: 0,
      billableNights: 0,
      foodServiceDays: 1,
    };
  }
  const billing = computeOutstationBillingUnits(duration.durationMinutes, {
    minDays,
  });
  return { ...duration, ...billing };
}

/**
 * Option A: minDays=N (N≥2) requires duration ≥ N×24h.
 * minDays=1 allows any positive duration (minimum 1-day billing applied).
 */
export function assertOutstationDurationWithinLimits(
  durationMinutes,
  { minDays = 1, maxDays = 0 } = {},
) {
  const mins = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  const min = Math.max(1, Math.floor(Number(minDays) || 1));
  const max = Math.max(0, Math.floor(Number(maxDays) || 0));

  if (mins <= 0) {
    const err = new Error('Outstation trip duration must be positive');
    err.code = 'OUTSTATION_DURATION_INVALID';
    err.details = { durationMinutes: mins, minDays: min, maxDays: max };
    throw err;
  }

  if (min > 1 && mins < min * MINUTES_PER_DAY) {
    const err = new Error(
      `Outstation trips require at least ${min} day${min === 1 ? '' : 's'} of service (${min * 24} hours)`,
    );
    err.code = 'OUTSTATION_BELOW_MIN_DAYS';
    err.details = { durationMinutes: mins, minDays: min, maxDays: max };
    throw err;
  }

  if (max > 0 && mins > max * MINUTES_PER_DAY) {
    const err = new Error(
      `Outstation trips cannot exceed ${max} day${max === 1 ? '' : 's'} of service (${max * 24} hours)`,
    );
    err.code = 'OUTSTATION_ABOVE_MAX_DAYS';
    err.details = { durationMinutes: mins, minDays: min, maxDays: max };
    throw err;
  }

  const billing = computeOutstationBillingUnits(mins, { minDays: min });
  return { ...billing, minDays: min, maxDays: max };
}

/** Human label — "3h", "30h 30m". */
export function formatOutstationDurationLabel(durationMinutes) {
  const total = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  if (total < 60) return `${total} min`;
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}
