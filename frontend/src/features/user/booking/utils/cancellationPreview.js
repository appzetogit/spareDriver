import { BOOKING_STATUS } from '../../../../constants/bookingStatus';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';

/**
 * Customer-side outstation cancellation tiers — must stay in lockstep
 * with `OUTSTATION_USER_CANCEL_TIER` in
 * `backend/src/services/bookingOutstationCancellation.service.js`.
 *
 * Only three tiers — STARTED collapses into DRIVER_ARRIVED (the car
 * is at/past pickup so the same arrived-stage fee applies).
 */
export const OUTSTATION_USER_CANCEL_TIER = Object.freeze({
  BEFORE_FREE_WINDOW: 'outstation_before_free_window',
  WITHIN_FREE_WINDOW_PRE_ARRIVAL: 'outstation_within_free_window_pre_arrival',
  DRIVER_ARRIVED: 'outstation_driver_arrived',
});

/** Mirrors `DEFAULT_OUTSTATION_POLICY` on the backend. */
const DEFAULT_OUTSTATION_POLICY = Object.freeze({
  freeCancellationHoursBeforePickup: 24,
  beforeWindowFeeType: 'percentage',
  beforeWindowFeeAmount: 0,
  preArrivalFeeType: 'percentage',
  preArrivalFeeAmount: 15,
  arrivedFeeType: 'percentage',
  arrivedFeeAmount: 50,
  arrivedFeeMinDays: 1,
  driverFreeReassignHoursBeforePickup: 24,
  driverPenaltyHoursBeforePickup: 6,
  driverMidPenaltyType: 'flat',
  driverMidPenaltyAmount: 100,
  driverPenaltyType: 'flat',
  driverPenaltyAmount: 200,
  driverPriorityPenaltyPoints: 10,
});

function readOutstationPolicy(booking) {
  const fromPreview = booking?.cancellationPreview?.policy?.outstation;
  if (fromPreview && typeof fromPreview === 'object') {
    return { ...DEFAULT_OUTSTATION_POLICY, ...fromPreview };
  }
  return { ...DEFAULT_OUTSTATION_POLICY };
}

function hoursUntilOutstationPickup(booking, now = Date.now()) {
  const pickupAt =
    booking?.outstation?.pickupAt || booking?.outstation?.startDate;
  if (!pickupAt) return Infinity;
  const ms = new Date(pickupAt).getTime() - now;
  if (!Number.isFinite(ms)) return Infinity;
  return ms / (60 * 60 * 1000);
}

const clampPct = (n) => Math.max(0, Math.min(100, Number(n) || 0));
const nonNeg = (n) => Math.max(0, Number(n) || 0);

/** Resolve a {type, amount} fee pair into a rupee figure. */
function resolveFee(type, amount, basis) {
  if (type === 'percentage') {
    return (nonNeg(basis) * clampPct(amount)) / 100;
  }
  return nonNeg(amount);
}

/**
 * Client-side mirror of `computeOutstationUserCancellation`. Used when
 * the booking flow on the FE needs to render the live deduction without
 * a round-trip — primarily the cancel-confirm dialog (the user can
 * cancel the moment they land on the booking, before the server has
 * had a chance to refresh `cancellationPreview`).
 */
