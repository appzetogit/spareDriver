import Booking from '../models/booking.model.js';
import ServicePricing from '../models/servicePricing.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  createRazorpayOrder,
  getRazorpayKeyId,
  verifyRazorpayPaymentSignature,
} from '../utils/razorpay.js';
import { BOOKING_STATUS, BOOKING_PAYMENT_STATUS } from '../constants/bookingStatus.js';
import { PAYMENT_PURPOSE } from '../constants/kitStatus.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToDriver,
  emitToBooking,
  emitToAdmins,
} from '../utils/socketEmitters.js';
import {
  notifyUserTripOvertimeStarted,
  notifyUserOvertimePaymentFailed,
  notifyDriverTripOvertimeStarted,
} from '../utils/notificationDispatch.js';
import {
  isOutstationRideEndBooking,
  isRideEndEligibleBooking,
  rideEndsAtMs,
  rideGraceEndsAtMs,
} from './bookingRideWindow.js';

export const OVERTIME_PAYMENT_STATUS = Object.freeze({
  NONE: 'none',
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
});

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const toPaise = (rupees) => Math.round(Number(rupees) * 100);

function inferRates(fareBreakdown) {
  const type =
    fareBreakdown?.platformFeeType === 'flat' ? 'flat' : 'percentage';
  const amount =
    Number(
      fareBreakdown?.platformFeeAmount
        ?? (type === 'percentage' ? fareBreakdown?.serviceChargePercent : 0),
    ) || 0;
  return {
    platformFeeType: type,
    platformFeeAmount: amount,
    serviceChargePercent: type === 'percentage' ? amount : 0,
    gstPercent: Number(fareBreakdown?.gstPercent) || 0,
    platformCommissionPercent:
      Number(fareBreakdown?.platformCommissionPercent) || 0,
  };
}

function computePlatformFeeFromRates(subtotal, rates) {
  if (rates.platformFeeType === 'flat') {
    return round2(Math.max(0, Number(rates.platformFeeAmount) || 0));
  }
  const pct = Number(rates.serviceChargePercent || rates.platformFeeAmount) || 0;
  return round2((subtotal * pct) / 100);
}

async function loadPricingForOvertime(booking) {
  const pricingId = booking?.fareSnapshot?.pricingId;
  if (pricingId) {
    const byId = await ServicePricing.findById(pricingId).lean();
    if (byId) return byId;
  }
  if (!booking?.serviceType) return null;
  return ServicePricing.findOne({
    serviceType: booking.serviceType,
    isActive: true,
  }).lean();
}

/**
 * ₹/hour for post-grace overtime. Hourly fare snapshots store
 * `extraHourCharge` as a TOTAL (extraHours × rate), not the rate —
 * using that field as ₹/hr made overdue show ₹0.00 on slab bookings.
 */
export function resolveOvertimeRatePerHour(booking, pricing = null) {
  const bd = booking?.fareSnapshot?.breakdown || {};
  const snapshotRate =
    Number(bd.outstationExtraHourCharge)
    || Number(bd.extraHourChargeRate)
    || 0;
  if (snapshotRate > 0) return round2(snapshotRate);

  const extraHours = Number(bd.extraHours) || 0;
  const extraTotal = Number(bd.extraHourCharge) || 0;
  if (extraHours > 0 && extraTotal > 0) {
    return round2(extraTotal / extraHours);
  }

  const stored = Number(booking?.overtime?.ratePerHour) || 0;
  if (stored > 0) return round2(stored);

  const fromPricing =
    Number(pricing?.outstation?.extraHourCharge)
    || Number(pricing?.extraHourCharge)
    || 0;
  if (fromPricing > 0) return round2(fromPricing);

  const daily =
    Number(bd.dailyRate) || Number(pricing?.outstation?.dailyRate) || 0;
  if (daily > 0) return round2(daily / 24);

  return 0;
}

export function isOvertimeUnpaid(booking) {
  const ot = booking?.overtime;
  if (!ot?.required) return false;
  if (ot.paymentStatus === OVERTIME_PAYMENT_STATUS.PAID) return false;
  if (!(round2(ot.amountRupees || 0) > 0)) return false;
  if (isOutstationRideEndBooking(booking)) {
    const graceEnds = rideGraceEndsAtMs(booking);
    if (graceEnds != null && Date.now() < graceEnds) return false;
  }
  return true;
}

