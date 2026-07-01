import Booking, { BOOKING_PAYMENT_METHOD } from '../models/booking.model.js';
import { ApiError } from '../utils/apiError.js';
import { generateBookingNumber } from '../utils/orderNumber.util.js';
import {
  estimateFareService,
  getServicePricingByTypeService,
} from './pricing.service.js';
import {
  cancelPaymentTimeout,
  releaseDriverFromBooking,
} from './bookingPaymentTimeout.service.js';
import {
  cancelNoShowSchedule,
  resumeNoShowScheduleIfNeeded,
} from './bookingNoShowTimeout.service.js';
import {
  loadCancellationPolicy,
  computeUserCancellation,
  computeDriverCancellation,
  evaluateDriverCancelChance,
} from './bookingCancellation.service.js';
import {
  issueBookingRefundService,
  REFUND_INITIATED_BY,
} from './refund.service.js';
import {
  notifyUserBookingCreated,
  notifyUserDriverSearching,
  notifyUserBookingCancelled,
  notifyUserPaymentSuccessful,
  notifyUserWalletDebited,
  notifyDriverBookingCancelled,
  notifyDriverCustomerCancelled,
} from '../utils/notificationDispatch.js';
import {
  releaseBookingBufferHold,
  clearPendingExtensionsOnTerminate,
} from './bookingExtension.service.js';
import {
  debitWalletService,
  creditWalletService,
  holdWalletService,
  releaseWalletHoldService,
  getWalletService,
} from './wallet.service.js';
import { WALLET_TXN_SOURCE } from '../models/walletTransaction.model.js';
import {
  recordPlatformRevenue,
  PLATFORM_REVENUE_SOURCE,
} from './platformRevenue.service.js';
import { Driver } from '../models/driverModels/driver.model.js';
import {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
  PAYMENT_MODE,
  PAYMENT_MODE_LIST,
  BOOKING_PAYMENT_STATUS,
  BOOKING_TYPE,
  BOOKING_TYPE_LIST,
  SCHEDULED_BOOKING,
} from '../constants/bookingStatus.js';
import { SERVICE_TYPES, SERVICE_TYPE_LIST } from '../constants/serviceTypes.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToBooking,
  emitToAdmins,
  emitToDriver,
} from '../utils/socketEmitters.js';
import { findActiveZoneIdsForPointService } from './zone.service.js';
import {
  setupScheduledBooking,
  cancelScheduledBookingJobs,
  loadScheduledDispatchConfig,
} from './bookingScheduled.service.js';

/**
 * Business rules:
 *  - A user can have MANY active bookings concurrently, one per car. The
 *    only constraint is that the same car cannot be on two bookings whose
 *    time windows overlap (see {@link assertCarAvailableForWindow}). This
 *    lets a customer with multiple cars line up trips in parallel without
 *    being blocked by a single in-flight booking.
 *  - Scheduled bookings must be created at least
 *    `SCHEDULED_BOOKING.MIN_SCHEDULED_LEAD_HOURS` in the future. Anything
 *    sooner has no safety net (the emergency-pool escalation needs at
 *    least that window) — customers needing a ride sooner pick "Instant".
 *  - Fare is re-computed on the server. The client only sends inputs; the
 *    backend never trusts a client-supplied total.
 *  - Booking is created in `searching` status. Dispatch kicks off in the
 *    controller layer right after, not here, so the service stays pure.
 *  - `paymentMode` always becomes `pre_ride` the moment a driver accepts —
 *    `acceptBookingService` flips the booking into AWAITING_PAYMENT.
 */

/* ------------------------------------------------------------------ */
/* Fare snapshot mapping                                               */
/* ------------------------------------------------------------------ */

/**
 * Flattens the pricing-engine breakdown into the persisted `fareSnapshot`
 * shape. The pricing engine and the booking model use different field
 * names; this is the only place that knows about the mapping.
 *
 *   pricing engine field   →   fareSnapshot field
 *   ─────────────────────       ──────────────────
 *   packagePrice (hourly)   →   baseFare
 *   dailyRateTotal (outst.) →   baseFare
 *   subtotal − baseFare     →   extras  (everything else added before tax)
 *   serviceCharge           →   serviceCharge
 *   gstAmount               →   gst
 *   subscriptionDiscount    →   discount
 *   totalPayable            →   total
 */
