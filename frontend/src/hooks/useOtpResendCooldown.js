import { useCallback, useEffect, useState } from 'react';

/** Default wait before an OTP can be resent. */
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

/**
 * Countdown gate for OTP resend buttons.
 * Call `start()` right after a successful send; `canResend` is false until it hits 0.
 */
export function useOtpResendCooldown(seconds = OTP_RESEND_COOLDOWN_SECONDS) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return undefined;
    const id = setTimeout(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  const start = useCallback(() => {
    setRemaining(seconds);
  }, [seconds]);

  const reset = useCallback(() => {
    setRemaining(0);
  }, []);

  return {
    remaining,
    canResend: remaining <= 0,
    start,
    reset,
  };
}
