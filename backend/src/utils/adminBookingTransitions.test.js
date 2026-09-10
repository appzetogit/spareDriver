import test from 'node:test';
import assert from 'node:assert/strict';

import { checkAdminTransition } from './adminBookingTransitions.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';

const S = BOOKING_STATUS;
const WITH_DRIVER = { hasDriver: true };

/**
 * The admin override is the one door into the booking state machine with no
 * driver, customer or timer on the other side of it, so these cover both
 * halves: the corrupting jumps must be refused, and the recovery work ops
 * actually rely on must keep working.
 */

test('refuses the transitions that corrupt money', async (t) => {
  await t.test('a booking with no driver cannot be completed', () => {
    // Settles commission and driver earning against nobody, on a booking the
    // customer has already paid for.
    const v = checkAdminTransition(S.STARTED, S.COMPLETED, { hasDriver: false });
    assert.equal(v.ok, false);
    assert.equal(v.code, 'COMPLETE_WITHOUT_DRIVER');
  });

  await t.test('searching cannot jump straight to completed', () => {
    const v = checkAdminTransition(S.SEARCHING, S.COMPLETED, WITH_DRIVER);
    assert.equal(v.ok, false);
    assert.equal(v.code, 'INVALID_STATUS_TRANSITION');
  });

  await t.test('a completed booking cannot be rewound', () => {
    // This is what let platform revenue and coupon usage double-count.
    for (const to of [S.STARTED, S.ARRIVED, S.EN_ROUTE, S.CANCELLED]) {
      const v = checkAdminTransition(S.COMPLETED, to, WITH_DRIVER);
      assert.equal(v.ok, false, `completed → ${to} must be refused`);
    }
  });

  await t.test('a cancelled booking cannot be revived', () => {
    for (const to of [S.STARTED, S.ARRIVED, S.EN_ROUTE, S.COMPLETED]) {
      const v = checkAdminTransition(S.CANCELLED, to, WITH_DRIVER);
      assert.equal(v.ok, false, `cancelled → ${to} must be refused`);
    }
  });

  await t.test('an unknown or blocked target is rejected outright', () => {
    const v = checkAdminTransition(S.SEARCHING, S.DRIVER_ASSIGNED, WITH_DRIVER);
    assert.equal(v.ok, false);
    assert.equal(v.code, 'STATUS_NOT_OVERRIDABLE');
  });
});

test('keeps the recovery work admins actually do', async (t) => {
  await t.test('forcing a wedged en-route booking to arrived', () => {
    // The exact case that left an outstation booking stuck for days: the
    // GPS-gated arrival can never fire, so an admin has to mint the OTP.
    assert.equal(checkAdminTransition(S.EN_ROUTE, S.ARRIVED, WITH_DRIVER).ok, true);
  });

  await t.test('a driver who never tapped "on the way"', () => {
    assert.equal(checkAdminTransition(S.DRIVER_ASSIGNED, S.EN_ROUTE, WITH_DRIVER).ok, true);
    assert.equal(checkAdminTransition(S.DRIVER_ASSIGNED, S.ARRIVED, WITH_DRIVER).ok, true);
  });

  await t.test('starting a trip when the OTP cannot be exchanged', () => {
    assert.equal(checkAdminTransition(S.ARRIVED, S.STARTED, WITH_DRIVER).ok, true);
  });

  await t.test('closing out a trip the driver never completed', () => {
    for (const from of [S.EN_ROUTE, S.ARRIVED, S.STARTED]) {
      assert.equal(
        checkAdminTransition(from, S.COMPLETED, WITH_DRIVER).ok,
        true,
        `${from} → completed must stay allowed`,
      );
    }
  });

  await t.test('rewinding a mistaken arrival or start', () => {
    assert.equal(checkAdminTransition(S.ARRIVED, S.EN_ROUTE, WITH_DRIVER).ok, true);
    assert.equal(checkAdminTransition(S.STARTED, S.ARRIVED, WITH_DRIVER).ok, true);
  });

  await t.test('cancelling is allowed from every live state', () => {
    for (const from of [
      S.PENDING_ASSIGNMENT,
      S.SEARCHING,
      S.DRIVER_ASSIGNED,
      S.AWAITING_PAYMENT,
      S.EN_ROUTE,
      S.ARRIVED,
      S.STARTED,
      S.IN_EMERGENCY_POOL,
      S.NO_DRIVERS_FOUND,
    ]) {
      assert.equal(
        checkAdminTransition(from, S.CANCELLED, WITH_DRIVER).ok,
        true,
        `${from} → cancelled must stay allowed`,
      );
    }
  });

  await t.test('parking an unmatched booking for manual assignment', () => {
    assert.equal(
      checkAdminTransition(S.SEARCHING, S.IN_EMERGENCY_POOL, { hasDriver: false }).ok,
      true,
    );
    assert.equal(
      checkAdminTransition(S.SEARCHING, S.NO_DRIVERS_FOUND, { hasDriver: false }).ok,
      true,
    );
  });

  await t.test('cancelling never needs a driver', () => {
    assert.equal(
      checkAdminTransition(S.SEARCHING, S.CANCELLED, { hasDriver: false }).ok,
      true,
    );
  });
});

test('rejections explain what would have worked', async (t) => {
  await t.test('lists the permitted source states', () => {
    const v = checkAdminTransition(S.SEARCHING, S.STARTED, WITH_DRIVER);
    assert.equal(v.ok, false);
    assert.deepEqual(v.allowedFrom, [S.ARRIVED]);
    assert.match(v.message, /Allowed from: arrived/);
  });

  await t.test('defaults to no driver when context is omitted', () => {
    const v = checkAdminTransition(S.STARTED, S.COMPLETED);
    assert.equal(v.ok, false);
    assert.equal(v.code, 'COMPLETE_WITHOUT_DRIVER');
  });
});
