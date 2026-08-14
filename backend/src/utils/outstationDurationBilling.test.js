/**
 * Outstation V2 duration billing tests.
 * Run: node --test src/utils/outstationDurationBilling.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeOutstationDurationBilling,
  computeOutstationBillingUnits,
  assertOutstationDurationWithinLimits,
  formatOutstationDurationLabel,
} from './outstationDurationBilling.js';

function ist(isoLocal) {
  return new Date(`${isoLocal}+05:30`);
}

describe('computeOutstationDurationBilling (V2)', () => {
  it('A: 10 Aug 10am → 8pm = 10h, 1 min day, 0 extra, 0 nights', () => {
    const m = computeOutstationDurationBilling(
      ist('2026-08-10T10:00:00'),
      ist('2026-08-10T20:00:00'),
    );
    assert.equal(m.durationMinutes, 10 * 60);
    assert.equal(m.billableFullDays, 1);
    assert.equal(m.billableExtraHours, 0);
    assert.equal(m.billableNights, 0);
  });

  it('B: 10pm → 1am = 3h, 1 min day, 0 extra, 0 nights (NOT 2 days)', () => {
    const m = computeOutstationDurationBilling(
      ist('2026-08-10T22:00:00'),
      ist('2026-08-11T01:00:00'),
    );
    assert.equal(m.durationMinutes, 3 * 60);
    assert.equal(m.billableFullDays, 1);
    assert.equal(m.billableExtraHours, 0);
    assert.equal(m.billableNights, 0);
  });

  it('C: 5am → next 11:30am = 30h30m, 1 day + 6.5h extra', () => {
    const m = computeOutstationDurationBilling(
      ist('2026-08-12T05:00:00'),
      ist('2026-08-13T11:30:00'),
    );
    assert.equal(m.durationMinutes, 30 * 60 + 30);
    assert.equal(m.billableFullDays, 1);
    assert.equal(m.billableExtraHours, 6.5);
    assert.equal(m.billableNights, 1);
  });

  it('D: 8am → next 8am = 24h, 1 day, 0 extra, 1 night', () => {
    const m = computeOutstationDurationBilling(
      ist('2026-08-10T08:00:00'),
      ist('2026-08-11T08:00:00'),
    );
    assert.equal(m.durationMinutes, 24 * 60);
    assert.equal(m.billableFullDays, 1);
    assert.equal(m.billableExtraHours, 0);
    assert.equal(m.billableNights, 1);
  });

  it('E: 8am → next 2pm = 30h, 1 day + 6h extra, 1 night', () => {
    const m = computeOutstationDurationBilling(
      ist('2026-08-10T08:00:00'),
      ist('2026-08-11T14:00:00'),
    );
    assert.equal(m.durationMinutes, 30 * 60);
    assert.equal(m.billableFullDays, 1);
    assert.equal(m.billableExtraHours, 6);
    assert.equal(m.billableNights, 1);
  });

  it('F: 8am → +2d 8am = 48h, 2 days, 0 extra, 2 nights', () => {
    const m = computeOutstationDurationBilling(
      ist('2026-08-10T08:00:00'),
      ist('2026-08-12T08:00:00'),
    );
    assert.equal(m.durationMinutes, 48 * 60);
    assert.equal(m.billableFullDays, 2);
    assert.equal(m.billableExtraHours, 0);
    assert.equal(m.billableNights, 2);
  });

  it('G: 8am → +2d 7pm = 59h, 2 days + 11h extra, 2 nights', () => {
    const m = computeOutstationDurationBilling(
      ist('2026-08-10T08:00:00'),
      ist('2026-08-12T19:00:00'),
    );
    assert.equal(m.durationMinutes, 59 * 60);
    assert.equal(m.billableFullDays, 2);
    assert.equal(m.billableExtraHours, 11);
    assert.equal(m.billableNights, 2);
  });

  it('H: return before pickup throws', () => {
    assert.throws(
      () =>
        computeOutstationDurationBilling(
          ist('2026-08-12T08:00:00'),
          ist('2026-08-10T08:00:00'),
        ),
      (err) => err.code === 'OUTSTATION_RETURN_BEFORE_PICKUP',
    );
  });
});

describe('assertOutstationDurationWithinLimits (Option A)', () => {
  it('I: below minDays=2 rejects 10h trip', () => {
    assert.throws(
      () =>
        assertOutstationDurationWithinLimits(10 * 60, {
          minDays: 2,
          maxDays: 0,
        }),
      (err) => err.code === 'OUTSTATION_BELOW_MIN_DAYS',
    );
  });

  it('minDays=1 allows 3h trip', () => {
    assert.doesNotThrow(() =>
      assertOutstationDurationWithinLimits(3 * 60, { minDays: 1, maxDays: 0 }),
    );
  });

  it('J: above maxDays rejects', () => {
    assert.throws(
      () =>
        assertOutstationDurationWithinLimits(49 * 60, {
          minDays: 1,
          maxDays: 2,
        }),
      (err) => err.code === 'OUTSTATION_ABOVE_MAX_DAYS',
    );
  });

  it('allows exact maxDays duration', () => {
    assert.doesNotThrow(() =>
      assertOutstationDurationWithinLimits(48 * 60, { minDays: 1, maxDays: 2 }),
    );
  });
});

describe('formatOutstationDurationLabel', () => {
  it('formats fractional hours', () => {
    assert.equal(formatOutstationDurationLabel(30 * 60 + 30), '30h 30m');
  });
});

describe('computeOutstationBillingUnits', () => {
  it('does not ceil partial days to full days', () => {
    const u = computeOutstationBillingUnits(59 * 60);
    assert.equal(u.billableFullDays, 2);
    assert.equal(u.billableExtraHours, 11);
  });
});