export function quoteOvertime(booking, nowMs = Date.now(), pricing = null) {
  if (!booking || !isRideEndEligibleBooking(booking)) return null;
  if (booking.status !== BOOKING_STATUS.STARTED) {
    if (booking.overtime?.paymentStatus === OVERTIME_PAYMENT_STATUS.PAID) {
      return serializeStoredOvertime(booking);
    }
    return null;
  }

  const ot = booking.overtime || {};
  if (ot.paymentStatus === OVERTIME_PAYMENT_STATUS.PAID) {
    return serializeStoredOvertime(booking);
  }

  const endsAt = rideEndsAtMs(booking);
  const graceEnds = rideGraceEndsAtMs(booking);
  if (endsAt == null || graceEnds == null) return null;
  if (nowMs < graceEnds) return null;

  const billableMinutes = Math.max(0, Math.floor((nowMs - graceEnds) / 60_000));
  const ratePerHour = resolveOvertimeRatePerHour(booking, pricing);
  const subtotal = round2((ratePerHour / 60) * billableMinutes);
  const rates = inferRates(booking.fareSnapshot?.breakdown || {});
  const platformFee = subtotal > 0 ? computePlatformFeeFromRates(subtotal, rates) : 0;
  const gst = round2(((subtotal + platformFee) * rates.gstPercent) / 100);
  const amountRupees = round2(subtotal + platformFee + gst);
  const platformCommission = round2(
    (subtotal * rates.platformCommissionPercent) / 100,
  );
  const driverEarning = round2(Math.max(0, subtotal - platformCommission));

  return {
    required: true,
    bookedEndAt: new Date(endsAt).toISOString(),
    graceEndedAt: new Date(graceEnds).toISOString(),
    overtimeStartedAt: ot.startedAt
      ? new Date(ot.startedAt).toISOString()
      : new Date(graceEnds).toISOString(),
    lastCalculatedAt: new Date(nowMs).toISOString(),
    billableMinutes,
    ratePerHour: round2(ratePerHour),
    subtotal,
    platformFee,
    gst,
    gstPercent: rates.gstPercent,
    platformFeeType: rates.platformFeeType,
    platformFeeAmount: rates.platformFeeAmount,
    amountRupees,
    totalPayable: amountRupees,
    driverEarning,
    platformCommission,
    platformCommissionPercent: rates.platformCommissionPercent,
    paymentStatus: ot.paymentStatus || OVERTIME_PAYMENT_STATUS.NONE,
    razorpayOrderId: ot.razorpayOrderId || null,
  };
}

function serializeStoredOvertime(booking) {
  const ot = booking.overtime || {};
  if (!ot.required && ot.paymentStatus !== OVERTIME_PAYMENT_STATUS.PAID) {
    return null;
  }
  return {
    required: Boolean(ot.required),
    bookedEndAt: ot.bookedEndAt ? new Date(ot.bookedEndAt).toISOString() : null,
    graceEndedAt: ot.graceEndedAt ? new Date(ot.graceEndedAt).toISOString() : null,
    overtimeStartedAt: ot.startedAt ? new Date(ot.startedAt).toISOString() : null,
    lastCalculatedAt: ot.lastCalculatedAt
      ? new Date(ot.lastCalculatedAt).toISOString()
      : null,
    billableMinutes: Number(ot.billableMinutes) || 0,
    ratePerHour: Number(ot.ratePerHour) || 0,
    subtotal: Number(ot.subtotal) || 0,
    platformFee: Number(ot.platformFee) || 0,
    gst: Number(ot.gst) || 0,
    gstPercent: Number(ot.breakdown?.gstPercent) || 0,
    amountRupees: Number(ot.amountRupees) || 0,
    totalPayable: Number(ot.amountRupees) || 0,
    paymentStatus: ot.paymentStatus || OVERTIME_PAYMENT_STATUS.NONE,
    razorpayOrderId: ot.razorpayOrderId || null,
    razorpayPaymentId: ot.razorpayPaymentId || null,
    paidAt: ot.paidAt ? new Date(ot.paidAt).toISOString() : null,
    lockedAmountRupees: ot.lockedAmountRupees ?? null,
    lockedMinutes: ot.lockedMinutes ?? null,
  };
}

