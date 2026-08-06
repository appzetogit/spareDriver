import Booking from '../models/booking.model.js';
import UserSubscription from '../models/userSubscription.model.js';
import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUS,
  BOOKING_TYPE,
  SCHEDULED_BOOKING,
} from '../constants/bookingStatus.js';
import {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_ASSIGNMENT_STATUS,
} from '../constants/serviceTypes.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Driver scheduling-conflict helpers.
 *
 * The wave dispatcher MUST NOT offer a new ride to a driver whose
 * existing accepted/scheduled bookings would overlap the new pickup
 * window — even when those bookings are hours away. A driver who
 * accepted a 6 PM scheduled pickup should still be receiving 11 AM
 * instant offers, but NOT a 5:30 PM instant offer.
 *
 * Dedicated-driver subscription stints are treated the same way: a
 * driver assigned to an active subscription for [assignedAt,
 * assignedWorkingEndDate || expiryDate] must not receive booking
 * offers (or admin manual assigns) that overlap that window.
 *
 * The buffer (`SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES`, admin-tunable
 * per service via `ServicePricing.scheduledDispatch.RIDE_BUFFER_MINUTES`)
 * is applied symmetrically around BOTH the existing booking and the new
 * request, so drivers always have breathing room between trips.
 */

const MIN_BOOKING_DURATION_HOURS = 1;
const HOURLY_FALLBACK_DURATION_HOURS = 2;
const INSTANT_FALLBACK_DURATION_HOURS = 1;

function toMs(date, fallback = null) {
  if (!date) return fallback;
  const t = date instanceof Date ? date.getTime() : new Date(date).getTime();
  return Number.isFinite(t) ? t : fallback;
}

function durationMsFromHours(hours, fallback) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return fallback * 3_600_000;
  return Math.max(n, MIN_BOOKING_DURATION_HOURS) * 3_600_000;
}

/**
 * Best-effort estimate of the `[start, end]` window a booking will
 * occupy on the driver's calendar. Falls back to sensible defaults when
 * the schema-level metadata is missing (e.g. a legacy booking with no
 * `hourly.durationHours`).
 */
export function estimateBookingWindow(booking, { nowMs = Date.now() } = {}) {
  if (!booking) return null;

  // Scheduled bookings always have a known pickup time.
  if (booking.bookingType === BOOKING_TYPE.SCHEDULED) {
    const startMs = toMs(booking?.hourly?.scheduledStartAt);
    if (!startMs) return null;
    const durationMs = durationMsFromHours(
      booking?.hourly?.durationHours,
      HOURLY_FALLBACK_DURATION_HOURS,
    );
    return { startMs, endMs: startMs + durationMs };
  }

  // Outstation: prefer the exact pickupAt / expectedReturnAt the
  // customer picked. Falls back to startDate / endDate (or +days)
  // for legacy bookings that pre-date the datetime pickers.
  const outstation = booking?.outstation;
  if (outstation?.pickupAt || outstation?.startDate) {
    const startMs = toMs(
      outstation.pickupAt || outstation.startDate,
      nowMs,
    );
    const endSrc = outstation.expectedReturnAt || outstation.endDate;
    const endMs =
      toMs(endSrc) ||
      startMs + Math.max(1, Number(outstation.days) || 1) * 24 * 3_600_000;
    return { startMs, endMs };
  }

  // Instant bookings start "around now" — use driver-assigned time when
  // available so we don't shift the window every time we recompute.
  const startMs = toMs(booking?.timeline?.driverAssignedAt, nowMs);
  const durationMs = durationMsFromHours(
    booking?.hourly?.durationHours,
    INSTANT_FALLBACK_DURATION_HOURS,
  );
  return { startMs, endMs: startMs + durationMs };
}

/**
 * Pad both ends of a `[start, end]` window with the configured buffer
 * so back-to-back trips can't be offered to the same driver.
 */