function buildFareSnapshot(estimate) {
  const bd = estimate?.fareBreakdown || {};
  const baseFare = bd.packagePrice ?? bd.dailyRateTotal ?? 0;
  const subtotal = bd.subtotal ?? 0;
  const extras = Math.max(0, Number(subtotal) - Number(baseFare));
  return {
    pricingId: estimate?.pricingId || null,
    baseFare: round2(baseFare),
    extras: round2(extras),
    serviceCharge: round2(bd.serviceCharge || 0),
    gst: round2(bd.gstAmount || 0),
    discount: round2(bd.subscriptionDiscount || 0),
    total: round2(bd.totalPayable || 0),
    breakdown: bd,
    subscriptionId: estimate?.subscription?._id || null,
  };
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Snapshot the live waiting-charge policy for a service onto the
 * booking's `waiting` sub-doc at creation time. The buffer rupees
 * (= maxBillableMinutes × chargePerMinute) is what gets collected
 * upfront alongside the fare. Per-minute / free-wait / max-billable
 * are stamped here too so the live driver UI can render the ticker
 * and the no-show settlement uses the *same* policy the customer
 * was charged under, even if the admin tweaks pricing mid-flight.
 *
 * Returns a fully-shaped `booking.waiting` POJO — callers just spread
 * it onto the Booking.create payload.
 */
async function buildWaitingChargeSnapshot(serviceType) {
  // Outstation never accrues waiting time. The driver picks the
  // customer up at the agreed time and stays with them for the whole
  // round trip \u2014 there's no "free wait \u2192 per-min ticker"
  // moment like there is on an hourly pickup. So we always emit a
  // zeroed-out snapshot (no buffer hold, no per-min rate, no max
  // billable) regardless of what defaults the admin saved on the
  // outstation pricing doc.
  if (serviceType === SERVICE_TYPES.OUTSTATION) {
    return {
      waitedMinutes: 0,
      billableMinutes: 0,
      chargeRupees: 0,
      freeMinutes: 0,
      perMinuteRupees: 0,
      maxBillableMinutes: 0,
      bufferRupees: 0,
      bufferConsumedRupees: 0,
      bufferRefundRupees: 0,
      bufferRefundTxId: null,
      noShow: false,
    };
  }
  let pricing = null;
  try {
    pricing = await getServicePricingByTypeService(serviceType);
  } catch (err) {
    console.warn(
      '[booking] waiting-charge snapshot pricing lookup failed:',
      err?.message,
    );
  }
  const cfg = pricing?.waitingCharge || {};
  const freeMinutes = Math.max(0, Number(cfg.freeWaitingMinutes) || 0);
  const perMinuteRupees = Math.max(0, Number(cfg.chargePerMinute) || 0);
  const maxBillableMinutes = Math.max(0, Number(cfg.maxBillableMinutes) || 0);
  const bufferRupees = round2(maxBillableMinutes * perMinuteRupees);
  return {
    waitedMinutes: 0,
    billableMinutes: 0,
    chargeRupees: 0,
    freeMinutes,
    perMinuteRupees,
    maxBillableMinutes,
    bufferRupees,
    bufferConsumedRupees: 0,
    bufferRefundRupees: 0,
    bufferRefundTxId: null,
    noShow: false,
  };
}

/* ------------------------------------------------------------------ */
/* Find existing active booking                                        */
/* ------------------------------------------------------------------ */

/**
 * Compute the amount the driver will receive for a booking, from a
 * persisted `fareSnapshot`. We prefer the breakdown value (which was
 * derived at booking-creation time so it matches what the customer paid)
 * and fall back to `total − total × commission%` if the breakdown is
 * missing (older bookings created before the breakdown was retained).
 */
export function driverEarningFromFareSnapshot(fareSnapshot) {
  if (!fareSnapshot) return 0;
  const bd = fareSnapshot.breakdown || {};
  if (typeof bd.driverEarning === 'number') return round2(bd.driverEarning);
  const total = Number(fareSnapshot.total) || 0;
  const commissionPct = Number(bd.platformCommissionPercent) || 0;
  if (commissionPct > 0 && total > 0) {
    return round2(total - (total * commissionPct) / 100);
  }
  return round2(total);
}

/**
 * Strip fields the driver is not allowed to see and rewrite the fare
 * block so the driver only ever sees their own earning — never the
 * customer's gross total or the commission cut. The mutation is on a
 * `.lean()` POJO so it's safe and cheap.
 *
 * `otpRequired` is preserved so the driver UI knows when to render the
 * OTP-entry sheet.
 */
export function sanitizeBookingForDriver(booking) {
  if (!booking) return booking;
  const obj = booking;
  if (obj.rideStartOtp) {
    obj.otpRequired = !obj.rideStartOtp.verifiedAt;
    obj.rideStartOtp = {
      generatedAt: obj.rideStartOtp.generatedAt || null,
      verifiedAt: obj.rideStartOtp.verifiedAt || null,
    };
  } else {
    obj.otpRequired = false;
  }
  // Driver doesn't need to see the customer's chosen payment timing or
  // running balance — those are user-side concerns.
  if ('paymentMode' in obj) delete obj.paymentMode;
  if ('paymentStatus' in obj) delete obj.paymentStatus;
  if ('payment' in obj) delete obj.payment;
  if ('razorpay' in obj) delete obj.razorpay;

  // Replace the customer-facing fare snapshot with a driver-safe view
  // that only shows the driver's earning. Includes the waiting charge
  // (`waiting.chargeRupees`) because under current policy 100% of it
  // is credited to the driver at trip-end — leaving it out would make
  // the per-trip line on the driver's earnings/recent-payouts feed
  // disagree with what actually landed in their wallet.
  if (obj.fareSnapshot) {
    const baseEarning = driverEarningFromFareSnapshot(obj.fareSnapshot);
    const waitingCharge = Number(obj.waiting?.chargeRupees) || 0;
    const driverEarning = round2(baseEarning + waitingCharge);
    obj.fareSnapshot = {
      pricingId: obj.fareSnapshot.pricingId || null,
      driverEarning,
      driverFareEarning: round2(baseEarning),
      driverWaitingEarning: round2(waitingCharge),
      currency: 'INR',
    };
  }

  // Strip customer-pricing fields off each extension subdoc and surface
  // only the driver's share. Previously the driver app received the
  // full `fareDelta` (= what the customer paid) plus the entire
  // `breakdown` (subtotal/serviceCharge/gst/platformCommission) — a
  // data leak that also made the driver think they earned more than
  // they actually did. We now expose just `driverEarning` (= subtotal
  // − platformCommission), the hours added and the lifecycle stamps.
  if (Array.isArray(obj.extensions) && obj.extensions.length) {
    obj.extensions = obj.extensions.map((ext) => {
      const bd = ext?.breakdown || {};
      const driverEarning = round2(Number(bd.driverEarning) || 0);
      return {
        _id: ext._id || null,
        status: ext.status || null,
        additionalHours: Number(ext.additionalHours) || 0,
        additionalDays: Number(ext.additionalDays) || 0,
        driverEarning,
        requestedAt: ext.requestedAt || null,
        respondedAt: ext.respondedAt || null,
        paidAt: ext.paidAt || null,
        // OTP block is presence-only — the code itself stays out of the
        // sanitized view (sockets carry it separately when needed).
        otp: ext.otp
          ? {
              generatedAt: ext.otp.generatedAt || null,
              verifiedAt: ext.otp.verifiedAt || null,
              expiresAt: ext.otp.expiresAt || null,
            }
          : null,
      };
    });
  }
  return obj;
}

/**
 * Attach a `cancellationPreview` block onto the booking POJO so the FE
 * can render the confirm-dialog warning without an extra round-trip. The
 * preview is computed from the live admin policy + current booking state
 * (so it shrinks/grows correctly as the booking moves through statuses).
 *
 *   side === 'user'   → `{ feeCharged, refundAmount, tripStarted, ... }`
 *   side === 'driver' → `{ driverPenalty, refundAmount, tripStarted, ... }`
 *
 * The booking object is mutated in place and returned for chainability.
 */
async function attachCancellationPreview(booking, side, { driverId } = {}) {
  if (!booking) return booking;
  try {
    const policy = await loadCancellationPolicy(booking.serviceType);
    if (side === 'driver') {
      // Surface the live grace+chance snapshot so the FE confirm dialog
      // can say "Free cancel — 2 chances left today" (or warn the
      // driver before they commit). Best-effort: a missing driver
      // record falls back to a chance-empty preview which the FE renders
      // as the full-penalty case.
      let chance = null;
      if (driverId) {
        const driverSnap = await Driver.findById(driverId)
          .select('cancellationChances')
          .lean();
        chance = evaluateDriverCancelChance(driverSnap, booking, policy);
      }
      booking.cancellationPreview = {
        side: 'driver',
        ...computeDriverCancellation(booking, policy, chance),
        chance,
        policy,
      };
    } else {
      booking.cancellationPreview = {
        side: 'user',
        ...computeUserCancellation(booking, policy),
        policy,
      };
    }
  } catch (err) {
    // Pricing lookup is best-effort — if the pricing config is missing
    // we just omit the preview rather than failing the whole fetch.
    console.warn('[booking] cancellationPreview hydration failed:', err?.message);
  }
  return booking;
}

/**
 * Fields the user-side views need on the assigned driver: identity,
 * rating, contact, and the "should I be reassured?" facts (experience
 * + vehicle expertise). Centralised so every populate call agrees.
 */
const DRIVER_USER_FIELDS = [
  'name',
  'phone_no',
  'rating',
  'profilePicture',
  // The "real" photo of the driver lives on the selfie document
  // captured during onboarding (documents[].type === 'selfie').
  // `profilePicture` is rarely set, so the customer-facing avatars
  // were falling back to initials. Shipping `documents` lets the
  // frontend pull the selfie URL when no profile picture exists.
  'documents',
  'experienceYears',
  'vehicleExperience',
  'carTypeExperience',
].join(' ');

const DRIVER_USER_FIELDS_WITH_LOC = `${DRIVER_USER_FIELDS} location`;

/** Fields the driver-side views need on the customer. */
const CUSTOMER_DRIVER_FIELDS = 'name phone_no email profilePicture createdAt';

/**
 * Shared `populate` recipe for the customer's car when fetching a
 * booking on the driver side. Drivers need to identify the vehicle
 * (image + brand + model + plate + fuel + transmission) on the active
 * trip screen so they can spot it at the pickup. The nested refs
 * resolve to `{ name }` documents via separate populates so the FE
 * gets the same shape it already consumes from the `BOOKING_OFFERED`
 * socket payload (see `buildOfferPayload`).
 */
const CAR_DRIVER_POPULATE = {
  path: 'carId',
  select: 'vehicleNumber transmission image carTypeId brandId modelId fuelTypeId',
  populate: [
    { path: 'carTypeId', select: 'name' },
    { path: 'brandId', select: 'name' },
    { path: 'modelId', select: 'name' },
    { path: 'fuelTypeId', select: 'name' },
  ],
};

/**
 * Status priority for surfacing "the most relevant active booking" when
 * a user has multiple in flight. In-trip statuses outrank pre-trip ones
 * so the resume UX always lands on whatever is happening *now*, not on
 * a long-lead scheduled ride that doesn't need any attention yet.
 */
const ACTIVE_STATUS_PRIORITY = Object.freeze({
  [BOOKING_STATUS.STARTED]: 0,
  [BOOKING_STATUS.ARRIVED]: 1,
  [BOOKING_STATUS.EN_ROUTE]: 2,
  [BOOKING_STATUS.AWAITING_PAYMENT]: 3,
  [BOOKING_STATUS.DRIVER_ASSIGNED]: 4,
  [BOOKING_STATUS.IN_EMERGENCY_POOL]: 5,
  [BOOKING_STATUS.SEARCHING]: 6,
  [BOOKING_STATUS.PENDING_ASSIGNMENT]: 7,
});

function rankActiveBooking(b) {
  if (!b) return Number.POSITIVE_INFINITY;
  const statusRank = ACTIVE_STATUS_PRIORITY[b.status] ?? 9;
  const pickupAt =
    b.hourly?.scheduledStartAt ||
    b.outstation?.startDate ||
    b.createdAt;
  // Convert pickup to a tiny secondary key (ms) so two equal-status
  // bookings sort by "closest pickup first".
  return statusRank * 1e15 + new Date(pickupAt || 0).getTime();
}

export async function getActiveBookingForUserService(userId) {
  if (!userId) return null;
  const candidates = await Booking.find({
    userId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    isDeleted: false,
  })
    .populate('driverId', DRIVER_USER_FIELDS)
    .lean();
  if (!candidates.length) return null;
  candidates.sort((a, b) => rankActiveBooking(a) - rankActiveBooking(b));
  const booking = candidates[0];
  // Cold-start safety: if the server restarted while a booking was
  // sitting at ARRIVED, the in-process no-show timer got dropped.
  // Re-attach it here so the prompt + auto-complete cycle never goes
  // missing for an active customer fetch.
  resumeNoShowScheduleIfNeeded(booking).catch(() => {});
  return attachCancellationPreview(booking, 'user');
}

/**
 * Return every active booking for the user. The resume hook still
 * focuses on the highest-priority one (via
 * {@link getActiveBookingForUserService}), but the frontend can use
 * this list to render an "Active rides" rail / let the user switch
 * between simultaneous bookings.
 */
export async function listActiveBookingsForUserService(userId) {
  if (!userId) return [];
  const candidates = await Booking.find({
    userId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    isDeleted: false,
  })
    .populate('driverId', DRIVER_USER_FIELDS)
    .lean();
  candidates.sort((a, b) => rankActiveBooking(a) - rankActiveBooking(b));
  return candidates.map((b) => attachCancellationPreview(b, 'user'));
}

/**
 * Return all bookings for a user (history + active).
 */
export async function listAllBookingsForUserService(userId) {
  if (!userId) return [];
  const bookings = await Booking.find({ userId, isDeleted: false })
    .sort({ createdAt: -1 })
    .populate('driverId', DRIVER_USER_FIELDS)
    .lean();
  
  // Attach cancellation preview for consistency, even on history items.
  return Promise.all(bookings.map((b) => attachCancellationPreview(b, 'user')));
}

export async function getBookingByIdService(bookingId, { userId, driverId } = {}) {
  const filter = { _id: bookingId, isDeleted: false };
  if (userId) filter.userId = userId;
  if (driverId) filter.driverId = driverId;
  const query = Booking.findOne(filter)
    .populate('driverId', DRIVER_USER_FIELDS_WITH_LOC)
    .populate('userId', CUSTOMER_DRIVER_FIELDS);
  // Both the driver-side and the customer-side detail views need the
  // vehicle (image + brand + model + plate + transmission + fuel) so
  // each side can identify the car. The shared `CAR_DRIVER_POPULATE`
  // recipe resolves the nested `brandId/modelId/...` refs to lookup
  // names so the FE renders without a second round-trip.
  query.populate(CAR_DRIVER_POPULATE);
  const booking = await query.lean();
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (driverId) {
    return attachCancellationPreview(
      sanitizeBookingForDriver(booking),
      'driver',
      { driverId },
    );
  }
  return attachCancellationPreview(booking, 'user');
}

export async function getActiveBookingForDriverService(driverId) {
  if (!driverId) return null;
  const booking = await Booking.findOne({
    driverId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    isDeleted: false,
  })
    .populate('userId', CUSTOMER_DRIVER_FIELDS)
    .populate(CAR_DRIVER_POPULATE)
    .lean();
  resumeNoShowScheduleIfNeeded(booking).catch(() => {});
  return attachCancellationPreview(
    sanitizeBookingForDriver(booking),
    'driver',
    { driverId },
  );
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

function validatePlace(label, place) {
  if (!place?.address?.trim()) throw new ApiError(400, `${label} address is required`);
  const lng = place?.location?.coordinates?.[0];
  const lat = place?.location?.coordinates?.[1];
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new ApiError(400, `${label} coordinates are required ([lng, lat])`);
  }
}

function validateCreateInput(body) {
  const {
    serviceType,
    bookingType,
    paymentMode,
    carId,
    pickup,
    dropoff,
    hourly,
    outstation,
  } = body || {};

  if (!SERVICE_TYPE_LIST.includes(serviceType)) {
    throw new ApiError(400, 'serviceType must be one of: ' + SERVICE_TYPE_LIST.join(', '));
  }
  if (!BOOKING_TYPE_LIST.includes(bookingType)) {
    throw new ApiError(400, 'bookingType must be one of: ' + BOOKING_TYPE_LIST.join(', '));
  }
  // paymentMode is optional on create — defaults to post_ride. If supplied,
  // it must still be in the enum.
  if (paymentMode != null && !PAYMENT_MODE_LIST.includes(paymentMode)) {
    throw new ApiError(400, 'paymentMode must be pre_ride or post_ride');
  }
  if (!carId) throw new ApiError(400, 'carId is required');
  validatePlace('Pickup', pickup);
  if (dropoff) validatePlace('Drop', dropoff);

  if (serviceType === SERVICE_TYPES.HOURLY) {
    if (!hourly?.scheduledStartAt) throw new ApiError(400, 'Hourly: scheduledStartAt is required');
    if (!hourly?.durationHours || hourly.durationHours < 1) {
      throw new ApiError(400, 'Hourly: durationHours must be ≥ 1');
    }
    // A booking is either slab-based or custom — never both, never neither.
    if (!hourly.slabId && !hourly.isCustomDuration) {
      throw new ApiError(400, 'Hourly: pick a slab or enable custom duration');
    }
    if (hourly.slabId && hourly.isCustomDuration) {
      throw new ApiError(400, 'Hourly: slabId and isCustomDuration cannot both be set');
    }
  }
  if (serviceType === SERVICE_TYPES.OUTSTATION) {
    if (!outstation?.destinationAddress?.trim()) {
      throw new ApiError(400, 'Outstation: destinationAddress is required');
    }
    // Accept either the new (pickupAt, expectedReturnAt) datetime pair
    // OR the legacy (startDate, endDate) pair. The create flow below
    // normalises to both, so older clients keep working.
    const start = outstation?.pickupAt || outstation?.startDate;
    const end = outstation?.expectedReturnAt || outstation?.endDate;
    if (!start || !end) {
      throw new ApiError(
        400,
        'Outstation: pickupAt and expectedReturnAt are required',
      );
    }
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      throw new ApiError(
        400,
        'Outstation: pickupAt and expectedReturnAt must be valid datetimes',
      );
    }
    if (endMs <= startMs) {
      throw new ApiError(
        400,
        'Outstation: expectedReturnAt must be after pickupAt',
      );
    }
  }
}