function clearedOvertimeOverlay(existing = {}) {
  return {
    ...existing,
    required: false,
    billableMinutes: 0,
    amountRupees: 0,
    totalPayable: 0,
    subtotal: 0,
    platformFee: 0,
    gst: 0,
    paymentStatus:
      existing.paymentStatus === OVERTIME_PAYMENT_STATUS.PAID
        ? OVERTIME_PAYMENT_STATUS.PAID
        : OVERTIME_PAYMENT_STATUS.NONE,
  };
}

export function attachOvertimeQuote(bookingObj, nowMs = Date.now()) {
  if (!bookingObj) return bookingObj;
  const quote = quoteOvertime(bookingObj, nowMs);
  if (quote) {
    bookingObj.overtime = { ...(bookingObj.overtime || {}), ...quote };
    return bookingObj;
  }
  // Outstation only: never surface a frozen quote during the 30-min
  // return grace. Hourly keep their stored overtime as-is.
  if (
    isOutstationRideEndBooking(bookingObj)
    && bookingObj.overtime?.required
    && bookingObj.overtime?.paymentStatus !== OVERTIME_PAYMENT_STATUS.PAID
  ) {
    const graceEnds = rideGraceEndsAtMs(bookingObj);
    if (graceEnds != null && nowMs < graceEnds) {
      bookingObj.overtime = clearedOvertimeOverlay(bookingObj.overtime);
    }
  }
  return bookingObj;
}

function overtimePayload(booking, extra = {}) {
  return {
    bookingId: String(booking._id),
    status: booking.status,
    overtime: serializeOvertimeForWire(booking),
    ...extra,
  };
}

function serializeOvertimeForWire(booking) {
  const live = quoteOvertime(booking);
  if (live) return live;
  const stored = serializeStoredOvertime(booking);
  if (stored) return stored;
  if (
    isOutstationRideEndBooking(booking)
    && booking?.overtime
    && booking.overtime.paymentStatus !== OVERTIME_PAYMENT_STATUS.PAID
  ) {
    return {
      required: false,
      billableMinutes: 0,
      amountRupees: 0,
      totalPayable: 0,
      paymentStatus: OVERTIME_PAYMENT_STATUS.NONE,
    };
  }
  return stored;
}

export function emitOvertimeUpdated(booking, extra = {}) {
  const payload = overtimePayload(booking, extra);
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);
  if (booking.driverId) {
    emitToDriver(booking.driverId, S2C_EVENTS.BOOKING_UPDATED, payload);
  }
}

function applyQuoteToDoc(booking, quote, { first = false } = {}) {
  booking.overtime = booking.overtime || {};
  const now = new Date();
  if (first && !booking.overtime.startedAt) {
    booking.overtime.startedAt = now;
  }
  booking.overtime.required = true;
  booking.overtime.bookedEndAt = quote.bookedEndAt
    ? new Date(quote.bookedEndAt)
    : null;
  booking.overtime.graceEndedAt = quote.graceEndedAt
    ? new Date(quote.graceEndedAt)
    : null;
  booking.overtime.lastCalculatedAt = now;
  booking.overtime.billableMinutes = quote.billableMinutes;
  booking.overtime.ratePerHour = quote.ratePerHour;
  booking.overtime.subtotal = quote.subtotal;
  booking.overtime.platformFee = quote.platformFee;
  booking.overtime.gst = quote.gst;
  booking.overtime.amountRupees = quote.amountRupees;
  booking.overtime.breakdown = {
    billableMinutes: quote.billableMinutes,
    ratePerHour: quote.ratePerHour,
    subtotal: quote.subtotal,
    platformFee: quote.platformFee,
    platformFeeType: quote.platformFeeType,
    platformFeeAmount: quote.platformFeeAmount,
    gst: quote.gst,
    gstPercent: quote.gstPercent,
    driverEarning: quote.driverEarning,
    platformCommission: quote.platformCommission,
    platformCommissionPercent: quote.platformCommissionPercent,
  };
  if (
    !booking.overtime.paymentStatus
    || booking.overtime.paymentStatus === OVERTIME_PAYMENT_STATUS.NONE
  ) {
    booking.overtime.paymentStatus = OVERTIME_PAYMENT_STATUS.NONE;
  }

  if (booking.outstation) {
    booking.outstation.overtimeBillableMinutes = quote.billableMinutes;
    booking.outstation.overtimeChargeRupees = quote.amountRupees;
  }
}

