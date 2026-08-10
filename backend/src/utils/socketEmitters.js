import {
  getIoOrNull,
  roomForUser,
  roomForDriver,
  roomForBooking,
  roomForBookingChat,
  ADMIN_ROOM,
  ADMIN_SOS_ROOM,
  OPERATIONS_SOS_ROOM,
} from '../config/socket.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import { SOS_SOCKET_EVENTS } from '../constants/sos.js';

/**
 * Thin wrappers around `io.to(room).emit(...)` so feature code never imports
 * Socket.IO directly. Every helper is safe to call before the socket server
 * has booted (returns false silently); this lets unit tests and CLI scripts
 * use the same services without crashing.
 *
 * Callers should treat these as fire-and-forget. The return value is for
 * tests and observability only.
 */

function safeEmit(room, event, payload) {
  const io = getIoOrNull();
  if (!io) return false;
  io.to(room).emit(event, payload);
  return true;
}

/**
 * Normalize the id argument to a plain string so callers can hand us
 * either a raw ObjectId, a string, or a populated Mongoose document.
 * Without this guard `${populatedDoc}` interpolates to `[object Object]`
 * and the emit lands in a phantom room (no one receives it).
 */
function toRoomId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

/** Send to all sockets of a specific app user. */
export function emitToUser(userId, event, payload) {
  const id = toRoomId(userId);
  if (!id) return false;
  return safeEmit(roomForUser(id), event, payload);
}

/** Send to all sockets of a specific driver. */
export function emitToDriver(driverId, event, payload) {
  const id = toRoomId(driverId);
  if (!id) return false;
  return safeEmit(roomForDriver(id), event, payload);
}

/** Send to everyone in a booking room (user + driver + admin observers). */
export function emitToBooking(bookingId, event, payload) {
  const id = toRoomId(bookingId);
  if (!id) return false;
  return safeEmit(roomForBooking(id), event, payload);
}

/** Send to everyone who joined the authorized booking chat room. */
export function emitToBookingChat(bookingId, event, payload) {
  const id = toRoomId(bookingId);
  if (!id) return false;
  return safeEmit(roomForBookingChat(id), event, payload);
}

/**
 * True if any active socket for this principal is currently in the
 * booking chat room (used to suppress push while viewing chat).
 */
export function isPrincipalInBookingChat(bookingId, principalType, principalId) {
  const io = getIoOrNull();
  const bid = toRoomId(bookingId);
  const pid = toRoomId(principalId);
  if (!io || !bid || !pid) return false;

  const room = roomForBookingChat(bid);
  const sockets = io.sockets?.adapter?.rooms?.get(room);
  if (!sockets || sockets.size === 0) return false;

  for (const socketId of sockets) {
    const sock = io.sockets.sockets.get(socketId);
    const principal = sock?.data?.principal;
    if (!principal) continue;
    if (String(principal.id) !== pid) continue;
    if (principalType === 'driver' && principal.type === 'driver') return true;
    if (principalType === 'user' && principal.type === 'user') return true;
    if (principalType === 'admin' && principal.type === 'user') {
      // staff use type=user with a staff role
      return true;
    }
  }
  return false;
}

/** Broadcast to every staff dashboard. */
export function emitToAdmins(event, payload) {
  return safeEmit(ADMIN_ROOM, event, payload);
}

/** Broadcast to admins of a specific staff role only. */
export function emitToAdminRole(role, event, payload) {
  if (!role) return false;
  return safeEmit(`${ADMIN_ROOM}:role:${role}`, event, payload);
}

/* ------------------------------------------------------------------ */
/* Sugar for common payload shapes                                     */
/* ------------------------------------------------------------------ */

/**
 * In-app notification toast. `target` is one of:
 *   { userId: '...' }, { driverId: '...' }, { admin: true }, { adminRole: 'sub_admin' }
 *
 * @param {object} target
 * @param {{ title: string; body?: string; severity?: 'info'|'success'|'warn'|'error'; data?: object }} notification
 */
export function emitNotification(target, notification) {
  const payload = {
    title: notification.title,
    body: notification.body || '',
    severity: notification.severity || 'info',
    data: notification.data || {},
    sentAt: Date.now(),
  };
  if (target.userId) return emitToUser(target.userId, S2C_EVENTS.NOTIFICATION, payload);
  if (target.driverId) return emitToDriver(target.driverId, S2C_EVENTS.NOTIFICATION, payload);
  if (target.adminRole) return emitToAdminRole(target.adminRole, S2C_EVENTS.NOTIFICATION, payload);
  if (target.admin) return emitToAdmins(S2C_EVENTS.NOTIFICATION, payload);
  return false;
}

/**
 * Operational alert for admin dashboards (driver shortage, kit low, etc.).
 *
 * @param {{ kind: string; severity?: 'info'|'warn'|'critical'; message: string; data?: object }} alert
 */
export function emitAdminAlert(alert) {
  return emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
    kind: alert.kind,
    severity: alert.severity || 'info',
    message: alert.message,
    data: alert.data || {},
    occurredAt: Date.now(),
  });
}

export function emitSosCreated(sosData) {
  const okAdmin = safeEmit(ADMIN_SOS_ROOM, SOS_SOCKET_EVENTS.NEW_SOS, sosData);
  const okOps = safeEmit(OPERATIONS_SOS_ROOM, SOS_SOCKET_EVENTS.NEW_SOS, sosData);
  return okAdmin || okOps;
}

export function emitSosLocation(locationData) {
  const okAdmin = safeEmit(ADMIN_SOS_ROOM, SOS_SOCKET_EVENTS.SOS_LOCATION, locationData);
  const okOps = safeEmit(OPERATIONS_SOS_ROOM, SOS_SOCKET_EVENTS.SOS_LOCATION, locationData);
  return okAdmin || okOps;
}

export function emitSosResolved(payload) {
  const okAdmin = safeEmit(ADMIN_SOS_ROOM, SOS_SOCKET_EVENTS.SOS_RESOLVED, payload);
  const okOps = safeEmit(OPERATIONS_SOS_ROOM, SOS_SOCKET_EVENTS.SOS_RESOLVED, payload);
  return okAdmin || okOps;
}
