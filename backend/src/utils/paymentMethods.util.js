import { SERVICE_TYPES, SERVICE_TYPE_LIST } from '../constants/serviceTypes.js';
import { BOOKING_TYPE } from '../constants/bookingStatus.js';

/**
 * Payment-rail resolution.
 *
 * Every "can this flow use this rail?" question in the platform goes
 * through this file. It is deliberately pure — no DB, no imports beyond
 * constants — so the rules can be locked by `node --test` without a
 * Mongo instance.
 *
 * The one rule that governs everything else:
 *
 *     effective = master && flow
 *
 * A per-flow toggle can only ever NARROW its master rail, never widen
 * it. That is what makes `razorpayEnabled: false` a genuine kill switch
 * for the iOS review — no per-flow flag can resurrect Razorpay behind
 * the admin's back.
 */

/** Named checkout surfaces that can offer a rail. */
export const PAYMENT_FLOW = Object.freeze({
  BOOKING: 'booking',
  SUBSCRIPTION_CHECKOUT: 'subscriptionCheckout',
  DRIVER_KIT: 'driverKit',
  WALLET_TOPUP: 'walletTopup',
});

/** The rails themselves. Mirrors `BOOKING_PAYMENT_METHOD` for bookings. */
export const PAYMENT_RAIL = Object.freeze({
  WALLET: 'wallet',
  RAZORPAY: 'razorpay',
  COD: 'cod',
});

/**
 * Why a rail is unavailable. Surfaced to the client so the UI can render
 * the right message (and the right CTA) instead of a bare "unavailable".
 */
export const PAYMENT_UNAVAILABLE_REASON = Object.freeze({
  RAIL_DISABLED: 'RAIL_DISABLED',
  FLOW_DISABLED: 'FLOW_DISABLED',
  COD_SERVICE_TYPE: 'COD_SERVICE_TYPE',
  COD_BOOKING_TYPE: 'COD_BOOKING_TYPE',
  COD_SUBSCRIPTION: 'COD_SUBSCRIPTION',
  COD_VALUE_CAP: 'COD_VALUE_CAP',
  WALLET_INSUFFICIENT: 'WALLET_INSUFFICIENT',
  USER_DUES_BLOCK: 'USER_DUES_BLOCK',
});

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Coerce to a finite number, defaulting rather than throwing. */
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Coerce to boolean with an explicit default. `undefined` means "the
 * settings doc predates this field" and must fall back to the default,
 * NOT to `false` — otherwise deploying the schema would silently
 * disable Razorpay for everyone before an admin ever opens the panel.
 */
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

/**
 * Fill every path of a possibly-empty `AppSettings.paymentMethods`
 * sub-document.
 *
 * This exists because `getOrCreateSettingsDoc()` reads the singleton
 * with `.lean()`, which skips mongoose defaults entirely — so an
 * AppSettings doc written before this feature shipped returns
 * `paymentMethods: undefined` and every downstream `config.x.y` would
 * throw. Callers may assume every field below is present and typed.
 */
export function normalisePaymentMethodConfig(raw) {
  const src = raw || {};
  const flows = src.flows || {};
  const cod = src.cod || {};
  const dues = cod.duesSettlement || {};

  const serviceTypes = Array.isArray(cod.serviceTypes)
    ? cod.serviceTypes.filter((t) => SERVICE_TYPE_LIST.includes(t))
    : [SERVICE_TYPES.HOURLY];

  return {
    razorpayEnabled: bool(src.razorpayEnabled, true),
    codEnabled: bool(src.codEnabled, false),
    flows: {
      [PAYMENT_FLOW.WALLET_TOPUP]: {
        razorpay: bool(flows.walletTopup?.razorpay, true),
      },
      [PAYMENT_FLOW.BOOKING]: {
        wallet: bool(flows.booking?.wallet, true),
        razorpay: bool(flows.booking?.razorpay, true),
        cod: bool(flows.booking?.cod, false),
      },
      [PAYMENT_FLOW.SUBSCRIPTION_CHECKOUT]: {
        razorpay: bool(flows.subscriptionCheckout?.razorpay, true),
        cod: bool(flows.subscriptionCheckout?.cod, false),
      },
      [PAYMENT_FLOW.DRIVER_KIT]: {
        razorpay: bool(flows.driverKit?.razorpay, true),
        cod: bool(flows.driverKit?.cod, false),
      },
    },
    cod: {
      // Empty array would mean "COD nowhere", which is what codEnabled
      // is for — treat it as "not configured" and fall back to hourly.
      serviceTypes: serviceTypes.length ? serviceTypes : [SERVICE_TYPES.HOURLY],
      allowInstant: bool(cod.allowInstant, true),
      allowScheduled: bool(cod.allowScheduled, true),
      maxBookingValueRupees: Math.max(0, num(cod.maxBookingValueRupees, 0)),
      driverDuesWarnRupees: Math.max(0, num(cod.driverDuesWarnRupees, 1000)),
      driverDuesBlockRupees: Math.max(0, num(cod.driverDuesBlockRupees, 2000)),
      driverDuesCodOfferBlockRupees: Math.max(
        0,
        num(cod.driverDuesCodOfferBlockRupees, num(cod.driverDuesBlockRupees, 2000)),
      ),
      userMaxPendingDuesRupees: Math.max(0, num(cod.userMaxPendingDuesRupees, 1000)),
      duesSettlement: {
        razorpay: bool(dues.razorpay, true),
        // adminManual is normalised here but `resolveDuesSettlementModes`
        // is the function that actually guarantees it can never be off.
        adminManual: bool(dues.adminManual, true),
      },
    },
  };
}