/**
 * Idempotent: mark overtime required once past grace, refresh the quote.
 * Does not create a Razorpay order or debit a wallet.
 */
export async function tickOvertimeQuote(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { skipped: true, reason: 'missing' };
  if (booking.status !== BOOKING_STATUS.STARTED) {
    return { skipped: true, reason: 'not_started' };
  }
  if (!isRideEndEligibleBooking(booking)) {
    return { skipped: true, reason: 'ineligible' };
  }
  if (booking.overtime?.paymentStatus === OVERTIME_PAYMENT_STATUS.PAID) {
    return { skipped: true, reason: 'paid' };
  }

  let pricing = null;
  if (resolveOvertimeRatePerHour(booking) <= 0) {
    try {
      pricing = await loadPricingForOvertime(booking);
    } catch {
      pricing = null;
    }
  }

  const quote = quoteOvertime(booking, Date.now(), pricing);
  if (!quote) {
    if (isOutstationRideEndBooking(booking)) {
      const cleared = await clearOvertimeIfWindowMoved(booking);
      if (cleared) return { skipped: true, reason: 'still_in_grace' };
    }
    return { skipped: true, reason: 'not_due' };
  }

  const first = !booking.overtime?.required;
  const prevMinutes = Number(booking.overtime?.billableMinutes) || 0;
  const prevAmount = Number(booking.overtime?.amountRupees) || 0;
  applyQuoteToDoc(booking, quote, { first });
  await booking.save();

  if (first) {
    emitOvertimeUpdated(booking);
    notifyUserTripOvertimeStarted(booking.userId, booking).catch(() => null);
    if (booking.driverId) {
      notifyDriverTripOvertimeStarted(booking.driverId, booking).catch(() => null);
    }
  } else if (
    quote.billableMinutes !== prevMinutes
    || round2(quote.amountRupees) !== round2(prevAmount)
  ) {
    emitOvertimeUpdated(booking);
  }

  return { ok: true, first, quote };
}

/** After a paid extension moves booked end / grace into the future. */
export function mergeUnpaidOvertimeIntoExtension(booking, fareDelta, breakdown = {}) {
  const q = quoteOvertime(booking);
  const ot = booking?.overtime || {};
  const stillInOutstationGrace =
    isOutstationRideEndBooking(booking)
    && (rideGraceEndsAtMs(booking) ?? 0) > Date.now();
  const unpaid =
    !stillInOutstationGrace
    && (
      (q && q.paymentStatus !== OVERTIME_PAYMENT_STATUS.PAID)
      || (ot.required && ot.paymentStatus !== OVERTIME_PAYMENT_STATUS.PAID)
    );

  const frozenMin = Math.max(0, Number(breakdown.overtimeMinutes) || 0);
  const liveMin = unpaid
    ? Math.max(
      Number(q?.billableMinutes) || 0,
      Number(ot.billableMinutes) || 0,
    )
    : 0;
  const minutes = Math.max(frozenMin, liveMin);

  const extensionFare = round2(fareDelta);
  const base = {
    ...breakdown,
    extensionFare,
    extensionDriverEarning: round2(Number(breakdown.driverEarning) || 0),
    extensionPlatformCommission: round2(Number(breakdown.platformCommission) || 0),
  };

  if (!unpaid || minutes <= 0) {
    return { fareDelta: extensionFare, breakdown: base };
  }

  const liveAmt = Number(q?.amountRupees) || Number(ot.amountRupees) || 0;
  const scaleMin = Number(q?.billableMinutes) || Number(ot.billableMinutes) || 0;
  let otAmt = 0;
  let driverEarning = Number(q?.driverEarning) || Number(ot.breakdown?.driverEarning) || 0;
  let platformCommission =
    Number(q?.platformCommission) || Number(ot.breakdown?.platformCommission) || 0;
  if (scaleMin > 0 && liveAmt > 0) {
    const factor = minutes / scaleMin;
    otAmt = round2(liveAmt * factor);
    driverEarning = round2(driverEarning * factor);
    platformCommission = round2(platformCommission * factor);
  } else if (liveAmt > 0) {
    otAmt = round2(liveAmt);
  }

  if (!(otAmt > 0)) {
    return { fareDelta: extensionFare, breakdown: base };
  }

  return {
    fareDelta: round2(extensionFare + otAmt),
    breakdown: {
      ...base,
      overtimeAmountRupees: otAmt,
      overtimeMinutes: minutes,
      overtimeRatePerHour: round2(
        Number(q?.ratePerHour) || Number(ot.ratePerHour) || 0,
      ),
      driverEarning: round2(
        (Number(base.extensionDriverEarning) || 0) + driverEarning,
      ),
      platformCommission: round2(
        (Number(base.extensionPlatformCommission) || 0) + platformCommission,
      ),
    },
  };
}