export function applyBuffer(window, bufferMinutes) {
  if (!window) return null;
  const bufferMs = Math.max(0, Number(bufferMinutes) || 0) * 60_000;
  return {
    startMs: window.startMs - bufferMs,
    endMs: window.endMs + bufferMs,
  };
}

/**
 * Flatten current + historical assignment stints on a subscription into
 * concrete `[startMs, endMs]` windows keyed by driver.
 */
export function listSubscriptionStints(subscription) {
  if (!subscription) return [];
  const stints = [];
  const expiryMs = toMs(subscription.expiryDate);

  if (
    subscription.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED
    && subscription.assignedDriverId
  ) {
    const startMs =
      toMs(subscription.assignedAt) || toMs(subscription.startDate);
    const endMs =
      toMs(subscription.assignedWorkingEndDate) || expiryMs;
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      stints.push({
        driverId: String(subscription.assignedDriverId),
        startMs,
        endMs,
        subscription,
      });
    }
  }

  for (const prev of subscription.previousAssignments || []) {
    if (!prev?.driverId || !prev.assignedAt) continue;
    const startMs = toMs(prev.assignedAt);
    const endMs = toMs(prev.releasedAt) || expiryMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      continue;
    }
    stints.push({
      driverId: String(prev.driverId),
      startMs,
      endMs,
      subscription,
    });
  }

  return stints;
}

function subscriptionConflictRow(stint) {
  const sub = stint.subscription;
  return {
    _id: String(sub._id),
    bookingNumber: sub.subscriptionNumber || 'SUB',
    bookingType: 'subscription',
    serviceType: 'subscription',
    status: sub.status,
    startMs: stint.startMs,
    endMs: stint.endMs,
    conflictKind: 'subscription',
    planName: sub.planNameSnapshot || '',
  };
}

async function loadActiveSubscriptionDocs({ driverIds = null } = {}) {
  const query = {
    status: SUBSCRIPTION_STATUS.ACTIVE,
  };

  if (driverIds?.length) {
    const ids = driverIds.map(String);
    query.$or = [
      {
        assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED,
        assignedDriverId: { $in: ids },
      },
      { 'previousAssignments.driverId': { $in: ids } },
    ];
  } else {
    query.$or = [
      {
        assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED,
        assignedDriverId: { $ne: null },
      },
      { 'previousAssignments.0': { $exists: true } },
    ];
  }

  return UserSubscription.find(query)
    .select(
      'subscriptionNumber status assignmentStatus assignedDriverId assignedAt assignedWorkingEndDate startDate expiryDate planNameSnapshot previousAssignments',
    )
    .lean();
}

/**
 * Returns the list of driver IDs (as strings) currently assigned to a
 * booking whose time window overlaps `window` (after applying the
 * shared buffer). Use this to populate `excludeDriverIds` when calling
 * `findDriversInExpandingRadius`.
 *
 * Also excludes drivers whose dedicated-subscription working stint
 * overlaps the same window.
 *
 * The wave dispatcher passes the new booking's `_id` as `excludeBookingId`
 * so we don't conflict a booking against itself (the new booking might
 * already be PENDING_ASSIGNMENT or SEARCHING and have no driver yet —
 * but defensive code shouldn't crash if both ends ever line up).
 *
 * @param {object} params
 * @param {{ startMs:number, endMs:number }} params.window  new ride window (already buffered)
 * @param {string|null} [params.excludeBookingId]           don't conflict with self
 * @param {number} [params.bufferMinutes=SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES]
 *        Buffer to pad around EACH EXISTING booking's window. The
 *        `window` argument is expected to already be buffered.
 * @returns {Promise<string[]>}
 */
