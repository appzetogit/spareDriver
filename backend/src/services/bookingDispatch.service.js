import Booking from '../models/booking.model.js';
import Car from '../models/user/car.model.js';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { findDriversInExpandingRadius } from './driverFinder.service.js';
import { syncFirebaseDriverStatus } from './driverLocation.service.js';
import {
  adminMarkNoDriversFoundService,
  driverEarningFromFareSnapshot,
} from './booking.service.js';
import { schedulePaymentTimeout } from './bookingPaymentTimeout.service.js';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  BOOKING_TYPE,
  PAYMENT_MODE,
  PAYMENT_POLICY,
  DISPATCH,
  DISPATCH_RESPONSE,
  SCHEDULED_BOOKING,
} from '../constants/bookingStatus.js';
import {
  estimateBookingWindow,
  findConflictingDriverIds,
} from './driverConflict.service.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import {
  emitToDriver,
  emitToUser,
  emitToAdmins,
  emitToBooking,
} from '../utils/socketEmitters.js';
import {
  notifyUserDriverAssigned,
  notifyUserDriverAccepted,
  notifyDriverNewBookingRequest,
  notifyAdminEmergencyPoolEntered,
} from '../utils/notificationDispatch.js';

/**
 * Wave-broadcast booking dispatcher.
 *
 * For every booking we run a sequence of "waves". Each wave:
 *
 *   1. Picks the closest WAVE_SIZE (=5) approved, online, idle drivers that
 *      haven't been offered yet, using an expanding-radius search starting at
 *      SEARCH_RADIUS_START_METERS (1 km) and growing up to either
 *      `dispatch.maxRadiusMeters` (default 5 km) or the booking's zone radius.
 *   2. Emits BOOKING_OFFERED to every selected driver in parallel.
 *   3. Starts a wave-level setTimeout. First driver to accept wins; the
 *      losing drivers receive BOOKING_OFFER_WITHDRAWN. If the timer expires
 *      without an accept, all unresponded offers are recorded as TIMEOUT
 *      and the next wave is dispatched.
 *
 * The lifecycle is essentially:
 *
 *   ┌─ dispatchNextWave ─────────────────────────────────────────────────┐
 *   │ 1. Pick next wave of N drivers (expanding radius)                  │
 *   │ 2. Emit BOOKING_OFFERED to all of them                             │
 *   │ 3. Start ONE wave timer                                            │
 *   │ 4. accept → withdraw others → STOP                                 │
 *   │ 5. all reject or timer expires → loop to step 1 (larger radius)    │
 *   │ 6. radius hits cap & wave is empty → no_drivers_found              │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * Wave timers live in memory only (`waveTimers`). A server restart drops
 * outstanding timers; the next driver action or admin sweep resumes things.
 */

/** bookingId → setTimeout handle for the active wave's expiry. */
const waveTimers = new Map();

/**
 * Read the per-service `RIDE_BUFFER_MINUTES` override (admin-tunable
 * via the pricing modal). Falls back to the platform-wide constant.
 *
 * Loaded through a dynamic import so the `bookingDispatch ↔
 * bookingScheduled` module pair can stay loosely coupled (the
 * scheduled service already pulls `dispatchNextDriverService` from
 * here, so a top-level static import would be circular).
 */
async function resolveRideBufferMinutes(serviceType) {
  try {
    const { loadScheduledDispatchConfig } = await import(
      './bookingScheduled.service.js'
    );
    const cfg = await loadScheduledDispatchConfig(serviceType);
    const value = Number(cfg?.RIDE_BUFFER_MINUTES);
    if (Number.isFinite(value) && value >= 0) return value;
  } catch (err) {
    console.warn(
      '[dispatch] failed to load RIDE_BUFFER_MINUTES override:',
      err?.message,
    );
  }
  return SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
}

function clearWaveTimer(bookingId) {
  const handle = waveTimers.get(String(bookingId));
  if (handle) {
    clearTimeout(handle);
    waveTimers.delete(String(bookingId));
  }
}

function alreadyOfferedDriverIds(booking) {
  return (booking.dispatch?.offers || []).map((o) => String(o.driverId));
}