export function clearOvertimeAfterExtensionPaid(booking) {
  if (!booking?.overtime) return;
  booking.overtime.required = false;
  booking.overtime.paymentStatus = OVERTIME_PAYMENT_STATUS.NONE;
  booking.overtime.razorpayOrderId = null;
  booking.overtime.razorpayPaymentId = null;
  booking.overtime.lockedAmountRupees = null;
  booking.overtime.lockedAmountPaise = null;
  booking.overtime.lockedMinutes = null;
  booking.overtime.billableMinutes = 0;
  booking.overtime.amountRupees = 0;
  booking.overtime.subtotal = 0;
  booking.overtime.platformFee = 0;
  booking.overtime.gst = 0;
}

/** After a paid extension moves booked end / grace into the future. */
export async function clearOvertimeIfWindowMoved(booking) {
  if (!booking?.overtime?.required) return false;
  if (booking.overtime.paymentStatus === OVERTIME_PAYMENT_STATUS.PAID) {
    return false;
  }
  const graceEnds = rideGraceEndsAtMs(booking);
  if (graceEnds == null || Date.now() >= graceEnds) return false;

  booking.overtime.required = false;
  booking.overtime.paymentStatus = OVERTIME_PAYMENT_STATUS.NONE;
  booking.overtime.razorpayOrderId = null;
  booking.overtime.lockedAmountRupees = null;
  booking.overtime.lockedMinutes = null;
  booking.overtime.lockedAmountPaise = null;
  booking.overtime.billableMinutes = 0;
  booking.overtime.amountRupees = 0;
  booking.overtime.subtotal = 0;
  booking.overtime.platformFee = 0;
  booking.overtime.gst = 0;
  await booking.save();
  emitOvertimeUpdated(booking);
  return true;
}

export async function getOvertimeQuoteService(userId, bookingId) {
  const booking = await Booking.findOne({
    _id: bookingId,
    userId,
    isDeleted: false,
  });
  if (!booking) throw new ApiError(404, 'Booking not found');
  await tickOvertimeQuote(booking._id);
  const fresh = await Booking.findById(bookingId);
  const live = quoteOvertime(fresh);
  if (live) {
    return {
      bookingId: String(fresh._id),
      status: fresh.status,
      overtime: live,
    };
  }
  if (isOutstationRideEndBooking(fresh)) {
    const graceEnds = rideGraceEndsAtMs(fresh);
    if (graceEnds != null && Date.now() < graceEnds) {
      return {
        bookingId: String(fresh._id),
        status: fresh.status,
        overtime: null,
      };
    }
  }
  return {
    bookingId: String(fresh._id),
    status: fresh.status,
    overtime: serializeStoredOvertime(fresh),
  };
}

