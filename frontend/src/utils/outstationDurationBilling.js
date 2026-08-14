/**
 * Outstation V2 duration billing — mirrors backend/outstationDurationBilling.js
 */

export const MINUTES_PER_DAY = 1440;
const MS_PER_MINUTE = 60_000;

export function computeOutstationExactDuration(pickupAt, expectedReturnAt, { soft = false } = {}) {
  const fallback = { durationMs: 0, durationMinutes: 0, durationHours: 0 };
  if (!pickupAt || !expectedReturnAt) {
    if (soft) return fallback;
    throw Object.assign(new Error('Outstation: pickupAt and expectedReturnAt are required'), {
      code: 'OUTSTATION_BOUNDS_REQUIRED',
    });
  }
  const start = new Date(pickupAt);
  const end = new Date(expectedReturnAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    if (soft) return fallback;
    throw Object.assign(new Error('Outstation: invalid datetimes'), {
      code: 'OUTSTATION_BOUNDS_INVALID',
    });
  }
  if (end.getTime() <= start.getTime()) {
    if (soft) return fallback;
    throw Object.assign(new Error('Outstation: return must be after pickup'), {
      code: 'OUTSTATION_RETURN_BEFORE_PICKUP',
    });
  }
  const durationMs = end.getTime() - start.getTime();
  const durationMinutes = Math.floor(durationMs / MS_PER_MINUTE);
  return { durationMs, durationMinutes, durationHours: durationMinutes / 60 };
}

export function computeOutstationBillingUnits(durationMinutes, { minDays = 1 } = {}) {
  const mins = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  const fullDays = Math.floor(mins / MINUTES_PER_DAY);
  const remainingMinutes = mins % MINUTES_PER_DAY;
  const remainingHours = remainingMinutes / 60;

  let billableFullDays;
  let billableExtraHours;
  if (fullDays === 0) {
    billableFullDays = 1;
    billableExtraHours = 0;
  } else {
    billableFullDays = fullDays;
    billableExtraHours = remainingHours;
  }

  return {
    durationMinutes: mins,
    durationHours: mins / 60,
    fullDays,
    remainingMinutes,
    remainingHours,
    billableFullDays,
    billableExtraHours,
    billableNights: fullDays >= 1 ? fullDays : 0,
    foodServiceDays: billableFullDays,
  };
}

export function computeOutstationDurationBilling(
  pickupAt,
  expectedReturnAt,
  { minDays = 1, soft = false } = {},
) {
  const duration = computeOutstationExactDuration(pickupAt, expectedReturnAt, { soft });
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
  return { ...duration, ...computeOutstationBillingUnits(duration.durationMinutes, { minDays }) };
}

export function formatOutstationDurationLabel(durationMinutes) {
  const total = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  if (total < 60) return `${total} min`;
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

/** V2 display shape — replaces calendar days/nights in the UI. */
export function computeOutstationDuration(pickupAt, expectedReturnAt) {
  const m = computeOutstationDurationBilling(pickupAt, expectedReturnAt, { soft: true });
  return {
    days: m.billableFullDays,
    nights: m.billableNights,
    durationMinutes: m.durationMinutes,
    billableFullDays: m.billableFullDays,
    billableExtraHours: m.billableExtraHours,
  };
}

export function computeOutstationTripMetrics(pickupAt, expectedReturnAt) {
  return computeOutstationDurationBilling(pickupAt, expectedReturnAt, { soft: true });
}