/** Statuses that legitimately keep a driver's `isOnTrip` flag at `true`. */
const ON_TRIP_LOCK_STATUSES = Object.freeze([
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
]);

/**
 * Self-heal pass that runs at the top of every dispatch wave.
 *
 * Two failure modes the rest of the system can't undo on its own:
 *
 *   1. A driver tapped "Start to pickup" on a SCHEDULED booking days
 *      before pickup. The booking is now wedged at EN_ROUTE far from
 *      its actual start time, and the driver's `isOnTrip` flag is set —
 *      so the radius search excludes them from every new wave for the
 *      entire interval. Walk those bookings back to DRIVER_ASSIGNED so
 *      both sides can resume normal life. (The newer
 *      `markDriverEnRouteService` guard prevents the wedge from
 *      happening again, but legacy data still needs cleaning up.)
 *
 *   2. A driver's `isOnTrip` is `true` but they have NO booking in any
 *      "actively committed" status. Cause is usually a server crash
 *      between the booking-status update and the driver-flag update.
 *      Reset their flag so the dispatcher stops skipping them.
 *
 * Both passes are bounded by Mongo aggregations on indexed fields, so
 * the cost is negligible per wave. Failures are logged and swallowed —
 * dispatch must never block on a self-heal hiccup.
 */
async function selfHealDriverLockState() {
  // 1. Walk back any SCHEDULED booking parked in EN_ROUTE while pickup
  //    is still well beyond the buffer window. We use the platform-wide
  //    default buffer here rather than the per-service override —
  //    accidentally clearing a few minutes early is harmless (the
  //    radius search will still match conflicting drivers via the
  //    overlap window) and keeps the heal cheap (no per-booking
  //    pricing lookup).
  try {
    const wedgeCutoffMs =
      Date.now() + SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES * 60_000;
    const wedged = await Booking.find({
      isDeleted: false,
      bookingType: BOOKING_TYPE.SCHEDULED,
      status: BOOKING_STATUS.EN_ROUTE,
      'hourly.scheduledStartAt': { $gt: new Date(wedgeCutoffMs) },
    })
      .select('_id userId driverId timeline status')
      .lean();
    for (const b of wedged) {
      try {
        await Booking.updateOne(
          { _id: b._id, status: BOOKING_STATUS.EN_ROUTE },
          {
            $set: { status: BOOKING_STATUS.DRIVER_ASSIGNED },
            $unset: { 'timeline.enRouteAt': '' },
          },
        );
        if (b.driverId) {
          await Driver.updateOne(
            { _id: b.driverId },
            { $set: { isOnTrip: false } },
          );
        }
        // Sync any open driver/user/admin UIs so they don't keep
        // rendering the stale EN_ROUTE state until the next refresh.
        const payload = {
          bookingId: String(b._id),
          status: BOOKING_STATUS.DRIVER_ASSIGNED,
        };
        emitToBooking(b._id, S2C_EVENTS.BOOKING_UPDATED, payload);
        if (b.userId) emitToUser(b.userId, S2C_EVENTS.BOOKING_UPDATED, payload);
        if (b.driverId) emitToDriver(b.driverId, S2C_EVENTS.BOOKING_UPDATED, payload);
        emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, payload);
      } catch (err) {
        console.warn(
          '[dispatch] failed to walk back wedged scheduled booking',
          String(b._id),
          err?.message,
        );
      }
    }
  } catch (err) {
    console.warn('[dispatch] self-heal wedge sweep failed:', err?.message);
  }

  // 2. Drivers flagged on-trip with no booking to back the flag. Bulk
  //    reset — the `$nin` is bounded by the live in-progress booking
  //    count which is small in practice.
  try {
    const lockedDriverIds = await Booking.distinct('driverId', {
      isDeleted: false,
      driverId: { $ne: null },
      status: { $in: ON_TRIP_LOCK_STATUSES },
    });
    await Driver.updateMany(
      { isOnTrip: true, _id: { $nin: lockedDriverIds } },
      { $set: { isOnTrip: false } },
    );
  } catch (err) {
    console.warn('[dispatch] self-heal stale isOnTrip sweep failed:', err?.message);
  }
}

