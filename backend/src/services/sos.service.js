import mongoose from 'mongoose';
import Booking from '../models/booking.model.js';
import Car from '../models/user/car.model.js';
import EmergencyContact from '../models/emergencyContact.model.js';
import SosAlert from '../models/sosAlert.model.js';
import SosLocationLog from '../models/sosLocationLog.model.js';
import SosAuditLog from '../models/sosAuditLog.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  SOS_STATUS,
  SOS_TRIGGERED_BY,
  SOS_ELIGIBLE_BOOKING_STATUSES,
  SOS_AUDIT_EVENT,
} from '../constants/sos.js';
import {
  buildEmergencyMessage,
  notifyEmergencyContactsBySms,
} from './sosNotification.service.js';
import {
  notifyAdminSosTriggered,
  notifyOperationsSosTriggered,
  notifyUserSosUpdate,
  notifyDriverEmergencyAlert,
} from '../utils/notificationDispatch.js';
import { emitSosCreated, emitSosLocation, emitSosResolved } from '../utils/socketEmitters.js';
import {
  staffAssigneeListFilter,
  assertStaffCanAccessAssigned,
  findTeamMemberAssignee,
  assertCanAssignToTeamMember,
} from '../utils/staffAssignment.util.js';

function formatTimelineLabel(event) {
  const labels = {
    [SOS_AUDIT_EVENT.SOS_TRIGGERED]: 'SOS Triggered',
    [SOS_AUDIT_EVENT.ADMIN_NOTIFIED]: 'Admin Notified',
    [SOS_AUDIT_EVENT.OPERATIONS_NOTIFIED]: 'Operations Notified',
    [SOS_AUDIT_EVENT.EMERGENCY_CONTACT_NOTIFIED]: 'Emergency Contact Notified',
    [SOS_AUDIT_EVENT.LOCATION_UPDATED]: 'Location Updated',
    [SOS_AUDIT_EVENT.SOS_ASSIGNED]: 'Assigned to Team Member',
    [SOS_AUDIT_EVENT.SOS_RESOLVED]: 'SOS Resolved',
  };
  return labels[event] || event;
}

async function writeAuditLog({ sosId, tripId, action, actorType = 'system', actorId = null, details = {}, ip = '' }) {
  await SosAuditLog.create({
    sosId,
    tripId,
    action,
    actorType,
    actorId,
    details,
    ip,
  });
}

function pushTimelineEvent(alert, event, meta = {}) {
  alert.timeline.push({
    event,
    label: formatTimelineLabel(event),
    at: new Date(),
    meta,
  });
}

function resolveDestination(booking) {
  if (booking.dropoff?.address) return booking.dropoff.address;
  if (booking.outstation?.destinationAddress) return booking.outstation.destinationAddress;
  return booking.pickup?.address || '';
}

function assertObjectId(id, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
}

async function loadBookingForSos(tripId) {
  assertObjectId(tripId, 'tripId');
  const booking = await Booking.findOne({ _id: tripId, isDeleted: false })
    .populate('userId', 'name phone_no')
    .populate('driverId', 'name phone')
    .lean();

  if (!booking) throw new ApiError(404, 'Trip not found');
  if (!SOS_ELIGIBLE_BOOKING_STATUSES.includes(booking.status)) {
    throw new ApiError(400, 'SOS is only available during an active trip');
  }
  if (!booking.driverId) {
    throw new ApiError(400, 'No driver assigned to this trip');
  }
  return booking;
}

function assertParticipant(booking, { userId, driverId }) {
  if (userId && String(booking.userId?._id || booking.userId) === String(userId)) return;
  if (driverId && String(booking.driverId?._id || booking.driverId) === String(driverId)) return;
  throw new ApiError(403, 'You are not a participant on this trip');
}

