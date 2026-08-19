/**
 * Location batch normalisation unit tests.
 * Run: node --test src/utils/locationFix.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFixes, toEpochMs, trackingDirective } from './locationFix.util.js';
import { LOCATION_BATCH } from '../constants/driverTracking.js';

const NOW = Date.UTC(2026, 7, 18, 12, 0, 0);

/** A valid fix, `secondsAgo` before NOW. */
function fix(secondsAgo, over = {}) {
  return {
    lat: 28.6139,
    lng: 77.209,
    accuracy: 8,
    heading: 90,
    speed: 4.2,
    capturedAt: new Date(NOW - secondsAgo * 1000).toISOString(),
    ...over,
  };
}

describe('toEpochMs', () => {
  it('accepts ISO strings', () => {
    assert.equal(toEpochMs('2026-08-18T12:00:00.000Z'), NOW);
  });

  it('accepts epoch milliseconds', () => {
    assert.equal(toEpochMs(NOW), NOW);
  });

  it('returns NaN for garbage', () => {
    assert.ok(Number.isNaN(toEpochMs('not a date')));
    assert.ok(Number.isNaN(toEpochMs(undefined)));
  });
});

describe('normalizeFixes', () => {
  it('sorts oldest-first regardless of upload order', () => {
    const { fixes } = normalizeFixes([fix(10), fix(30), fix(20)], NOW);
    assert.deepEqual(
      fixes.map((f) => f.capturedAt),
      [NOW - 30_000, NOW - 20_000, NOW - 10_000],
    );
  });

  it('rejects fixes older than the age horizon', () => {
    const tooOld = LOCATION_BATCH.MAX_AGE_MS / 1000 + 60;
    const { fixes, rejected } = normalizeFixes([fix(tooOld), fix(5)], NOW);
    assert.equal(fixes.length, 1);
    assert.equal(rejected, 1);
  });

  it('rejects fixes beyond the tolerated future skew', () => {
    const skewSec = LOCATION_BATCH.MAX_FUTURE_SKEW_MS / 1000;
    const { fixes, rejected } = normalizeFixes(
      [fix(-(skewSec + 30)), fix(-(skewSec - 10))],
      NOW,
    );
    assert.equal(rejected, 1, 'only the far-future fix is rejected');
    assert.equal(fixes.length, 1, 'mild clock skew is tolerated');
  });

  it('rejects out-of-range and non-finite coordinates', () => {
    const { fixes, rejected } = normalizeFixes(
      [
        fix(5, { lat: 91 }),
        fix(6, { lng: -181 }),
        fix(7, { lat: Number.NaN }),
        fix(8, { lng: 'oops' }),
        fix(9),
      ],
      NOW,
    );
    assert.equal(fixes.length, 1);
    assert.equal(rejected, 4);
  });

  it('drops exact repeats inside one batch', () => {
    const same = fix(12);
    const { fixes, duplicates } = normalizeFixes([same, { ...same }, fix(11)], NOW);
    assert.equal(fixes.length, 2);
    assert.equal(duplicates, 1);
  });

  it('keeps two fixes at the same instant from different places', () => {
    const a = fix(12);
    const b = fix(12, { lat: 28.62 });
    const { fixes, duplicates } = normalizeFixes([a, b], NOW);
    assert.equal(fixes.length, 2);
    assert.equal(duplicates, 0);
  });

  it('normalises missing optional telemetry to null', () => {
    const { fixes } = normalizeFixes(
      [{ lat: 1, lng: 2, capturedAt: NOW - 1000 }],
      NOW,
    );
    assert.equal(fixes[0].accuracy, null);
    assert.equal(fixes[0].heading, null);
    assert.equal(fixes[0].speed, null);
  });

  it('survives a non-array body', () => {
    const { fixes, rejected } = normalizeFixes(null, NOW);
    assert.deepEqual(fixes, []);
    assert.equal(rejected, 0);
  });
});

describe('trackingDirective', () => {
  it('on a trip: keep the accurate mode running', () => {
    assert.deepEqual(trackingDirective({ isOnline: true, isOnTrip: true }), {
      stopTracking: false,
      mode: 'onTrip',
    });
  });

  it('online but idle: keep the cheap mode running', () => {
    assert.deepEqual(trackingDirective({ isOnline: true, isOnTrip: false }), {
      stopTracking: false,
      mode: 'idle',
    });
  });

  it('offline: stand the service down', () => {
    assert.deepEqual(trackingDirective({ isOnline: false, isOnTrip: false }), {
      stopTracking: true,
      mode: 'stopped',
    });
  });

  it('on a trip while flagged offline still tracks — the ride outranks the toggle', () => {
    assert.deepEqual(trackingDirective({ isOnline: false, isOnTrip: true }), {
      stopTracking: false,
      mode: 'onTrip',
    });
  });

  it('missing driver: stand down', () => {
    assert.deepEqual(trackingDirective(null), { stopTracking: true, mode: 'stopped' });
  });
});