function buildOfferPayload(booking, driver, { customer, car } = {}) {
  return {
    bookingId: String(booking._id),
    bookingNumber: booking.bookingNumber,
    serviceType: booking.serviceType,
    // Drivers need to tell scheduled vs instant requests apart at a
    // glance — the offer modal themes itself off this field.
    bookingType: booking.bookingType,
    paymentMode: booking.paymentMode,
    pickup: booking.pickup,
    dropoff: booking.dropoff || null,
    hourly: booking.hourly || null,
    outstation: booking.outstation || null,
    // Drivers only ever see their own earning — never the customer's
    // gross total or the platform commission. Computed once here so the
    // offer payload, the active-trip view and the trip history all show
    // the same number.
    fare: {
      driverEarning: driverEarningFromFareSnapshot(booking.fareSnapshot),
      currency: 'INR',
    },
    customer: customer
      ? {
          name: customer.name || '',
          phone: customer.phone_no ? String(customer.phone_no) : '',
          profilePicture: customer.profilePicture || '',
        }
      : null,
    car: car
      ? {
          _id: String(car._id),
          vehicleNumber: car.vehicleNumber || '',
          transmission: car.transmission || '',
          carTypeName: car.carTypeId?.name || '',
          brandName: car.brandId?.name || '',
          modelName: car.modelId?.name || '',
          fuelTypeName: car.fuelTypeId?.name || '',
        }
      : null,
    offerExpiresAt: booking.dispatch.currentExpiresAt,
    distanceMeters: driver.distanceMeters ?? null,
    waveSize: booking.dispatch.pendingOfferIds.length,
  };
}

function emitUserDispatchUpdate(booking) {
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, {
    bookingId: String(booking._id),
    status: booking.status,
    dispatch: {
      attempt: booking.dispatch.attemptsCount,
      maxAttempts: booking.dispatch.maxAttempts,
      radiusMeters: booking.dispatch.currentRadiusMeters,
      pendingDriverCount: booking.dispatch.pendingOfferIds.length,
    },
  });
}

