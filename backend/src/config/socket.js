import { Server as SocketIOServer } from 'socket.io';
import { Driver } from '../models/driverModels/driver.model.js';
import User from '../models/user.model.js';
import { verifyAccessToken, inferAccountType } from '../utils/jwt.util.js';
import { ACCOUNT_DRIVER, ACCOUNT_USER, USER_ROLES } from '../constants/roles.js';
import { STAFF_ROLES } from '../constants/staffPermissions.js';
import { COOKIE_NAMES } from '../utils/cookie.util.js';
import { getCorsOrigins } from './cors.config.js';
import {
  C2S_EVENTS,
  S2C_EVENTS,
  SOCKET_ROOM_PREFIX,
} from '../constants/socketEvents.js';
import { SOS_SOCKET_ROOMS } from '../constants/sos.js';
import { attachDriverSocketHandlers } from '../controllers/driverSocket.controller.js';
import { attachChatSocketHandlers } from '../controllers/chatSocket.controller.js';

/**
 * Socket.IO server bootstrap.
 *
 * Auth model:
 *   - Token resolution order: `handshake.auth.token` → cookie (`accessToken`).
 *   - JWT verified using the same secret/util as REST middlewares.
 *   - Account loaded from Mongo and attached to `socket.data.principal`.
 *
 * Room model (auto-joined on connect):
 *   - `user:{userId}`     for an authenticated app user
 *   - `driver:{driverId}` for an authenticated driver
 *   - `admin`             for any staff role (admin / sub_admin / team_member)
 *
 * Booking rooms (`booking:{bookingId}`) are joined dynamically by callers
 * when a ride enters an active phase. That logic lives in the booking
 * controller (Phase 4+).
 */

let ioInstance = null;

/* ------------------------------------------------------------------ */
/* Cookie + token helpers                                              */
/* ------------------------------------------------------------------ */

