import {
  BOOKING_TYPE,
  PAYMENT_POLICY,
} from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';

const DEFAULT_OUTSTATION_REMINDER_MINUTES = 120;
const DEFAULT_OUTSTATION_GRACE_MINUTES = 30;
const DEFAULT_OUTSTATION_PROMPT_REPEAT_MINUTES = 30;

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function isOutstationRideEndBooking(booking) {
  return (
    booking?.serviceType === SERVICE_TYPES.OUTSTATION
    || booking?.bookingType === BOOKING_TYPE.OUTSTATION
  );
}

export function isHourlyRideEndBooking(booking) {
  return booking?.serviceType === SERVICE_TYPES.HOURLY;
}

export function isRideEndEligibleBooking(booking) {
  return isHourlyRideEndBooking(booking) || isOutstationRideEndBooking(booking);
}

export function resolveOutstationRideEndConfig(booking) {
  const o = booking?.outstation || {};
  const bd = booking?.fareSnapshot?.breakdown || {};
  return {
    reminderMinutes: numOr(
      o.returnReminderMinutes ?? bd.returnReminderMinutes,
      DEFAULT_OUTSTATION_REMINDER_MINUTES,
    ),
    // 0/null means “use default”. Pricing also treats 0 as 30
    // (`Number(returnGraceMinutes) || 30`). Treating 0 as a real
    // window made overdue start at booked return.
    graceMinutes: (() => {
      const n = Number(o.returnGraceMinutes ?? bd.returnGraceMinutes);
      return Number.isFinite(n) && n > 0 ? n : DEFAULT_OUTSTATION_GRACE_MINUTES;
    })(),
    promptRepeatMinutes: numOr(
      o.returnPromptRepeatMinutes ?? bd.returnPromptRepeatMinutes,
      DEFAULT_OUTSTATION_PROMPT_REPEAT_MINUTES,
    ),
    autoCompleteHours: numOr(
      o.returnAutoCompleteHours ?? bd.returnAutoCompleteHours,
      0,
    ),
  };
}

const hourlyGraceMs = () =>
  Math.max(0, Number(PAYMENT_POLICY.RIDE_END_EXTENSION_GRACE_SECONDS) || 0) *
  1000;

const hourlyPromptLeadMs = () =>
  Math.max(0, Number(PAYMENT_POLICY.EXTENSION_PROMPT_LEAD_SECONDS) || 0) *
  1000;

/** Booked length in ms (base hours + accepted extensions). Hourly only. */
export function bookedRideDurationMs(booking) {
  const base = Number(booking?.hourly?.durationHours) || 0;
  if (base <= 0) return 0;
  const extra = (booking?.extensions || []).reduce(
    (sum, ext) =>
      sum + (ext?.status === 'accepted' ? Number(ext.additionalHours) || 0 : 0),
    0,
  );
  const pad = Number(booking?.hourly?.windowPadHours) || 0;
  return (base + extra + pad) * 3_600_000;
}

function outstationUnappliedExtensionMs(booking) {
  return (booking?.extensions || []).reduce((sum, ext) => {
    if (ext?.status !== 'accepted') return sum;
    if (ext.windowAppliedAt) return sum;
    const days = Number(ext.additionalDays) || 0;
    if (days > 0) return sum + days * 86_400_000;
    const hours = Number(ext.additionalHours) || 0;
    if (hours > 0) return sum + hours * 3_600_000;
    return sum;
  }, 0);
}

/** Wall-clock booked-end instant (before grace), or null. */
export function rideEndsAtMs(booking) {
  if (!booking) return null;

  if (isOutstationRideEndBooking(booking)) {
    const src =
      booking.outstation?.expectedReturnAt || booking.outstation?.endDate;
    if (!src) return null;
    const ms = new Date(src).getTime();
    if (!Number.isFinite(ms)) return null;
    return ms + outstationUnappliedExtensionMs(booking);
  }

  if (!isHourlyRideEndBooking(booking)) return null;
  const startedAtMs = booking.timeline?.startedAt
    ? new Date(booking.timeline.startedAt).getTime()
    : NaN;
  const durationMs = bookedRideDurationMs(booking);
  if (!Number.isFinite(startedAtMs) || durationMs <= 0) return null;
  return startedAtMs + durationMs;
}

/** When the first extend push should fire = booked end − lead time. */
export function rideExtensionPromptAtMs(booking) {
  const endsAt = rideEndsAtMs(booking);
  if (endsAt == null) return null;
  if (isOutstationRideEndBooking(booking)) {
    const { reminderMinutes } = resolveOutstationRideEndConfig(booking);
    if (reminderMinutes <= 0) return endsAt;
    return endsAt - reminderMinutes * 60_000;
  }
  return endsAt - hourlyPromptLeadMs();
}

export function rideGraceEndsAtMs(booking) {
  const endsAt = rideEndsAtMs(booking);
  if (endsAt == null) return null;
  if (isOutstationRideEndBooking(booking)) {
    const { graceMinutes } = resolveOutstationRideEndConfig(booking);
    return endsAt + graceMinutes * 60_000;
  }
  return endsAt + hourlyGraceMs();
}

/**
 * Overtime starts when grace ends. Auto-complete after grace is retired
 * for hourly + outstation — this stays as a named alias for callers.
 */
export function rideOvertimeStartsAtMs(booking) {
  return rideGraceEndsAtMs(booking);
}

/**
 * @deprecated Always null. Hourly and outstation no longer auto-complete
 * after grace; they enter overtime payment instead.
 */
export function rideAutoCompleteAtMs() {
  return null;
}