export async function findConflictingDriverIds({
  window,
  excludeBookingId = null,
  bufferMinutes = SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES,
} = {}) {
  if (!window || !Number.isFinite(window.startMs) || !Number.isFinite(window.endMs)) {
    return [];
  }

  // Coarse Mongo filter first — pull every active booking that COULD
  // overlap. We refine with the precise overlap check in JS because
  // mixing scheduled/instant/outstation date sources makes a single
  // `$or` query unreadable and brittle (especially for instant
  // bookings, whose end time isn't persisted).
  const query = {
    isDeleted: false,
    driverId: { $ne: null },
    status: {
      $in: ACTIVE_BOOKING_STATUSES.filter(
        // Skip purely-pre-driver states — they have no `driverId` yet
        // so the `$ne: null` above already filters them out, but keep
        // the list tight for readability.
        (status) =>
          status !== BOOKING_STATUS.PENDING_ASSIGNMENT &&
          status !== BOOKING_STATUS.SEARCHING &&
          status !== BOOKING_STATUS.IN_EMERGENCY_POOL,
      ),
    },
  };
  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const [candidates, subscriptions] = await Promise.all([
    Booking.find(query)
      .select(
        'bookingType driverId hourly outstation timeline status',
      )
      .lean(),
    loadActiveSubscriptionDocs(),
  ]);

  const bufferMs = Math.max(0, Number(bufferMinutes) || 0) * 60_000;
  const newStart = window.startMs;
  const newEnd = window.endMs;
  const conflicted = new Set();

  for (const candidate of candidates) {
    const baseWindow = estimateBookingWindow(candidate);
    if (!baseWindow) continue;
    const paddedStart = baseWindow.startMs - bufferMs;
    const paddedEnd = baseWindow.endMs + bufferMs;
    // Inclusive overlap test: any time in common between
    // [paddedStart, paddedEnd] and [newStart, newEnd].
    if (paddedStart <= newEnd && paddedEnd >= newStart) {
      conflicted.add(String(candidate.driverId));
    }
  }

  for (const sub of subscriptions) {
    for (const stint of listSubscriptionStints(sub)) {
      const paddedStart = stint.startMs - bufferMs;
      const paddedEnd = stint.endMs + bufferMs;
      if (paddedStart <= newEnd && paddedEnd >= newStart) {
        conflicted.add(stint.driverId);
      }
    }
  }

  return Array.from(conflicted);
}

/**
 * Convenience wrapper used by the dispatcher: takes a `booking` doc
 * directly and returns the conflicted-driver list for it. Loads the
 * per-service buffer override when present.
 */
export async function findConflictingDriverIdsForBooking(booking, { bufferMinutes } = {}) {
  if (!booking) return [];
  const baseWindow = estimateBookingWindow(booking);
  if (!baseWindow) return [];
  const buffered = applyBuffer(baseWindow, bufferMinutes);
  return findConflictingDriverIds({
    window: buffered,
    excludeBookingId: booking._id || null,
    bufferMinutes,
  });
}

/**
 * For each driver in `driverIds`, returns the list of bookings whose
 * buffered time window overlaps `window`. Used by the admin "manual
 * assignment" UI so each candidate driver can be rendered with a
 * conflict badge + the actual overlapping bookings as a tooltip.
 *
 * Dedicated-subscription stints that overlap are included with
 * `conflictKind: 'subscription'` (and `bookingType`/`serviceType`
 * set to `'subscription'`).
 *
 *   { [driverId]: [{ _id, bookingNumber, bookingType, status, startMs, endMs }, ...] }
 *
 * Empty entries are omitted so the caller can simply check
 * `Boolean(map[driverId])` to know whether the driver has any
 * conflict at all.
 *
 * @param {object} params
 * @param {string[]} params.driverIds
 * @param {{ startMs:number, endMs:number }} params.window  Already buffered.
 * @param {string|null} [params.excludeBookingId]
 * @param {number} [params.bufferMinutes]
 */