function shapePlace(place) {
  return {
    address: place.address.trim(),
    city: place.city?.trim() || '',
    location: {
      type: 'Point',
      coordinates: [place.location.coordinates[0], place.location.coordinates[1]],
    },
  };
}

/**
 * Round-trip outstation duration.
 *
 *   Days  = number of DISTINCT calendar dates the trip spans
 *           (server-local time). Same-day = 1, overnight = 2, etc.
 *           e.g. pickup Mon 09:00 → return Wed 06:00 ⇒ 3 days.
 *           e.g. pickup Mon 08:00 → return Mon 20:00 ⇒ 1 day.
 *   Nights = days − 1 (one less night than days, since the customer
 *           is back home on the final day).
 *
 * The two arguments are intentionally named generically (`pickupAt`,
 * `expectedReturnAt`) but accept the legacy `(startDate, endDate)`
 * pair too — both flows use the same calendar-day model.
 *
 * Returns `{ days: 1, nights: 0 }` when either bound is missing or
 * invalid so a downstream fare estimate never blows up on null math.
 */
export function computeOutstationDuration(pickupAt, expectedReturnAt) {
  if (!pickupAt || !expectedReturnAt) return { days: 1, nights: 0 };
  const start = new Date(pickupAt);
  const end = new Date(expectedReturnAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { days: 1, nights: 0 };
  }
  if (end.getTime() <= start.getTime()) return { days: 1, nights: 0 };

  // Strip the time component so the diff is in WHOLE calendar days.
  // Math.round (not floor) shrugs off DST quirks where the local-day
  // difference is 23h 59m or 24h 01m.
  const startMidnight = new Date(start);
  startMidnight.setHours(0, 0, 0, 0);
  const endMidnight = new Date(end);
  endMidnight.setHours(0, 0, 0, 0);
  const calendarSpan = Math.round(
    (endMidnight.getTime() - startMidnight.getTime()) / 86_400_000,
  );
  const days = Math.max(1, calendarSpan + 1);
  return { days, nights: Math.max(0, days - 1) };
}

