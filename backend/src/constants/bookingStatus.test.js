import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOOKING_STATUS,
  BOOKING_STATUS_LIST,
  ACTIVE_BOOKING_STATUSES,
  TERMINAL_BOOKING_STATUSES,
} from './bookingStatus.js';

/**
 * Invariants the booking concurrency guards depend on.
 *
 * `cancelBookingByUserService` claims a booking atomically with
 * `status: { $in: ACTIVE_BOOKING_STATUSES }`. That single filter is what
 * stops a cancel from overwriting a trip the driver just completed — so
 * the moment COMPLETED (or CANCELLED) appears in that list, the guard
 * silently stops guarding and the double-pay bug comes back with no test
 * failing anywhere else. These lock the shape of the lists themselves.
 */

test('ACTIVE_BOOKING_STATUSES excludes terminal states', async (t) => {
  await t.test('COMPLETED is not active — cancel must not clobber it', () => {
    assert.equal(
      ACTIVE_BOOKING_STATUSES.includes(BOOKING_STATUS.COMPLETED),
      false,
      'adding COMPLETED here would let a cancel overwrite a finished trip',
    );
  });

  await t.test('CANCELLED is not active — a second cancel must not re-refund', () => {
    assert.equal(
      ACTIVE_BOOKING_STATUSES.includes(BOOKING_STATUS.CANCELLED),
      false,
      'adding CANCELLED here would let a second cancel issue a second refund',
    );
  });

  await t.test('active and terminal sets are disjoint', () => {
    const overlap = ACTIVE_BOOKING_STATUSES.filter((s) =>
      TERMINAL_BOOKING_STATUSES.includes(s),
    );
    assert.deepEqual(overlap, [], `overlapping statuses: ${overlap.join(', ')}`);
  });
});

test('status lists only contain real statuses', async (t) => {
  await t.test('every active status is a declared BOOKING_STATUS', () => {
    for (const s of ACTIVE_BOOKING_STATUSES) {
      assert.ok(
        BOOKING_STATUS_LIST.includes(s),
        `${s} is in ACTIVE_BOOKING_STATUSES but is not a BOOKING_STATUS value`,
      );
    }
  });

  await t.test('every terminal status is a declared BOOKING_STATUS', () => {
    for (const s of TERMINAL_BOOKING_STATUSES) {
      assert.ok(
        BOOKING_STATUS_LIST.includes(s),
        `${s} is in TERMINAL_BOOKING_STATUSES but is not a BOOKING_STATUS value`,
      );
    }
  });

  await t.test('the in-flight states a cancel must still be able to claim', () => {
    // These are the states a customer can legitimately cancel from. If one
    // drops out of the active list, cancel starts rejecting valid requests.
    for (const s of [
      BOOKING_STATUS.SEARCHING,
      BOOKING_STATUS.DRIVER_ASSIGNED,
      BOOKING_STATUS.AWAITING_PAYMENT,
      BOOKING_STATUS.EN_ROUTE,
      BOOKING_STATUS.ARRIVED,
      BOOKING_STATUS.STARTED,
    ]) {
      assert.ok(
        ACTIVE_BOOKING_STATUSES.includes(s),
        `${s} must stay cancellable`,
      );
    }
  });
});
