/** Keep in sync with backend/src/constants/chat.js */

import { BOOKING_STATUS } from './bookingStatus';

export const CHAT_SENDER_ROLE = Object.freeze({
  USER: 'user',
  DRIVER: 'driver',
  ADMIN: 'admin',
});

export const CHAT_CHANNEL = Object.freeze({
  USER_DRIVER: 'user_driver',
  USER_ADMIN: 'user_admin',
  DRIVER_ADMIN: 'driver_admin',
});

export const CHAT_MESSAGE_TYPE = Object.freeze({
  TEXT: 'text',
});

export const CHAT_MESSAGE_MAX_LENGTH = 1500;
export const CHAT_HISTORY_DEFAULT_LIMIT = 40;

export const CHAT_VISIBLE_STATUSES = Object.freeze([
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
]);

export const CHAT_WRITABLE_STATUSES = Object.freeze([
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
]);

export function isChatVisibleForBooking(booking) {
  if (!booking?.driverId) return false;
  return CHAT_VISIBLE_STATUSES.includes(booking.status);
}

export function isChatWritableForBooking(booking, audience = 'user') {
  if (!booking?.driverId) return false;
  if (audience === 'admin') return false;
  return CHAT_WRITABLE_STATUSES.includes(booking.status);
}

export const CHAT_ROLE_LABEL = Object.freeze({
  [CHAT_SENDER_ROLE.USER]: 'Customer',
  [CHAT_SENDER_ROLE.DRIVER]: 'Driver',
  [CHAT_SENDER_ROLE.ADMIN]: 'Support',
});

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
  if (senderRole === CHAT_SENDER_ROLE.DRIVER && recipientRole === CHAT_SENDER_ROLE.ADMIN) {
    return CHAT_CHANNEL.DRIVER_ADMIN;
  }
  return null;
}

export function inferMessageChannel(msg) {
  if (msg?.channel) return msg.channel;
  const resolved = resolveChatChannel(msg?.senderRole, msg?.recipientRole);
  if (resolved) return resolved;
  if (
    msg?.senderRole === CHAT_SENDER_ROLE.USER ||
    msg?.senderRole === CHAT_SENDER_ROLE.DRIVER
  ) {
    return CHAT_CHANNEL.USER_DRIVER;
  }
  return CHAT_CHANNEL.USER_ADMIN;
}

/** Tabs shown per audience (recipient role for each tab). */
export function channelTabsForAudience(audience) {
  if (audience === 'admin') {
    return [
      { channel: CHAT_CHANNEL.USER_DRIVER, label: 'Customer ↔ Driver', recipientRole: null },
    ];
  }
  return [
    {
      channel: CHAT_CHANNEL.USER_DRIVER,
      label: audience === 'driver' ? 'Customer' : 'Driver',
      recipientRole:
        audience === 'driver' ? CHAT_SENDER_ROLE.USER : CHAT_SENDER_ROLE.DRIVER,
    },
  ];
}

export const CHAT_QUICK_REPLIES = Object.freeze({
  [`${CHAT_SENDER_ROLE.USER}:${CHAT_SENDER_ROLE.DRIVER}`]: [
    'Where are you?',
    "I'm waiting at the pickup point",
    'Please call me',
    "I'm coming",
    'Please wait for me',
    "I'm at the location",
    'Can you share your current location?',
  ],
  [`${CHAT_SENDER_ROLE.DRIVER}:${CHAT_SENDER_ROLE.USER}`]: [
    "I'm on the way",
    "I've reached the pickup location",
    'Please come outside',
    "I'll be there shortly",
    'Please share your exact pickup location',
    "I'm waiting at the pickup point",
    'Please call me',
  ],
  [`${CHAT_SENDER_ROLE.USER}:${CHAT_SENDER_ROLE.ADMIN}`]: [
    'I need help with my trip',
    'Driver is not responding',
    'Please contact the driver',
    'Issue with pickup location',
    'I want to report an issue',
  ],
  [`${CHAT_SENDER_ROLE.DRIVER}:${CHAT_SENDER_ROLE.ADMIN}`]: [
    'Customer is not reachable',
    'Need support at pickup',
    'Issue with trip details',
    'Customer requested to cancel',
  ],
});

export function quickRepliesFor(senderRole, recipientRole) {
  return CHAT_QUICK_REPLIES[`${senderRole}:${recipientRole}`] || [];
}