export function previewOutstationUserCancellation(booking) {
  const policy = readOutstationPolicy(booking);
  const status = booking?.status;
  const tripStarted = status === BOOKING_STATUS.STARTED;
  const driverArrived = status === BOOKING_STATUS.ARRIVED || tripStarted;
  const hoursUntilPickup = hoursUntilOutstationPickup(booking);
  const paid =
    Math.round((Number(booking?.payment?.amountPaidRupees) || 0) * 100) / 100;
  const fareTotal = Number(booking?.fareSnapshot?.total) || 0;
  const dailyRate = Number(booking?.fareSnapshot?.breakdown?.dailyRate) || 0;

  let tier;
  let rawFee = 0;

  if (driverArrived) {
    tier = OUTSTATION_USER_CANCEL_TIER.DRIVER_ARRIVED;
    const baseFee = resolveFee(
      policy.arrivedFeeType,
      policy.arrivedFeeAmount,
      paid,
    );
    const minDaysPart = nonNeg(policy.arrivedFeeMinDays) * dailyRate;
    rawFee = Math.max(baseFee, minDaysPart);
  } else if (hoursUntilPickup > policy.freeCancellationHoursBeforePickup) {
    tier = OUTSTATION_USER_CANCEL_TIER.BEFORE_FREE_WINDOW;
    rawFee = resolveFee(
      policy.beforeWindowFeeType,
      policy.beforeWindowFeeAmount,
      paid,
    );
  } else {
    tier = OUTSTATION_USER_CANCEL_TIER.WITHIN_FREE_WINDOW_PRE_ARRIVAL;
    rawFee = resolveFee(
      policy.preArrivalFeeType,
      policy.preArrivalFeeAmount,
      paid,
    );
  }

  const feeCharged =
    Math.round(Math.min(rawFee, paid) * 100) / 100;
  const refundAmount =
    Math.round(Math.max(0, paid - feeCharged) * 100) / 100;

  return {
    feeCharged,
    refundAmount,
    tripStarted,
    driverArrived,
    tier,
    hoursUntilPickup: Number.isFinite(hoursUntilPickup)
      ? Math.round(hoursUntilPickup * 10) / 10
      : null,
    policy,
    basis: { paid, fareTotal, dailyRate },
  };
}

/**
 * Client-side mirror of `bookingCancellation.service.js`.
 *
 * Why we recompute on the FE: the backend stamps an initial
 * `cancellationPreview` onto the booking when it's fetched, but the
 * preview shifts as the booking moves through statuses and we don't
 * want to fire an extra round-trip on every transition.
 *
 * The values here MUST stay in lockstep with the backend `compute…`
 * helpers. If you change the formulas there, mirror them here.
 *
 *   status                            →  fee
 *   ──────                               ───
 *   searching                            0
 *   driver_assigned / awaiting_payment   flatFeeAfterAssignment (₹)
 *   en_route                             flatFeeAfterAssignment (₹)
 *   arrived / started                    arrivedFeeType picks:
 *                                          'flat'       → arrivedFeeAmount (₹)
 *                                          'percentage' → arrivedFeeAmount % of paid
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const ASSIGNED_PRE_ARRIVAL_STATUSES = new Set([
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
]);

const ARRIVED_OR_LATER_STATUSES = new Set([
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
]);

function readPolicy(booking) {
  return booking?.cancellationPreview?.policy || {};
}

/**
 * Returns `{ feeCharged, refundAmount, tripStarted, driverArrived }`
 * for a user-side cancellation. Mirrors `computeUserCancellation` on
 * the backend.
 */
export function previewUserCancellation(booking) {
  if (!booking) {
    return {
      feeCharged: 0,
      refundAmount: 0,
      tripStarted: false,
      driverArrived: false,
    };
  }
  // Outstation uses a TIME-driven policy. Branch out before any
  // status-driven math runs so the hourly preview stays untouched.
  if (booking.serviceType === SERVICE_TYPES.OUTSTATION) {
    return previewOutstationUserCancellation(booking);
  }
  const status = booking.status;
  const tripStarted = status === BOOKING_STATUS.STARTED;
  const driverArrived =
    status === BOOKING_STATUS.ARRIVED || status === BOOKING_STATUS.STARTED;
  const paid = round2(Number(booking?.payment?.amountPaidRupees) || 0);

  if (paid <= 0) {
    return { feeCharged: 0, refundAmount: 0, tripStarted, driverArrived };
  }

  const policy = readPolicy(booking);
  let rawFee = 0;
  if (ARRIVED_OR_LATER_STATUSES.has(status)) {
    const amount = Math.max(0, Number(policy.arrivedFeeAmount) || 0);
    if (policy.arrivedFeeType === 'percentage') {
      const pct = Math.max(0, Math.min(100, amount));
      rawFee = (paid * pct) / 100;
    } else {
      // Falls back to legacy `flatFeeAfterArrival` if the new amount is
      // unset on an older policy snapshot.
      rawFee =
        amount ||
        Math.max(0, Number(policy.flatFeeAfterArrival) || 0);
    }
  } else if (ASSIGNED_PRE_ARRIVAL_STATUSES.has(status)) {
    rawFee = Math.max(0, Number(policy.flatFeeAfterAssignment) || 0);
  }

  const fee = Math.min(round2(rawFee), paid);
  return {
    feeCharged: round2(fee),
    refundAmount: round2(Math.max(0, paid - fee)),
    tripStarted,
    driverArrived,
  };
}

