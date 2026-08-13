import Booking, { BOOKING_PAYMENT_METHOD } from '../models/booking.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import ServicePricing from '../models/servicePricing.model.js';
import { ApiError } from '../utils/apiError.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { withdrawCurrentOfferService } from './bookingDispatch.service.js';
import {
  schedulePromptTimer,
  cancelNoShowSchedule,
} from './bookingNoShowTimeout.service.js';
import {
  scheduleRideEndTimer,
  cancelRideEndSchedule,
} from './bookingRideEndTimeout.service.js';
import {
  scheduleOutstationReturnJobs,
  cancelOutstationReturnJobs,
  snapshotOutstationReturnConfig,
} from './bookingOutstationReturn.service.js';
import {
  BOOKING_STATUS,
  BOOKING_TYPE,
  ACTIVE_BOOKING_STATUSES,
  PAYMENT_MODE,
  BOOKING_PAYMENT_STATUS,
  PAYMENT_POLICY,
  DISPATCH,
  DISPATCH_RESPONSE,
  SCHEDULED_BOOKING,
} from '../constants/bookingStatus.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToUser,
  emitToBooking,
  emitToAdmins,
  emitToDriver,
} from '../utils/socketEmitters.js';
import {
  notifyUserDriverArrived,
  notifyUserTripStarted,
  notifyUserTripCompleted,
  notifyDriverEarningsCredited,
} from '../utils/notificationDispatch.js';
import { isTestOtp } from '../utils/otpService.js';
import { resolveBookingSearchStartAt } from '../utils/bookingInbox.js';
import { cancelPaymentTimeout } from './bookingPaymentTimeout.service.js';
import { cancelScheduledBookingJobs } from './bookingScheduled.service.js';
import {
  loadCancellationPolicy,
  computeDriverCancellation,
  computeUserCancellation,
  evaluateDriverCancelChance,
  todayKey,
} from './bookingCancellation.service.js';
import {
  issueBookingRefundService,
  REFUND_INITIATED_BY,
  REFUND_PAYOUT_METHOD,
} from './refund.service.js';
import { dispatchNextDriverService } from './bookingDispatch.service.js';
import { driverEarningFromFareSnapshot } from './booking.service.js';
import {
  recordPlatformRevenue,
  recordCompletedTripPlatformRevenue,
  PLATFORM_REVENUE_SOURCE,
} from './platformRevenue.service.js';
import {
  settleWaitingBuffer,
  releaseBookingBufferHold,
  clearPendingExtensionsOnTerminate,
  settleDriverEarning,
} from './bookingExtension.service.js';
import { incrementCouponUsageService } from './coupon.service.js';
import { creditWalletService } from './wallet.service.js';
import { WALLET_TXN_SOURCE } from '../models/walletTransaction.model.js';

/**
 * Generate a numeric OTP of the configured length. We zero-pad so codes that
 * happen to start with a 0 still render as N digits on the client (e.g.
 * "0381" not "381" — important for a fixed-width PIN input).
 */
function generateRideOtp() {
  const len = PAYMENT_POLICY.RIDE_OTP_LENGTH;
  const max = 10 ** len;
  const n = Math.floor(Math.random() * max);
  return String(n).padStart(len, '0');
}

/**
 * Trip-execution state transitions.
 *
 * Owns every status change that happens AFTER the dispatcher has paired a
 * driver with a booking. Splitting this from `booking.service.js` keeps the
 * dispatching concerns (wave search, offer/accept/reject) cleanly apart from
 * the trip-lifecycle concerns (heading to pickup → arrived → started →
 * completed → cancelled-by-driver).
 *
 * State diagram (this file's responsibility):
 *
 *   driver_assigned ─┐
 *                    ├─► en_route ─► arrived ─► started ─► completed
 *   (after payment)  │                                          │
 *                    │                                          ▼
 *                    └─► cancelled_by_driver  (allowed until ARRIVED)
 *
 * Every successful transition broadcasts `BOOKING_UPDATED` on the user, the
 * booking room, the driver and admins — the same fan-out shape the rest of
 * the lifecycle uses, so frontend consumers don't need to special-case any
 * event.
 */

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const STATUSES_DRIVER_CAN_CANCEL = Object.freeze([
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  // STARTED is allowed too — the driver pays the admin-configured
  // penalty (see computeDriverCancellation) instead of being blocked.
  BOOKING_STATUS.STARTED,
]);

/**
 * Look up the booking that belongs to `driverId` and verify the driver is
 * authorised to act on it. The same guard is used by every transition below.
 *
 * Populates `userId` (basic customer profile) and `carId` (vehicle the
 * driver is meeting) so the sanitized booking returned by each transition
 * controller keeps the same shape as the initial `GET /driver/bookings/:id`
 * fetch — otherwise the active-trip page would lose customer/car details
 * after the first transition (e.g. "Start trip") because the store would
 * be replaced with a stub that has bare ObjectIds instead of populated
 * docs.
 */
async function loadDriverBooking(driverId, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false })
    .populate('userId', 'name phone_no email profilePicture createdAt')
    .populate({
      path: 'carId',
      select:
        'vehicleNumber transmission image carTypeId brandId modelId fuelTypeId',
      populate: [
        { path: 'carTypeId', select: 'name' },
        { path: 'brandId', select: 'name' },
        { path: 'modelId', select: 'name' },
        { path: 'fuelTypeId', select: 'name' },
      ],
    });
  if (!booking) throw new ApiError(404, 'Booking not found');
  // `driverId` is left as a raw ObjectId here — the auth check below
  // and every transition's mutate-and-save flow expect that. The
  // driver's own profile isn't needed in the response (the FE has it
  // from `useDriverAuthStore`).
  if (!booking.driverId || String(booking.driverId) !== String(driverId)) {
    throw new ApiError(403, 'You are not assigned to this booking');
  }
  return booking;
}

/**
 * Build the patch we broadcast on every transition.
 *
 * We deliberately keep this payload narrow: a UI consumer only needs to
 * know "what changed" — the full booking can always be refetched. The
 * shape mirrors what `applyUpdate` in the user/driver active-booking
 * stores already merges, so no client-side changes are needed when we
 * add new transitions.
 *
 * A payload is requested per-audience:
 *   - 'user'    → includes the OTP code (the customer reads it out to the
 *                 driver).
 *   - 'driver'  → strips the OTP code and substitutes `otpRequired: true`.
 *                 We never trust the driver app with the code itself.
 *   - 'room'    → same as driver (admins watching the booking shouldn't
 *                 leak the OTP to anyone tailing the room).
 */
function buildUpdatePayload(booking, audience = 'room') {
  // `driverId` is normally a raw ObjectId here, but loadDriverBooking
  // (and a few other callers) sometimes hand us a populated Mongoose
  // doc. Stringify the `_id` so the wire payload is always a plain id
  // string the FE store can compare against its own populated object.
  const driverIdValue = booking.driverId
    ? String(booking.driverId._id || booking.driverId)
    : null;
  const base = {
    bookingId: String(booking._id),
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    paymentMode: booking.paymentMode,
    driverId: driverIdValue,
    timeline: booking.timeline ? booking.timeline.toObject?.() || booking.timeline : null,
    cancellation: booking.cancellation
      ? booking.cancellation.toObject?.() || booking.cancellation
      : null,
  };

  if (booking.rideStartOtp?.code) {
    if (audience === 'user') {
      base.rideStartOtp = {
        code: booking.rideStartOtp.code,
        generatedAt: booking.rideStartOtp.generatedAt,
        verifiedAt: booking.rideStartOtp.verifiedAt,
      };
    } else {
      base.otpRequired = !booking.rideStartOtp.verifiedAt;
    }
  }
  return base;
}

