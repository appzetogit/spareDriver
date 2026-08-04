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
      const unappliedDays = (booking?.extensions || []).reduce((sum, ext) => {
        if (ext?.status !== 'accepted') return sum;
        if (ext.windowAppliedAt) return sum;
        const days =
          Number(ext.additionalDays) ||
          Math.round((Number(ext.additionalHours) || 0) / 24) ||
          0;
        return sum + Math.max(0, days);
      }, 0);
      if (unappliedDays > 0) {
        ms += unappliedDays * 86_400_000;
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

  // Hourly-only auto-prompt near the end of the booked window.
  // Outstation uses a persistent "Extend trip" card instead.
  const shouldPromptExtension =
    !isOutstation &&
    status === BOOKING_STATUS.STARTED &&
    remainingSeconds != null &&
    remainingSeconds <= PAYMENT_POLICY.EXTENSION_PROMPT_LEAD_SECONDS;

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