export async function createSosService({ tripId, latitude, longitude, principal, ip }) {
  const booking = await loadBookingForSos(tripId);

  const triggeredBy =
    principal.type === 'driver' ? SOS_TRIGGERED_BY.DRIVER : SOS_TRIGGERED_BY.PASSENGER;
  assertParticipant(booking, {
    userId: principal.type === 'user' ? principal.id : null,
    driverId: principal.type === 'driver' ? principal.id : null,
  });

  const existing = await SosAlert.findOne({ tripId, status: SOS_STATUS.ACTIVE }).lean();
  if (existing) {
    throw new ApiError(409, 'An active SOS already exists for this trip', { sosId: String(existing._id) });
  }

  const passenger = booking.userId;
  const driver = booking.driverId;
  const car = await Car.findById(booking.carId).select('vehicleNumber').lean();

  const alert = await SosAlert.create({
    tripId: booking._id,
    bookingNumber: booking.bookingNumber || '',
    userId: passenger._id || passenger,
    passengerName: passenger?.name || '',
    passengerPhone: passenger?.phone_no || '',
    driverId: driver._id || driver,
    driverName: driver?.name || '',
    driverPhone: driver?.phone || '',
    vehicleId: booking.carId,
    vehicleNumber: car?.vehicleNumber || '',
    startLocation: booking.pickup?.address || '',
    destination: resolveDestination(booking),
    currentLocation: { lat: latitude, lng: longitude },
    status: SOS_STATUS.ACTIVE,
    triggeredBy,
    timeline: [],
  });

  pushTimelineEvent(alert, SOS_AUDIT_EVENT.SOS_TRIGGERED, { triggeredBy });
  await alert.save();

  await SosLocationLog.create({
    sosId: alert._id,
    latitude,
    longitude,
    timestamp: new Date(),
  });

  await writeAuditLog({
    sosId: alert._id,
    tripId: booking._id,
    action: SOS_AUDIT_EVENT.SOS_TRIGGERED,
    actorType: principal.type,
    actorId: principal.id,
    details: { latitude, longitude, triggeredBy },
    ip,
  });

  const contacts = await EmergencyContact.find({ userId: alert.userId }).lean();
  const emergencyMessage = buildEmergencyMessage({
    userName: alert.passengerName,
    driverName: alert.driverName,
    driverPhone: alert.driverPhone,
    vehicleNumber: alert.vehicleNumber,
    lat: latitude,
    lng: longitude,
    tripId: alert.bookingNumber || alert.tripId,
  });

  const socketPayload = {
    sosId: String(alert._id),
    tripId: String(alert.tripId),
    bookingNumber: alert.bookingNumber,
    passengerName: alert.passengerName,
    driverName: alert.driverName,
    vehicleNumber: alert.vehicleNumber,
    currentLocation: alert.currentLocation,
    status: alert.status,
    triggeredBy: alert.triggeredBy,
    createdAt: alert.createdAt,
  };

  emitSosCreated(socketPayload);

  notifyAdminSosTriggered({
    sosId: String(alert._id),
    tripId: String(alert.tripId),
    message: 'Passenger has requested emergency assistance.',
    zoneIds: (booking.zoneIds || []).map((id) => String(id)),
  });
  pushTimelineEvent(alert, SOS_AUDIT_EVENT.ADMIN_NOTIFIED);
  await writeAuditLog({
    sosId: alert._id,
    tripId: booking._id,
    action: SOS_AUDIT_EVENT.ADMIN_NOTIFIED,
    details: {},
  });

  notifyOperationsSosTriggered({
    sosId: String(alert._id),
    tripId: String(alert.tripId),
    message: 'Passenger has requested emergency assistance.',
  });
  pushTimelineEvent(alert, SOS_AUDIT_EVENT.OPERATIONS_NOTIFIED);
  await writeAuditLog({
    sosId: alert._id,
    tripId: booking._id,
    action: SOS_AUDIT_EVENT.OPERATIONS_NOTIFIED,
    details: {},
  });

  if (contacts.length) {
    const smsResults = await notifyEmergencyContactsBySms(contacts, emergencyMessage);
    pushTimelineEvent(alert, SOS_AUDIT_EVENT.EMERGENCY_CONTACT_NOTIFIED, {
      count: contacts.length,
      smsResults,
    });
    await writeAuditLog({
      sosId: alert._id,
      tripId: booking._id,
      action: SOS_AUDIT_EVENT.EMERGENCY_CONTACT_NOTIFIED,
      details: { count: contacts.length, smsResults },
    });
  }

  await alert.save();

  notifyUserSosUpdate(alert.userId, {
    sosId: String(alert._id),
    message: 'Emergency assistance has been activated. Help is on the way.',
  });

  if (alert.driverId) {
    notifyDriverEmergencyAlert(alert.driverId, {
      title: '🚨 Emergency SOS Alert',
      body: 'Passenger has requested emergency assistance.',
      data: { sosId: String(alert._id), tripId: String(alert.tripId), priority: 'high' },
    });
  }

  return { sosId: String(alert._id), alert };
}

export async function updateSosLocationService({ sosId, latitude, longitude, principal, ip }) {
  assertObjectId(sosId, 'sosId');

  const alert = await SosAlert.findById(sosId);
  if (!alert) throw new ApiError(404, 'SOS alert not found');
  if (alert.status !== SOS_STATUS.ACTIVE) {
    throw new ApiError(400, 'This SOS alert is no longer active');
  }

  const booking = { userId: alert.userId, driverId: alert.driverId };
  assertParticipant(booking, {
    userId: principal.type === 'user' ? principal.id : null,
    driverId: principal.type === 'driver' ? principal.id : null,
  });

  alert.currentLocation = { lat: latitude, lng: longitude };
  pushTimelineEvent(alert, SOS_AUDIT_EVENT.LOCATION_UPDATED, { latitude, longitude });
  await alert.save();

  const log = await SosLocationLog.create({
    sosId: alert._id,
    latitude,
    longitude,
    timestamp: new Date(),
  });

  await writeAuditLog({
    sosId: alert._id,
    tripId: alert.tripId,
    action: SOS_AUDIT_EVENT.LOCATION_UPDATED,
    actorType: principal.type,
    actorId: principal.id,
    details: { latitude, longitude },
    ip,
  });

  const locationPayload = {
    sosId: String(alert._id),
    tripId: String(alert.tripId),
    latitude,
    longitude,
    timestamp: log.timestamp,
    currentLocation: alert.currentLocation,
  };

  emitSosLocation(locationPayload);

  return { sosId: String(alert._id) };
}

