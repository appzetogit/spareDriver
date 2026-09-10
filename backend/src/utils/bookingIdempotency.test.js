import test from 'node:test';
import assert from 'node:assert/strict';

import { bookingFingerprint, resolveIdempotencyKey } from './bookingIdempotency.js';

/**
 * The fingerprint is the duplicate-charge guard, and it fails in two
 * directions: too unstable and a double-tap slips through as two bookings
 * and two wallet debits; too coarse and a customer's legitimate second
 * booking is refused. Both directions are covered here.
 */

const USER = '65a000000000000000000001';

/** A representative hourly create payload. */
function hourlyBody(over = {}) {
  return {
    serviceType: 'hourly',
    bookingType: 'instant',
    carId: '65b000000000000000000001',
    pickup: { location: { coordinates: [77.5946, 12.9716] } },
    dropoff: { location: { coordinates: [77.6033, 12.9784] } },
    hourly: {
      scheduledStartAt: '2026-03-01T09:00:00.000Z',
      durationHours: 4,
      slabId: '65c000000000000000000001',
      isCustomDuration: false,
    },
    ...over,
  };
}

function outstationBody(over = {}) {
  return {
    serviceType: 'outstation',
    bookingType: 'outstation',
    carId: '65b000000000000000000001',
    pickup: { location: { coordinates: [77.5946, 12.9716] } },
    outstation: {
      destinationAddress: 'Mysuru',
      pickupAt: '2026-03-10T06:00:00.000Z',
      expectedReturnAt: '2026-03-12T20:00:00.000Z',
      needsStay: true,
      needsFood: true,
    },
    ...over,
  };
}

test('fingerprint is stable for the same request', async (t) => {
  await t.test('identical payloads hash identically', () => {
    assert.equal(
      bookingFingerprint(USER, hourlyBody()),
      bookingFingerprint(USER, hourlyBody()),
    );
  });

  await t.test('incidental client-only fields are ignored', () => {
    // This is the reason fields are picked explicitly instead of hashing the
    // whole body — an analytics id that changes per tap would otherwise let
    // every double-submit through.
    const withNoise = hourlyBody({
      _clientRequestId: Math.random().toString(36),
      analytics: { sessionId: 'abc', tapCount: 2 },
      deviceTime: new Date().toISOString(),
    });
    assert.equal(bookingFingerprint(USER, withNoise), bookingFingerprint(USER, hourlyBody()));
  });

  await t.test('equivalent date representations hash identically', () => {
    const asDate = hourlyBody();
    asDate.hourly.scheduledStartAt = new Date('2026-03-01T09:00:00.000Z');
    const asOffset = hourlyBody();
    asOffset.hourly.scheduledStartAt = '2026-03-01T14:30:00.000+05:30';
    assert.equal(bookingFingerprint(USER, asDate), bookingFingerprint(USER, hourlyBody()));
    assert.equal(bookingFingerprint(USER, asOffset), bookingFingerprint(USER, hourlyBody()));
  });

  await t.test('sub-metre GPS jitter between two taps does not split the key', () => {
    const jittered = hourlyBody();
    jittered.pickup = { location: { coordinates: [77.594600002, 12.971599998] } };
    assert.equal(bookingFingerprint(USER, jittered), bookingFingerprint(USER, hourlyBody()));
  });

  await t.test('coupon case and padding are normalised', () => {
    assert.equal(
      bookingFingerprint(USER, hourlyBody({ couponCode: '  save50 ' })),
      bookingFingerprint(USER, hourlyBody({ couponCode: 'SAVE50' })),
    );
  });
});

test('fingerprint separates genuinely different requests', async (t) => {
  const base = bookingFingerprint(USER, hourlyBody());

  await t.test('a different customer', () => {
    assert.notEqual(bookingFingerprint('65a000000000000000000002', hourlyBody()), base);
  });

  await t.test('a different car', () => {
    assert.notEqual(
      bookingFingerprint(USER, hourlyBody({ carId: '65b000000000000000000009' })),
      base,
    );
  });

  await t.test('a different pickup time', () => {
    const later = hourlyBody();
    later.hourly.scheduledStartAt = '2026-03-01T11:00:00.000Z';
    assert.notEqual(bookingFingerprint(USER, later), base);
  });

  await t.test('a different duration', () => {
    const longer = hourlyBody();
    longer.hourly.durationHours = 6;
    assert.notEqual(bookingFingerprint(USER, longer), base);
  });

  await t.test('a real change of pickup location', () => {
    const moved = hourlyBody();
    moved.pickup = { location: { coordinates: [77.61, 12.99] } };
    assert.notEqual(bookingFingerprint(USER, moved), base);
  });

  await t.test('a different coupon', () => {
    assert.notEqual(bookingFingerprint(USER, hourlyBody({ couponCode: 'SAVE50' })), base);
  });
});

test('outstation windows are fingerprinted on both date pairs', async (t) => {
  await t.test('the legacy startDate/endDate pair matches the new one', () => {
    const legacy = outstationBody();
    legacy.outstation = {
      destinationAddress: 'Mysuru',
      startDate: '2026-03-10T06:00:00.000Z',
      endDate: '2026-03-12T20:00:00.000Z',
      needsStay: true,
      needsFood: true,
    };
    assert.equal(
      bookingFingerprint(USER, legacy),
      bookingFingerprint(USER, outstationBody()),
    );
  });

  await t.test('a different return date separates them', () => {
    const shorter = outstationBody();
    shorter.outstation.expectedReturnAt = '2026-03-11T20:00:00.000Z';
    assert.notEqual(
      bookingFingerprint(USER, shorter),
      bookingFingerprint(USER, outstationBody()),
    );
  });

  await t.test('destination casing is normalised', () => {
    const cased = outstationBody();
    cased.outstation.destinationAddress = '  mysuru ';
    assert.equal(
      bookingFingerprint(USER, cased),
      bookingFingerprint(USER, outstationBody()),
    );
  });

  await t.test('opting out of stay separates them', () => {
    const noStay = outstationBody();
    noStay.outstation.needsStay = false;
    assert.notEqual(
      bookingFingerprint(USER, noStay),
      bookingFingerprint(USER, outstationBody()),
    );
  });
});

test('resolveIdempotencyKey', async (t) => {
  await t.test('falls back to the fingerprint when no client key is sent', () => {
    assert.equal(
      resolveIdempotencyKey(USER, hourlyBody(), undefined),
      bookingFingerprint(USER, hourlyBody()),
    );
    assert.equal(
      resolveIdempotencyKey(USER, hourlyBody(), '   '),
      bookingFingerprint(USER, hourlyBody()),
    );
  });

  await t.test('a client key wins over the request shape', () => {
    // Two different payloads under one client key are one attempt.
    const a = resolveIdempotencyKey(USER, hourlyBody(), 'tap-1');
    const b = resolveIdempotencyKey(USER, hourlyBody({ carId: 'other' }), 'tap-1');
    assert.equal(a, b);
    assert.notEqual(a, bookingFingerprint(USER, hourlyBody()));
  });

  await t.test('client keys are namespaced per customer', () => {
    // Two customers both sending "1" must not collide.
    assert.notEqual(
      resolveIdempotencyKey(USER, hourlyBody(), '1'),
      resolveIdempotencyKey('65a000000000000000000002', hourlyBody(), '1'),
    );
  });

  await t.test('returns a hex sha256', () => {
    assert.match(resolveIdempotencyKey(USER, hourlyBody()), /^[0-9a-f]{64}$/);
  });
});
