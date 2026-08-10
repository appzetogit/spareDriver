import { BOOKING_STATUS } from './bookingStatus.js';

/**
 * Booking-scoped trip chat constants.
 * Mirrored (partially) in `frontend/src/constants/chat.js`.
 */

export const CHAT_SENDER_ROLE = Object.freeze({
  USER: 'user',
  DRIVER: 'driver',
  ADMIN: 'admin',
});

export const CHAT_SENDER_ROLE_LIST = Object.freeze(Object.values(CHAT_SENDER_ROLE));

/** Conversation lanes inside a booking chat. */
export const CHAT_CHANNEL = Object.freeze({
  USER_DRIVER: 'user_driver',
  USER_ADMIN: 'user_admin',
  DRIVER_ADMIN: 'driver_admin',
});

export const CHAT_CHANNEL_LIST = Object.freeze(Object.values(CHAT_CHANNEL));

export const CHAT_MESSAGE_TYPE = Object.freeze({
  TEXT: 'text',
  // Reserved for later — do not emit from clients yet.
  IMAGE: 'image',
  SYSTEM: 'system',
  LOCATION: 'location',
  FILE: 'file',
});

export const CHAT_MESSAGE_TYPE_LIST = Object.freeze(Object.values(CHAT_MESSAGE_TYPE));

/** Max length for a single text message. */
export const CHAT_MESSAGE_MAX_LENGTH = 1500;

/** Default page size when loading history (newest first, then reversed for UI). */
export const CHAT_HISTORY_DEFAULT_LIMIT = 40;
export const CHAT_HISTORY_MAX_LIMIT = 100;

/**
 * Statuses where customer/driver may open chat (driver must be assigned).
 * Includes terminal states for read-only history.
 */
export const CHAT_VISIBLE_STATUSES = Object.freeze([
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
]);

/**
 * Statuses where customer/driver may send messages.
 * Admin may still send after trip ends (ops follow-up).
 */
export const CHAT_WRITABLE_STATUSES = Object.freeze([
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
]);

export function isChatVisibleForBooking(booking) {
  if (!booking?.driverId) return false;
  const status = booking.status;
  return CHAT_VISIBLE_STATUSES.includes(status);
}

export function isChatWritableForParticipant(booking, senderRole) {
  if (!booking?.driverId) return false;
  // Admin observes customer ↔ driver chat only (read-only).
  if (senderRole === CHAT_SENDER_ROLE.ADMIN) return false;
  return CHAT_WRITABLE_STATUSES.includes(booking.status);
}

/** Map sender + intended recipient to a persisted channel key. */
export function resolveChatChannel(senderRole, recipientRole) {
  if (senderRole === CHAT_SENDER_ROLE.USER && recipientRole === CHAT_SENDER_ROLE.DRIVER) {
    return CHAT_CHANNEL.USER_DRIVER;
  }
  if (senderRole === CHAT_SENDER_ROLE.DRIVER && recipientRole === CHAT_SENDER_ROLE.USER) {
    return CHAT_CHANNEL.USER_DRIVER;
  }
  if (senderRole === CHAT_SENDER_ROLE.USER && recipientRole === CHAT_SENDER_ROLE.ADMIN) {
    return CHAT_CHANNEL.USER_ADMIN;
  }
  if (senderRole === CHAT_SENDER_ROLE.ADMIN && recipientRole === CHAT_SENDER_ROLE.USER) {
    return CHAT_CHANNEL.USER_ADMIN;
  }
  if (senderRole === CHAT_SENDER_ROLE.DRIVER && recipientRole === CHAT_SENDER_ROLE.ADMIN) {
    return CHAT_CHANNEL.DRIVER_ADMIN;
  }
  if (senderRole === CHAT_SENDER_ROLE.ADMIN && recipientRole === CHAT_SENDER_ROLE.DRIVER) {
    return CHAT_CHANNEL.DRIVER_ADMIN;
  }
  return null;
}

/** Allowed recipient roles per sender (admin excluded — read-only). */
export function allowedRecipientRoles(senderRole) {
  if (senderRole === CHAT_SENDER_ROLE.USER) {
    return [CHAT_SENDER_ROLE.DRIVER, CHAT_SENDER_ROLE.ADMIN];
  }
  if (senderRole === CHAT_SENDER_ROLE.DRIVER) {
    return [CHAT_SENDER_ROLE.USER, CHAT_SENDER_ROLE.ADMIN];
  }
  return [];
}

export function defaultChannelForAudience(audience) {
  if (audience === 'driver') return CHAT_CHANNEL.USER_DRIVER;
  if (audience === 'admin') return CHAT_CHANNEL.USER_DRIVER;
  return CHAT_CHANNEL.USER_DRIVER;
}

/** Infer channel for legacy rows missing `channel`. */
export function inferMessageChannel(msg) {
  if (msg?.channel) return msg.channel;
  const { senderRole, recipientRole } = msg || {};
  const resolved = resolveChatChannel(senderRole, recipientRole);
  if (resolved) return resolved;
  if (senderRole === CHAT_SENDER_ROLE.USER || senderRole === CHAT_SENDER_ROLE.DRIVER) {
    return CHAT_CHANNEL.USER_DRIVER;
  }
  return CHAT_CHANNEL.USER_ADMIN;
}