export async function createOvertimePaymentOrderService(userId, bookingId) {
  const booking = await Booking.findOne({
    _id: bookingId,
    userId,
    isDeleted: false,
  });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status !== BOOKING_STATUS.STARTED) {
    throw new ApiError(400, 'Overtime payment is only due on an active trip');
  }

  await tickOvertimeQuote(booking._id);
  const fresh = await Booking.findById(bookingId);
  if (!fresh.overtime?.required) {
    throw new ApiError(400, 'This trip is not in overtime');
  }
  if (fresh.overtime.paymentStatus === OVERTIME_PAYMENT_STATUS.PAID) {
    throw new ApiError(400, 'Overtime is already paid');
  }

  const quote = quoteOvertime(fresh);
  if (!quote || !(quote.amountRupees > 0)) {
    throw new ApiError(400, 'No overtime amount is due yet');
  }

  applyQuoteToDoc(fresh, quote);
  const amountPaise = toPaise(quote.amountRupees);
  const existingId = fresh.overtime.razorpayOrderId;
  const lockedPaise = Number(fresh.overtime.lockedAmountPaise) || 0;

  if (!existingId || lockedPaise !== amountPaise) {
    const order = await createRazorpayOrder({
      amountPaise,
      receipt: `ot_${fresh._id.toString().slice(-10)}_${Date.now().toString(36).slice(-4)}`,
      notes: {
        bookingId: String(fresh._id),
        bookingNumber: fresh.bookingNumber,
        purpose: 'overtime',
      },
    });
    fresh.overtime.razorpayOrderId = order.id;
    fresh.overtime.lockedAmountPaise = amountPaise;
    fresh.overtime.lockedAmountRupees = quote.amountRupees;
    fresh.overtime.lockedMinutes = quote.billableMinutes;
    fresh.overtime.paymentStatus = OVERTIME_PAYMENT_STATUS.PENDING;
  }

  await fresh.save();
  emitOvertimeUpdated(fresh);

  return {
    keyId: getRazorpayKeyId(),
    orderId: fresh.overtime.razorpayOrderId,
    amount: fresh.overtime.lockedAmountPaise,
    currency: 'INR',
    name: 'SpareDriver',
    description: `Overtime — ${fresh.bookingNumber}`,
    bookingId: String(fresh._id),
    overtime: serializeOvertimeForWire(fresh),
  };
}

function applyPaidOvertimeToFare(booking) {
  const ot = booking.overtime || {};
  const amount = round2(ot.lockedAmountRupees || ot.amountRupees || 0);
  const bdExt = ot.breakdown || {};
  const addDriver = Number(bdExt.driverEarning) || 0;
  const addCommission = Number(bdExt.platformCommission) || 0;

  booking.fareSnapshot = booking.fareSnapshot || {};
  booking.fareSnapshot.total = round2(
    (Number(booking.fareSnapshot.total) || 0) + amount,
  );
  booking.fareSnapshot.breakdown = booking.fareSnapshot.breakdown || {};
  const bd = booking.fareSnapshot.breakdown;
  bd.overtimeChargeRupees = amount;
  bd.overtimeBillableMinutes = ot.lockedMinutes || ot.billableMinutes || 0;
  bd.driverEarning = round2((Number(bd.driverEarning) || 0) + addDriver);
  bd.platformCommission = round2(
    (Number(bd.platformCommission) || 0) + addCommission,
  );
  bd.gst = round2((Number(bd.gst) || 0) + (Number(ot.gst) || 0));
  bd.serviceCharge = round2(
    (Number(bd.serviceCharge) || 0) + (Number(ot.platformFee) || 0),
  );
  booking.markModified('fareSnapshot');

  booking.payment = booking.payment || {};
  booking.payment.amountPaidRupees = round2(
    (Number(booking.payment.amountPaidRupees) || 0) + amount,
  );
  booking.paymentStatus = BOOKING_PAYMENT_STATUS.PAID;

  if (booking.outstation) {
    booking.outstation.overtimeChargeRupees = amount;
    booking.outstation.overtimeBillableMinutes =
      ot.lockedMinutes || ot.billableMinutes || 0;
    booking.outstation.overtimeLastSettledAt = new Date();
  }
}

