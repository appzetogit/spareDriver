import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PAYMENT_FLOW,
  PAYMENT_RAIL,
  PAYMENT_UNAVAILABLE_REASON,
  normalisePaymentMethodConfig,
  isRailEnabled,
  isWalletTopupEnabled,
  resolveDuesSettlementModes,
  isCodEligibleForBooking,
  resolveBookingPaymentMethods,
  isBookingMethodAllowed,
} from './paymentMethods.util.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { BOOKING_TYPE } from '../constants/bookingStatus.js';

/**
 * These lock the payment-rail rules that the iOS kill switch and the
 * whole COD rollout depend on. The recurring theme: a per-flow toggle
 * must never be able to resurrect a rail its master switch turned off.
 */

/** Everything on, COD included — the permissive baseline to narrow from. */
const allOn = {
  razorpayEnabled: true,
  codEnabled: true,
  flows: {
    walletTopup: { razorpay: true },
    booking: { wallet: true, razorpay: true, cod: true },
    subscriptionCheckout: { razorpay: true, cod: true },
    driverKit: { razorpay: true, cod: true },
  },
  cod: {
    serviceTypes: [SERVICE_TYPES.HOURLY],
    allowInstant: true,
    allowScheduled: true,
    maxBookingValueRupees: 0,
    userMaxPendingDuesRupees: 1000,
    duesSettlement: { razorpay: true, adminManual: true },
  },
};

const hourlyInstant = {
  serviceType: SERVICE_TYPES.HOURLY,
  bookingType: BOOKING_TYPE.INSTANT,
};

test('normalisePaymentMethodConfig fills a missing sub-document', async (t) => {
  await t.test('undefined config does not throw and keeps Razorpay on', () => {
    const cfg = normalisePaymentMethodConfig(undefined);
    assert.equal(cfg.razorpayEnabled, true);
    assert.equal(cfg.codEnabled, false);
    assert.equal(cfg.flows[PAYMENT_FLOW.BOOKING].wallet, true);
  });

  await t.test('missing booleans fall back to defaults, not to false', () => {
    // The settings singleton is read with .lean(), so mongoose defaults
    // never apply. If `undefined` collapsed to false, deploying the
    // schema would silently kill Razorpay before an admin touched it.
    const cfg = normalisePaymentMethodConfig({});
    assert.equal(cfg.razorpayEnabled, true);
    assert.equal(cfg.flows[PAYMENT_FLOW.WALLET_TOPUP].razorpay, true);
  });

  await t.test('explicit false is preserved', () => {
    const cfg = normalisePaymentMethodConfig({ razorpayEnabled: false });
    assert.equal(cfg.razorpayEnabled, false);
  });

  await t.test('unknown service types are dropped, empty falls back to hourly', () => {
    assert.deepEqual(
      normalisePaymentMethodConfig({ cod: { serviceTypes: ['spaceship'] } }).cod.serviceTypes,
      [SERVICE_TYPES.HOURLY],
    );
  });

  await t.test('negative thresholds are clamped to zero', () => {
    const cfg = normalisePaymentMethodConfig({ cod: { driverDuesBlockRupees: -50 } });
    assert.equal(cfg.cod.driverDuesBlockRupees, 0);
  });
});