/**
 * Returns `{ driverPenalty, refundAmount, tripStarted, chance, fullPenalty, penaltyWaived }`
 * for a driver-side cancellation. Mirrors `computeDriverCancellation` on
 * the backend.
 *
 * IMPORTANT: the server stamps `cancellationPreview.chance` at fetch
 * time, but the grace window shrinks every second. If the driver opens
 * the cancel dialog at 1:55 we'd happily say "no penalty" — only to
 * have the backend at 2:05 actually charge them. To avoid that drift
 * we recompute `inGrace` here using the live wall-clock vs.
 * `timeline.driverAssignedAt`, and **only treat the cancel as waived
 * when BOTH the server snapshot AND the live clock agree it's still
 * inside the window AND chances remain**. The server stays the source
 * of truth for `chancesLeft` (we can't know that on the client).
 */
export function previewDriverCancellation(booking) {
  if (!booking) {
    return {
      driverPenalty: 0,
      fullPenalty: 0,
      penaltyWaived: false,
      refundAmount: 0,
      tripStarted: false,
      chance: null,
    };
  }
  const tripStarted = booking.status === BOOKING_STATUS.STARTED;
  const policy = readPolicy(booking);
  const fullPenalty = round2(Number(policy.driverCancellationPenalty) || 0);
  const previewBlock = booking?.cancellationPreview || {};
  const serverChance = previewBlock.chance || null;

  // Live-clock recompute of the grace window. Keeps the dialog honest
  // even when the booking payload was fetched minutes ago.
  const graceMinutes = Math.max(
    0,
    Number(serverChance?.graceMinutes ?? policy.driverGraceMinutes) || 0,
  );
  const acceptedAt = booking?.timeline?.driverAssignedAt;
  const elapsedMs = acceptedAt
    ? Math.max(0, Date.now() - new Date(acceptedAt).getTime())
    : 0;
  const elapsedMinutes = elapsedMs / 60000;
  const liveInGrace = graceMinutes > 0 && elapsedMinutes <= graceMinutes;
  const chancesLeft = Math.max(0, Number(serverChance?.chancesLeft) || 0);

  // Waiver applies only when (a) BOTH server and live clock agree we're
  // still inside the grace window, (b) the driver still has chances
  // left today, and (c) we're not mid-trip (started rides never waive).
  const penaltyWaived =
    !tripStarted && liveInGrace && chancesLeft > 0;
  const driverPenalty = penaltyWaived ? 0 : fullPenalty;

  // Live chance snapshot — we keep the server-supplied `dailyLimit` /
  // `usedToday` / `chancesLeft` but override the time-sensitive bits
  // with our wall-clock recompute so dialog copy stays accurate.
  const chance = serverChance
    ? {
        ...serverChance,
        graceMinutes,
        elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
        inGrace: liveInGrace,
        penaltyWaived,
        // Minutes left in the grace window (negative once expired).
        // Used by the FE to render a live countdown.
        remainingMinutes: graceMinutes - elapsedMinutes,
      }
    : null;

  const userPreview = previewUserCancellation(booking);
  return {
    driverPenalty,
    fullPenalty,
    penaltyWaived,
    refundAmount: userPreview.refundAmount,
    tripStarted,
    chance,
  };
}

/**
 * Confirm-dialog body for a user cancellation. Uses the live preview so
 * fee / refund copy matches admin policy for this trip type + status.
 */
