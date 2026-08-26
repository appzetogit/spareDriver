/** Keep in sync with backend/src/constants/socketEvents.js */

export const CONNECTION_EVENTS = Object.freeze({
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
});

/** Client → Server */
export const C2S_EVENTS = Object.freeze({
  PING: 'system:ping',

  DRIVER_LOCATION_UPDATE: 'driver:location:update',
  DRIVER_ONLINE: 'driver:online',
  DRIVER_OFFLINE: 'driver:offline',

  BOOKING_ACCEPT: 'booking:accept',
  BOOKING_REJECT: 'booking:reject',

  BOOKING_JOIN: 'booking:join',
  BOOKING_LEAVE: 'booking:leave',

  CHAT_JOIN: 'chat:join',
  CHAT_LEAVE: 'chat:leave',
  CHAT_MESSAGE_SEND: 'chat:message:send',
  CHAT_MESSAGE_READ: 'chat:message:read',
  CHAT_TYPING_START: 'chat:typing:start',
  CHAT_TYPING_STOP: 'chat:typing:stop',
});

/** Server → Client */
export const S2C_EVENTS = Object.freeze({
  AUTH_ERROR: 'system:auth:error',
  PONG: 'system:pong',
  CONNECTED: 'system:connected',

  DRIVER_STATUS_CHANGED: 'driver:status:changed',
  TRIP_LOCATION_UPDATED: 'trip:location:updated',
  /** Alias emitted alongside TRIP_LOCATION_UPDATED for native customer apps. */
  DRIVER_LOCATION_UPDATE: 'driverLocationUpdate',

  BOOKING_OFFERED: 'booking:offered',
  BOOKING_OFFER_WITHDRAWN: 'booking:offer:withdrawn',
  BOOKING_UPDATED: 'booking:updated',
  BOOKING_PAYMENT_REQUIRED: 'booking:payment:required',
  BOOKING_DRIVER_REASSIGNING: 'booking:driver:reassigning',
  BOOKING_EXTENSION_OFFERED: 'booking:extension:offered',
  BOOKING_EXTENSION_RESOLVED: 'booking:extension:resolved',
  // Driver receives the OTP to read out to the customer who's trying
  // to extend their ride. Payload: { bookingId, extensionId, otp,
  // additionalHours, fareDelta, expiresAt }
  BOOKING_EXTENSION_OTP: 'booking:extension:otp',
  // Extension paid successfully. Payload includes the full extension
  // sub-doc + updated extensions list so the UI can extend its
  // remaining-time bar without a refetch.
  BOOKING_EXTENSION_PAID: 'booking:extension:paid',
  BOOKING_NOSHOW_PROMPT: 'booking:noshow:prompt',
  /** Outstation return approaching / reached / grace prompts. */
  BOOKING_OUTSTATION_RETURN: 'booking:outstation:return',

  // Post-trip ratings. Each side submits once after COMPLETED and the
  // other side hears about it here. Payload: { bookingId,
  // bookingNumber, stars, review, serviceType }
  BOOKING_RATED_BY_CUSTOMER: 'booking:rated:by_customer',
  BOOKING_RATED_BY_DRIVER: 'booking:rated:by_driver',

  NOTIFICATION: 'notification:new',
  ADMIN_ALERT: 'admin:alert',

  CHAT_JOINED: 'chat:joined',
  CHAT_MESSAGE_CREATED: 'chat:message:created',
  CHAT_MESSAGE_READ: 'chat:message:read',
  CHAT_TYPING: 'chat:typing',
  CHAT_ERROR: 'chat:error',
});

/** SOS realtime events (keep in sync with backend/src/constants/sos.js) */
export const SOS_SOCKET_EVENTS = Object.freeze({
  NEW_SOS: 'new-sos',
  SOS_LOCATION: 'sos-location',
  SOS_RESOLVED: 'sos-resolved',
});