async function completeAfterOvertimePaid(booking, { orderId, paymentId, signature }) {
  if (booking.status === BOOKING_STATUS.COMPLETED) {
    return booking;
  }

  booking.overtime = booking.overtime || {};
  booking.overtime.paymentStatus = OVERTIME_PAYMENT_STATUS.PAID;
  booking.overtime.razorpayPaymentId = paymentId || booking.overtime.razorpayPaymentId;
  booking.overtime.razorpaySignature = signature || booking.overtime.razorpaySignature;
  booking.overtime.razorpayOrderId = orderId || booking.overtime.razorpayOrderId;
  booking.overtime.paidAt = booking.overtime.paidAt || new Date();
  booking.overtime.required = true;

  applyPaidOvertimeToFare(booking);

  try {
    const { upsertRazorpayPaymentRecord } = await import('./onlineTransaction.service.js');
    await upsertRazorpayPaymentRecord({
      purpose: PAYMENT_PURPOSE.BOOKING_OVERTIME,
      referenceId: booking._id,
      referenceModel: 'Booking',
      userId: booking.userId,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      amountRupees: round2(
        booking.overtime.lockedAmountRupees || booking.overtime.amountRupees || 0,
      ),
      status: 'captured',
      meta: {
        bookingNumber: booking.bookingNumber || '',
        purpose: 'overtime',
      },
      matchBy: 'paymentId',
    });
  } catch {
    /* ledger is best-effort */
  }

  const { finalizeTripCompletionService } = await import('./bookingTrip.service.js');
  const completed = await finalizeTripCompletionService(booking, {
    reason: 'overtime_paid',
  });
  return completed;
}

export async function verifyOvertimePaymentService(
  userId,
  bookingId,
  { orderId, paymentId, signature },
) {
  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'orderId, paymentId and signature are required');
  }

  const booking = await Booking.findOne({
    _id: bookingId,
    userId,
    isDeleted: false,
  });
  if (!booking) throw new ApiError(404, 'Booking not found');

  if (booking.status === BOOKING_STATUS.COMPLETED) {
    return booking.toObject();
  }

  if (booking.overtime?.razorpayOrderId !== orderId) {
    throw new ApiError(400, 'Order ID mismatch');
  }

  const ok = verifyRazorpayPaymentSignature({ orderId, paymentId, signature });
  if (!ok) {
    booking.overtime.paymentStatus = OVERTIME_PAYMENT_STATUS.FAILED;
    await booking.save();
    emitOvertimeUpdated(booking);
    notifyUserOvertimePaymentFailed(booking.userId, booking).catch(() => null);
    throw new ApiError(400, 'Payment signature verification failed');
  }

  const completed = await completeAfterOvertimePaid(booking, {
    orderId,
    paymentId,
    signature,
  });
  return completed.toObject();
}

export async function handleOvertimePaymentCaptured({ orderId, paymentId }) {
  if (!orderId) return { handled: false };
  const booking = await Booking.findOne({
    'overtime.razorpayOrderId': orderId,
    isDeleted: false,
  });
  if (!booking) return { handled: false };
  if (booking.status === BOOKING_STATUS.COMPLETED) {
    return { handled: true, skipped: true };
  }
  if (!booking.overtime?.required) {
    return { handled: true, skipped: true };
  }

  await completeAfterOvertimePaid(booking, { orderId, paymentId });
  return { handled: true };
}

export async function handleOvertimePaymentFailed({ orderId }) {
  if (!orderId) return { handled: false };
  const booking = await Booking.findOne({
    'overtime.razorpayOrderId': orderId,
    isDeleted: false,
    status: BOOKING_STATUS.STARTED,
  });
  if (!booking) return { handled: false };
  if (booking.overtime?.paymentStatus === OVERTIME_PAYMENT_STATUS.PAID) {
    return { handled: true, skipped: true };
  }
  booking.overtime.paymentStatus = OVERTIME_PAYMENT_STATUS.FAILED;
  await booking.save();
  emitOvertimeUpdated(booking);
  notifyUserOvertimePaymentFailed(booking.userId, booking).catch(() => null);
  return { handled: true };
}

export async function triggerOvertimeNow(bookingId) {
  await tickOvertimeQuote(bookingId);
  const booking = await Booking.findById(bookingId).lean();
  return {
    ok: true,
    status: booking?.status || null,
    overtime: booking?.overtime || null,
  };
}
