import { useEffect, useMemo, useState } from 'react';
import { BOOKING_STATUS, PAYMENT_POLICY } from '../../../../constants/bookingStatus';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';

/**
 * Drives the in-ride countdown for the user side. Given the active booking,
 * it returns:
 *
 *   - `startedAt`          when the ride actually started (timeline)
 *   - `scheduledEndAt`     booked end instant (hourly: start + hours;
 *                          outstation: expectedReturnAt, already bumped
 *                          when extensions are paid)
 *   - `remainingSeconds`   negative once we've crossed `scheduledEndAt`
 *   - `elapsedSeconds`     seconds since startedAt
 *   - `isStarted`          true while the booking status === STARTED
 *   - `shouldPromptExtension`  hourly only — fires when remaining drops
 *                              below the configured lead time
 *   - `isOutstation`       true when the booking is an outstation trip
 *
 * Only `accepted` (paid) extensions add to the clock. Pending OTP /
 * pending-payment rows are ignored so the timer never jumps before the
 * handshake completes.
 *
 * The hook is pure timer + derived state — surfacing the prompt is left
 * to the page so the same data can drive other UI (progress bars, badges).
 */
export function useRideTimer(booking) {
  const [now, setNow] = useState(() => Date.now());

  const status = booking?.status;
  const isOutstation = booking?.serviceType === SERVICE_TYPES.OUTSTATION;
  const startedAt = booking?.timeline?.startedAt
    ? new Date(booking.timeline.startedAt).getTime()
    : null;

  const totalHours = useMemo(() => {
    if (isOutstation) return 0;
    const base = booking?.hourly?.durationHours || 0;
    // Only paid (`accepted`) extensions extend the clock. Counting
    // `pending_otp` / `pending_payment` here made the timer jump as soon
    // as the customer tapped Extend — before OTP verify + wallet pay —
    // while the invoice correctly ignored those unpaid rows.
    const extra = (booking?.extensions || []).reduce(
      (sum, ext) =>
        sum + (ext?.status === 'accepted' ? Number(ext.additionalHours) || 0 : 0),
      0,
    );
    return base + extra;
  }, [isOutstation, booking?.hourly?.durationHours, booking?.extensions]);

  const scheduledEndAt = useMemo(() => {
    if (isOutstation) {
      // Paid extensions bump `expectedReturnAt` / `endDate` and stamp
      // `windowAppliedAt` on the extension row. Legacy accepted rows
      // (pre-bump) still need their additionalDays added here so the
      // countdown doesn't snap back to the original return.
      const endSrc =
        booking?.outstation?.expectedReturnAt || booking?.outstation?.endDate;
      if (!endSrc) return null;
      let ms = new Date(endSrc).getTime();
      if (!Number.isFinite(ms)) return null;
      const unappliedMs = (booking?.extensions || []).reduce((sum, ext) => {
        if (ext?.status !== 'accepted') return sum;
        if (ext.windowAppliedAt) return sum;
        const days = Number(ext.additionalDays) || 0;
        if (days > 0) return sum + days * 86_400_000;
        const hours = Number(ext.additionalHours) || 0;
        if (hours > 0) return sum + hours * 3_600_000;
        return sum;
      }, 0);
      if (unappliedMs > 0) {
        ms += unappliedMs;
      }
      return ms;
    }
    if (!startedAt || !totalHours) return null;
    return startedAt + totalHours * 3600 * 1000;
  }, [
    isOutstation,
    booking?.outstation?.expectedReturnAt,
    booking?.outstation?.endDate,
    booking?.extensions,
    startedAt,
    totalHours,
  ]);

  // Tick at 1Hz once the ride is started — quiet otherwise so we don't burn
  // battery on listing/idle screens.
  useEffect(() => {
    if (status !== BOOKING_STATUS.STARTED) return undefined;
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [status]);

  const remainingSeconds = useMemo(() => {
    if (!scheduledEndAt) return null;
    return Math.floor((scheduledEndAt - now) / 1000);
  }, [scheduledEndAt, now]);

  const elapsedSeconds = useMemo(() => {
    if (!startedAt) return null;
    return Math.floor((now - startedAt) / 1000);
  }, [startedAt, now]);

  // Hourly + outstation: auto-prompt near the end of the booked window
  // (server also pushes BOOKING_EXTENSION_OFFERED / ride_ending_soon).
  const outstationLeadSeconds = (() => {
    if (!isOutstation) return null;
    const mins = Number(
      booking?.outstation?.returnReminderMinutes
        ?? booking?.fareSnapshot?.breakdown?.returnReminderMinutes,
    );
    if (!Number.isFinite(mins) || mins < 0) return 120 * 60;
    return mins * 60;
  })();

  const shouldPromptExtension =
    status === BOOKING_STATUS.STARTED &&
    remainingSeconds != null &&
    remainingSeconds > 0 &&
    !booking?.outstation?.extensionPromptDeclinedAt &&
    (isOutstation
      ? remainingSeconds <= outstationLeadSeconds
      : remainingSeconds <= PAYMENT_POLICY.EXTENSION_PROMPT_LEAD_SECONDS);

  return {
    startedAt,
    scheduledEndAt,
    elapsedSeconds,
    remainingSeconds,
    isStarted: status === BOOKING_STATUS.STARTED,
    totalHours,
    shouldPromptExtension,
    isOutstation,
  };
}