/**
 * Compute the start + end Date for a booking-create payload. Used by
 * the per-car overlap check so we can compare windows across booking
 * types (instant vs scheduled hourly, outstation, etc.) without each
 * caller re-implementing the rules.
 *
 *   - Hourly + scheduled  →  [scheduledStartAt, +durationHours]
 *   - Hourly + instant    →  [now, +durationHours]
 *   - Outstation          →  [startDate, endDate || startDate + days]
 *
 * Returns `null` if we don't have enough information to bound the
 * window (treated as "no conflict possible").
 */
function windowFromCreatePayload(body) {
  const { serviceType, bookingType, hourly, outstation } = body || {};
  if (serviceType === SERVICE_TYPES.HOURLY) {
    const durationMs = (Number(hourly?.durationHours) || 1) * 60 * 60 * 1000;
    const start =
      bookingType === BOOKING_TYPE.SCHEDULED && hourly?.scheduledStartAt
        ? new Date(hourly.scheduledStartAt)
        : new Date();
    if (Number.isNaN(start.getTime())) return null;
    return { start, end: new Date(start.getTime() + durationMs) };
  }
  if (serviceType === SERVICE_TYPES.OUTSTATION) {
    // Prefer pickupAt / expectedReturnAt — they are exact customer-
    // picked datetimes. Fall back to the legacy startDate / endDate
    // (or +days when endDate is missing) for older client payloads.
    const startSrc = outstation?.pickupAt || outstation?.startDate;
    if (!startSrc) return null;
    const start = new Date(startSrc);
    const endSrc = outstation?.expectedReturnAt || outstation?.endDate;
    const end = endSrc
      ? new Date(endSrc)
      : new Date(start.getTime() + (Number(outstation?.days) || 1) * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime())) return null;
    return { start, end };
  }
  return null;
}

/**
 * Project an existing booking's [start, end] window so we can compare
 * it against the requested booking. Mirrors `windowFromCreatePayload`
 * for stored bookings.
 */
function windowFromExistingBooking(b) {
  if (!b) return null;
  if (b.serviceType === SERVICE_TYPES.HOURLY) {
    const durationMs = (Number(b.hourly?.durationHours) || 1) * 60 * 60 * 1000;
    const start =
      b.hourly?.scheduledStartAt
        ? new Date(b.hourly.scheduledStartAt)
        : new Date(b.timeline?.createdAt || b.createdAt || Date.now());
    if (Number.isNaN(start.getTime())) return null;
    return { start, end: new Date(start.getTime() + durationMs) };
  }
  if (b.serviceType === SERVICE_TYPES.OUTSTATION) {
    const startSrc = b.outstation?.pickupAt || b.outstation?.startDate;
    if (!startSrc) return null;
    const start = new Date(startSrc);
    const endSrc = b.outstation?.expectedReturnAt || b.outstation?.endDate;
    const end = endSrc
      ? new Date(endSrc)
      : new Date(start.getTime() + (Number(b.outstation?.days) || 1) * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime())) return null;
    return { start, end };
  }
  return null;
}