function notifyWaveWithdrawn(driverIds, bookingId, reason) {
  for (const id of driverIds) {
    emitToDriver(id, S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, {
      bookingId: String(bookingId),
      reason,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Start (or continue) the dispatch loop for a booking by sending the next
 * wave of offers. Idempotent — calling this multiple times for the same
 * booking is safe; only one wave timer can exist at a time per bookingId.
 *
 * @param {string} bookingId
 */
export async function dispatchNextDriverService(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status !== BOOKING_STATUS.SEARCHING) {
    return { ok: false, reason: 'not_searching' };
  }

  clearWaveTimer(bookingId);

  // Belt-and-braces cleanup before each wave: walks back any SCHEDULED
  // booking wedged at EN_ROUTE far from pickup and resets stale
  // `Driver.isOnTrip` flags. Without this, a single early-en-route tap
  // (or a crashed cancel path) would silently exclude the driver from
  // every dispatch wave for hours/days.
  await selfHealDriverLockState();

  const maxAttempts = booking.dispatch?.maxAttempts || DISPATCH.MAX_ATTEMPTS;
  if ((booking.dispatch?.attemptsCount || 0) >= maxAttempts) {
    return failBookingNoDrivers(bookingId);
  }

  const [lng, lat] = booking.pickup?.location?.coordinates || [];
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return failBookingNoDrivers(bookingId);
  }

  // Expanding search starts at the radius we left off on (1 km → step → cap).
  const startMeters =
    booking.dispatch?.currentRadiusMeters || DISPATCH.SEARCH_RADIUS_START_METERS;
  const maxMeters = booking.dispatch?.maxRadiusMeters || DISPATCH.SEARCH_RADIUS_MAX_METERS;

  // Restrict driver matching to the user's chosen car-type so the driver
  // who picks up the offer is qualified to drive that vehicle. We also
  // pull the full car + customer doc here so we can hydrate the offer
  // payload without an extra round-trip per driver in the wave.
  const car = booking.carId
    ? await Car.findById(booking.carId)
        .populate('carTypeId', 'name')
        .populate('brandId', 'name')
        .populate('modelId', 'name')
        .populate('fuelTypeId', 'name')
        .lean()
    : null;
  const customer = await User.findById(booking.userId)
    .select('name phone_no profilePicture')
    .lean();
  const carTypeIds = car?.carTypeId?._id ? [String(car.carTypeId._id)] : [];

  // Resolve the per-service buffer (admin-tunable). Falls back to the
  // platform-wide default when pricing isn't configured for the service.
  const bufferMinutes = await resolveRideBufferMinutes(booking.serviceType);

  // Exclude drivers whose existing accepted/scheduled bookings would
  // overlap this booking's time window once the buffer is applied. Lets
  // a driver who's holding a 6 PM scheduled ride still pick up an
  // 11 AM instant offer — but blocks them from a 5:30 PM ride that
  // would clash with their commitment.
  //
  // The buffer is applied EXACTLY ONCE — on the existing booking side
  // inside `findConflictingDriverIds` — so admins reading the modal as
  // "30 min between rides" get exactly 30 min, not 60.
  const newWindow = estimateBookingWindow(booking);
  const conflictedDriverIds = newWindow
    ? await findConflictingDriverIds({
        window: newWindow,
        excludeBookingId: booking._id,
        bufferMinutes,
      })
    : [];

  const excludeDriverIds = [
    ...alreadyOfferedDriverIds(booking),
    ...conflictedDriverIds,
  ];

  const { drivers, radiusMeters } = await findDriversInExpandingRadius({
    lat,
    lng,
    startMeters,
    stepMeters: DISPATCH.SEARCH_RADIUS_STEP_METERS,
    maxMeters,
    limit: DISPATCH.WAVE_SIZE,
    minResults: 1,
    carTypeIds,
    excludeDriverIds,
  });

  if (!drivers.length) {
    return failBookingNoDrivers(bookingId);
  }

  const expiresAt = new Date(Date.now() + DISPATCH.OFFER_TIMEOUT_SECONDS * 1000);
  booking.dispatch.currentExpiresAt = expiresAt;
  booking.dispatch.currentRadiusMeters = radiusMeters;
  booking.dispatch.attemptsCount = (booking.dispatch.attemptsCount || 0) + 1;
  booking.dispatch.pendingOfferIds = drivers.map((d) => d._id);
  for (const driver of drivers) {
    booking.dispatch.offers.push({
      driverId: driver._id,
      offeredAt: new Date(),
      response: null,
      distanceMeters: driver.distanceMeters ?? null,
    });
  }
  await booking.save();

  // Emit to every driver in the wave in parallel.
  for (const driver of drivers) {
    emitToDriver(
      driver._id,
      S2C_EVENTS.BOOKING_OFFERED,
      buildOfferPayload(booking, driver, { customer, car }),
    );
    notifyDriverNewBookingRequest(driver._id, booking).catch(() => null);
  }
  emitUserDispatchUpdate(booking);

  // Schedule the wave-level timeout-skip.
  const handle = setTimeout(() => {
    handleWaveTimeoutService(bookingId).catch((err) => {
      console.warn('[dispatch] wave timeout handler failed:', err.message);
    });
  }, DISPATCH.OFFER_TIMEOUT_SECONDS * 1000);
  waveTimers.set(String(bookingId), handle);

  return {
    ok: true,
    wave: booking.dispatch.attemptsCount,
    driverIds: drivers.map((d) => String(d._id)),
    radiusMeters,
  };
}

async function failBookingNoDrivers(bookingId) {
  clearWaveTimer(bookingId);

  // Scheduled bookings get a "retry, then escalate" loop instead of an
  // immediate dead-end. We park the booking back in PENDING_ASSIGNMENT
  // and queue another assign attempt RETRY_DELAY_MINUTES later — until
  // we run out of runway before the emergency-pool cutoff, at which
  // point the booking is parked in the pool for an admin to take.
  const peek = await Booking.findById(bookingId).select(
    'bookingType bookingNumber userId',
  );
  if (peek?.bookingType === BOOKING_TYPE.SCHEDULED) {
    const { scheduleAssignmentRetryOrEscalate } = await import(
      './bookingScheduled.service.js'
    );
    const outcome = await scheduleAssignmentRetryOrEscalate(bookingId);
    if (outcome.retried) {
      const { notifyAdminScheduledDispatchRetry } = await import('../utils/notificationDispatch.js');
      notifyAdminScheduledDispatchRetry(peek, outcome.attempt).catch(() => null);
      return { ok: false, reason: 'scheduled_retry_queued', attempt: outcome.attempt };
    }
    if (outcome.escalated) {
      notifyAdminEmergencyPoolEntered(peek).catch(() => null);
      return { ok: false, reason: 'in_emergency_pool' };
    }
    // Unknown failure path (e.g. booking deleted out from under us);
    // fall through to the legacy terminator so the caller still sees a
    // settled status.
  }

  // Instant bookings (or scheduled bookings that somehow escaped the
  // branch above) follow the legacy path: NO_DRIVERS_FOUND + refund.
  const booking = await adminMarkNoDriversFoundService(bookingId);
  const escalated = booking.status === BOOKING_STATUS.IN_EMERGENCY_POOL;
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, {
    bookingId: String(booking._id),
    status: booking.status,
  });
  emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
    kind: escalated ? 'emergency_pool_entered' : 'no_drivers_found',
    severity: 'warn',
    message: escalated
      ? `Scheduled booking ${booking.bookingNumber} needs manual driver assignment`
      : `Booking ${booking.bookingNumber} could not find a driver`,
    data: { bookingId: String(booking._id) },
  });
  return {
    ok: false,
    reason: escalated ? 'in_emergency_pool' : 'no_drivers_found',
  };
}