/** `master && flow` for one named flow + rail. Unknown pairs are false. */
export function isRailEnabled(config, flow, rail) {
  const cfg = normalisePaymentMethodConfig(config);
  const flowCfg = cfg.flows[flow];
  if (!flowCfg) return false;
  if (!(rail in flowCfg)) return false;

  // The wallet rail is internal money — it has no external provider and
  // is therefore not gated by a master switch, only by its flow flag.
  if (rail === PAYMENT_RAIL.WALLET) return Boolean(flowCfg.wallet);

  const master =
    rail === PAYMENT_RAIL.COD ? cfg.codEnabled : cfg.razorpayEnabled;
  return Boolean(master && flowCfg[rail]);
}

/** Is wallet top-up reachable at all? It is a Razorpay-only flow. */
export function isWalletTopupEnabled(config) {
  return isRailEnabled(config, PAYMENT_FLOW.WALLET_TOPUP, PAYMENT_RAIL.RAZORPAY);
}

/**
 * Which rails a driver may use to clear outstanding cash dues.
 *
 * `adminManual` is force-enabled and can never be turned off. Without
 * this floor, switching Razorpay off for an App Store review would trap
 * every driver who owes dues: they cannot clear them, so they cannot go
 * back online, so they cannot earn. The admin-manual path (driver hands
 * cash to an admin, admin records it) always has to exist.
 */
export function resolveDuesSettlementModes(config) {
  const cfg = normalisePaymentMethodConfig(config);
  return {
    razorpay: Boolean(cfg.razorpayEnabled && cfg.cod.duesSettlement.razorpay),
    adminManual: true,
  };
}

/**
 * Is COD offerable for a booking of this shape, ignoring the toggles?
 * Split out from `resolveBookingPaymentMethods` so the scope rules
 * (hourly-only, not subscription-backed, under the value cap) can be
 * asserted on their own.
 *
 * @returns {{ eligible: boolean, reason: string|null }}
 */
export function isCodEligibleForBooking({
  config,
  serviceType,
  bookingType,
  hasSubscription = false,
  fareTotal = 0,
}) {
  const cfg = normalisePaymentMethodConfig(config);

  if (!cfg.cod.serviceTypes.includes(serviceType)) {
    return { eligible: false, reason: PAYMENT_UNAVAILABLE_REASON.COD_SERVICE_TYPE };
  }

  if (bookingType === BOOKING_TYPE.INSTANT && !cfg.cod.allowInstant) {
    return { eligible: false, reason: PAYMENT_UNAVAILABLE_REASON.COD_BOOKING_TYPE };
  }
  if (bookingType === BOOKING_TYPE.SCHEDULED && !cfg.cod.allowScheduled) {
    return { eligible: false, reason: PAYMENT_UNAVAILABLE_REASON.COD_BOOKING_TYPE };
  }
  // Outstation is its own booking type and is excluded by serviceTypes
  // above; this guard catches any future type we have not reasoned about.
  if (bookingType === BOOKING_TYPE.OUTSTATION) {
    return { eligible: false, reason: PAYMENT_UNAVAILABLE_REASON.COD_BOOKING_TYPE };
  }

  // A subscription ride is already paid for by the plan — there is no
  // cash to collect and no commission to recover.
  if (hasSubscription) {
    return { eligible: false, reason: PAYMENT_UNAVAILABLE_REASON.COD_SUBSCRIPTION };
  }

  const cap = cfg.cod.maxBookingValueRupees;
  if (cap > 0 && num(fareTotal) > cap) {
    return { eligible: false, reason: PAYMENT_UNAVAILABLE_REASON.COD_VALUE_CAP };
  }

  return { eligible: true, reason: null };
}