/**
 * Guards a booking-create against overlapping the same car onto two
 * concurrent trips. We intentionally key the conflict on `carId` (not
 * `userId`) so a user with multiple cars can spin up parallel rides.
 *
 * Throws `ApiError(409, ..., { code, conflictBookingId })` so the
 * frontend can pop a specific toast and deep-link to the conflicting
 * booking if it wants to.
 */
async function assertCarAvailableForWindow({ userId, carId, body }) {
  if (!carId) return;
  const newWindow = windowFromCreatePayload(body);
  // Without a bounded window we can't safely compare — fall back to a
  // generic "this car already has an active booking" guard so we never
  // accidentally double-book.
  const candidates = await Booking.find({
    carId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    isDeleted: false,
  })
    .select(
      'serviceType hourly outstation timeline createdAt bookingNumber userId status',
    )
    .lean();

  for (const b of candidates) {
    if (!newWindow) {
      const err = new ApiError(
        409,
        'This car already has an active booking. Pick a different car or wait until it finishes.',
      );
      err.data = {
        code: 'CAR_HAS_ACTIVE_BOOKING',
        conflictBookingId: String(b._id),
        conflictBookingNumber: b.bookingNumber,
      };
      throw err;
    }
    const existingWindow = windowFromExistingBooking(b);
    if (!existingWindow) continue;
    const overlaps =
      newWindow.start < existingWindow.end &&
      newWindow.end > existingWindow.start;
    if (overlaps) {
      const err = new ApiError(
        409,
        `This car is already booked from ${existingWindow.start.toLocaleString('en-IN')} to ${existingWindow.end.toLocaleString('en-IN')}. Choose a different car or a non-overlapping time.`,
      );
      err.data = {
        code: 'CAR_TIME_CONFLICT',
        conflictBookingId: String(b._id),
        conflictBookingNumber: b.bookingNumber,
        conflictFrom: existingWindow.start.toISOString(),
        conflictTo: existingWindow.end.toISOString(),
        ownedByCurrentUser: String(b.userId) === String(userId),
      };
      throw err;
    }
  }
}