/**
 * Decide whether a freshly-accepted booking should immediately mark
 * the driver as `isOnTrip: true`. Returns `true` for:
 *
 *   - Instant bookings (driver is committed right now).
 *   - Scheduled bookings whose pickup is inside one buffer window of
 *     now (e.g. ≤ 30 min away by default) — at that point we don't
 *     want to risk offering them another ride.
 *
 * Returns `false` for far-future scheduled bookings: the driver
 * stays dispatchable for non-overlapping work in the meantime and
 * the overlap-check in `dispatchNextDriverService` protects the
 * accepted booking.
 */
async function shouldImmediatelyLockDriver(booking) {
  if (!booking) return true;
  if (booking.bookingType !== BOOKING_TYPE.SCHEDULED) return true;

  const scheduledAt = booking?.hourly?.scheduledStartAt;
  if (!scheduledAt) return true;
  const startMs = new Date(scheduledAt).getTime();
  if (!Number.isFinite(startMs)) return true;

  const bufferMinutes = await resolveRideBufferMinutes(booking.serviceType);
  const lockLeadMs = Math.max(0, Number(bufferMinutes) || 0) * 60_000;
  return startMs - Date.now() <= lockLeadMs;
}

/** Driver accepts a live offer for a booking. First driver in the wave wins. */
export async function acceptBookingService(bookingId, driverId) {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status !== BOOKING_STATUS.SEARCHING) {
    return { ok: false, reason: 'no_longer_searching' };
  }
  const pending = (booking.dispatch?.pendingOfferIds || []).map(String);
  if (!pending.includes(String(driverId))) {
    return { ok: false, reason: 'not_in_active_wave' };
  }

  clearWaveTimer(bookingId);

  // Mark this driver's offer as accepted.
  const offer = booking.dispatch.offers.find(
    (o) => String(o.driverId) === String(driverId) && o.response == null,
  );
  if (offer) {
    offer.response = DISPATCH_RESPONSE.ACCEPTED;
    offer.respondedAt = new Date();
  }

  // Withdraw all the other drivers in this wave — they lost the race.
  const losers = pending.filter((id) => String(id) !== String(driverId));
  for (const loserId of losers) {
    const otherOffer = booking.dispatch.offers.find(
      (o) => String(o.driverId) === String(loserId) && o.response == null,
    );
    if (otherOffer) {
      otherOffer.response = DISPATCH_RESPONSE.CANCELLED;
      otherOffer.respondedAt = new Date();
    }
  }

  booking.dispatch.pendingOfferIds = [];
  booking.dispatch.currentExpiresAt = null;
  booking.driverId = driverId;
  const acceptedAt = new Date();
  booking.timeline.driverAssignedAt = acceptedAt;

  // When a previous driver cancelled a *paid* booking the dispatcher
  // re-queues it as SEARCHING with paymentStatus still PAID. In that
  // case we skip the AWAITING_PAYMENT phase entirely and the new
  // driver gets a fully-paid booking they can start immediately. The
  // booking's `cancellation` block (set by redispatchAfterDriverCancel)
  // is cleared so the UI doesn't keep showing the old popup.
  const alreadyPaid =
    booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID;

  if (alreadyPaid) {
    booking.status = BOOKING_STATUS.DRIVER_ASSIGNED;
    booking.timeline.paymentDeadlineAt = null;
    booking.cancellation = null;
  } else {
    // Standard "first acceptance" flow: lock in PRE_RIDE, set the 60s
    // payment deadline, and arm the auto-cancel timer.
    booking.timeline.paymentDeadlineAt = new Date(
      acceptedAt.getTime() + PAYMENT_POLICY.PAYMENT_DEADLINE_SECONDS * 1000,
    );
    booking.status = BOOKING_STATUS.AWAITING_PAYMENT;
    booking.paymentMode = PAYMENT_MODE.PRE_RIDE;
    booking.paymentStatus = BOOKING_PAYMENT_STATUS.PENDING;
  }
  await booking.save();

  // Mark the driver as on-trip so future dispatches skip them. Other
  // drivers in the lost wave stay available.
  //
  // For SCHEDULED bookings whose pickup is more than the configured
  // buffer away we leave `isOnTrip` alone — the driver can still be
  // offered other non-overlapping rides in the meantime, and the
  // conflict-overlap check in `dispatchNextDriverService` prevents
  // anything from clashing with the upcoming pickup. The flag flips
  // on automatically when the driver hits "I'm on the way"
  // (`markDriverEnRouteService`), which is the moment they're
  // physically committed to that pickup.
  const shouldLockDriver = await shouldImmediatelyLockDriver(booking);
  if (shouldLockDriver) {
    await Driver.updateOne({ _id: driverId }, { $set: { isOnTrip: true } });
    syncFirebaseDriverStatus(driverId).catch(() => {});
  }

  // Kick off the auto-cancel timer only for the standard (unpaid) flow.
  // Re-dispatched bookings are already paid → no payment timer needed.
  if (!alreadyPaid) {
    schedulePaymentTimeout(booking._id);
  }

  // For scheduled bookings, NOW is the right moment to queue the
  // pre-pickup reminder toasts — we have a driver, so the reminders
  // will be useful to both sides. Fire-and-forget (queue is best-effort).
  if (booking.bookingType === BOOKING_TYPE.SCHEDULED) {
    import('./bookingScheduled.service.js')
      .then(({ enqueueRemindersAfterAssignment }) =>
        enqueueRemindersAfterAssignment(booking),
      )
      .catch((err) =>
        console.warn(
          '[bookingDispatch] reminder enqueue failed for',
          String(booking._id),
          err?.message,
        ),
      );
  }

  // Notify the losing drivers that the offer is gone.
  notifyWaveWithdrawn(losers, booking._id, 'awarded_to_other_driver');

  // We split the payload by audience so the driver never sees the
  // customer's `paymentMode`/`paymentStatus`. They only need to know the
  // booking is parked in `awaiting_payment` so their UI can render the
  // "user is making payment" overlay.
  const userPayload = {
    bookingId: String(booking._id),
    status: booking.status,
    paymentMode: booking.paymentMode,
    paymentStatus: booking.paymentStatus,
    driverId: String(driverId),
    timeline: booking.timeline?.toObject?.() || booking.timeline,
    // When this is a re-dispatched (already-paid) booking we wipe the
    // old cancellation block so the FE doesn't keep flashing the
    // "driver bailed" popup.
    cancellation: booking.cancellation
      ? booking.cancellation?.toObject?.() || booking.cancellation
      : null,
  };
  const driverPayload = {
    bookingId: String(booking._id),
    status: booking.status,
    driverId: String(driverId),
    timeline: booking.timeline?.toObject?.() || booking.timeline,
  };
  emitToUser(booking.userId, S2C_EVENTS.BOOKING_UPDATED, userPayload);
  emitToBooking(booking._id, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToDriver(driverId, S2C_EVENTS.BOOKING_UPDATED, driverPayload);
  emitToAdmins(S2C_EVENTS.BOOKING_UPDATED, userPayload);

  notifyUserDriverAccepted(booking.userId, booking).catch(() => null);
  notifyUserDriverAssigned(booking.userId, booking).catch(() => null);

  return { ok: true, status: booking.status };
}