/**
 * The full answer for a booking checkout: which rails are offerable,
 * which one to preselect, and why each disabled one is disabled.
 *
 * `walletAvailableRupees` must be the wallet's AVAILABLE figure
 * (balance − heldRupees), matching what `createBookingService` checks —
 * using raw balance here would offer a wallet payment the create call
 * then rejects with a 402.
 */
export function resolveBookingPaymentMethods({
  config,
  serviceType,
  bookingType,
  hasSubscription = false,
  fareTotal = 0,
  userPendingDues = 0,
  walletAvailableRupees = 0,
  requiredAmount = null,
}) {
  const cfg = normalisePaymentMethodConfig(config);
  const needed = round2(requiredAmount == null ? fareTotal : requiredAmount);
  const dues = Math.max(0, num(userPendingDues));
  const duesCap = cfg.cod.userMaxPendingDuesRupees;

  // A user over the dues ceiling cannot book on ANY rail. Blocking only
  // COD would be pointless: they would cancel COD rides to rack up dues
  // and keep booking by wallet, and the dues would never be recovered.
  const duesBlocked = duesCap > 0 && dues >= duesCap;

  const methods = [];

  const push = (method, enabled, reason = null) =>
    methods.push({ method, enabled, reason: enabled ? null : reason });

  // ── Wallet ──────────────────────────────────────────────────────
  if (duesBlocked) {
    push(PAYMENT_RAIL.WALLET, false, PAYMENT_UNAVAILABLE_REASON.USER_DUES_BLOCK);
  } else if (!isRailEnabled(cfg, PAYMENT_FLOW.BOOKING, PAYMENT_RAIL.WALLET)) {
    push(PAYMENT_RAIL.WALLET, false, PAYMENT_UNAVAILABLE_REASON.FLOW_DISABLED);
  } else if (round2(walletAvailableRupees) < needed) {
    push(PAYMENT_RAIL.WALLET, false, PAYMENT_UNAVAILABLE_REASON.WALLET_INSUFFICIENT);
  } else {
    push(PAYMENT_RAIL.WALLET, true);
  }

  // ── COD ─────────────────────────────────────────────────────────
  if (duesBlocked) {
    push(PAYMENT_RAIL.COD, false, PAYMENT_UNAVAILABLE_REASON.USER_DUES_BLOCK);
  } else if (!cfg.codEnabled) {
    push(PAYMENT_RAIL.COD, false, PAYMENT_UNAVAILABLE_REASON.RAIL_DISABLED);
  } else if (!cfg.flows[PAYMENT_FLOW.BOOKING].cod) {
    push(PAYMENT_RAIL.COD, false, PAYMENT_UNAVAILABLE_REASON.FLOW_DISABLED);
  } else {
    const { eligible, reason } = isCodEligibleForBooking({
      config: cfg,
      serviceType,
      bookingType,
      hasSubscription,
      // The cap applies to everything the customer will hand over,
      // including dues carried from an earlier ride.
      fareTotal: round2(num(fareTotal) + dues),
    });
    push(PAYMENT_RAIL.COD, eligible, reason);
  }

  const enabled = methods.filter((m) => m.enabled).map((m) => m.method);

  // Preference order: wallet (money already with us, zero collection
  // risk) → COD. Razorpay is not a booking rail — it funds the wallet.
  const defaultMethod =
    (enabled.includes(PAYMENT_RAIL.WALLET) && PAYMENT_RAIL.WALLET)
    || (enabled.includes(PAYMENT_RAIL.COD) && PAYMENT_RAIL.COD)
    || null;

  return {
    methods,
    enabled,
    defaultMethod,
    anyEnabled: enabled.length > 0,
    duesBlocked,
    pendingDues: round2(dues),
    shortBy: round2(Math.max(0, needed - round2(walletAvailableRupees))),
  };
}

/** Throws-free membership check against a resolution. */
export function isBookingMethodAllowed(resolution, method) {
  if (!resolution?.methods) return false;
  return resolution.methods.some((m) => m.method === method && m.enabled);
}