test('master switch always beats the per-flow toggle', async (t) => {
  // The 2x2 that matters: only master AND flow yields an enabled rail.
  const table = [
    { master: true, flow: true, expected: true },
    { master: true, flow: false, expected: false },
    { master: false, flow: true, expected: false },
    { master: false, flow: false, expected: false },
  ];

  await t.test('razorpay on the booking flow', () => {
    for (const { master, flow, expected } of table) {
      const cfg = {
        ...allOn,
        razorpayEnabled: master,
        flows: { ...allOn.flows, booking: { ...allOn.flows.booking, razorpay: flow } },
      };
      assert.equal(
        isRailEnabled(cfg, PAYMENT_FLOW.BOOKING, PAYMENT_RAIL.RAZORPAY),
        expected,
        `master=${master} flow=${flow}`,
      );
    }
  });

  await t.test('cod on the booking flow', () => {
    for (const { master, flow, expected } of table) {
      const cfg = {
        ...allOn,
        codEnabled: master,
        flows: { ...allOn.flows, booking: { ...allOn.flows.booking, cod: flow } },
      };
      assert.equal(
        isRailEnabled(cfg, PAYMENT_FLOW.BOOKING, PAYMENT_RAIL.COD),
        expected,
        `master=${master} flow=${flow}`,
      );
    }
  });

  await t.test('a flow toggle cannot widen a disabled master', () => {
    const cfg = { ...allOn, razorpayEnabled: false };
    assert.equal(isRailEnabled(cfg, PAYMENT_FLOW.DRIVER_KIT, PAYMENT_RAIL.RAZORPAY), false);
    assert.equal(
      isRailEnabled(cfg, PAYMENT_FLOW.SUBSCRIPTION_CHECKOUT, PAYMENT_RAIL.RAZORPAY),
      false,
    );
  });

  await t.test('wallet is internal money — no master switch gates it', () => {
    const cfg = { ...allOn, razorpayEnabled: false, codEnabled: false };
    assert.equal(isRailEnabled(cfg, PAYMENT_FLOW.BOOKING, PAYMENT_RAIL.WALLET), true);
  });

  await t.test('unknown flow or rail is false, never a throw', () => {
    assert.equal(isRailEnabled(allOn, 'nope', PAYMENT_RAIL.COD), false);
    assert.equal(isRailEnabled(allOn, PAYMENT_FLOW.WALLET_TOPUP, PAYMENT_RAIL.COD), false);
  });
});

test('wallet top-up dies with Razorpay', async (t) => {
  await t.test('razorpay off ⇒ top-up unavailable', () => {
    assert.equal(isWalletTopupEnabled({ ...allOn, razorpayEnabled: false }), false);
  });

  await t.test('top-up flow can be closed while Razorpay stays on elsewhere', () => {
    const cfg = { ...allOn, flows: { ...allOn.flows, walletTopup: { razorpay: false } } };
    assert.equal(isWalletTopupEnabled(cfg), false);
    assert.equal(isRailEnabled(cfg, PAYMENT_FLOW.BOOKING, PAYMENT_RAIL.RAZORPAY), true);
  });
});

test('dues settlement always leaves drivers a way out', async (t) => {
  // If both rails could close, switching Razorpay off for an App Store
  // review would trap every driver who owes dues: they could not clear
  // them, so they could not go online, so they could not earn.
  await t.test('adminManual survives razorpay being off', () => {
    const modes = resolveDuesSettlementModes({ ...allOn, razorpayEnabled: false });
    assert.equal(modes.razorpay, false);
    assert.equal(modes.adminManual, true);
  });

  await t.test('adminManual survives being explicitly disabled', () => {
    const modes = resolveDuesSettlementModes({
      ...allOn,
      cod: { ...allOn.cod, duesSettlement: { razorpay: false, adminManual: false } },
    });
    assert.equal(modes.adminManual, true);
  });

  await t.test('never returns zero open rails, for any config', () => {
    for (const razorpayEnabled of [true, false]) {
      for (const razorpay of [true, false]) {
        for (const adminManual of [true, false]) {
          const modes = resolveDuesSettlementModes({
            ...allOn,
            razorpayEnabled,
            cod: { ...allOn.cod, duesSettlement: { razorpay, adminManual } },
          });
          assert.ok(
            modes.razorpay || modes.adminManual,
            `trapped drivers with ${JSON.stringify({ razorpayEnabled, razorpay, adminManual })}`,
          );
        }
      }
    }
  });
});