export function buildUserCancelConfirmMessage(preview) {
  if (!preview) return 'Are you sure you want to cancel?';
  const fee = Number(preview.feeCharged) || 0;
  const refund = Number(preview.refundAmount) || 0;

  if (preview.tier && String(preview.tier).startsWith('outstation_')) {
    return buildOutstationCancelConfirmMessage(preview);
  }

  if (preview.tripStarted) {
    if (fee > 0) {
      const parts = [`This trip is in progress. A cancellation fee of \u20B9${fee} will be deducted.`];
      if (refund > 0) parts.push(`You\u2019ll be refunded \u20B9${refund}.`);
      return parts.join(' ');
    }
    return 'This trip is in progress. Cancelling now will end the ride.';
  }

  if (preview.driverArrived) {
    if (fee > 0) {
      const parts = [`The driver has arrived at the pickup location. A cancellation fee of \u20B9${fee} will be deducted.`];
      if (refund > 0) parts.push(`You\u2019ll be refunded \u20B9${refund}.`);
      return parts.join(' ');
    }
    return 'The driver has arrived at the pickup. You can cancel, but a fee may apply once processed.';
  }

  if (fee > 0) {
    const parts = [`A cancellation fee of \u20B9${fee} will be deducted.`];
    if (refund > 0) parts.push(`You\u2019ll be refunded \u20B9${refund}.`);
    return parts.join(' ');
  }

  if (refund > 0) {
    return `No cancellation fee will be charged. \u20B9${refund} will be refunded to your wallet.`;
  }
  return 'No cancellation fee will be charged.';
}

function buildOutstationCancelConfirmMessage(preview) {
  const fee = Number(preview.feeCharged) || 0;
  const refund = Number(preview.refundAmount) || 0;
  const policy = preview.policy || {};
  const freeHours = Number(policy.freeCancellationHoursBeforePickup ?? 24);
  const tier = preview.tier;
  const tripStarted = !!preview.tripStarted;
  const hoursUntilPickup =
    typeof preview.hoursUntilPickup === 'number' ? preview.hoursUntilPickup : null;
  const refundLine =
    refund > 0 ? ` You\u2019ll be refunded \u20B9${refund} to your wallet.` : '';

  const describeFee = (type, amount) => {
    const value = Number(amount) || 0;
    if (value <= 0) return null;
    return type === 'percentage' ? `${value}% of the fare` : `\u20B9${value}`;
  };

  if (tier === OUTSTATION_USER_CANCEL_TIER.DRIVER_ARRIVED) {
    if (tripStarted) {
      return `This trip is in progress. \u20B9${fee} will be deducted as the cancellation fee.${refundLine}`;
    }
    const arrivedFee = describeFee(policy.arrivedFeeType, policy.arrivedFeeAmount);
    const floorDays = Number(policy.arrivedFeeMinDays) || 0;
    const floorLine = floorDays > 0
      ? ` (the higher of ${arrivedFee || 'the configured fee'} or ${floorDays === 1 ? "one day\u2019s" : `${floorDays} days\u2019`} fare)`
      : arrivedFee
        ? ` (${arrivedFee})`
        : '';
    return `The driver has reached the pickup location. \u20B9${fee} will be deducted${floorLine}.${refundLine}`;
  }
  if (tier === OUTSTATION_USER_CANCEL_TIER.BEFORE_FREE_WINDOW) {
    if (fee <= 0) {
      return `You\u2019re cancelling more than ${freeHours}h before pickup\u2014${refund > 0 ? `\u20B9${refund} will be refunded to your wallet in full.` : 'no cancellation fee applies.'}`;
    }
    const beforeFee = describeFee(policy.beforeWindowFeeType, policy.beforeWindowFeeAmount);
    return `You\u2019re cancelling more than ${freeHours}h before pickup. ${beforeFee || `\u20B9${fee}`} (\u20B9${fee}) will be deducted.${refundLine}`;
  }
  if (tier === OUTSTATION_USER_CANCEL_TIER.WITHIN_FREE_WINDOW_PRE_ARRIVAL) {
    const left = hoursUntilPickup != null
      ? ` (~${Math.max(0, Math.round(hoursUntilPickup))}h until pickup)`
      : '';
    const preFee = describeFee(policy.preArrivalFeeType, policy.preArrivalFeeAmount);
    return `You\u2019re cancelling inside the ${freeHours}h window${left}. ${preFee || `\u20B9${fee}`} (\u20B9${fee}) will be deducted.${refundLine}`;
  }
  return `\u20B9${fee} will be deducted.${refundLine}`;
}
