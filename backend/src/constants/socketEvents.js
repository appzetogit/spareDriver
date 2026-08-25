/**
 * Socket.IO event-name catalog.
 *
 * Mirrored verbatim in `frontend/src/constants/socketEvents.js`.
 * Keep both files in sync; any renames must happen on both sides
 * in the same PR.
 *
 * Naming convention: `<domain>:<entity>:<verb>`.
 *  - `client_to_server` events use imperative verbs (e.g. `update`, `ping`).
 *  - `server_to_client` events use past-tense verbs (e.g. `updated`, `changed`).
 */

export const SOCKET_NAMESPACE = '/';

export const SOCKET_ROOM_PREFIX = Object.freeze({
  USER: 'user',
  DRIVER: 'driver',
  ADMIN: 'admin',
  BOOKING: 'booking',
  /** Authorized chat room — join only after booking membership check. */
  BOOKING_CHAT: 'booking-chat',
});

/** Built-in Socket.IO lifecycle events (re-exported for convenience). */
export const CONNECTION_EVENTS = Object.freeze({
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
});

/**
 * Client → Server events.
 * The server expects exactly these names from authenticated sockets.
 */
export const C2S_EVENTS = Object.freeze({
  /** Lightweight latency / liveness probe. Server replies on same socket. */
  PING: 'system:ping',

  /** Driver app pushes current GPS coordinates. Payload validated server-side. */
  DRIVER_LOCATION_UPDATE: 'driver:location:update',

  /** Driver joins/leaves the dispatch pool (mirror of REST online toggle). */
  DRIVER_ONLINE: 'driver:online',
  DRIVER_OFFLINE: 'driver:offline',

  /** Booking lifecycle responses from driver app (accept / reject offer). */
  BOOKING_ACCEPT: 'booking:accept',
  BOOKING_REJECT: 'booking:reject',

  /** Booking room join/leave (for users + drivers watching a specific trip). */
  BOOKING_JOIN: 'booking:join',
  BOOKING_LEAVE: 'booking:leave',

  /** Trip chat — join/leave requires server-side booking access check. */
  CHAT_JOIN: 'chat:join',
  CHAT_LEAVE: 'chat:leave',
  CHAT_MESSAGE_SEND: 'chat:message:send',
  CHAT_MESSAGE_READ: 'chat:message:read',
  CHAT_TYPING_START: 'chat:typing:start',
  CHAT_TYPING_STOP: 'chat:typing:stop',
});

/**
 * Server → Client events.
 * Frontend should subscribe with `socket.on(S2C_EVENTS.X, handler)`.
 */
export const S2C_EVENTS = Object.freeze({
  /** Server-side authentication / authorization error after connect. */
  AUTH_ERROR: 'system:auth:error',

  /** Pong reply to PING. */
  PONG: 'system:pong',

  /** Welcome packet sent right after auth succeeds (principal info, server time). */
  CONNECTED: 'system:connected',

  /** A driver's status (online/offline/on-trip) changed. Broadcast to admins. */
  DRIVER_STATUS_CHANGED: 'driver:status:changed',

  /** Driver's live location update mirrored to a booking room. */
  TRIP_LOCATION_UPDATED: 'trip:location:updated',

  /**
   * Alias of the live GPS stream for native customer apps and the dashboard.
   * Emitted to `booking:{id}`, `trip_{id}`, and the admin room.
   */
  DRIVER_LOCATION_UPDATE: 'driverLocationUpdate',

  /** A new booking offer arrived for a driver. */
  BOOKING_OFFERED: 'booking:offered',

  /** Offer was withdrawn (driver took too long, user cancelled, etc.). */
  BOOKING_OFFER_WITHDRAWN: 'booking:offer:withdrawn',

  /** Booking state transitions (accepted, started, completed, cancelled, …). */
  BOOKING_UPDATED: 'booking:updated',

  /** Pre-pay flow: backend tells the user app it is time to pay. */
  BOOKING_PAYMENT_REQUIRED: 'booking:payment:required',

  /**
   * Driver cancelled a paid pre-STARTED booking. The user app shows a
   * popup ("driver bailed — finding a new driver") while the dispatcher
   * spins a fresh wave. Fires once per re-dispatch; the new SEARCHING
   * state still arrives via the standard BOOKING_UPDATED stream.
   */
  BOOKING_DRIVER_REASSIGNING: 'booking:driver:reassigning',

  /** Phase 5: extension flow — backend asks user to confirm +1h. */
  BOOKING_EXTENSION_OFFERED: 'booking:extension:offered',

  /** Phase 5: user responded to extension; driver hears about it here. */
  BOOKING_EXTENSION_RESOLVED: 'booking:extension:resolved',

  /**
   * Customer hit Extend → server generated a 4-digit OTP. Pushed to the
   * driver app so they can read it back to the customer who types it in.
   *
   * Payload: `{ bookingId, extensionId, otp, additionalHours,
   *            fareDelta, expiresAt }`
   *
   * The OTP is included in clear text because driver↔customer handshake
   * is the whole point of this event (just like RIDE_START_OTP today).
   */
  BOOKING_EXTENSION_OTP: 'booking:extension:otp',

  /**
   * Extension paid and accepted. Drives the driver UI to extend the
   * remaining-time bar and the user UI to dismiss the modal.
   *
   * Payload: `{ bookingId, extension, extensions, paymentStatus,
   *            amountDue, effectiveTotal, walletBalance }`
   */
  BOOKING_EXTENSION_PAID: 'booking:extension:paid',

  /**
   * No-show flow: driver has been at pickup past `noShowPromptMinutes`
   * without the trip starting. User app shows a modal asking "are you
   * coming?". Payload carries `{ bookingId, promptDeadlineAt }` so the
   * UI can render a countdown matching the server-side timer.
   */
  BOOKING_NOSHOW_PROMPT: 'booking:noshow:prompt',

  /**
   * Outstation return lifecycle prompt (approaching / reached / grace /
   * awaiting_decision). Hourly rides never emit this — they use
   * BOOKING_EXTENSION_OFFERED / ride-end timers instead.
   *
   * Payload: `{ bookingId, returnPhase, expectedReturnAt, outstation, … }`
   */
  BOOKING_OUTSTATION_RETURN: 'booking:outstation:return',

  /**
   * Post-trip rating events. Each side submits exactly once after
   * `COMPLETED`; the other side hears about it here (driver dashboard
   * tile / admin feedback feed). Payload:
   *   { bookingId, bookingNumber, stars, review, serviceType }
   */
  BOOKING_RATED_BY_CUSTOMER: 'booking:rated:by_customer',
  BOOKING_RATED_BY_DRIVER: 'booking:rated:by_driver',

  /** Generic toast / in-app notification. */
  NOTIFICATION: 'notification:new',

  /** Operational alerts for admin dashboards (e.g. low driver count in zone). */
  ADMIN_ALERT: 'admin:alert',

  /** Trip chat realtime events. */
  CHAT_JOINED: 'chat:joined',
  CHAT_MESSAGE_CREATED: 'chat:message:created',
  CHAT_MESSAGE_READ: 'chat:message:read',
  CHAT_TYPING: 'chat:typing',
  CHAT_ERROR: 'chat:error',
});