test('COD booking scope is hourly-only', async (t) => {
  await t.test('hourly instant is eligible', () => {
    const res = isCodEligibleForBooking({ config: allOn, ...hourlyInstant });
    assert.equal(res.eligible, true);
    assert.equal(res.reason, null);
  });

  await t.test('hourly scheduled is eligible too', () => {
    // Decision 2 was "hourly instant AND scheduled". A regression that
    // quietly drops scheduled COD is otherwise invisible.
    const res = isCodEligibleForBooking({
      config: allOn,
      serviceType: SERVICE_TYPES.HOURLY,
      bookingType: BOOKING_TYPE.SCHEDULED,
    });
    assert.equal(res.eligible, true);
  });

  await t.test('outstation is refused even with COD fully on', () => {
    const res = isCodEligibleForBooking({
      config: allOn,
      serviceType: SERVICE_TYPES.OUTSTATION,
      bookingType: BOOKING_TYPE.OUTSTATION,
    });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, PAYMENT_UNAVAILABLE_REASON.COD_SERVICE_TYPE);
  });

  await t.test('subscription-backed rides are refused', () => {
    const res = isCodEligibleForBooking({
      config: allOn,
      ...hourlyInstant,
      hasSubscription: true,
    });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, PAYMENT_UNAVAILABLE_REASON.COD_SUBSCRIPTION);
  });

  await t.test('instant and scheduled can be disabled independently', () => {
    const noInstant = { ...allOn, cod: { ...allOn.cod, allowInstant: false } };
    assert.equal(isCodEligibleForBooking({ config: noInstant, ...hourlyInstant }).eligible, false);
    assert.equal(
      isCodEligibleForBooking({
        config: noInstant,
        serviceType: SERVICE_TYPES.HOURLY,
        bookingType: BOOKING_TYPE.SCHEDULED,
      }).eligible,
      true,
    );
  });
});

test('COD value cap', async (t) => {
  const capped = { ...allOn, cod: { ...allOn.cod, maxBookingValueRupees: 500 } };

  await t.test('at the cap is allowed, above it is not', () => {
    assert.equal(
      isCodEligibleForBooking({ config: capped, ...hourlyInstant, fareTotal: 500 }).eligible,
      true,
    );
    const over = isCodEligibleForBooking({ config: capped, ...hourlyInstant, fareTotal: 500.01 });
    assert.equal(over.eligible, false);
    assert.equal(over.reason, PAYMENT_UNAVAILABLE_REASON.COD_VALUE_CAP);
  });

  await t.test('zero means uncapped, not "always blocked"', () => {
    assert.equal(
      isCodEligibleForBooking({ config: allOn, ...hourlyInstant, fareTotal: 1e6 }).eligible,
      true,
    );
  });
});

