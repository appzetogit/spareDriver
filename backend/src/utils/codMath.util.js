/**
 * The COD money kernel.
 *
 * Pure — no DB, no imports. Everything the cash rail does to a rupee
 * happens here, so `node --test` can lock the arithmetic without a
 * Mongo instance.
 *
 * The model, stated once:
 *
 *   Wallet rail : customer pays the platform up front, the platform
 *                 credits the driver their share at completion.
 *   COD rail    : customer pays the DRIVER in cash, so the driver ends
 *                 the trip holding money that is partly ours. We take
 *                 our cut back out of their wallet.
 *
 * Which gives the invariant every function below is built around:
 *
 *   Every COD operation moves `wallet.balance` and `wallet.cashDues` by
 *   the SAME magnitude with OPPOSITE signs. So `balance + cashDues` is
 *   conserved across all of them, and the two fields cannot drift.
 *
 * `cashDues` is the obligation counter (what the driver owes us);
 * `balance` is spendable money and may go negative. Neither is ever
 * derived from the other — deriving `cashDues` from a negative balance
 * would break the moment a driver with savings takes a cash ride.
 */

/** The enum value. Duplicated from booking.model.js to keep this file pure. */
export const COD_PAYMENT_METHOD = 'cod';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Non-negative coercion — every cash figure is a magnitude. */
const pos = (v) => Math.max(0, num(v));

/**
 * Is this booking on the cash rail?
 *
 * Reads the BOOKING, never the settings. That is deliberate: a booking
 * is quoted and dispatched on one rail and must settle on that same
 * rail, so an admin flipping the COD toggle mid-trip can never reroute
 * money that is already in flight.
 */
export function isCodBooking(booking) {
  return booking?.paymentMethod === COD_PAYMENT_METHOD;
}

/**
 * Accepted extension rupees on a booking.
 *
 * Only `accepted` rows count — a pending or declined extension was
 * never agreed to, so the customer does not owe it.
 */
export function acceptedExtensionsRupees(booking) {
  const rows = Array.isArray(booking?.extensions) ? booking.extensions : [];
  return round2(
    rows
      .filter((e) => e?.status === 'accepted')
      .reduce((sum, e) => sum + pos(e.fareDelta), 0),
  );
}

/** Driver's share of accepted extensions, from the snapshotted breakdown. */
export function acceptedExtensionsDriverEarning(booking) {
  const rows = Array.isArray(booking?.extensions) ? booking.extensions : [];
  return round2(
    rows
      .filter((e) => e?.status === 'accepted')
      .reduce((sum, e) => sum + pos(e?.breakdown?.driverEarning), 0),
  );
}

/**
 * Every rupee the driver must physically collect from the customer.
 *
 * `userDues` is an amount the customer owed from an EARLIER ride (a
 * cancellation or no-show fee that could not be deducted, because on
 * COD we never held any of their money). Folding it in here is how it
 * is recovered: the driver collects it as cash, and because it is not
 * part of their earning it flows straight into their `cashDues` and so
 * back to the platform.
 *
 * @returns {{fare, extensions, overtime, waiting, userDues, total}}
 */
export function computeCashToCollect(booking) {
  const fare = pos(booking?.fareSnapshot?.total);
  const extensions = acceptedExtensionsRupees(booking);
  // Overtime only counts once the customer actually owes it.
  const overtime = booking?.overtime?.required ? pos(booking.overtime.amountRupees) : 0;
  const waiting = pos(booking?.waiting?.chargeRupees);
  const userDues = pos(booking?.cod?.userDuesAppliedRupees);

  return {
    fare: round2(fare),
    extensions,
    overtime: round2(overtime),
    waiting: round2(waiting),
    userDues: round2(userDues),
    total: round2(fare + extensions + overtime + waiting + userDues),
  };
}

/**
 * What the platform owes the driver out of that cash — i.e. the part of
 * the collected total that is genuinely theirs.
 *
 * `fareSnapshot.breakdown.driverEarning` already absorbs accepted
 * extension uplift (payExtensionService increments it in place), so it
 * must NOT be added again here. Waiting is added separately because it
 * is 100% the driver's — no commission is taken on time they sat idle.
 * Carried user dues are deliberately excluded: that money is ours.
 */
export function computeDriverCodCredit(booking) {
  const base = pos(booking?.fareSnapshot?.breakdown?.driverEarning);
  const waiting = pos(booking?.waiting?.chargeRupees);
  const overtime = booking?.overtime?.required
    ? pos(booking?.overtime?.breakdown?.driverEarning)
    : 0;
  return round2(base + waiting + overtime);
}