function parseCookieHeader(header) {
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function extractToken(socket) {
  const authToken = socket.handshake?.auth?.token;
  if (authToken) return authToken;

  const cookieHeader = socket.request?.headers?.cookie;
  if (cookieHeader) {
    const parsed = parseCookieHeader(cookieHeader);
    if (parsed[COOKIE_NAMES.accessToken]) return parsed[COOKIE_NAMES.accessToken];
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Auth middleware                                                     */
/* ------------------------------------------------------------------ */

class SocketAuthError extends Error {
  constructor(message, code = 'unauthorized') {
    super(message);
    this.data = { code };
  }
}

async function loadPrincipal(decoded) {
  const accountType = inferAccountType(decoded);

  if (accountType === ACCOUNT_DRIVER) {
    const driver = await Driver.findById(decoded.id);
    if (!driver || driver.isDeleted) {
      throw new SocketAuthError('Driver account not found or deactivated');
    }
    return {
      type: 'driver',
      id: driver._id.toString(),
      role: 'driver',
      entity: driver,
    };
  }

  if (accountType === ACCOUNT_USER) {
    const user = await User.findById(decoded.id);
    if (!user || user.isDeleted) {
      throw new SocketAuthError('User account not found or deactivated');
    }
    if (STAFF_ROLES.includes(user.role) && !user.isActive) {
      throw new SocketAuthError('Staff account is deactivated');
    }
    return {
      type: 'user',
      id: user._id.toString(),
      role: user.role || USER_ROLES.USER,
      entity: user,
    };
  }

  throw new SocketAuthError('Unknown account type');
}

async function authMiddleware(socket, next) {
  try {
    const token = extractToken(socket);
    if (!token) {
      return next(new SocketAuthError('No access token provided'));
    }

    const decoded = verifyAccessToken(token);
    const principal = await loadPrincipal(decoded);

    socket.data.principal = principal;
    next();
  } catch (err) {
    if (err instanceof SocketAuthError) return next(err);
    return next(new SocketAuthError(err.message || 'Authentication failed'));
  }
}

/* ------------------------------------------------------------------ */
/* Room helpers                                                        */
/* ------------------------------------------------------------------ */

export function roomForUser(userId) {
  return `${SOCKET_ROOM_PREFIX.USER}:${userId}`;
}

export function roomForDriver(driverId) {
  return `${SOCKET_ROOM_PREFIX.DRIVER}:${driverId}`;
}

export function roomForBooking(bookingId) {
  return `${SOCKET_ROOM_PREFIX.BOOKING}:${bookingId}`;
}

/** Authorized trip-chat room — only join after chat.service access check. */
export function roomForBookingChat(bookingId) {
  return `${SOCKET_ROOM_PREFIX.BOOKING_CHAT}:${bookingId}`;
}

export const ADMIN_ROOM = SOCKET_ROOM_PREFIX.ADMIN;
export const ADMIN_SOS_ROOM = SOS_SOCKET_ROOMS.ADMIN;
export const OPERATIONS_SOS_ROOM = SOS_SOCKET_ROOMS.OPERATIONS;

function joinIdentityRooms(socket) {
  const { principal } = socket.data;
  if (!principal) return;

  if (principal.type === 'driver') {
    socket.join(roomForDriver(principal.id));
    return;
  }

  if (principal.type === 'user') {
    socket.join(roomForUser(principal.id));
    if (STAFF_ROLES.includes(principal.role)) {
      socket.join(ADMIN_ROOM);
      socket.join(`${ADMIN_ROOM}:role:${principal.role}`);
      socket.join(ADMIN_SOS_ROOM);
      socket.join(OPERATIONS_SOS_ROOM);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Connection handler                                                  */
/* ------------------------------------------------------------------ */

function attachConnectionHandlers(socket) {
  joinIdentityRooms(socket);

  const { principal } = socket.data;
  socket.emit(S2C_EVENTS.CONNECTED, {
    principalType: principal.type,
    role: principal.role,
    serverTime: Date.now(),
  });

  socket.on(C2S_EVENTS.PING, (payload, ack) => {
    const reply = { serverTime: Date.now(), echo: payload ?? null };
    socket.emit(S2C_EVENTS.PONG, reply);
    if (typeof ack === 'function') ack(reply);
  });

  socket.on(C2S_EVENTS.BOOKING_JOIN, ({ bookingId } = {}) => {
    if (!bookingId) return;
    socket.join(roomForBooking(bookingId));
  });

  socket.on(C2S_EVENTS.BOOKING_LEAVE, ({ bookingId } = {}) => {
    if (!bookingId) return;
    socket.leave(roomForBooking(bookingId));
  });

  // Booking-scoped trip chat (authorized join + message handlers).
  attachChatSocketHandlers(socket);

  // Driver-specific handlers (location stream, online/offline mirror).
  if (principal.type === 'driver') {
    attachDriverSocketHandlers(socket);
  }

  if (process.env.SOCKET_DEBUG === 'true') {
    console.log(
      `[socket] connected ${principal.type}:${principal.id} role=${principal.role} id=${socket.id}`,
    );
    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnected ${principal.type}:${principal.id} reason=${reason}`);
    });
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Initializes the Socket.IO server, attaches it to the given HTTP server,
 * and stores it as a module-level singleton. Idempotent.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
export function initializeSocket(httpServer) {
  if (ioInstance) return ioInstance;

  ioInstance = new SocketIOServer(httpServer, {
    cors: {
      origin: getCorsOrigins(),
      credentials: true,
    },
    pingInterval: 25_000,
    pingTimeout: 60_000,
    transports: ['websocket', 'polling'],
  });

  ioInstance.use(authMiddleware);

  ioInstance.on('connection', (socket) => {
    try {
      attachConnectionHandlers(socket);
    } catch (err) {
      console.error('[socket] connection handler error:', err);
      socket.emit(S2C_EVENTS.AUTH_ERROR, { message: err.message });
      socket.disconnect(true);
    }
  });

  console.log('✅ Socket.IO initialized');
  return ioInstance;
}

/**
 * Returns the active Socket.IO server instance.
 * Throws when accessed before `initializeSocket(...)` has run.
 */
export function getIo() {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized yet. Call initializeSocket(httpServer) first.');
  }
  return ioInstance;
}

/** Returns the singleton if it exists, without throwing. */
export function getIoOrNull() {
  return ioInstance;
}
