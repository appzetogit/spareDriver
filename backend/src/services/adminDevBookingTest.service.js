import Booking from '../models/booking.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_LIST,
  BOOKING_PAYMENT_STATUS,
  BOOKING_TYPE,
} from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { adminUpdateBookingStatusService } from './adminBookingOps.service.js';
import {
  bookedRideDurationMs,
  rideEndsAtMs,
  rideExtensionPromptAtMs,
  rideOvertimeStartsAtMs,
  scheduleRideEndTimer,
  cancelRideEndSchedule,
  triggerExtensionPromptNow,
  triggerAutoCompleteNow,
} from './bookingRideEndTimeout.service.js';
import { kickoffScheduledAssignment } from './bookingScheduled.service.js';
import { dispatchNextDriverService } from './bookingDispatch.service.js';

const POPULATE = [
  { path: 'userId', select: 'name email phone_no' },
  { path: 'driverId', select: 'name email phone_no isOnline isOnTrip' },
];

function parseDate(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildTimingSnapshot(booking) {
  const now = Date.now();
  const endsAt = rideEndsAtMs(booking);
  const promptAt = rideExtensionPromptAtMs(booking);
  const overtimeAt = rideOvertimeStartsAtMs(booking);

  return {
    now: new Date(now).toISOString(),
    bookedDurationMs: bookedRideDurationMs(booking),
    endsAt: endsAt != null ? new Date(endsAt).toISOString() : null,
    extensionPromptAt: promptAt != null ? new Date(promptAt).toISOString() : null,
    autoCompleteAt: overtimeAt != null ? new Date(overtimeAt).toISOString() : null,
    overtimeAt: overtimeAt != null ? new Date(overtimeAt).toISOString() : null,
    msUntilEnd: endsAt != null ? Math.max(0, endsAt - now) : null,
    msUntilPrompt: promptAt != null ? promptAt - now : null,
    msUntilAutoComplete: overtimeAt != null ? overtimeAt - now : null,
    msUntilOvertime: overtimeAt != null ? overtimeAt - now : null,
    phase:
      booking.status !== BOOKING_STATUS.STARTED
        ? 'not_started'
        : overtimeAt != null && overtimeAt <= now
          ? 'past_grace'
          : endsAt != null && endsAt <= now
            ? 'in_grace'
            : promptAt != null && promptAt <= now
              ? 'extend_window'
              : 'in_ride',
  };
}

export async function listDevBookingsService(query = {}) {
  const {
    search = '',
    status = '',
    bookingType = '',
    page = 1,
    limit = 20,
  } = query;

  const filter = { isDeleted: false };
  if (status) filter.status = status;
  if (bookingType) filter.bookingType = bookingType;

  const term = String(search || '').trim();
  if (term) {
    filter.$or = [
      { bookingNumber: { $regex: term, $options: 'i' } },
      ...( /^[a-fA-F0-9]{24}$/.test(term) ? [{ _id: term }] : []),
    ];
  }

  const skip = (Math.max(1, Number(page)) - 1) * Math.min(50, Math.max(1, Number(limit)));
  const take = Math.min(50, Math.max(1, Number(limit)));

  const [total, bookings] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(filter)
      .select(
        'bookingNumber status bookingType serviceType paymentStatus fareSnapshot.total timeline hourly outstation userId driverId createdAt',
      )
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone_no')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(take)
      .lean(),
  ]);

  return {
    bookings,
    pagination: { page: Number(page), limit: take, total, pages: Math.ceil(total / take) },
  };
}

export async function getDevBookingDetailService(bookingRef) {
  const booking = await resolveBooking(bookingRef);
  const doc = await Booking.findById(booking._id).populate(POPULATE).lean();
  if (!doc) throw new ApiError(404, 'Booking not found');

  return {
    booking: doc,
    timing: buildTimingSnapshot(doc),
    allowedStatuses: BOOKING_STATUS_LIST,
    bookingTypes: Object.values(BOOKING_TYPE),
  };
}

async function resolveBooking(ref) {
  const key = String(ref || '').trim();
  if (!key) throw new ApiError(400, 'Booking id required');

  if (/^[a-fA-F0-9]{24}$/.test(key)) {
    const byId = await Booking.findOne({ _id: key, isDeleted: false }).select('_id bookingNumber');
    if (byId) return byId;
  }

  const byNumber = await Booking.findOne({ bookingNumber: key, isDeleted: false }).select(
    '_id bookingNumber',
  );
  if (byNumber) return byNumber;

  throw new ApiError(404, `Booking not found for "${key}"`);
}

/**
 * Patch booking fields for QA — status changes go through the normal
 * admin pipeline so sockets/notifications stay honest.
 */
