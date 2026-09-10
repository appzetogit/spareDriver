import test from 'node:test';
import assert from 'node:assert/strict';

import { decideRecoveryStages, minutesPast } from './stuckRecovery.js';
import { STUCK_RECOVERY } from '../constants/bookingStatus.js';

/**
 * Escalation ladder for outstation bookings wedged at EN_ROUTE past their
 * pickup time. The sweep that consumes this needs Mongo; the decision
 * itself is pure, so it is covered here with no database.
 */

const NUDGE = STUCK_RECOVERY.NUDGE_MINUTES;
const ESCALATE = STUCK_RECOVERY.ESCALATE_MINUTES;
const CLEAN = Object.freeze({ nudgedAt: null, escalatedAt: null });

test('decideRecoveryStages', async (t) => {
  await t.test('does nothing before the nudge threshold', () => {
    assert.deepEqual(decideRecoveryStages(0, CLEAN), {
      nudge: false,
      escalate: false,
    });
    assert.deepEqual(decideRecoveryStages(NUDGE - 1, CLEAN), {
      nudge: false,
      escalate: false,
    });
  });

  await t.test('nudges at the nudge threshold, without escalating', () => {
    assert.deepEqual(decideRecoveryStages(NUDGE, CLEAN), {
      nudge: true,
      escalate: false,
    });
    assert.deepEqual(decideRecoveryStages(ESCALATE - 1, CLEAN), {
      nudge: true,
      escalate: false,
    });
  });

  await t.test('escalates at the hard threshold', () => {
    assert.deepEqual(
      decideRecoveryStages(ESCALATE, { ...CLEAN, nudgedAt: new Date() }),
      { nudge: false, escalate: true },
    );
  });

  await t.test('a booking found already past the hard threshold does both stages at once', () => {
    // Worker downtime, or a legacy row wedged for days: it must not have to
    // wait another batch interval for the reminder stage to tick first.
    assert.deepEqual(decideRecoveryStages(ESCALATE + 5000, CLEAN), {
      nudge: true,
      escalate: true,
    });
  });

  await t.test('is idempotent — already-stamped stages do not re-fire', () => {
    assert.deepEqual(
      decideRecoveryStages(NUDGE + 1, { nudgedAt: new Date(), escalatedAt: null }),
      { nudge: false, escalate: false },
    );
    assert.deepEqual(
      decideRecoveryStages(ESCALATE + 1, {
        nudgedAt: new Date(),
        escalatedAt: new Date(),
      }),
      { nudge: false, escalate: false },
    );
  });

  await t.test('treats a missing state object as a clean slate', () => {
    assert.deepEqual(decideRecoveryStages(NUDGE, undefined), {
      nudge: true,
      escalate: false,
    });
    assert.deepEqual(decideRecoveryStages(NUDGE, {}), {
      nudge: true,
      escalate: false,
    });
  });

  await t.test('ignores non-finite lateness rather than notifying on bad data', () => {
    for (const bad of [NaN, undefined, null, 'soon']) {
      assert.deepEqual(
        decideRecoveryStages(bad, CLEAN),
        { nudge: false, escalate: false },
        `expected no action for ${String(bad)}`,
      );
    }
  });

  await t.test('honours policy overrides', () => {
    const policy = { nudgeMinutes: 10, escalateMinutes: 20 };
    assert.deepEqual(decideRecoveryStages(9, CLEAN, policy), {
      nudge: false,
      escalate: false,
    });
    assert.deepEqual(decideRecoveryStages(10, CLEAN, policy), {
      nudge: true,
      escalate: false,
    });
    assert.deepEqual(decideRecoveryStages(20, CLEAN, policy), {
      nudge: true,
      escalate: true,
    });
  });

  await t.test('a mis-set policy can never escalate before it nudges', () => {
    // escalateMinutes below nudgeMinutes is clamped up to the nudge point,
    // so the stages fire together rather than inverting.
    const inverted = { nudgeMinutes: 60, escalateMinutes: 5 };
    assert.deepEqual(decideRecoveryStages(59, CLEAN, inverted), {
      nudge: false,
      escalate: false,
    });
    assert.deepEqual(decideRecoveryStages(60, CLEAN, inverted), {
      nudge: true,
      escalate: true,
    });
  });
});

test('minutesPast', async (t) => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  await t.test('counts whole minutes since the given time', () => {
    assert.equal(minutesPast(new Date(now - 90 * 60_000), now), 90);
    assert.equal(minutesPast(new Date(now - 59_000), now), 0);
    assert.equal(minutesPast(new Date(now - 61_000), now), 1);
  });

  await t.test('accepts ISO strings as well as Dates', () => {
    assert.equal(minutesPast(new Date(now - 30 * 60_000).toISOString(), now), 30);
  });

  await t.test('never reports negative lateness for a future pickup', () => {
    assert.equal(minutesPast(new Date(now + 60 * 60_000), now), 0);
  });

  await t.test('returns 0 for missing or unparseable input', () => {
    for (const bad of [null, undefined, '', 'not-a-date']) {
      assert.equal(minutesPast(bad, now), 0, `expected 0 for ${String(bad)}`);
    }
  });
});