function broadcastUpdate(booking) {
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, buildUpdatePayload(booking, 'user'));
  if (booking.driverId) {
    emitToDriver(
      booking.driverId,
      S2C_EVENTS.BOOKING_UPDATED,
      buildUpdatePayload(booking, 'driver'),
    );
  }
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, buildUpdatePayload(booking, 'room'));
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, buildUpdatePayload(booking, 'room'));
}

/**
 * Enforce a small whitelist of allowed source statuses for a transition.
 * Throws a 409 (conflict) so the client knows this was a stale action
 * rather than a permission issue.
 */
function assertStatus(booking, allowed, label) {
  if (!allowed.includes(booking.status)) {
    throw new ApiError(
      409,
      `Cannot ${label} while booking is "${booking.status}"`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Transitions                                                         */
/* ------------------------------------------------------------------ */

/**
 * Resolve the per-service `RIDE_BUFFER_MINUTES` override (admin-tunable
 * via the pricing modal) that defines the "you can start heading to
 * pickup now" window for scheduled rides. Falls back to the
 * platform-wide constant when pricing isn't configured. Best-effort —
 * any DB error degrades to the default.
 */
async function resolveEnRouteLeadMinutes(serviceType) {
  if (!serviceType) return SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
  try {
    const pricing = await ServicePricing.findOne({ serviceType })
      .select('scheduledDispatch')
      .lean();
    const value = Number(pricing?.scheduledDispatch?.RIDE_BUFFER_MINUTES);
    if (Number.isFinite(value) && value >= 0) return value;
  } catch {
    // fall through to default
  }
  return SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
}

/**
 * Authoritative "are we close enough to pickup time?" guard for
 * **Start to pickup** (en_route) on scheduled / outstation bookings.
 * Drivers may head out once pickup is within `RIDE_BUFFER_MINUTES`
 * (default 2h). Callers must skip this for instant rides — their
 * `scheduledStartAt` (+15m dispatch seed) is not an en-route gate.
 *
 * Arrival / start use the stricter `assertScheduledStartReached`
 * instead — billing must not begin before the customer's booked time.
 */
async function assertWithinScheduledLead(booking, verb) {
  const pickupDate = resolveBookingSearchStartAt(booking);
  const startMs = pickupDate ? pickupDate.getTime() : NaN;
  if (!Number.isFinite(startMs)) return;
  const leadMinutes = await resolveEnRouteLeadMinutes(booking.serviceType);
  const minutesAway = Math.ceil((startMs - Date.now()) / 60_000);
  if (minutesAway > leadMinutes) {
    const pickupAt = new Date(startMs);
    throw new ApiError(
      409,
      `Pickup is scheduled for ${pickupAt.toLocaleString()} — you can ${verb} within ${leadMinutes} min of that time (still ${minutesAway} min away).`,
      {
        scheduledStartAt: pickupAt.toISOString(),
        minutesUntilPickup: minutesAway,
        leadMinutes,
      },
    );
  }
}

/**
 * Hard floor for arrival + ride start on **scheduled / outstation** trips:
 * the customer's booked pickup (`hourly.scheduledStartAt` or
 * `outstation.pickupAt`) must have been reached. Heading out early is fine;
 * locking ARRIVED / STARTED early would start wait timers and bill before
 * the trip window the customer paid for.
 *
 * Instant arrivals/starts skip this at the call site — arrival uses the
 * 100 m proximity guard only; start uses OTP only (their +15m
 * scheduledStartAt is a dispatch seed, not a hard floor).
 */
function assertScheduledStartReached(booking, verb) {
  const pickupDate = resolveBookingSearchStartAt(booking);
  const startMs = pickupDate ? pickupDate.getTime() : NaN;
  if (!Number.isFinite(startMs)) return;
  const remainingMs = startMs - Date.now();
  if (remainingMs <= 0) return;
  const minutesAway = Math.max(1, Math.ceil(remainingMs / 60_000));
  const pickupAt = new Date(startMs);
  throw new ApiError(
    409,
    `Pickup is scheduled for ${pickupAt.toLocaleString()} — you can ${verb} at that time (still ${minutesAway} min away).`,
    {
      scheduledStartAt: pickupAt.toISOString(),
      minutesUntilPickup: minutesAway,
      leadMinutes: 0,
    },
  );
}

/**
 * driver_assigned → en_route
 *
 * Driver tells us "I've started heading to the pickup". We block this
 * transition while a pre-pay booking is still `awaiting_payment` — there's
 * no point driving to a pickup the customer hasn't paid for yet.
 *
 * For SCHEDULED bookings the tap is also gated on time-of-day: drivers
 * can only flip into EN_ROUTE once pickup is within `RIDE_BUFFER_MINUTES`
 * of now. Tapping earlier would lock them out of every other dispatch
 * wave (the radius search filters on `isOnTrip = false`) for hours or
 * days while still doing nothing physically — exactly the dispatch
 * dead-zone bug we hit when a driver tapped "Start to pickup" 24 days
 * before pickup. The guard mirrors `shouldImmediatelyLockDriver` in the
 * dispatcher so accept-time and start-time both honour the same window.
 */
export async function markDriverEnRouteService(driverId, bookingId) {
  const booking = await loadDriverBooking(driverId, bookingId);
  assertStatus(booking, [BOOKING_STATUS.DRIVER_ASSIGNED], 'start the trip');

  if (
    booking.paymentMode === PAYMENT_MODE.PRE_RIDE &&
    booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID
  ) {
    throw new ApiError(
      409,
      'Customer has chosen Pay Now but has not paid yet — wait for confirmation',
    );
  }

  // Time gate — scheduled/outstation only. Instant rides keep a +15m
  // scheduledStartAt as a dispatch seed; drivers must be able to head
  // to pickup immediately after accept.
  if (
    booking.bookingType === BOOKING_TYPE.SCHEDULED ||
    booking.bookingType === BOOKING_TYPE.OUTSTATION
  ) {
    await assertWithinScheduledLead(booking, 'head out');
  }

  booking.status = BOOKING_STATUS.EN_ROUTE;
  booking.timeline.enRouteAt = new Date();
  await booking.save();

  // Scheduled bookings deliberately leave `isOnTrip` false at accept
  // time so the driver can keep receiving non-overlapping offers
  // until pickup is close. Once they tap "On the way" they're
  // physically committed — flip the flag now so the dispatcher stops
  // offering anything else, regardless of buffer maths.
  Driver.updateOne({ _id: driverId }, { $set: { isOnTrip: true } }).catch((err) =>
    console.warn(
      '[bookingTrip] failed to set driver.isOnTrip on en-route:',
      err?.message,
    ),
  );

  broadcastUpdate(booking);
  return booking.toObject();
}

/**
 * Maximum distance (metres) between the driver's reported location and
 * the booking pickup at which we accept an "I have arrived" tap. Keeps
 * drivers honest — they can't flip the booking to ARRIVED from across
 * town to harvest the post-arrival cancellation fee. Tuned generously
 * enough to swallow GPS jitter on phones with a fix.
 */
export const ARRIVAL_PROXIMITY_METERS = 100;

const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance in metres between two `{ lat, lng }` points. Lives
 * here to keep the trip service self-contained — the FE has its own
 * mirror in `utils/geo.js`.
 */
function haversineMeters(a, b) {
  if (
    !a ||
    !b ||
    typeof a.lat !== 'number' ||
    typeof a.lng !== 'number' ||
    typeof b.lat !== 'number' ||
    typeof b.lng !== 'number'
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * en_route → arrived
 *
 * Generates a fresh ride-start OTP at the same time and emits it to the user
 * only. The driver simultaneously receives `otpRequired: true` so their UI
 * swaps the Start CTA for an OTP input. Regenerating on every arrival means
 * a flaky network won't leave a stale code lying around.
 *
 * Proximity guard: the driver must report a location within
 * `ARRIVAL_PROXIMITY_METERS` of the pickup. The FE also disables the
 * CTA outside the radius; this is the server-side enforcement so a
 * scripted request can't bypass it.
 */
export async function markDriverArrivedService(driverId, bookingId, { driverCoords } = {}) {
  const booking = await loadDriverBooking(driverId, bookingId);
  assertStatus(booking, [BOOKING_STATUS.EN_ROUTE], 'mark arrival');

  // Scheduled / outstation: arrival may only lock in at/after the booked
  // pickup time (even though en-route was allowed up to RIDE_BUFFER early).
  // Instant: skip the time floor — the +15m scheduledStartAt seed is a
  // dispatch buffer, not a hard gate; proximity below is the only check.
  if (
    booking.bookingType === BOOKING_TYPE.SCHEDULED ||
    booking.bookingType === BOOKING_TYPE.OUTSTATION
  ) {
    assertScheduledStartReached(booking, 'mark arrival');
  }

  const pickupCoords = (() => {
    const c = booking.pickup?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  })();

  if (!pickupCoords) {
    throw new ApiError(500, 'Pickup coordinates missing from booking');
  }
  if (
    !driverCoords ||
    typeof driverCoords.lat !== 'number' ||
    typeof driverCoords.lng !== 'number'
  ) {
    throw new ApiError(
      400,
      'Driver location is required to mark arrival — enable location and try again',
    );
  }

  const distance = haversineMeters(driverCoords, pickupCoords);
  if (distance > ARRIVAL_PROXIMITY_METERS) {
    throw new ApiError(
      409,
      `You're too far from the pickup (${Math.round(distance)} m). Move within ${ARRIVAL_PROXIMITY_METERS} m to mark arrival.`,
      { distanceMeters: Math.round(distance), maxDistanceMeters: ARRIVAL_PROXIMITY_METERS },
    );
  }

  const arrivedAt = new Date();
  booking.status = BOOKING_STATUS.ARRIVED;
  booking.timeline.arrivedAt = arrivedAt;
  booking.rideStartOtp = {
    code: generateRideOtp(),
    generatedAt: arrivedAt,
    verifiedAt: null,
    attempts: 0,
  };
  // Reset any prior no-show state — every fresh ARRIVED transition
  // starts a clean window. (Possible if the booking was bounced
  // back via re-dispatch.)
  booking.noShow = {
    promptSentAt: null,
    promptDeadlineAt: null,
    customerResponse: '',
    respondedAt: null,
    firedFor: 0,
  };
  // Snapshot the active waiting-charge policy so the live driver UI
  // can render a "free wait 15:00 → ₹2/min after" ticker without
  // having to fetch pricing separately. The actual `chargeRupees`
  // stays 0 until Start; these knobs just communicate the policy.
  try {
    const pricing = await ServicePricing.findOne({
      serviceType: booking.serviceType,
      isActive: true,
    })
      .select('waitingCharge')
      .lean();
    booking.waiting = booking.waiting || {};
    Object.assign(booking.waiting, {
      waitedMinutes: 0,
      billableMinutes: 0,
      chargeRupees: 0,
      freeMinutes: Math.max(
        0,
        Number(pricing?.waitingCharge?.freeWaitingMinutes) || 0,
      ),
      perMinuteRupees: Math.max(
        0,
        Number(pricing?.waitingCharge?.chargePerMinute) || 0,
      ),
      noShow: false,
    });
  } catch (err) {
    console.warn(
      '[bookingTrip] waiting policy snapshot on arrival failed:',
      err?.message,
    );
  }
  await booking.save();

  // Hourly only: outstation stuck-at-OTP cases go to admin settlement
  // instead of the free-wait → prompt → auto-complete path.
  if (booking.serviceType !== SERVICE_TYPES.OUTSTATION) {
    schedulePromptTimer(booking._id, arrivedAt).catch((err) =>
      console.warn('[bookingTrip] no-show schedule failed:', err?.message),
    );
  }

  broadcastUpdate(booking);
  notifyUserDriverArrived(booking.userId, booking).catch(() => null);
  return booking.toObject();
}

/**
 * arrived → started
 *
 * Customer reads out the OTP they were shown when the driver hit Arrived;
 * the driver types it back. We bail (without changing the status) if the
 * code doesn't match. After RIDE_OTP_MAX_ATTEMPTS we still allow further
 * attempts but flag the booking so admins can intervene — the booking
 * itself is never auto-cancelled by OTP failures.
 */
export async function startTripService(driverId, bookingId, { otp } = {}) {
  const booking = await loadDriverBooking(driverId, bookingId);
  assertStatus(booking, [BOOKING_STATUS.ARRIVED], 'start the ride');

  // Scheduled / outstation: billing clock must not start before pickup.
  // Instant skips — OTP + arrival proximity are the only gates.
  if (
    booking.bookingType === BOOKING_TYPE.SCHEDULED ||
    booking.bookingType === BOOKING_TYPE.OUTSTATION
  ) {
    assertScheduledStartReached(booking, 'start the ride');
  }

  const expected = booking.rideStartOtp?.code;
  if (!expected) {
    throw new ApiError(
      409,
      'No start OTP has been generated yet — mark arrival first',
    );
  }

  const submitted = String(otp || '').trim();
  if (!submitted) {
    throw new ApiError(400, 'OTP is required to start the ride');
  }
  if (submitted !== String(expected) && !isTestOtp(submitted)) {
    booking.rideStartOtp.attempts = (booking.rideStartOtp.attempts || 0) + 1;
    await booking.save();
    const tooMany =
      booking.rideStartOtp.attempts >= PAYMENT_POLICY.RIDE_OTP_MAX_ATTEMPTS;
    throw new ApiError(
      400,
      tooMany
        ? 'OTP entered incorrectly too many times — please confirm with the customer'
        : 'Incorrect OTP',
    );
  }

  const startedAt = new Date();
  booking.status = BOOKING_STATUS.STARTED;
  booking.timeline.startedAt = startedAt;
  booking.rideStartOtp.verifiedAt = startedAt;

  // Compute the waiting charge accrued between ARRIVED → STARTED so
  // completion has the final number to add to the customer's bill.
  // Best-effort: a missing pricing config just leaves waiting at 0.
  await applyWaitingChargeOnStart(booking, startedAt);

  // Once the trip has actually started, no-show flow is no longer
  // relevant. Clear any pending prompt deadline so the scheduler
  // doesn't auto-complete a ride that's now in progress.
  cancelNoShowSchedule(booking._id);
  if (booking.noShow) {
    booking.noShow.promptDeadlineAt = null;
  }

  await booking.save();

  // Hourly / scheduled-hourly: auto-complete when the booked window
  // (plus any later accepted extensions) elapses without a further
  // extension. Outstation is day-based and is not auto-closed here.
  scheduleRideEndTimer(booking);

  // Outstation: arm return-approaching / return-reached jobs.
  if (
    booking.serviceType === SERVICE_TYPES.OUTSTATION
    || booking.bookingType === BOOKING_TYPE.OUTSTATION
  ) {
    const pricing = await ServicePricing.findOne({
      serviceType: SERVICE_TYPES.OUTSTATION,
      isActive: true,
    })
      .select('outstation')
      .lean();
    snapshotOutstationReturnConfig(booking, pricing?.outstation);
    await booking.save();
    scheduleOutstationReturnJobs(booking).catch((err) =>
      console.warn(
        '[trip] failed to schedule outstation return jobs:',
        err?.message,
      ),
    );
  }

  broadcastUpdate(booking);
  notifyUserTripStarted(booking.userId, booking).catch(() => null);
  return booking.toObject();
}

/**
 * Snapshot the waiting charge onto `booking.waiting` based on how long
 * the driver waited at pickup. Uses the admin-configured
 * `waitingCharge.{freeWaitingMinutes, chargePerMinute}` policy.
 *
 * The math:
 *   waitedMinutes   = (startedAt − arrivedAt) in minutes
 *   billableMinutes = max(0, waitedMinutes − freeWaitingMinutes)
 *   chargeRupees    = billableMinutes × chargePerMinute
 *
 * The function is async because it has to look up the pricing doc;
 * the result is stamped on the booking POJO. Callers should `save()`
 * the booking afterwards.
 *
 * `flags.noShow` lets the no-show auto-complete path mark the row so
 * the audit knows this wait was unilateral.
 */
async function applyWaitingChargeOnStart(booking, startedAt, flags = {}) {
  const arrivedAt = booking.timeline?.arrivedAt;
  if (!arrivedAt) {
    booking.waiting = booking.waiting || {};
    Object.assign(booking.waiting, {
      waitedMinutes: 0,
      billableMinutes: 0,
      chargeRupees: 0,
      // Don't wipe the buffer snapshot — we still need `bufferRupees`
      // for settlement at trip-end. Only clear the per-charge counters.
      noShow: !!flags.noShow,
    });
    return;
  }
  // Prefer the policy snapshotted onto the booking at creation. Fall
  // back to live pricing only for legacy bookings created before the
  // snapshot landed (those won't have `perMinuteRupees` filled in).
  const snapshot = booking.waiting || {};
  let freeMinutes = Number(snapshot.freeMinutes);
  let perMinute = Number(snapshot.perMinuteRupees);
  const maxBillable = Number(snapshot.maxBillableMinutes) || 0;
  if (!Number.isFinite(freeMinutes) || !Number.isFinite(perMinute)) {
    try {
      const pricing = await ServicePricing.findOne({
        serviceType: booking.serviceType,
        isActive: true,
      }).lean();
      freeMinutes = Math.max(
        0,
        Number(pricing?.waitingCharge?.freeWaitingMinutes) || 0,
      );
      perMinute = Math.max(
        0,
        Number(pricing?.waitingCharge?.chargePerMinute) || 0,
      );
    } catch (err) {
      console.warn('[bookingTrip] waiting-charge pricing lookup failed:', err?.message);
      freeMinutes = 0;
      perMinute = 0;
    }
  }
  freeMinutes = Math.max(0, freeMinutes || 0);
  perMinute = Math.max(0, perMinute || 0);

  // Compute billable in raw milliseconds first, then convert. Doing
  // `Math.ceil(waitedMs / 60000)` BEFORE subtracting the free window
  // was the old behaviour and it bit us: a driver who started within
  // the free wait (say 10s into a 30s free window) saw `waitedMinutes
  // = 1`, billable = 1 − 0.5 = 0.5, and was billed for 30s of "wait"
  // that never happened. We now only bill the strictly post-free
  // duration.
  const waitedMs = Math.max(0, startedAt.getTime() - new Date(arrivedAt).getTime());
  const waitedMinutes = Math.round((waitedMs / 60000) * 100) / 100;
  const freeMs = Math.max(0, freeMinutes) * 60000;
  const billableMs = Math.max(0, waitedMs - freeMs);
  let billableMinutes = billableMs / 60000;
  if (maxBillable > 0) billableMinutes = Math.min(billableMinutes, maxBillable);
  billableMinutes = Math.round(billableMinutes * 100) / 100;
  const chargeRupees = Math.round(billableMinutes * perMinute * 100) / 100;

  booking.waiting = booking.waiting || {};
  Object.assign(booking.waiting, {
    waitedMinutes,
    billableMinutes,
    chargeRupees,
    freeMinutes,
    perMinuteRupees: perMinute,
    noShow: !!flags.noShow,
  });
}

/**
 * started → completed
 *
 * Ride is done. Also flips the driver's `isOnTrip` flag so the next
 * dispatch wave can offer them new work, and bumps a `pay-after-ride`
 * booking's payment status to `pending` so the user app knows to surface
 * the post-ride payment flow.
 */
/**
 * Booked ride length in ms for hourly trips (base hours + accepted
 * extensions). Returns 0 for outstation — that path uses
 * {@link earliestCompleteAtMs} against the calendar return instead.
 */
function bookedDurationMs(booking) {
  if (
    booking?.serviceType === SERVICE_TYPES.OUTSTATION
    || booking?.bookingType === BOOKING_TYPE.OUTSTATION
  ) {
    return 0;
  }
  const base = Number(booking?.hourly?.durationHours) || 0;
  if (base <= 0) return 0;
  const extra = (booking?.extensions || []).reduce(
    (sum, ext) =>
      sum + (ext?.status === 'accepted' ? Number(ext.additionalHours) || 0 : 0),
    0,
  );
  return (base + extra) * 3_600_000;
}

/**
 * Earliest wall-clock instant the driver may mark COMPLETED.
 *   - Hourly: startedAt + booked hours (+ paid extensions)
 *   - Outstation: null — early completion is allowed any time after STARTED
 *     (no unused-time refund in V1)
 */
function earliestCompleteAtMs(booking) {
  if (!booking) return null;

  const isOutstation =
    booking.serviceType === SERVICE_TYPES.OUTSTATION
    || booking.bookingType === BOOKING_TYPE.OUTSTATION;

  if (isOutstation) {
    return null;
  }

  const startedAtMs = booking.timeline?.startedAt
    ? new Date(booking.timeline.startedAt).getTime()
    : NaN;
  const durationMs = bookedDurationMs(booking);
  if (!Number.isFinite(startedAtMs) || durationMs <= 0) return null;
  return startedAtMs + durationMs;
}

export async function completeTripService(driverId, bookingId) {
  const booking = await loadDriverBooking(driverId, bookingId);
  assertStatus(booking, [BOOKING_STATUS.STARTED], 'complete the ride');

  // Do not allow completing before the booked window ends (hourly only).
  // Outstation allows early completion once STARTED.
  const earliestCompleteMs = earliestCompleteAtMs(booking);
  if (earliestCompleteMs != null) {
    const remainingMs = earliestCompleteMs - Date.now();
    if (remainingMs > 0) {
      const remainingMin = Math.max(1, Math.ceil(remainingMs / 60_000));
      const isOutstation =
        booking.serviceType === SERVICE_TYPES.OUTSTATION
        || booking.bookingType === BOOKING_TYPE.OUTSTATION;
      const remainingDays = Math.ceil(remainingMs / 86_400_000);
      throw new ApiError(
        409,
        isOutstation
          ? `This round trip runs until the booked return — you can complete it in about ${remainingDays} day(s).`
          : `This ride is booked for ${(earliestCompleteMs - new Date(booking.timeline.startedAt).getTime()) / 3_600_000} hour(s) — you can complete it in about ${remainingMin} min.`,
        {
          code: 'TRIP_DURATION_NOT_ELAPSED',
          earliestCompleteAt: new Date(earliestCompleteMs).toISOString(),
          remainingMinutes: remainingMin,
          remainingDays: isOutstation ? remainingDays : undefined,
        },
      );
    }
  }

  // Stop the auto-complete timer — we're completing manually.
  cancelRideEndSchedule(booking._id);
  cancelOutstationReturnJobs(booking._id).catch(() => null);

  booking.status = BOOKING_STATUS.COMPLETED;
  booking.timeline.completedAt = new Date();

  // Post-pay bookings move from `not_due_yet` → `pending` so the user app
  // knows to surface a "pay now" screen. Pre-pay bookings were already
  // paid before EN_ROUTE.
  if (
    booking.paymentMode === PAYMENT_MODE.POST_RIDE &&
    booking.paymentStatus === BOOKING_PAYMENT_STATUS.NOT_DUE_YET
  ) {
    booking.paymentStatus = BOOKING_PAYMENT_STATUS.PENDING;
  }

  // Settle the pre-collected waiting buffer: caps `waiting.chargeRupees`
  // at the buffer and credits the unused portion back to the user's
  // wallet. Best-effort — wallet failure is logged inside the helper so
  // trip completion never wedges on a refund.
  await settleWaitingBuffer(booking);

  // Sweep any mid-flow extension intents (OTP unverified / unpaid).
  // The customer no longer has the ride active, so a stale row would
  // leave the driver's OTP banner glued to their screen and would also
  // be a fraud vector if the FE ever resumed it.
  await clearPendingExtensionsOnTerminate(booking, 'trip_completed');

  await booking.save();

  // Free the driver up for new offers. Failure here is non-fatal — admins
  // can clear stale isOnTrip flags from the admin panel if needed.
  if (booking.driverId) {
    Driver.updateOne({ _id: booking.driverId }, { $set: { isOnTrip: false } }).catch((err) =>
      console.warn('[bookingTrip] failed to clear driver.isOnTrip:', err?.message),
    );
  }

  // Book the platform's revenue from this trip:
  //   - commission (cut of the ride subtotal, pre-coupon)
  //   - platform fee (customer-facing fee)
  //   - coupon discount as a negative line (admin bears the cost)
  // Best-effort: a failure here logs but never wedges trip completion.
  const snap = booking.fareSnapshot || {};
  recordCompletedTripPlatformRevenue(booking).catch((err) =>
    console.warn(
      '[bookingTrip] failed to log trip platform revenue:',
      err?.message,
    ),
  );

  // Credit limited-use coupon only on a completed trip (not on cancel /
  // no-drivers). Idempotent at the business level: completion runs once.
  if (snap.couponId) {
    incrementCouponUsageService(snap.couponId).catch((err) =>
      console.warn(
        '[bookingTrip] failed to increment coupon usage:',
        err?.message,
      ),
    );
  }

  // Settle the driver's earning into their wallet. Mirrors the
  // commission revenue write above — booking ↔ accounting are now
  // both balanced at COMPLETED. Best-effort: a failure here just
  // logs (admin can reconcile from the booking later) so trip
  // completion never wedges on a wallet write.
  await settleDriverEarning(booking).catch((err) =>
    console.warn(
      '[bookingTrip] failed to settle driver earning:',
      err?.message,
    ),
  );

  broadcastUpdate(booking);
  notifyUserTripCompleted(booking.userId, booking).catch(() => null);
  if (booking.driverId) {
    const earning = driverEarningFromFareSnapshot(booking.fareSnapshot);
    if (earning > 0) {
      notifyDriverEarningsCredited(booking.driverId, {
        amountRupees: earning,
        bookingId: booking._id,
      }).catch(() => null);
    }
  }
  return booking.toObject();
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------------------ */
/* Driver-cancel helpers (re-dispatch vs. terminate)                    */
/* ------------------------------------------------------------------ */

/**
 * Debit the driver's wallet for a cancellation penalty AND book the
 * same rupee as platform revenue. The penalty + revenue write are
 * paired so the platform-revenue ledger always matches the sum of
 * driver-wallet deductions — easy reconciliation for accounting.
 *
 * Non-fatal — we log instead of throwing so the booking transition
 * itself never wedges on a wallet write.
 *
 * `booking` is required (not just `bookingId`) so we can tag the
 * revenue row with the bookingNumber + serviceType, matching the
 * shape `recordPlatformRevenue` uses for the other revenue sources.
 */
async function applyDriverPenalty(driverId, penaltyRupees, booking) {
  if (!penaltyRupees || penaltyRupees <= 0) return;
  try {
    await Driver.updateOne(
      { _id: driverId },
      { $inc: { 'wallet.balance': -penaltyRupees } },
    );
  } catch (err) {
    console.warn(
      '[bookingTrip] failed to debit driver wallet on cancel:',
      err?.message,
    );
  }
  // The full penalty goes to the platform. Best-effort: a failed
  // revenue write just means the audit lags — the wallet was already
  // debited, so we never want this to throw.
  if (booking?._id) {
    recordPlatformRevenue({
      source: PLATFORM_REVENUE_SOURCE.DRIVER_PENALTY,
      amountRupees: penaltyRupees,
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber || '',
      serviceType: booking.serviceType || '',
      userId: booking.userId || null,
      driverId,
      meta: {
        reason: booking.cancellation?.reason || 'cancelled_by_driver',
        status: booking.status || '',
      },
    }).catch((err) =>
      console.warn(
        '[bookingTrip] failed to record driver-penalty revenue:',
        err?.message,
      ),
    );
  }
}

/**
 * Spend one cancellation chance for the driver, rolling the day-key
 * over if this is the first cancel of a new calendar day. Best-effort;
 * a failure here just means the audit counter lags — never blocks the
 * cancellation itself.
 */
async function spendDriverCancelChance(driverId, dateKey) {
  if (!driverId || !dateKey) return;
  try {
    const driver = await Driver.findById(driverId).select('cancellationChances').lean();
    const sameDay = driver?.cancellationChances?.dateKey === dateKey;
    if (sameDay) {
      await Driver.updateOne(
        { _id: driverId },
        { $inc: { 'cancellationChances.used': 1 } },
      );
    } else {
      await Driver.updateOne(
        { _id: driverId },
        { $set: { cancellationChances: { dateKey, used: 1 } } },
      );
    }
  } catch (err) {
    console.warn(
      '[bookingTrip] failed to record driver cancellation chance:',
      err?.message,
    );
  }
}

/**
 * Re-dispatch path: the driver bailed on a paid pre-STARTED booking. We
 * keep the payment intact and put the booking back on the dispatcher
 * (SEARCHING) so the next available driver picks it up without the
 * customer having to repay. Driver penalty is applied here too.
 *
 * If the dispatcher can't find anyone in the next wave,
 * `dispatchNextDriverService` will eventually call
 * `adminMarkNoDriversFoundService`, which soft-parks the booking
 * (no auto-refund — user searches again or cancels).
 */
async function redispatchAfterDriverCancel(booking, driverId, policy, chance) {
  const { driverPenalty } = computeDriverCancellation(booking, policy, chance);

  // Fresh dispatch wave: clear prior offers so alreadyOfferedDriverIds
  // does not exclude every driver from the first search (including the
  // cancelling driver and anyone who timed out / was withdrawn).
  if (booking.dispatch) {
    booking.dispatch.offers = [];
    booking.dispatch.pendingOfferIds = [];
    booking.dispatch.currentExpiresAt = null;
    // Reset radius / attempts so the new search starts fresh from the
    // configured starting radius — the customer shouldn't inherit an
    // already-fully-expanded wave from the cancelling driver's offer.
    booking.dispatch.currentRadiusMeters = DISPATCH.SEARCH_RADIUS_START_METERS;
    booking.dispatch.attemptsCount = 0;
  }

  booking.status = BOOKING_STATUS.SEARCHING;
  booking.driverId = null;
  booking.timeline.driverAssignedAt = null;
  booking.timeline.paymentDeadlineAt = null;
  // Record the previous driver's cancellation. We don't terminate the
  // booking so `cancellation` stays for the FE to surface a popup; it
  // gets cleared the moment a new driver accepts.
  booking.cancellation = {
    reason: 'driver_cancelled_reassigning',
    cancelledBy: 'driver',
    feeCharged: driverPenalty,
    refundAmount: 0,
  };

  await booking.save();

  // Kill the Pay Now timer (irrelevant now — booking is back in
  // SEARCHING and the payment is already locked in).
  cancelPaymentTimeout(booking._id);
  cancelNoShowSchedule(booking._id);
  cancelRideEndSchedule(booking._id);

  await applyDriverPenalty(driverId, driverPenalty, booking);

  // Free the cancelling driver so the dispatcher can hand them their
  // next offer, then start a fresh dispatch wave.
  Driver.updateOne({ _id: driverId }, { $set: { isOnTrip: false } }).catch((err) =>
    console.warn(
      '[bookingTrip] failed to clear driver.isOnTrip on re-dispatch:',
      err?.message,
    ),
  );

  // Tell the user app to surface the "driver cancelled — searching
  // again" popup, and broadcast the new SEARCHING state to everyone.
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_DRIVER_REASSIGNING, {
    bookingId: String(booking._id),
    reason: 'driver_cancelled',
  });
  broadcastUpdate(booking);

  // Kick off a fresh dispatch wave. Errors here are non-fatal — the
  // dispatch service has its own retry path and ultimately calls
  // adminMarkNoDriversFoundService (soft-park; user cancels for refund).
  dispatchNextDriverService(booking._id).catch((err) =>
    console.warn(
      '[bookingTrip] redispatch failed for booking',
      String(booking._id),
      ':',
      err?.message,
    ),
  );

  return booking.toObject();
}

/**
 * Terminal cancellation: the booking is fully closed (status =
 * CANCELLED). Issues a refund (minus retained service charge) if the
 * user had already paid, debits the driver penalty, and broadcasts the
 * cancellation patch.
 */
async function terminateBookingByDriver(
  booking,
  driverId,
  policy,
  { reason, tripStarted, chance },
) {
  const {
    driverPenalty,
    refundAmount,
  } = computeDriverCancellation(booking, policy, chance);

  // Re-use the user-side breakdown for the refund ledger so the
  // cancellation fee field on the Refund document matches the customer
  // copy on the FE.
  const userBreakdown = computeUserCancellation(booking, policy);

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancellation = {
    reason:
      reason ||
      (tripStarted ? 'cancelled_by_driver_after_start' : 'cancelled_by_driver'),
    cancelledBy: 'driver',
    feeCharged: driverPenalty,
    refundAmount,
  };
  booking.timeline.cancelledAt = new Date();
  if (booking.dispatch) {
    booking.dispatch.pendingOfferIds = [];
    booking.dispatch.currentExpiresAt = null;
  }
  // Driver-cancel termination — release the customer's reserved
  // waiting buffer back to spendable (it was never used).
  await releaseBookingBufferHold(booking);
  // Also sweep any pending extension intent so the driver banner /
  // customer modal don't outlive the booking.
  await clearPendingExtensionsOnTerminate(booking, 'driver_cancelled');
  await booking.save();

  cancelPaymentTimeout(booking._id);
  cancelNoShowSchedule(booking._id);
  cancelRideEndSchedule(booking._id);
  cancelScheduledBookingJobs(booking._id).catch(() => {});
  await applyDriverPenalty(driverId, driverPenalty, booking);

  Driver.updateOne({ _id: driverId }, { $set: { isOnTrip: false } }).catch((err) =>
    console.warn(
      '[bookingTrip] failed to clear driver.isOnTrip on cancel:',
      err?.message,
    ),
  );

  // Record the refund. Wallet-paid bookings credit instantly and land
  // on the admin ledger as processed; Razorpay stays pending for admin.
  let refundRecord = null;
  const wasPaid = booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID;
  const paidViaWallet = booking.paymentMethod === BOOKING_PAYMENT_METHOD.WALLET;
  if (wasPaid && refundAmount > 0) {
    const refundMeta = {
      initiatedBy: REFUND_INITIATED_BY.DRIVER,
      reason: booking.cancellation.reason,
      breakdown: {
        amountRupees: refundAmount,
        cancellationFeeRupees: userBreakdown.feeCharged,
        grossPaidRupees: Number(booking.payment?.amountPaidRupees) || 0,
      },
    };
    if (paidViaWallet) {
      try {
        const walletTx = await creditWalletService({
          userId: booking.userId,
          amount: refundAmount,
          source: WALLET_TXN_SOURCE.BOOKING_REFUND,
          description: `Refund \u2014 booking ${booking.bookingNumber} cancelled by driver`,
          refType: 'Booking',
          refId: String(booking._id),
        });
        booking.paymentStatus = BOOKING_PAYMENT_STATUS.REFUNDED;
        await Booking.updateOne(
          { _id: booking._id },
          { $set: { paymentStatus: BOOKING_PAYMENT_STATUS.REFUNDED } },
        );
        refundRecord = await issueBookingRefundService(booking, {
          ...refundMeta,
          autoProcessed: true,
          payoutMethod: REFUND_PAYOUT_METHOD.WALLET,
          walletTxId: walletTx?._id,
        });
      } catch (refundErr) {
        console.error(
          '[bookingTrip] failed to credit wallet refund for booking',
          String(booking._id),
          refundErr?.message,
        );
      }
    } else {
      refundRecord = await issueBookingRefundService(booking, refundMeta);
    }
  }

  const payload = {
    ...buildUpdatePayload(booking, 'user'),
    paymentStatus: booking.paymentStatus,
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
  if (booking.driverId) {
    emitToDriver(
      booking.driverId,
      S2C_EVENTS.BOOKING_UPDATED,
      buildUpdatePayload(booking, 'driver'),
    );
  }
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);

  return booking.toObject();
}

/**
 * Outstation-only driver cancellation. Hourly bookings keep the
 * grace/chance/redispatch flow above; outstation runs on a separate
 * TIME-driven tier policy:
 *
 *   > driverFreeReassignHoursBeforePickup   → no penalty, drop driver,
 *                                              push booking to the
 *                                              emergency pool so an
 *                                              admin assigns another.
 *   between penalty & free-reassign hours   → mid-tier ₹ penalty, same
 *                                              emergency-pool path.
 *   ≤ driverPenaltyHoursBeforePickup        → full ₹ penalty + priority
 *                                              points debit + recent-
 *                                              events log; emergency-pool
 *                                              reassignment.
 *   tripStarted                              → terminate the booking
 *                                              (no reassignment) and
 *                                              charge full penalty.
 *
 * Daily `cancellationChances` are intentionally NOT decremented here —
 * that counter exists for the hourly grace flow, which doesn't apply
 * to scheduled outstation pickups.
 */
async function cancelOutstationByDriver(booking, driverId, reason = '') {
  const policy = await loadCancellationPolicy(booking.serviceType);
  const breakdown = computeDriverCancellation(booking, policy);
  const {
    driverPenalty,
    fullPenalty,
    tier,
    hoursUntilPickup,
    priorityPenaltyPoints,
    shouldReassign,
    trackRepeated,
    tripStarted,
  } = breakdown;

  // Pull the customer-side breakdown so a mid-ride terminate path can
  // reuse the refund logic. Outstation isn't expected to land here
  // (the user must contact support for a started-trip refund) but the
  // path stays consistent.
  const userBreakdown = computeUserCancellation(booking, policy);

  // ── Mid-ride terminate (driver bailed after STARTED) ──
  if (tripStarted || !shouldReassign) {
    booking.status = BOOKING_STATUS.CANCELLED;
    booking.cancellation = {
      reason: reason || 'cancelled_by_driver_after_start',
      cancelledBy: 'driver',
      feeCharged: driverPenalty,
      refundAmount: userBreakdown.refundAmount,
      tier: tier || '',
      hoursUntilPickup:
        typeof hoursUntilPickup === 'number' ? hoursUntilPickup : null,
    };
    booking.timeline.cancelledAt = new Date();
    if (booking.dispatch) {
      booking.dispatch.pendingOfferIds = [];
      booking.dispatch.currentExpiresAt = null;
    }
    await releaseBookingBufferHold(booking);
    await clearPendingExtensionsOnTerminate(booking, 'driver_cancelled');
    await booking.save();

    cancelPaymentTimeout(booking._id);
    cancelNoShowSchedule(booking._id);
    cancelRideEndSchedule(booking._id);
    cancelScheduledBookingJobs(booking._id).catch(() => {});

    await applyDriverPenalty(driverId, driverPenalty, booking);
    await applyOutstationDriverCancellationStats(driverId, booking, {
      tier,
      penalty: driverPenalty,
      priorityPoints: priorityPenaltyPoints,
      hoursUntilPickup,
      trackRepeated,
    });

    Driver.updateOne({ _id: driverId }, { $set: { isOnTrip: false } }).catch(
      (err) =>
        console.warn(
          '[bookingTrip] failed to clear driver.isOnTrip on outstation cancel:',
          err?.message,
        ),
    );

    // No refund record is opened for the mid-ride path — refunds for
    // outstation mid-ride are handled by support per the policy spec.

    const payload = {
      ...buildUpdatePayload(booking, 'user'),
      paymentStatus: booking.paymentStatus,
    };
    emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
    emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
    emitToDriver(driverId, S2C_EVENTS.BOOKING_UPDATED, buildUpdatePayload(booking, 'driver'));
    emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);
    return booking.toObject();
  }

  // ── Re-dispatch path: send the booking back to the outstation queue ──
  //
  // Outstation has its own admin-managed assignment surface
  // (`/admin/bookings/outstation-assignments`) which only lists
  // `PENDING_ASSIGNMENT` bookings of `serviceType: outstation`. When a
  // driver bails before the pickup we want the booking to land back
  // there — NOT in the generic emergency pool used for hourly
  // re-broadcasts — so the same admin who originally assigned can
  // pick a replacement driver from the same screen they already use.
  //
  // We don't refund — the customer's wallet hold stays in place and
  // the next driver takes over the same booking. Withdraw the current
  // wave (best-effort) so no other driver gets paged on this booking
  // while it's parked.
  try {
    await withdrawCurrentOfferService(booking._id, 'driver_cancelled_outstation');
  } catch (err) {
    console.warn(
      '[bookingTrip] failed to withdraw offers on outstation driver cancel:',
      err?.message,
    );
  }

  // Stamp the cancelling driver's offer with CANCELLED so the audit
  // trail explains why the booking is back in the queue.
  if (booking.dispatch?.offers?.length) {
    const offer = booking.dispatch.offers.find(
      (o) => String(o.driverId) === String(driverId),
    );
    if (offer) {
      offer.response = DISPATCH_RESPONSE.CANCELLED;
      offer.respondedAt = new Date();
    }
  }
  if (booking.dispatch) {
    booking.dispatch.pendingOfferIds = [];
    booking.dispatch.currentExpiresAt = null;
    booking.dispatch.currentRadiusMeters = DISPATCH.SEARCH_RADIUS_START_METERS;
    booking.dispatch.attemptsCount = 0;
  }

  booking.status = BOOKING_STATUS.PENDING_ASSIGNMENT;
  booking.driverId = null;
  booking.timeline.driverAssignedAt = null;
  booking.timeline.paymentDeadlineAt = null;
  // Cancellation block is kept on the booking purely as audit info —
  // the outstation queue can surface a "previous driver bailed
  // <hoursUntilPickup>h before pickup" hint so the admin knows why
  // the booking re-appeared. Status above is what actually drives
  // routing.
  booking.cancellation = {
    reason: reason || 'outstation_driver_cancelled_reassigning',
    cancelledBy: 'driver',
    feeCharged: driverPenalty,
    refundAmount: 0,
    tier: tier || '',
    hoursUntilPickup:
      typeof hoursUntilPickup === 'number' ? hoursUntilPickup : null,
  };

  await booking.save();
  cancelPaymentTimeout(booking._id);
  cancelNoShowSchedule(booking._id);
  cancelRideEndSchedule(booking._id);

  await applyDriverPenalty(driverId, driverPenalty, booking);
  await applyOutstationDriverCancellationStats(driverId, booking, {
    tier,
    penalty: driverPenalty,
    priorityPoints: priorityPenaltyPoints,
    hoursUntilPickup,
    trackRepeated,
  });

  Driver.updateOne({ _id: driverId }, { $set: { isOnTrip: false } }).catch(
    (err) =>
      console.warn(
        '[bookingTrip] failed to clear driver.isOnTrip on outstation reassign:',
        err?.message,
      ),
  );

  const payload = {
    bookingId: String(booking._id),
    status: booking.status,
    cancellation: booking.cancellation?.toObject?.() || booking.cancellation,
    scheduledStartAt: booking.outstation?.pickupAt || booking.outstation?.startDate || null,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_DRIVER_REASSIGNING, {
    bookingId: String(booking._id),
    reason: 'outstation_driver_cancelled',
  });
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToDriver(driverId, S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);
  emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
    kind: 'outstation_driver_cancelled',
    severity: penaltyAlertSeverity(driverPenalty, fullPenalty),
    message: `Outstation booking ${booking.bookingNumber || ''} needs a new driver`,
    data: {
      bookingId: String(booking._id),
      tier,
      hoursUntilPickup,
      driverId: String(driverId),
      penalty: driverPenalty,
    },
  });

  return booking.toObject();
}

function penaltyAlertSeverity(driverPenalty, fullPenalty) {
  if (driverPenalty <= 0) return 'info';
  if (driverPenalty >= fullPenalty) return 'warn';
  return 'info';
}

/**
 * Persist the long-running outstation cancellation tracking on the
 * driver:
 *   - increment lifetime counters
 *   - bump `priorityPenaltyPoints` (lowers dispatch priority on future
 *     outstation assignments)
 *   - push a bounded ring of recent events for the admin audit panel
 *
 * Best-effort — a failure here logs but does not roll back the
 * cancellation itself.
 */
async function applyOutstationDriverCancellationStats(
  driverId,
  booking,
  { tier, penalty, priorityPoints, hoursUntilPickup, trackRepeated },
) {
  if (!driverId) return;
  try {
    const event = {
      at: new Date(),
      bookingId: booking?._id || null,
      serviceType: booking?.serviceType || '',
      tier: tier || '',
      penalty: Number(penalty) || 0,
      priorityPoints: Number(priorityPoints) || 0,
      hoursUntilPickup:
        typeof hoursUntilPickup === 'number' ? hoursUntilPickup : null,
    };
    const inc = {
      'cancellationStats.outstationTotal': 1,
    };
    if (penalty > 0) inc['cancellationStats.outstationPenalised'] = 1;
    if (trackRepeated && priorityPoints > 0) {
      inc['cancellationStats.priorityPenaltyPoints'] = priorityPoints;
    }
    await Driver.updateOne(
      { _id: driverId },
      {
        $inc: inc,
        $set: { 'cancellationStats.lastCancelledAt': event.at },
        // Keep the recent ring bounded so it doesn't grow unbounded.
        $push: {
          'cancellationStats.recentEvents': {
            $each: [event],
            $slice: -20,
          },
        },
      },
    );
  } catch (err) {
    console.warn(
      '[bookingTrip] failed to persist outstation cancellation stats:',
      err?.message,
    );
  }
}

/**
 * * → cancelled  (driver-initiated)
 *
 * Mirror of `cancelBookingByUserService` for the driver — but with a
 * twist when the user has already paid:
 *
 *   - PAID + pre-STARTED → re-dispatch the booking to another driver
 *                          (the customer doesn't have to repay).
 *                          Driver penalty is still applied.
 *   - PAID + STARTED     → terminate the booking. Refund =
 *                          paid − serviceCharge. Driver penalty applied.
 *   - UNPAID + any state → terminate. No refund (nothing was charged).
 *                          Driver penalty applied per policy.
 */
export async function cancelBookingByDriverService(driverId, bookingId, reason = '') {
  const booking = await loadDriverBooking(driverId, bookingId);

  if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
    throw new ApiError(400, 'This booking is no longer cancellable');
  }
  if (!STATUSES_DRIVER_CAN_CANCEL.includes(booking.status)) {
    throw new ApiError(
      400,
      'Trip is already in progress — please contact support to cancel',
    );
  }

  // Instant rides: once the trip has started the driver cannot cancel —
  // they must complete the ride (or contact support).
  const isInstant =
    !booking.bookingType || booking.bookingType === BOOKING_TYPE.INSTANT;
  if (isInstant && booking.status === BOOKING_STATUS.STARTED) {
    throw new ApiError(
      400,
      'Trip is in progress — you can no longer cancel this ride',
    );
  }

  // Scheduled / outstation: drivers may cancel only before pickup time.
  // After the ride time they must start/complete the trip (or contact support).
  if (
    booking.bookingType === BOOKING_TYPE.SCHEDULED
    || booking.bookingType === BOOKING_TYPE.OUTSTATION
  ) {
    const { resolveBookingSearchStartAt } = await import('../utils/bookingInbox.js');
    const startAt = resolveBookingSearchStartAt(booking);
    if (startAt && startAt.getTime() <= Date.now()) {
      throw new ApiError(
        400,
        'Ride time has passed — you can no longer cancel this trip',
      );
    }
  }

  // Outstation runs on its own time-based policy + emergency-pool
  // reassignment. Branch out so the hourly grace/chance accounting
  // never touches it (and vice-versa).
  if (booking.serviceType === SERVICE_TYPES.OUTSTATION) {
    return cancelOutstationByDriver(booking, driverId, reason);
  }

  const policy = await loadCancellationPolicy(booking.serviceType);
  const tripStarted = booking.status === BOOKING_STATUS.STARTED;
  const wasPaid = booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID;

  // Snapshot the driver's daily cancel budget BEFORE we mutate it so
  // the grace decision matches what the FE saw in its confirm prompt.
  const driverSnap = await Driver.findById(driverId)
    .select('cancellationChances')
    .lean();
  const chance = evaluateDriverCancelChance(driverSnap, booking, policy);

  let result;
  // Paid + pre-STARTED → re-dispatch so the customer's payment isn't
  // wasted on a driver who bailed. Mid-ride cancellations can't be
  // re-dispatched (the customer is in a car) so they terminate.
  if (wasPaid && !tripStarted) {
    result = await redispatchAfterDriverCancel(booking, driverId, policy, chance);
  } else {
    result = await terminateBookingByDriver(booking, driverId, policy, {
      reason,
      tripStarted,
      chance,
    });
  }

  // Always spend a chance — the counter tracks "I bailed on a job" and
  // is independent of whether the penalty was actually charged.
  await spendDriverCancelChance(driverId, chance.dateKey || todayKey());

  return result;
}