export async function createBookingService(userId, body) {
  validateCreateInput(body);

  const { serviceType, bookingType, carId, pickup, dropoff, hourly, outstation } = body;

  // Scheduled rides must be created with enough lead time for the
  // emergency-pool safety window to fire. Anything sooner is treated as
  // a UX error — surface a clear 422 rather than letting the queue
  // schedule a job in the past.
  //
  // The minimum lead time is admin-tunable per service via
  // `ServicePricing.scheduledDispatch.MIN_SCHEDULED_LEAD_HOURS`; the
  // hard-coded constant is only used as a fallback when no override
  // exists. This keeps the validation in lockstep with the rest of the
  // scheduled-dispatcher knobs admins can change from the panel.
  if (bookingType === BOOKING_TYPE.SCHEDULED && serviceType === SERVICE_TYPES.HOURLY) {
    const cfg = await loadScheduledDispatchConfig(serviceType);
    const minLeadHours =
      cfg.MIN_SCHEDULED_LEAD_HOURS ?? SCHEDULED_BOOKING.MIN_SCHEDULED_LEAD_HOURS;
    const minLeadMs = minLeadHours * 60 * 60 * 1000;
    const startMs = new Date(hourly.scheduledStartAt).getTime();
    if (!Number.isFinite(startMs) || startMs - Date.now() < minLeadMs) {
      throw new ApiError(
        422,
        `Scheduled rides must start at least ${minLeadHours} hours from now. Pick a later pickup time or use Instant.`,
      );
    }
  }

  // Outstation pickups are always scheduled in advance — the manual
  // assignment queue needs at least the admin-configured lead window
  // for ops to pick a driver before the trip is supposed to start. Past
  // pickups land here too (negative diff < positive lead) and are
  // rejected with the same 422 so the FE can surface one consistent
  // error path. The knob lives on `ServicePricing.scheduledDispatch`
  // and is admin-tunable per service (same field hourly already uses).
  if (serviceType === SERVICE_TYPES.OUTSTATION) {
    const cfg = await loadScheduledDispatchConfig(serviceType);
    const minLeadHours =
      cfg.MIN_SCHEDULED_LEAD_HOURS ?? SCHEDULED_BOOKING.MIN_SCHEDULED_LEAD_HOURS;
    const minLeadMs = minLeadHours * 60 * 60 * 1000;
    const pickupRaw = outstation?.pickupAt || outstation?.startDate;
    const startMs = new Date(pickupRaw).getTime();
    if (!Number.isFinite(startMs)) {
      throw new ApiError(400, 'Outstation: pickupAt is invalid');
    }
    if (startMs - Date.now() < minLeadMs) {
      throw new ApiError(
        422,
        `Outstation bookings must start at least ${minLeadHours} hours from now. Pick a later pickup time.`,
      );
    }
    // Outstation always gets its own booking type — override whatever the
    // client sent so every outstation row is consistently typed 'outstation'.
    body.bookingType = BOOKING_TYPE.OUTSTATION;
  }

  // The "one active booking per user" rule is gone — users can run
  // bookings in parallel as long as no two collide on the same car.
  await assertCarAvailableForWindow({ userId, carId, body });

  // Re-compute fare server-side. Client-supplied totals are never trusted.
  // Hourly bookings can now opt out of food / accommodation when their
  // duration crosses the configured threshold (see pricing.service.js).
  // Compute the canonical pickup datetime once — the create flow uses
  // it both for the fare estimate (night-window check) and for the
  // persisted outstation document below. Falls back to the legacy
  // startDate for older clients that haven't moved to pickupAt yet.
  const outstationPickupAt =
    serviceType === SERVICE_TYPES.OUTSTATION
      ? new Date(outstation?.pickupAt || outstation?.startDate)
      : null;
  const outstationReturnAt =
    serviceType === SERVICE_TYPES.OUTSTATION
      ? new Date(outstation?.expectedReturnAt || outstation?.endDate)
      : null;
  const outstationDuration =
    serviceType === SERVICE_TYPES.OUTSTATION
      ? computeOutstationDuration(outstationPickupAt, outstationReturnAt)
      : null;

  const estimate = await estimateFareService({
    serviceType,
    userId,
    carId: body.carId,
    slabId: hourly?.slabId || undefined,
    bookedHours: hourly?.durationHours,
    scheduledAt: hourly?.scheduledStartAt || outstationPickupAt,
    days: outstationDuration?.days,
    // Outstation: `needsStay` and `needsFood` are AND'd in the engine
    // into a single "customer arranges everything" toggle. Both must
    // be `true` for the per-night allowance to be waived.
    stayProvided:
      serviceType === SERVICE_TYPES.OUTSTATION
        ? (outstation?.needsStay ?? true)
        : (hourly?.stayProvided ?? true),
    foodProvided:
      serviceType === SERVICE_TYPES.OUTSTATION
        ? (outstation?.needsFood ?? true)
        : (hourly?.foodProvided ?? true),
  });
  const fareSnapshot = buildFareSnapshot(estimate);
  if (!fareSnapshot.total || fareSnapshot.total <= 0) {
    throw new ApiError(500, 'Fare engine returned a zero total. Check pricing configuration.');
  }

  // Snapshot the live waiting-charge policy so the buffer is locked in
  // at booking-creation time — a mid-flight admin tweak can't shift the
  // amount we reserved against the user's wallet.
  const waitingSnapshot = await buildWaitingChargeSnapshot(serviceType);

  const bookingNumber = generateBookingNumber();

  // Pay-then-search with a soft hold for the waiting buffer:
  //   1. Pre-check the wallet can cover fare + buffer (so a short wallet
  //      surfaces a single clear "you need ₹X" error, before any side
  //      effects).
  //   2. Debit only the fare (the buffer is NOT debited — see below).
  //   3. Hold the buffer (`wallet.heldRupees += bufferRupees`). The
  //      money stays in the wallet but `availableRupees = balance −
  //      heldRupees` drops, so the user can't spend it elsewhere.
  //
  // The hold is settled at trip-end: the actual accrued waiting charge
  // is debited (via `bypassHeld: true`) and the rest of the hold is
  // released back to spendable.
  const fareTotal = round2(fareSnapshot.total);
  const bufferRupees = round2(waitingSnapshot.bufferRupees);
  const requiredAmount = round2(fareTotal + bufferRupees);

  const walletSnapshot = await getWalletService(userId);
  if ((walletSnapshot?.availableRupees ?? 0) < requiredAmount) {
    const available = walletSnapshot?.availableRupees ?? 0;
    const heldRupees = walletSnapshot?.heldRupees ?? 0;
    const message =
      bufferRupees > 0
        ? `You need \u20B9${requiredAmount} in your wallet to book this ride (\u20B9${fareTotal} fare + \u20B9${bufferRupees} refundable waiting reserve).`
        : `You need \u20B9${requiredAmount} in your wallet to book this ride.`;
    throw new ApiError(402, message, {
      requiredAmount,
      fareAmount: fareTotal,
      bufferAmount: bufferRupees,
      walletBalance: walletSnapshot?.balance || 0,
      heldRupees,
      availableRupees: available,
      shortBy: round2(Math.max(0, requiredAmount - available)),
    });
  }

  const walletTx = await debitWalletService({
    userId,
    amount: fareTotal,
    source: WALLET_TXN_SOURCE.BOOKING_PAYMENT,
    description: `Booking ${bookingNumber} \u2014 ${serviceType}`,
    refType: 'Booking',
    refId: bookingNumber, // _id isn't known yet; we patch refId below.
  });

  // Hold the buffer. If this fails (e.g. another concurrent booking
  // grabbed the available wallet between our pre-check and now), undo
  // the fare debit so the user isn't left with money missing AND no
  // booking.
  if (bufferRupees > 0) {
    try {
      await holdWalletService({ userId, amount: bufferRupees });
    } catch (holdErr) {
      try {
        await creditWalletService({
          userId,
          amount: fareTotal,
          source: WALLET_TXN_SOURCE.BOOKING_REFUND,
          description: `Refund \u2014 booking ${bookingNumber} hold failed`,
          refType: 'Booking',
          refId: bookingNumber,
        });
      } catch (refundErr) {
        console.error(
          '[booking] CRITICAL: failed to credit wallet after hold-failure rollback:',
          refundErr,
        );
      }
      throw holdErr;
    }
  }

  // Best-effort lookup of every zone the pickup falls inside. Stamped
  // on the booking so the admin emergency-pool filter (team_member only
  // sees their `assignedZones`) doesn't pay a geo lookup per row. Skip
  // failures — the booking flow must not block on zone resolution.
  let zoneIds = [];
  try {
    zoneIds = await findActiveZoneIdsForPointService({
      lat: pickup.location.coordinates[1],
      lng: pickup.location.coordinates[0],
    });
  } catch (zoneErr) {
    console.warn('[booking] zone resolution failed:', zoneErr?.message);
  }

  let booking;
  try {
    booking = await Booking.create({
      bookingNumber,
      userId,
      carId,
      serviceType,
      bookingType,
      pickup: shapePlace(pickup),
      dropoff: dropoff ? shapePlace(dropoff) : null,
      zoneIds,
      hourly:
        serviceType === SERVICE_TYPES.HOURLY
          ? {
              scheduledStartAt: new Date(hourly.scheduledStartAt),
              durationHours: hourly.durationHours,
              slabId: estimate.selectedSlab?._id || null,
              isCustomDuration: !!hourly.isCustomDuration,
            }
          : null,
      outstation:
        serviceType === SERVICE_TYPES.OUTSTATION
          ? {
              destinationAddress: outstation.destinationAddress.trim(),
              // pickupAt / expectedReturnAt are the new authoritative
              // datetimes. startDate / endDate mirror them so legacy
              // readers (driver app, admin queue, conflict service
              // fallback paths) keep working without a code change.
              pickupAt: outstationPickupAt,
              expectedReturnAt: outstationReturnAt,
              startDate: outstationPickupAt,
              endDate: outstationReturnAt,
              days: outstationDuration.days,
              nights: outstationDuration.nights,
              needsStay: outstation.needsStay ?? true,
              needsFood: outstation.needsFood ?? true,
              estimatedKm: outstation.estimatedKm || 0,
            }
          : null,
      fareSnapshot,
      waiting: waitingSnapshot,
      // Booking is already paid up-front via the wallet. Only the fare
      // total was debited; the waiting buffer is held against
      // `wallet.heldRupees` (no money has left the wallet for it).
      // The settle path debits the actual waiting charge at trip-end
      // and releases the rest of the hold.
      paymentMode: PAYMENT_MODE.PRE_RIDE,
      paymentMethod: BOOKING_PAYMENT_METHOD.WALLET,
      paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
      payment: {
        amountPaidRupees: fareTotal,
        attempts: 0,
        walletTxId: walletTx._id,
      },
      timeline: {
        createdAt: new Date(),
        paymentReceivedAt: new Date(),
      },
      // Outstation rides skip the wave dispatcher entirely — they sit in
      // PENDING_ASSIGNMENT until an admin/sub_admin (or zone-scoped
      // team_member) picks a driver from the outstation-assignment
      // queue. Hourly bookings (instant + immediate-tier scheduled)
      // continue to start in SEARCHING and let the dispatcher take over.
      status:
        serviceType === SERVICE_TYPES.OUTSTATION
          ? BOOKING_STATUS.PENDING_ASSIGNMENT
          : BOOKING_STATUS.SEARCHING,
    });
  } catch (err) {
    // Compensating credit if booking creation fails after we've already
    // debited the wallet — we never want money silently stuck in the
    // ledger without a booking to back it up.
    try {
      // Roll back the fare debit AND release the buffer hold so the
      // user is whole again.
      await creditWalletService({
        userId,
        amount: fareTotal,
        source: WALLET_TXN_SOURCE.BOOKING_REFUND,
        description: `Refund \u2014 booking ${bookingNumber} failed to create`,
        refType: 'Booking',
        refId: bookingNumber,
      });
      if (bufferRupees > 0) {
        await releaseWalletHoldService({ userId, amount: bufferRupees });
      }
    } catch (refundErr) {
      console.error(
        '[booking] CRITICAL: failed to credit wallet after booking-create rollback:',
        refundErr,
      );
    }
    throw err;
  }

  // Backfill the refId on the wallet txn now that we know the booking id.
  try {
    walletTx.refId = String(booking._id);
    await walletTx.save();
  } catch (linkErr) {
    console.warn('[booking] failed to link wallet txn to booking:', linkErr?.message);
  }

  // Scheduled hourly bookings branch through the scheduled-ride
  // dispatcher: short-window + morning rides search immediately (just
  // like instant), longer-lead rides sit in PENDING_ASSIGNMENT until
  // the BullMQ `assign` job fires. The emergency-pool `escalate` job
  // is enqueued for every scheduled booking either way.
  //
  // Outstation bookings are always manually assigned (no auto-dispatch).
  // The booking lives in PENDING_ASSIGNMENT until an admin picks a
  // driver from the outstation-assignment queue.
  let shouldDispatchNow = serviceType !== SERVICE_TYPES.OUTSTATION;
  if (
    bookingType === BOOKING_TYPE.SCHEDULED &&
    serviceType === SERVICE_TYPES.HOURLY &&
    booking.hourly?.scheduledStartAt
  ) {
    try {
      const decision = await setupScheduledBooking(booking);
      shouldDispatchNow = decision.immediate;
    } catch (scheduleErr) {
      console.error(
        '[booking] scheduled setup failed — falling back to immediate dispatch:',
        scheduleErr?.message,
      );
      // Best-effort fallback: behave like an instant booking so the
      // user isn't stuck with a booking that never searches.
      shouldDispatchNow = true;
    }
  }

  notifyUserBookingCreated(booking.userId, booking).catch(() => null);
  if (shouldDispatchNow !== false && booking.status === BOOKING_STATUS.SEARCHING) {
    notifyUserDriverSearching(booking.userId, booking).catch(() => null);
  }

  return {
    booking: booking.toObject(),
    reused: false,
    shouldDispatchNow,
  };
}