/**
 * Driver rejects their pending offer. Removes them from the active wave; if
 * the wave is now empty, immediately dispatches the next one.
 */
export async function rejectBookingService(bookingId, driverId) {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status !== BOOKING_STATUS.SEARCHING) {
    return { ok: false, reason: 'not_searching' };
  }
  const pending = (booking.dispatch?.pendingOfferIds || []).map(String);
  if (!pending.includes(String(driverId))) {
    return { ok: false, reason: 'not_in_active_wave' };
  }

  const offer = booking.dispatch.offers.find(
    (o) => String(o.driverId) === String(driverId) && o.response == null,
  );
  if (offer) {
    offer.response = DISPATCH_RESPONSE.REJECTED;
    offer.respondedAt = new Date();
  }
  booking.dispatch.pendingOfferIds = booking.dispatch.pendingOfferIds.filter(
    (id) => String(id) !== String(driverId),
  );
  const stillPending = booking.dispatch.pendingOfferIds.length;
  if (stillPending === 0) {
    booking.dispatch.currentExpiresAt = null;
  }
  await booking.save();

  emitToDriver(driverId, S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, {
    bookingId: String(booking._id),
    reason: 'rejected_by_driver',
  });

  if (stillPending === 0) {
    // Everyone in the wave bailed — move on with an expanded radius.
    clearWaveTimer(bookingId);
    return dispatchNextDriverService(bookingId);
  }

  // Wave still has other drivers; keep waiting for them.
  return { ok: true, pendingDriverCount: stillPending };
}