/**
 * The debit: what the driver owes us out of the cash they are holding.
 *
 * Floored at zero. A credit larger than the collected total would mean
 * we owe THEM money, which is not a cash-dues situation — it would be a
 * pricing bug, and silently turning it into a wallet credit here would
 * hide it.
 */
export function computeCodCommission(cashToCollect, driverCredit) {
  return round2(Math.max(0, round2(num(cashToCollect)) - round2(num(driverCredit))));
}

/**
 * Next wallet state after charging a COD commission.
 *
 * `balance` down, `cashDues` up, by the same amount — the conservation
 * invariant. `totalEarnings` and `totalWithdrawn` are deliberately
 * absent from the returned shape: the platform relies on
 * `Σ driver TRIP_* payment rows === wallet.totalEarnings`, and a
 * commission debit is not an earning.
 */
export function applyCodCommission(wallet, commission) {
  const amt = pos(commission);
  const balance = num(wallet?.balance);
  const cashDues = pos(wallet?.cashDues);
  return {
    balance: round2(balance - amt),
    cashDues: round2(cashDues + amt),
    lifetimeCashDuesCharged: round2(pos(wallet?.lifetimeCashDuesCharged) + amt),
  };
}

/**
 * Next wallet state after a driver clears part or all of their dues.
 * The exact inverse of `applyCodCommission`, so the pair round-trips.
 */
export function applyCodDuesPayment(wallet, amount) {
  const cashDues = pos(wallet?.cashDues);
  // Never clear more than is owed, whatever the caller passes.
  const amt = clampDuesPayment(cashDues, amount);
  return {
    balance: round2(num(wallet?.balance) + amt),
    cashDues: round2(cashDues - amt),
    lifetimeCashDuesCleared: round2(pos(wallet?.lifetimeCashDuesCleared) + amt),
  };
}

/** Clamp a settlement request to what is actually outstanding. */
export function clampDuesPayment(cashDues, requested) {
  return round2(Math.min(pos(cashDues), pos(requested)));
}

/**
 * Dues gating for going online and for withdrawals.
 *
 * A threshold of 0 means "never gate", matching the `0 = uncapped`
 * convention used for the COD value cap. The block is inclusive: a
 * driver sitting exactly on the limit is blocked, so the limit is a
 * ceiling they cannot rest on.
 */
export function evaluateDriverDuesGate(wallet, codConfig) {
  const cashDues = round2(pos(wallet?.cashDues));
  const blockThreshold = pos(codConfig?.driverDuesBlockRupees);
  const warnThreshold = pos(codConfig?.driverDuesWarnRupees);

  const blocked = blockThreshold > 0 && cashDues >= blockThreshold;
  // A blocked driver is always also warned — the UI can rely on
  // `warned` alone to decide whether to show the dues banner at all.
  const warned = blocked || (warnThreshold > 0 && cashDues >= warnThreshold);

  return {
    cashDues,
    blocked,
    warned,
    blockThreshold,
    warnThreshold,
    headroomRupees: blockThreshold > 0 ? round2(Math.max(0, blockThreshold - cashDues)) : Infinity,
  };
}

/**
 * Add a cancellation / no-show fee to a customer's outstanding dues.
 *
 * Capped at `maxDues`. When the cap bites we report the uncharged
 * remainder in `uncharged` rather than dropping it silently, so the
 * caller can log it for an admin to chase.
 */
export function applyUserDues(currentDues, feeRupees, maxDues) {
  const current = pos(currentDues);
  const fee = pos(feeRupees);
  const cap = pos(maxDues);

  if (cap <= 0) {
    return { pendingDues: round2(current + fee), charged: round2(fee), uncharged: 0 };
  }

  const room = Math.max(0, cap - current);
  const charged = round2(Math.min(fee, room));
  return {
    pendingDues: round2(current + charged),
    charged,
    uncharged: round2(fee - charged),
  };
}

/**
 * How much of a customer's outstanding dues to fold into the ride they
 * are booking now. All of it — dues are recovered at the first
 * opportunity, and the customer sees the line item before confirming.
 */
export function computeUserDuesToApply(pendingDues) {
  return round2(pos(pendingDues));
}

/** Is this customer barred from booking until they settle? Inclusive. */
export function isUserDuesBlocked(pendingDues, maxDues) {
  const cap = pos(maxDues);
  return cap > 0 && pos(pendingDues) >= cap;
}