/* ------------------------------------------------------------------ */
/* Cancel                                                              */
/* ------------------------------------------------------------------ */

export async function cancelBookingByUserService(userId, bookingId, reason = '') {
  const booking = await Booking.findOne({ _id: bookingId, userId, isDeleted: false });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
    throw new ApiError(400, 'This booking is no longer cancellable');
  }
  // Cancellation fee = admin-configured (flat ₹ or % of paid). The fee
  // is then split into a driver share + company share per the
  // `driverSharePercent` knob on the same policy.
  const policy = await loadCancellationPolicy(booking.serviceType);
  const breakdown = computeUserCancellation(booking, policy);
  const {
    feeCharged,
    refundAmount,
    driverShare,
    companyShare,
    tripStarted,
    // Outstation-only — undefined for hourly.
    tier,
    hoursUntilPickup,
  } = breakdown;

  const previouslyAssignedDriver = booking.driverId;
  const wasPaid = booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID;
  const paidViaWallet = booking.paymentMethod === BOOKING_PAYMENT_METHOD.WALLET;

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancellation = {
    reason:
      reason ||
      (tripStarted ? 'cancelled_by_user_after_start' : 'cancelled_by_user'),
    cancelledBy: 'user',
    feeCharged,
    refundAmount,
    driverShare,
    companyShare,
    tier: tier || '',
    hoursUntilPickup:
      typeof hoursUntilPickup === 'number' ? hoursUntilPickup : null,
  };
  booking.timeline.cancelledAt = new Date();
  booking.dispatch.pendingOfferIds = [];
  booking.dispatch.currentExpiresAt = null;

  // Wallet-paid bookings refund instantly into the wallet — no admin
  // intervention needed. Razorpay-paid (legacy) bookings continue to
  // write a Refund ledger entry for the admin to process by hand.
  if (wasPaid && paidViaWallet && refundAmount > 0) {
    booking.paymentStatus = BOOKING_PAYMENT_STATUS.REFUNDED;
  }
  // Release the waiting-buffer hold (if any). The buffer was reserved
  // at booking creation against `wallet.heldRupees`; a cancel means it
  // never gets used, so the whole hold goes back to spendable.
  await releaseBookingBufferHold(booking);
  // And sweep any pending extension intent (OTP unverified / unpaid)
  // — the booking is gone, the driver banner must go too.
  await clearPendingExtensionsOnTerminate(booking, 'user_cancelled');
  await booking.save();

  // Stop any pay-deadline timer and release the assigned driver so the
  // dispatcher can hand them a new offer immediately. Post-STARTED
  // cancels also free the driver — they're done with this trip even
  // though they collected a (penalised) fare share elsewhere.
  cancelPaymentTimeout(bookingId);
  cancelNoShowSchedule(bookingId);
  // Scheduled-ride safety: drop any BullMQ jobs (assign / escalate /
  // reminders) so a cancelled booking never wakes back up.
  cancelScheduledBookingJobs(bookingId).catch(() => {});
  await releaseDriverFromBooking(previouslyAssignedDriver);

  let refundRecord = null;
  if (wasPaid && refundAmount > 0) {
    if (paidViaWallet) {
      // Credit the wallet right now (atomic + ledgered).
      try {
        await creditWalletService({
          userId: booking.userId,
          amount: refundAmount,
          source: WALLET_TXN_SOURCE.BOOKING_REFUND,
          description: `Refund \u2014 booking ${booking.bookingNumber} cancelled (fee \u20B9${feeCharged})`,
          refType: 'Booking',
          refId: String(booking._id),
        });
      } catch (refundErr) {
        console.error(
          '[booking] failed to credit wallet refund for booking',
          String(booking._id),
          refundErr?.message,
        );
      }
    } else {
      // Legacy Razorpay path — admin processes manually.
      refundRecord = await issueBookingRefundService(booking, {
        initiatedBy: REFUND_INITIATED_BY.USER,
        reason: booking.cancellation.reason,
        breakdown: {
          amountRupees: refundAmount,
          cancellationFeeRupees: feeCharged,
          grossPaidRupees: Number(booking.payment?.amountPaidRupees) || 0,
        },
      });
    }
  }

  // Distribute the cancellation fee: the driver who was mobilised gets
  // `driverShare` straight into their wallet, the platform books
  // `companyShare` as revenue. Both writes are best-effort — a failure
  // here logs but does not roll back the cancellation itself.
  if (feeCharged > 0) {
    if (previouslyAssignedDriver && driverShare > 0) {
      try {
        await Driver.updateOne(
          { _id: previouslyAssignedDriver },
          {
            $inc: {
              'wallet.balance': driverShare,
              'wallet.totalEarnings': driverShare,
            },
          },
        );
      } catch (driverCreditErr) {
        console.error(
          '[booking] failed to credit driver wallet for cancellation share',
          String(booking._id),
          driverCreditErr?.message,
        );
      }
    }
    if (companyShare > 0) {
      try {
        await recordPlatformRevenue({
          source: PLATFORM_REVENUE_SOURCE.CANCELLATION_FEE,
          amountRupees: companyShare,
          bookingId: booking._id,
          bookingNumber: booking.bookingNumber || '',
          serviceType: booking.serviceType || '',
          userId: booking.userId,
          driverId: previouslyAssignedDriver || null,
          meta: {
            feeCharged,
            driverShare,
            companyShare,
            arrivedFeeType: policy?.arrivedFeeType || 'flat',
            arrivedFeeAmount: policy?.arrivedFeeAmount || 0,
            driverSharePercent: policy?.driverSharePercent || 0,
            cancelledAtStatus: booking.cancellation?.reason || '',
          },
        });
      } catch (revenueErr) {
        console.error(
          '[booking] failed to log platform revenue for cancellation',
          String(booking._id),
          revenueErr?.message,
        );
      }
    }
  }

  // Broadcast so the driver page can clear itself in real-time and the
  // admin dashboard sees the cancellation immediately.
  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    cancellation: booking.cancellation?.toObject?.() || booking.cancellation,
    timeline: booking.timeline?.toObject?.() || booking.timeline,
    refund: refundRecord
      ? {
          status: refundRecord.status,
          amountRupees: refundRecord.amountRupees,
          cancellationFeeRupees: refundRecord.cancellationFeeRupees,
        }
      : null,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
  if (previouslyAssignedDriver) {
    emitToDriver(previouslyAssignedDriver, S2C_EVENTS.BOOKING_UPDATED, payload);
  }
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);

  return booking.toObject();
}

