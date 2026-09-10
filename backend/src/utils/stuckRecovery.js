import { STUCK_RECOVERY } from '../constants/bookingStatus.js';

/**
 * Pure decision logic for stuck-booking recovery.
 *
 * Kept out of `services/bookingStuckRecovery.service.js` so the escalation
 * ladder can be unit-tested without pulling in the Mongoose model graph —
 * the same reason the other `src/utils/*.test.js` suites stay dependency-free
 * and runnable in a bare checkout.
 */

/**
 * Which recovery stages a wedged booking still needs, given how late it is
 * and what has already been stamped on it.
 *
 * Escalation subsumes the nudge: a booking discovered already past the hard
 * threshold (worker downtime, a long-wedged legacy row) reports both stages
 * at once rather than waiting a further batch interval for the reminder to
 * tick first.
 *
 * @param {number} minutesLate  minutes past the booked pickup time
 * @param {{ nudgedAt?: any, escalatedAt?: any }} [state]  existing stamps
 * @param {{ nudgeMinutes?: number, escalateMinutes?: number }} [policy]
 * @returns {{ nudge: boolean, escalate: boolean }}
 */
export function decideRecoveryStages(minutesLate, state = {}, policy = {}) {
  const nudgeAfter = Math.max(
    1,
    Number(policy.nudgeMinutes ?? STUCK_RECOVERY.NUDGE_MINUTES) || 30,
  );
  // Never allow a mis-set knob to put escalation before the nudge.
  const escalateAfter = Math.max(
    nudgeAfter,
    Number(policy.escalateMinutes ?? STUCK_RECOVERY.ESCALATE_MINUTES) || 120,
  );

  const late = Number(minutesLate);
  if (!Number.isFinite(late) || late < nudgeAfter) {
    return { nudge: false, escalate: false };
  }

  return {
    nudge: !state?.nudgedAt,
    escalate: late >= escalateAfter && !state?.escalatedAt,
  };
}

/**
 * Whole minutes elapsed since `date`, floored at 0. Returns 0 for missing or
 * unparseable input so a bad timestamp can never manufacture lateness.
 *
 * @param {Date|string|number|null|undefined} date
 * @param {number} now  epoch ms to measure against
 * @returns {number}
 */
export function minutesPast(date, now) {
  if (!date) return 0;
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60_000));
}