export async function getDriverConflictMap({
  driverIds = [],
  window,
  excludeBookingId = null,
  bufferMinutes = SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES,
} = {}) {
  const out = {};
  if (!driverIds.length) return out;
  if (!window || !Number.isFinite(window.startMs) || !Number.isFinite(window.endMs)) {
    return out;
  }

  const driverIdStrings = driverIds.map(String);
  const query = {
    isDeleted: false,
    driverId: { $in: driverIdStrings },
    status: {
      $in: ACTIVE_BOOKING_STATUSES.filter(
        (status) =>
          status !== BOOKING_STATUS.PENDING_ASSIGNMENT &&
          status !== BOOKING_STATUS.SEARCHING &&
          status !== BOOKING_STATUS.IN_EMERGENCY_POOL,
      ),
    },
  };
  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const [candidates, subscriptions] = await Promise.all([
    Booking.find(query)
      .select(
        'bookingNumber bookingType driverId hourly outstation timeline status serviceType',
      )
      .lean(),
    loadActiveSubscriptionDocs({ driverIds: driverIdStrings }),
  ]);

  const bufferMs = Math.max(0, Number(bufferMinutes) || 0) * 60_000;
  const newStart = window.startMs;
  const newEnd = window.endMs;
  const wanted = new Set(driverIdStrings);

  for (const candidate of candidates) {
    const baseWindow = estimateBookingWindow(candidate);
    if (!baseWindow) continue;
    const paddedStart = baseWindow.startMs - bufferMs;
    const paddedEnd = baseWindow.endMs + bufferMs;
    if (paddedStart <= newEnd && paddedEnd >= newStart) {
      const key = String(candidate.driverId);
      if (!out[key]) out[key] = [];
      out[key].push({
        _id: String(candidate._id),
        bookingNumber: candidate.bookingNumber,
        bookingType: candidate.bookingType,
        serviceType: candidate.serviceType,
        status: candidate.status,
        startMs: baseWindow.startMs,
        endMs: baseWindow.endMs,
        conflictKind: 'booking',
      });
    }
  }

  for (const sub of subscriptions) {
    for (const stint of listSubscriptionStints(sub)) {
      if (!wanted.has(stint.driverId)) continue;
      const paddedStart = stint.startMs - bufferMs;
      const paddedEnd = stint.endMs + bufferMs;
      if (paddedStart <= newEnd && paddedEnd >= newStart) {
        if (!out[stint.driverId]) out[stint.driverId] = [];
        out[stint.driverId].push(subscriptionConflictRow(stint));
      }
    }
  }

  return out;
}

/**
 * Throw 409 when `driverId` has any booking or subscription overlap
 * with `window`. Used by admin manual-assign paths.
 */
export async function assertDriverFreeForWindow({
  driverId,
  window,
  excludeBookingId = null,
  bufferMinutes = SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES,
} = {}) {
  if (!driverId || !window) return [];
  const map = await getDriverConflictMap({
    driverIds: [driverId],
    window,
    excludeBookingId,
    bufferMinutes,
  });
  const conflicts = map[String(driverId)] || [];
  if (!conflicts.length) return conflicts;

  const hasSubscription = conflicts.some(
    (c) => c.conflictKind === 'subscription' || c.bookingType === 'subscription',
  );
  const err = new ApiError(
    409,
    hasSubscription
      ? 'Driver is assigned to a dedicated subscription during this period. Pick another driver.'
      : 'Driver is already assigned to an overlapping booking. Pick another driver.',
  );
  err.data = { code: 'DRIVER_CONFLICT', conflicts };
  throw err;
}

/**
 * Attach `conflicts` / `hasConflict` to each driver row for admin pickers.
 */
export async function enrichDriversWithScheduleConflicts(
  drivers,
  {
    window,
    excludeBookingId = null,
    bufferMinutes = SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES,
  } = {},
) {
  if (!drivers?.length || !window) {
    return (drivers || []).map((d) => ({
      ...d,
      conflicts: d.conflicts || [],
      hasConflict: Boolean(d.hasConflict),
    }));
  }

  const conflictMap = await getDriverConflictMap({
    driverIds: drivers.map((d) => d._id),
    window,
    excludeBookingId,
    bufferMinutes,
  });

  return drivers.map((d) => {
    const conflicts = conflictMap[String(d._id)] || [];
    return {
      ...d,
      conflicts,
      hasConflict: conflicts.length > 0,
    };
  });
}