/** Called by the timer when no driver in the active wave has responded in time. */
export async function handleWaveTimeoutService(bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false });
  if (!booking) return;
  if (booking.status !== BOOKING_STATUS.SEARCHING) return;

  const pending = (booking.dispatch?.pendingOfferIds || []).map(String);
  if (pending.length === 0) return;

  // Mark every unresponded offer in the wave as timed out.
  for (const driverId of pending) {
    const offer = booking.dispatch.offers.find(
      (o) => String(o.driverId) === String(driverId) && o.response == null,
    );
    if (offer) {
      offer.response = DISPATCH_RESPONSE.TIMEOUT;
      offer.respondedAt = new Date();
    }
  }

  booking.dispatch.pendingOfferIds = [];
  booking.dispatch.currentExpiresAt = null;
  await booking.save();

  notifyWaveWithdrawn(pending, booking._id, 'timeout');

  await dispatchNextDriverService(bookingId);
}

/** Backwards-compat alias for legacy callers. */
export const handleOfferTimeoutService = handleWaveTimeoutService;

/**
 * Withdraw every in-flight offer for a booking (used by user-cancel and
 * post-payment dispatch transitions).
 */
export async function withdrawCurrentOfferService(bookingId, reason = 'cancelled') {
  clearWaveTimer(bookingId);
  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  const pending = (booking.dispatch?.pendingOfferIds || []).map(String);
  if (!pending.length) return;

  for (const driverId of pending) {
    const offer = booking.dispatch.offers.find(
      (o) => String(o.driverId) === String(driverId) && o.response == null,
    );
    if (offer) {
      offer.response = DISPATCH_RESPONSE.CANCELLED;
      offer.respondedAt = new Date();
    }
  }
  booking.dispatch.pendingOfferIds = [];
  booking.dispatch.currentExpiresAt = null;
  await booking.save();

  notifyWaveWithdrawn(pending, bookingId, reason);
}