test('resolveBookingPaymentMethods', async (t) => {
  await t.test('wallet is preferred when it can cover the ride', () => {
    const res = resolveBookingPaymentMethods({
      config: allOn,
      ...hourlyInstant,
      fareTotal: 400,
      walletAvailableRupees: 900,
    });
    assert.equal(res.defaultMethod, PAYMENT_RAIL.WALLET);
    assert.deepEqual(res.enabled, [PAYMENT_RAIL.WALLET, PAYMENT_RAIL.COD]);
  });

  await t.test('wallet uses AVAILABLE, not raw balance', () => {
    // Mirrors createBookingService, which checks availableRupees. Using
    // raw balance here would offer a payment the create call then 402s.
    const res = resolveBookingPaymentMethods({
      config: allOn,
      ...hourlyInstant,
      fareTotal: 500,
      walletAvailableRupees: 100, // balance 1000 − held 900
    });
    assert.equal(isBookingMethodAllowed(res, PAYMENT_RAIL.WALLET), false);
    assert.equal(
      res.methods.find((m) => m.method === PAYMENT_RAIL.WALLET).reason,
      PAYMENT_UNAVAILABLE_REASON.WALLET_INSUFFICIENT,
    );
    assert.equal(res.shortBy, 400);
    assert.equal(res.defaultMethod, PAYMENT_RAIL.COD);
  });

  await t.test('COD off leaves an empty-wallet user with nothing', () => {
    const res = resolveBookingPaymentMethods({
      config: { ...allOn, codEnabled: false },
      ...hourlyInstant,
      fareTotal: 500,
      walletAvailableRupees: 0,
    });
    assert.equal(res.anyEnabled, false);
    assert.equal(res.defaultMethod, null);
  });

  await t.test('defaultMethod is always a member of the enabled set', () => {
    for (const codEnabled of [true, false]) {
      for (const walletAvailableRupees of [0, 10_000]) {
        const res = resolveBookingPaymentMethods({
          config: { ...allOn, codEnabled },
          ...hourlyInstant,
          fareTotal: 500,
          walletAvailableRupees,
        });
        if (res.defaultMethod === null) {
          assert.equal(res.anyEnabled, false);
        } else {
          assert.ok(
            res.enabled.includes(res.defaultMethod),
            `default ${res.defaultMethod} not in [${res.enabled}]`,
          );
        }
      }
    }
  });

  await t.test('user dues over the cap block every rail', () => {
    // Blocking only COD would be pointless — the user would cancel COD
    // rides to accrue dues and keep booking by wallet forever.
    const res = resolveBookingPaymentMethods({
      config: allOn,
      ...hourlyInstant,
      fareTotal: 100,
      walletAvailableRupees: 99_999,
      userPendingDues: 1000,
    });
    assert.equal(res.duesBlocked, true);
    assert.equal(res.anyEnabled, false);
    for (const m of res.methods) {
      assert.equal(m.reason, PAYMENT_UNAVAILABLE_REASON.USER_DUES_BLOCK);
    }
  });

  await t.test('dues below the cap do not block', () => {
    const res = resolveBookingPaymentMethods({
      config: allOn,
      ...hourlyInstant,
      fareTotal: 100,
      walletAvailableRupees: 500,
      userPendingDues: 999,
    });
    assert.equal(res.duesBlocked, false);
    assert.equal(res.anyEnabled, true);
  });

  await t.test('carried dues count toward the COD value cap', () => {
    const res = resolveBookingPaymentMethods({
      config: { ...allOn, cod: { ...allOn.cod, maxBookingValueRupees: 500 } },
      ...hourlyInstant,
      fareTotal: 450,
      userPendingDues: 100, // driver would have to collect 550
      walletAvailableRupees: 0,
    });
    assert.equal(isBookingMethodAllowed(res, PAYMENT_RAIL.COD), false);
  });

  await t.test('outstation never offers COD, whatever the wallet says', () => {
    const res = resolveBookingPaymentMethods({
      config: allOn,
      serviceType: SERVICE_TYPES.OUTSTATION,
      bookingType: BOOKING_TYPE.OUTSTATION,
      fareTotal: 5000,
      walletAvailableRupees: 0,
    });
    assert.equal(isBookingMethodAllowed(res, PAYMENT_RAIL.COD), false);
    assert.equal(res.anyEnabled, false);
  });
});

test('isBookingMethodAllowed is defensive', async (t) => {
  await t.test('a malformed resolution is false, not a throw', () => {
    assert.equal(isBookingMethodAllowed(null, PAYMENT_RAIL.COD), false);
    assert.equal(isBookingMethodAllowed({}, PAYMENT_RAIL.COD), false);
  });

  await t.test('a disabled method is never allowed', () => {
    const res = resolveBookingPaymentMethods({
      config: { ...allOn, codEnabled: false },
      ...hourlyInstant,
      fareTotal: 100,
      walletAvailableRupees: 100,
    });
    assert.equal(isBookingMethodAllowed(res, PAYMENT_RAIL.COD), false);
    assert.equal(isBookingMethodAllowed(res, PAYMENT_RAIL.WALLET), true);
  });
});
