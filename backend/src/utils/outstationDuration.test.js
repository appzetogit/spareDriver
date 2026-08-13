/**
 * Outstation calendar-day / duration unit tests.
 * Run: node --test src/utils/outstationDuration.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeOutstationTripMetrics,
  assertOutstationDaysWithinLimits,
} from './outstationDuration.js';

/** Build an ISO instant that is the given IST wall time. */
function ist(isoLocal) {
  // isoLocal like '2026-08-10T08:00:00' interpreted as Asia/Kolkata.
  return new Date(`${isoLocal}+05:30`);
}

describe('computeOutstationTripMetrics (Asia/Kolkata)', () => {
  it('same-day: 10 Aug 08:00 → 10 Aug 20:00 = 1 day / 0 nights', () => {
    const m = computeOutstationTripMetrics(
      ist('2026-08-10T08:00:00'),
      ist('2026-08-10T20:00:00'),
    );
    assert.equal(m.days, 1);
    assert.equal(m.nights, 0);
    assert.equal(m.durationMinutes, 12 * 60);
  });

  it('24 hours: 10 Aug 08:00 → 11 Aug 08:00 = 2 days / 1 night', () => {
    const m = computeOutstationTripMetrics(
      ist('2026-08-10T08:00:00'),
      ist('2026-08-11T08:00:00'),
    );
    assert.equal(m.days, 2);
    assert.equal(m.nights, 1);
    assert.equal(m.durationMinutes, 24 * 60);
  });

  it('25 hours: 10 Aug 08:00 → 11 Aug 09:00 = 2 days / 1 night', () => {
    const m = computeOutstationTripMetrics(
      ist('2026-08-10T08:00:00'),
      ist('2026-08-11T09:00:00'),
    );
    assert.equal(m.days, 2);
    assert.equal(m.nights, 1);
    assert.equal(m.durationMinutes, 25 * 60);
  });

  it('48 hours: 10 Aug 08:00 → 12 Aug 08:00 = 3 days / 2 nights', () => {
    const m = computeOutstationTripMetrics(
      ist('2026-08-10T08:00:00'),
      ist('2026-08-12T08:00:00'),
    );
    assert.equal(m.days, 3);
    assert.equal(m.nights, 2);
    assert.equal(m.durationMinutes, 48 * 60);
  });

  it('59 hours: 10 Aug 08:00 → 12 Aug 19:00 = 3 days / 2 nights', () => {
    const m = computeOutstationTripMetrics(
      ist('2026-08-10T08:00:00'),
      ist('2026-08-12T19:00:00'),
    );
    assert.equal(m.days, 3);
    assert.equal(m.nights, 2);
    assert.equal(m.durationMinutes, 59 * 60);
  });

  it('return before pickup throws', () => {
    assert.throws(
      () =>
        computeOutstationTripMetrics(
          ist('2026-08-12T08:00:00'),
          ist('2026-08-10T08:00:00'),
        ),
      (err) => err.code === 'OUTSTATION_RETURN_BEFORE_PICKUP',
    );
  });

  it('does not bill extra hours for partial final day', () => {
    const m = computeOutstationTripMetrics(
      ist('2026-08-10T08:00:00'),
      ist('2026-08-12T19:00:00'),
    );
    // Fare uses days/nights only — duration is stored separately.
    assert.equal(m.days, 3);
    assert.equal(m.nights, 2);
    assert.ok(m.durationHours === 59);
  });
});

describe('assertOutstationDaysWithinLimits', () => {
  it('rejects below minDays', () => {
    assert.throws(
      () => assertOutstationDaysWithinLimits(1, { minDays: 2, maxDays: 0 }),
      (err) => err.code === 'OUTSTATION_BELOW_MIN_DAYS',
    );
  });

  it('rejects above maxDays', () => {
    assert.throws(
      () => assertOutstationDaysWithinLimits(5, { minDays: 1, maxDays: 3 }),
      (err) => err.code === 'OUTSTATION_ABOVE_MAX_DAYS',
    );
  });

  it('allows unlimited when maxDays = 0', () => {
    assert.doesNotThrow(() =>
      assertOutstationDaysWithinLimits(30, { minDays: 1, maxDays: 0 }),
    );
  });

  it('allows exact maxDays', () => {
    assert.doesNotThrow(() =>
      assertOutstationDaysWithinLimits(3, { minDays: 1, maxDays: 3 }),
    );
  });
});