export async function patchDevBookingService(bookingRef, body = {}) {
  const resolved = await resolveBooking(bookingRef);
  let booking = await Booking.findById(resolved._id);
  if (!booking) throw new ApiError(404, 'Booking not found');

  const {
    status,
    statusReason,
    paymentStatus,
    timeline = {},
    hourly = {},
    outstation = {},
    rescheduleTimers,
  } = body;

  if (status && status !== booking.status) {
    const result = await adminUpdateBookingStatusService(
      String(booking._id),
      { status, reason: statusReason || 'dev_panel_override' },
      null,
    );
    booking = await Booking.findById(booking._id);
    if (!result.changed && result.booking) {
      booking.status = result.booking.status;
    }
  }

  if (paymentStatus && Object.values(BOOKING_PAYMENT_STATUS).includes(paymentStatus)) {
    booking.paymentStatus = paymentStatus;
  }

  booking.timeline = booking.timeline || {};
  for (const key of [
    'driverAssignedAt',
    'paymentDeadlineAt',
    'paymentReceivedAt',
    'enRouteAt',
    'arrivedAt',
    'startedAt',
    'completedAt',
    'cancelledAt',
  ]) {
    if (timeline[key] !== undefined) {
      booking.timeline[key] = parseDate(timeline[key]);
    }
  }

  if (booking.hourly) {
    if (hourly.scheduledStartAt !== undefined) {
      booking.hourly.scheduledStartAt = parseDate(hourly.scheduledStartAt);
    }
    if (hourly.durationHours !== undefined) {
      const h = Number(hourly.durationHours);
      if (Number.isFinite(h) && h > 0) booking.hourly.durationHours = h;
    }
  }

  if (booking.outstation) {
    for (const key of [
      'pickupAt',
      'expectedReturnAt',
      'startDate',
      'endDate',
      'returnReminderSentAt',
      'returnReachedPromptedAt',
      'lastReturnPromptAt',
    ]) {
      if (outstation[key] !== undefined) {
        booking.outstation[key] = parseDate(outstation[key]);
      }
    }
    if (outstation.days !== undefined) {
      const d = Number(outstation.days);
      if (Number.isFinite(d) && d > 0) booking.outstation.days = d;
    }
  }

  await booking.save();

  if (rescheduleTimers !== false) {
    cancelRideEndSchedule(booking._id);
    if (booking.status === BOOKING_STATUS.STARTED) {
      scheduleRideEndTimer(booking);
    }
  }

  const fresh = await Booking.findById(booking._id).populate(POPULATE).lean();
  return {
    booking: fresh,
    timing: buildTimingSnapshot(fresh),
  };
}

/** Shift startedAt so the booked window ends in `minutesUntilEnd` minutes. */
export async function devSimulateRideEndingService(bookingRef, { minutesUntilEnd = 5 } = {}) {
  const resolved = await resolveBooking(bookingRef);
  const booking = await Booking.findById(resolved._id);
  if (!booking) throw new ApiError(404, 'Booking not found');

  if (booking.serviceType !== SERVICE_TYPES.HOURLY) {
    throw new ApiError(400, 'Ride-end simulation applies to hourly bookings only');
  }
  if (booking.status !== BOOKING_STATUS.STARTED) {
    throw new ApiError(409, 'Booking must be STARTED to simulate ride ending');
  }

  const durationMs = bookedRideDurationMs(booking);
  if (durationMs <= 0) {
    throw new ApiError(400, 'Booking has no hourly duration');
  }

  const mins = Math.max(0, Number(minutesUntilEnd) || 0);
  const targetEndMs = Date.now() + mins * 60_000;
  const newStartedAt = new Date(targetEndMs - durationMs);

  booking.timeline = booking.timeline || {};
  booking.timeline.startedAt = newStartedAt;
  await booking.save();

  cancelRideEndSchedule(booking._id);
  scheduleRideEndTimer(booking);

  const fresh = await Booking.findById(booking._id).populate(POPULATE).lean();
  return {
    booking: fresh,
    timing: buildTimingSnapshot(fresh),
    startedAt: newStartedAt.toISOString(),
  };
}

export async function devBookingActionService(bookingRef, action, payload = {}) {
  const resolved = await resolveBooking(bookingRef);
  const id = String(resolved._id);

  switch (action) {
    case 'trigger_assign': {
      const result = await kickoffScheduledAssignment(id);
      return { action, result };
    }
    case 'trigger_dispatch': {
      const booking = await Booking.findById(id);
      if (!booking) throw new ApiError(404, 'Booking not found');
      if (booking.status !== BOOKING_STATUS.SEARCHING) {
        booking.status = BOOKING_STATUS.SEARCHING;
        await booking.save();
      }
      const result = await dispatchNextDriverService(id);
      return { action, result };
    }
    case 'trigger_escalate': {
      const { escalateToEmergencyPool } = await import('./bookingEmergencyPool.service.js');
      const result = await escalateToEmergencyPool(id);
      return { action, result };
    }
    case 'extension_prompt': {
      await triggerExtensionPromptNow(id);
      const booking = await Booking.findById(id).populate(POPULATE).lean();
      return { action, timing: buildTimingSnapshot(booking), booking };
    }
    case 'auto_complete':
    case 'force_overtime': {
      const result = await triggerAutoCompleteNow(id);
      const booking = await Booking.findById(id).populate(POPULATE).lean();
      return { action, result, timing: buildTimingSnapshot(booking), booking };
    }
    case 'reschedule_timers': {
      const booking = await Booking.findById(id);
      if (!booking) throw new ApiError(404, 'Booking not found');
      cancelRideEndSchedule(id);
      if (booking.status === BOOKING_STATUS.STARTED) scheduleRideEndTimer(booking);
      const fresh = await Booking.findById(id).populate(POPULATE).lean();
      return { action, timing: buildTimingSnapshot(fresh), booking: fresh };
    }
    case 'simulate_ending': {
      return devSimulateRideEndingService(id, payload);
    }
    default:
      throw new ApiError(400, `Unknown action: ${action}`);
  }
}