export async function adminMarkNoDriversFoundService(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  const wasPaid = booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID;
  const paidViaWallet = booking.paymentMethod === BOOKING_PAYMENT_METHOD.WALLET;

  // Scheduled rides never auto-cancel into NO_DRIVERS_FOUND — they get
  // routed to the emergency pool instead so a human can assign someone.
  // Refund + cleanup only runs for instant bookings (which the user
  // would otherwise be left waiting on indefinitely).
  if (booking.bookingType === BOOKING_TYPE.SCHEDULED) {
    const { escalateToEmergencyPool } = await import('./bookingEmergencyPool.service.js');
    await escalateToEmergencyPool(booking._id);
    return (await Booking.findById(booking._id)).toObject();
  }
  cancelScheduledBookingJobs(bookingId).catch(() => {});

  // When no driver was found (typical after a driver bailed mid-flight),
  // we don't apply a cancellation fee — the customer didn't choose to
  // cancel. Full refund of whatever they paid.
  const refundAmount = wasPaid
    ? Math.max(0, Math.round((Number(booking.payment?.amountPaidRupees) || 0) * 100) / 100)
    : 0;

  booking.status = BOOKING_STATUS.NO_DRIVERS_FOUND;
  booking.timeline.cancelledAt = new Date();
  booking.dispatch.pendingOfferIds = [];
  booking.dispatch.currentExpiresAt = null;
  booking.cancellation = {
    reason: 'no_drivers_available',
    cancelledBy: 'system',
    feeCharged: 0,
    refundAmount,
  };
  if (wasPaid && paidViaWallet && refundAmount > 0) {
    booking.paymentStatus = BOOKING_PAYMENT_STATUS.REFUNDED;
  }
  // No-driver-found terminates the booking — release any reserved
  // waiting buffer back into the user's spendable wallet.
  await releaseBookingBufferHold(booking);
  // (Defensive — extensions only exist post-STARTED, but the
  // earlier-stage helper is idempotent and protects us against
  // future flow changes.)
  await clearPendingExtensionsOnTerminate(booking, 'no_drivers_found');
  await booking.save();

  if (wasPaid && refundAmount > 0) {
    if (paidViaWallet) {
      try {
        await creditWalletService({
          userId: booking.userId,
          amount: refundAmount,
          source: WALLET_TXN_SOURCE.BOOKING_NO_DRIVERS_REFUND,
          description: `Refund \u2014 no drivers available for ${booking.bookingNumber}`,
          refType: 'Booking',
          refId: String(booking._id),
        });
      } catch (refundErr) {
        console.error(
          '[booking] failed to credit wallet for no-drivers refund',
          String(booking._id),
          refundErr?.message,
        );
      }
    } else {
      // Legacy Razorpay refund — recorded for admin to process by hand.
      await issueBookingRefundService(booking, {
        initiatedBy: REFUND_INITIATED_BY.SYSTEM,
        reason: 'no_drivers_available',
        breakdown: {
          amountRupees: refundAmount,
          cancellationFeeRupees: 0,
          grossPaidRupees: refundAmount,
        },
      });
    }
  }

  return booking.toObject();
}

/* ------------------------------------------------------------------ */
/* (Legacy payment-mode + abort-prepay flows removed)                  */
/*                                                                     */
/* The booking now flips to AWAITING_PAYMENT directly in               */
/* `acceptBookingService`. There is no pay-later option and no         */
/* prepay-discount window; the user pays the full fare upfront via the */
/* /pay endpoint or cancels.                                           */
/* ------------------------------------------------------------------ */

export async function listAdminBookingsService(query = {}) {
  const {
    page = 1,
    limit = 20,
    search,
    status,
    bookingType,
    serviceType,
    paymentStatus,
    from,
    to,
  } = query;
  const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

  const filter = { isDeleted: false };
  if (status) filter.status = status;
  if (bookingType) filter.bookingType = bookingType;
  if (serviceType) filter.serviceType = serviceType;
  if (paymentStatus) filter.paymentStatus = paymentStatus;

  // Date range over createdAt — admins typically want "show me bookings
  // created on date X" rather than "scheduled for X" because the latter
  // is null for instant bookings.
  if (from || to) {
    filter.createdAt = {};
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate && !Number.isNaN(fromDate.getTime())) {
      filter.createdAt.$gte = fromDate;
    }
    if (toDate && !Number.isNaN(toDate.getTime())) {
      // Treat `to` as inclusive of the end-of-day.
      toDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = toDate;
    }
    if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
  }

  if (search) {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(search);
    if (isObjectId) {
      filter._id = search;
    } else {
      filter.bookingNumber = { $regex: search, $options: 'i' };
    }
  }

  // Aggregate true stats for the dashboard across all bookings (ignoring current page filters)
  const statsPromise = Booking.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const [bookings, total, statsRaw] = await Promise.all([
    Booking.find(filter)
      .populate('userId', 'name phone_no email')
      .populate('driverId', 'name phone_no email')
      .populate('zoneIds', 'name code city')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean(),
    Booking.countDocuments(filter),
    statsPromise,
  ]);

  const statusCounts = statsRaw.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});

  const stats = {
    total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    searching: statusCounts[BOOKING_STATUS.SEARCHING] || 0,
    active:
      (statusCounts[BOOKING_STATUS.DRIVER_ASSIGNED] || 0) +
      (statusCounts[BOOKING_STATUS.EN_ROUTE] || 0) +
      (statusCounts[BOOKING_STATUS.ARRIVED] || 0) +
      (statusCounts[BOOKING_STATUS.STARTED] || 0),
    completed: statusCounts[BOOKING_STATUS.COMPLETED] || 0,
    cancelled: statusCounts[BOOKING_STATUS.CANCELLED] || 0,
  };

  return { bookings, total, page: parseInt(page, 10), pages: Math.ceil(total / limit), stats };
}