export async function resolveSosService({ sosId, staff, ip }) {
  assertObjectId(sosId, 'sosId');
  const staffId = staff._id;

  const alert = await SosAlert.findById(sosId);
  if (!alert) throw new ApiError(404, 'SOS alert not found');
  assertStaffCanAccessAssigned(staff, alert.assignedTo);
  if (alert.status === SOS_STATUS.RESOLVED) {
    throw new ApiError(400, 'SOS alert is already resolved');
  }

  alert.status = SOS_STATUS.RESOLVED;
  alert.resolvedAt = new Date();
  alert.resolvedBy = staffId;
  pushTimelineEvent(alert, SOS_AUDIT_EVENT.SOS_RESOLVED, { resolvedBy: String(staffId) });
  await alert.save();

  await writeAuditLog({
    sosId: alert._id,
    tripId: alert.tripId,
    action: SOS_AUDIT_EVENT.SOS_RESOLVED,
    actorType: 'staff',
    actorId: staffId,
    ip,
  });

  emitSosResolved({
    sosId: String(alert._id),
    tripId: String(alert.tripId),
    resolvedAt: alert.resolvedAt,
  });

  notifyUserSosUpdate(alert.userId, {
    sosId: String(alert._id),
    message: 'Your SOS alert has been resolved by our support team.',
  });

  return alert;
}

export async function getActiveSosForTripService(tripId, principal) {
  assertObjectId(tripId, 'tripId');
  const booking = await Booking.findById(tripId).select('userId driverId').lean();
  if (!booking) throw new ApiError(404, 'Trip not found');
  assertParticipant(booking, {
    userId: principal.type === 'user' ? principal.id : null,
    driverId: principal.type === 'driver' ? principal.id : null,
  });

  return SosAlert.findOne({ tripId, status: SOS_STATUS.ACTIVE }).lean();
}

export async function listAdminSosService(staff, { status, page = 1, limit = 20, search }) {
  const filter = {
    ...staffAssigneeListFilter(staff),
  };
  if (status) filter.status = status;

  if (search) {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(search);
    filter.$or = [
      { passengerName: { $regex: search, $options: 'i' } },
      { passengerPhone: { $regex: search, $options: 'i' } },
      { driverName: { $regex: search, $options: 'i' } },
      { driverPhone: { $regex: search, $options: 'i' } },
      { vehicleNumber: { $regex: search, $options: 'i' } },
      { bookingNumber: { $regex: search, $options: 'i' } },
      ...(isObjectId ? [{ _id: search }, { tripId: search }] : []),
    ];
  }

  const skip = (page - 1) * limit;
  const [alerts, total] = await Promise.all([
    SosAlert.find(filter)
      .populate('assignedTo', 'name email role')
      .populate('assignedBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SosAlert.countDocuments(filter),
  ]);

  return {
    alerts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function getAdminSosDetailService(staff, sosId) {
  assertObjectId(sosId, 'sosId');

  const alert = await SosAlert.findById(sosId)
    .populate('assignedTo', 'name email role')
    .populate('assignedBy', 'name email role')
    .lean();
  if (!alert) throw new ApiError(404, 'SOS alert not found');
  assertStaffCanAccessAssigned(staff, alert.assignedTo);

  const [locationLogs, auditLogs] = await Promise.all([
    SosLocationLog.find({ sosId }).sort({ timestamp: -1 }).limit(200).lean(),
    SosAuditLog.find({ sosId }).sort({ createdAt: -1 }).limit(100).lean(),
  ]);

  return { alert, locationLogs, auditLogs };
}

export async function assignSosService(staff, sosId, { assigneeId }) {
  assertCanAssignToTeamMember(staff);
  assertObjectId(sosId, 'sosId');

  const alert = await SosAlert.findById(sosId);
  if (!alert) throw new ApiError(404, 'SOS alert not found');
  if (alert.status === SOS_STATUS.RESOLVED) {
    throw new ApiError(400, 'Cannot assign a resolved SOS alert');
  }

  const assignee = await findTeamMemberAssignee(assigneeId);
  alert.assignedTo = assignee._id;
  alert.assignedBy = staff._id;
  alert.assignedAt = new Date();
  pushTimelineEvent(alert, SOS_AUDIT_EVENT.SOS_ASSIGNED, {
    assigneeId: String(assignee._id),
    assigneeName: assignee.name || assignee.email || '',
  });
  await alert.save();

  await writeAuditLog({
    sosId: alert._id,
    tripId: alert.tripId,
    action: SOS_AUDIT_EVENT.SOS_ASSIGNED,
    actorType: 'staff',
    actorId: staff._id,
    details: {
      assigneeId: String(assignee._id),
      assigneeName: assignee.name || assignee.email || '',
    },
  });

  return SosAlert.findById(alert._id)
    .populate('assignedTo', 'name email role')
    .populate('assignedBy', 'name email role')
    .lean();
}
