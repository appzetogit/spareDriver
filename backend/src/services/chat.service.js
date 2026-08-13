import mongoose from 'mongoose';
import Booking from '../models/booking.model.js';
import ChatConversation from '../models/chatConversation.model.js';
import ChatMessage from '../models/chatMessage.model.js';
import { ApiError } from '../utils/apiError.js';
import { STAFF_ROLES } from '../constants/staffPermissions.js';
import { assertStaffCanViewBooking } from './booking.service.js';
import {
  CHAT_HISTORY_DEFAULT_LIMIT,
  CHAT_MESSAGE_TYPE,
  CHAT_SENDER_ROLE,
  CHAT_CHANNEL,
  defaultChannelForAudience,
  inferMessageChannel,
  isChatVisibleForBooking,
  isChatWritableForParticipant,
  resolveChatChannel,
  allowedRecipientRoles,
} from '../constants/chat.js';
import {
  emitToBookingChat,
  emitToUser,
  emitToDriver,
  emitToAdmins,
  isPrincipalInBookingChat,
} from '../utils/socketEmitters.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import { TERMINAL_BOOKING_STATUSES } from '../constants/bookingStatus.js';
import {
  notifyUserTripChatMessage,
  notifyDriverTripChatMessage,
  notifyAdminsTripChatMessage,
} from '../utils/notificationDispatch.js';

function toId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value._id != null) return String(value._id);
  return String(value);
}

function displayNameFromEntity(entity, role) {
  if (!entity) {
    if (role === CHAT_SENDER_ROLE.ADMIN) return 'Support';
    if (role === CHAT_SENDER_ROLE.DRIVER) return 'Driver';
    return 'Customer';
  }
  const name =
    entity.fullName ||
    entity.name ||
    [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim();
  if (name) return String(name).slice(0, 120);
  if (role === CHAT_SENDER_ROLE.ADMIN) return 'Support';
  if (role === CHAT_SENDER_ROLE.DRIVER) return 'Driver';
  return 'Customer';
}

function serializeMessage(doc) {
  const m = doc?.toObject ? doc.toObject() : doc;
  return {
    id: String(m._id),
    conversationId: String(m.conversationId),
    bookingId: String(m.bookingId),
    senderId: String(m.senderId),
    senderRole: m.senderRole,
    senderName: m.senderName || '',
    recipientRole: m.recipientRole || null,
    channel: m.channel || inferMessageChannel(m),
    message: m.message,
    messageType: m.messageType,
    clientMessageId: m.clientMessageId || null,
    readBy: (m.readBy || []).map((r) => ({
      readerId: String(r.readerId),
      readerRole: r.readerRole,
      readAt: r.readAt,
    })),
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function serializeConversation(doc) {
  const c = doc?.toObject ? doc.toObject() : doc;
  return {
    id: String(c._id),
    bookingId: String(c.bookingId),
    userId: String(c.userId),
    driverId: String(c.driverId),
    lastMessage: c.lastMessage
      ? {
          text: c.lastMessage.text || '',
          senderId: c.lastMessage.senderId ? String(c.lastMessage.senderId) : null,
          senderRole: c.lastMessage.senderRole || null,
          createdAt: c.lastMessage.createdAt || null,
        }
      : null,
    lastMessageAt: c.lastMessageAt || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/**
 * Resolve actor from Express req or socket principal.
 * @returns {{ role: string, id: string, entity: object }}
 */
export function resolveChatActor({ user, driver, staff, principal } = {}) {
  if (staff) {
    return {
      role: CHAT_SENDER_ROLE.ADMIN,
      id: String(staff._id),
      entity: staff,
    };
  }
  if (driver) {
    return {
      role: CHAT_SENDER_ROLE.DRIVER,
      id: String(driver._id),
      entity: driver,
    };
  }
  if (user) {
    if (STAFF_ROLES.includes(user.role)) {
      return {
        role: CHAT_SENDER_ROLE.ADMIN,
        id: String(user._id),
        entity: user,
      };
    }
    return {
      role: CHAT_SENDER_ROLE.USER,
      id: String(user._id),
      entity: user,
    };
  }
  if (principal) {
    if (principal.type === 'driver') {
      return {
        role: CHAT_SENDER_ROLE.DRIVER,
        id: String(principal.id),
        entity: principal.entity,
      };
    }
    if (STAFF_ROLES.includes(principal.role)) {
      return {
        role: CHAT_SENDER_ROLE.ADMIN,
        id: String(principal.id),
        entity: principal.entity,
      };
    }
    return {
      role: CHAT_SENDER_ROLE.USER,
      id: String(principal.id),
      entity: principal.entity,
    };
  }
  throw new ApiError(401, 'Not authenticated');
}

async function loadBookingForChat(bookingId) {
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new ApiError(400, 'Invalid booking id');
  }
  const booking = await Booking.findOne({ _id: bookingId, isDeleted: false })
    .select(
      'userId driverId status timeline bookingNumber zoneIds serviceType',
    )
    .lean();
  if (!booking) throw new ApiError(404, 'Booking not found');
  return booking;
}

/**
 * Authorize chat access. Throws ApiError on failure.
 * @returns {{ booking, actor, canWrite: boolean }}
 */
export async function assertChatAccess(bookingId, actor, { requireWrite = false } = {}) {
  const booking = await loadBookingForChat(bookingId);

  if (actor.role === CHAT_SENDER_ROLE.USER) {
    if (toId(booking.userId) !== actor.id) {
      throw new ApiError(403, 'You do not have access to this chat');
    }
  } else if (actor.role === CHAT_SENDER_ROLE.DRIVER) {
    if (!booking.driverId || toId(booking.driverId) !== actor.id) {
      throw new ApiError(403, 'You do not have access to this chat');
    }
  } else if (actor.role === CHAT_SENDER_ROLE.ADMIN) {
    assertStaffCanViewBooking(actor.entity, booking);
  } else {
    throw new ApiError(403, 'You do not have access to this chat');
  }

  if (!isChatVisibleForBooking(booking)) {
    throw new ApiError(403, 'Chat is not available for this booking yet');
  }

  const canWrite = isChatWritableForParticipant(booking, actor.role);
  if (requireWrite && !canWrite) {
    throw new ApiError(403, 'Chat is read-only for this trip');
  }

  return { booking, actor, canWrite };
}

async function getOrCreateConversation(booking) {
  const bookingId = booking._id;
  const existing = await ChatConversation.findOne({ bookingId });
  if (existing) return existing;

  try {
    return await ChatConversation.create({
      bookingId,
      userId: booking.userId,
      driverId: booking.driverId,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return ChatConversation.findOne({ bookingId });
    }
    throw err;
  }
}

export async function getChatForBookingService(bookingId, actorInput) {
  const actor = resolveChatActor(actorInput);
  const { booking, canWrite } = await assertChatAccess(bookingId, actor);
  const conversation = await getOrCreateConversation(booking);
  const unreadCount = await countUnreadForActor(conversation._id, actor);

  return {
    conversation: serializeConversation(conversation),
    canWrite: actor.role === CHAT_SENDER_ROLE.ADMIN ? false : canWrite,
    unreadCount,
    booking: {
      id: String(booking._id),
      bookingNumber: booking.bookingNumber || '',
      status: booking.status,
      userId: toId(booking.userId),
      driverId: toId(booking.driverId),
    },
  };
}

export async function listChatMessagesService(
  bookingId,
  actorInput,
  { limit = CHAT_HISTORY_DEFAULT_LIMIT, before, channel } = {},
) {
  const actor = resolveChatActor(actorInput);
  const { booking, canWrite } = await assertChatAccess(bookingId, actor);
  const conversation = await getOrCreateConversation(booking);

  const filter = { conversationId: conversation._id, bookingId: booking._id };

  const lane =
    channel ||
    (actor.role === CHAT_SENDER_ROLE.ADMIN ? CHAT_CHANNEL.USER_DRIVER : null);
  if (lane) {
    filter.channel = lane;
  }

  if (before) {
    const beforeDate = new Date(before);
    if (!Number.isNaN(beforeDate.getTime())) {
      filter.createdAt = { $lt: beforeDate };
    }
  }

  const pageSize = Math.min(Number(limit) || CHAT_HISTORY_DEFAULT_LIMIT, 100);
  const rows = await ChatMessage.find(filter)
    .sort({ createdAt: -1 })
    .limit(pageSize)
    .lean();

  const messages = rows.reverse().map(serializeMessage);
  const hasMore = rows.length >= pageSize;

  return {
    conversation: serializeConversation(conversation),
    messages,
    hasMore,
    canWrite: actor.role === CHAT_SENDER_ROLE.ADMIN ? false : canWrite,
    unreadCount: await countUnreadForActor(conversation._id, actor, lane),
    channel: lane,
  };
}

async function countUnreadForActor(conversationId, actor, channel = null) {
  const actorOid = new mongoose.Types.ObjectId(actor.id);
  const filter = {
    conversationId,
    senderId: { $ne: actorOid },
    'readBy.readerId': { $nin: [actorOid] },
  };
  if (channel) filter.channel = channel;
  return ChatMessage.countDocuments(filter);
}

export async function getChatUnreadCountService(bookingId, actorInput, { channel } = {}) {
  const actor = resolveChatActor(actorInput);
  const { booking } = await assertChatAccess(bookingId, actor);
  const conversation = await ChatConversation.findOne({ bookingId: booking._id }).lean();
  if (!conversation) return { unreadCount: 0 };
  const lane =
    channel ||
    (actor.role === CHAT_SENDER_ROLE.ADMIN ? CHAT_CHANNEL.USER_DRIVER : null);
  const unreadCount = await countUnreadForActor(conversation._id, actor, lane);
  return { unreadCount, channel: lane };
}

export async function sendChatMessageService(bookingId, actorInput, payload) {
  const actor = resolveChatActor(actorInput);
  const { booking } = await assertChatAccess(bookingId, actor, { requireWrite: true });
  const conversation = await getOrCreateConversation(booking);

  const recipientRole = String(payload.recipientRole || '').trim();
  const allowed = allowedRecipientRoles(actor.role);
  if (!allowed.includes(recipientRole)) {
    throw new ApiError(400, 'Invalid message recipient');
  }

  const channel = resolveChatChannel(actor.role, recipientRole);
  if (!channel) {
    throw new ApiError(400, 'Could not resolve chat channel');
  }

  const text = String(payload.message || '').trim();
  if (!text) throw new ApiError(400, 'Message cannot be empty');

  const clientMessageId = payload.clientMessageId
    ? String(payload.clientMessageId).trim()
    : null;

  if (clientMessageId) {
    const existing = await ChatMessage.findOne({
      bookingId: booking._id,
      senderId: actor.id,
      clientMessageId,
    }).lean();
    if (existing) {
      return {
        message: serializeMessage(existing),
        conversation: serializeConversation(conversation),
        duplicate: true,
      };
    }
  }

  const senderName = displayNameFromEntity(actor.entity, actor.role);

  let messageDoc;
  try {
    messageDoc = await ChatMessage.create({
      conversationId: conversation._id,
      bookingId: booking._id,
      senderId: actor.id,
      senderRole: actor.role,
      recipientRole,
      channel,
      senderName,
      message: text,
      messageType: payload.messageType || CHAT_MESSAGE_TYPE.TEXT,
      clientMessageId,
      readBy: [
        {
          readerId: actor.id,
          readerRole: actor.role,
          readAt: new Date(),
        },
      ],
    });
  } catch (err) {
    if (err?.code === 11000 && clientMessageId) {
      const existing = await ChatMessage.findOne({
        bookingId: booking._id,
        senderId: actor.id,
        clientMessageId,
      }).lean();
      if (existing) {
        return {
          message: serializeMessage(existing),
          conversation: serializeConversation(
            await ChatConversation.findById(conversation._id),
          ),
          duplicate: true,
        };
      }
    }
    throw err;
  }

  conversation.lastMessage = {
    text: text.slice(0, 200),
    senderId: actor.id,
    senderRole: actor.role,
    createdAt: messageDoc.createdAt,
  };
  conversation.lastMessageAt = messageDoc.createdAt;
  await conversation.save();

  const serialized = serializeMessage(messageDoc);
  const eventPayload = {
    bookingId: String(booking._id),
    conversationId: String(conversation._id),
    channel,
    message: serialized,
  };

  // Real-time fan-out to chat room + personal rooms (for unread badges).
  emitToBookingChat(booking._id, S2C_EVENTS.CHAT_MESSAGE_CREATED, eventPayload);
  emitToUser(booking.userId, S2C_EVENTS.CHAT_MESSAGE_CREATED, eventPayload);
  emitToDriver(booking.driverId, S2C_EVENTS.CHAT_MESSAGE_CREATED, eventPayload);
  emitToAdmins(S2C_EVENTS.CHAT_MESSAGE_CREATED, eventPayload);

  await dispatchChatNotifications({
    booking,
    message: serialized,
    channel,
    senderRole: actor.role,
    recipientRole,
    senderId: actor.id,
    senderName,
  });

  return {
    message: serialized,
    conversation: serializeConversation(conversation),
    duplicate: false,
  };
}

async function dispatchChatNotifications({
  booking,
  message,
  channel,
  senderRole,
  recipientRole,
  senderId,
  senderName,
}) {
  const bookingId = String(booking._id);
  const preview = message.message.length > 80
    ? `${message.message.slice(0, 77)}...`
    : message.message;

  const roleLabel =
    senderRole === CHAT_SENDER_ROLE.USER
      ? 'Customer'
      : senderRole === CHAT_SENDER_ROLE.DRIVER
        ? 'Driver'
        : 'Support';

  const title = `New message from ${senderName || roleLabel}`;
  const body = preview;
  const data = {
    bookingId,
    bookingNumber: booking.bookingNumber || '',
    conversationId: message.conversationId,
    messageId: message.id,
    channel,
    recipientRole,
  };

  const chatQuery = channel ? `chat=1&channel=${encodeURIComponent(channel)}` : 'chat=1';
  const userChatPath = TERMINAL_BOOKING_STATUSES.includes(booking.status)
    ? `/user/trips/${bookingId}?${chatQuery}`
    : `/user/book/assigned/${bookingId}?${chatQuery}`;

  const tasks = [];

  if (recipientRole === CHAT_SENDER_ROLE.USER && senderRole !== CHAT_SENDER_ROLE.USER) {
    const inChat = isPrincipalInBookingChat(
      bookingId,
      'user',
      toId(booking.userId),
    );
    if (!inChat) {
      tasks.push(
        notifyUserTripChatMessage(toId(booking.userId), {
          title,
          body,
          data: {
            ...data,
            path: userChatPath,
          },
        }),
      );
    }
  }

  if (recipientRole === CHAT_SENDER_ROLE.DRIVER && senderRole !== CHAT_SENDER_ROLE.DRIVER) {
    const inChat = isPrincipalInBookingChat(
      bookingId,
      'driver',
      toId(booking.driverId),
    );
    if (!inChat) {
      tasks.push(
        notifyDriverTripChatMessage(toId(booking.driverId), {
          title,
          body,
          data: {
            ...data,
            path: `/driver/trip/${bookingId}?${chatQuery}`,
          },
        }),
      );
    }
  }

  if (recipientRole === CHAT_SENDER_ROLE.ADMIN) {
    tasks.push(
      notifyAdminsTripChatMessage({
        title: `${roleLabel} message · ${booking.bookingNumber || ''}`.trim(),
        body,
        data: {
          ...data,
          path: `/admin/bookings?bookingId=${bookingId}&${chatQuery}`,
          bookingId,
        },
        zoneIds: booking.zoneIds,
      }),
    );
  }

  await Promise.allSettled(tasks);
}

export async function markChatReadService(
  bookingId,
  actorInput,
  { upToMessageId, channel } = {},
) {
  const actor = resolveChatActor(actorInput);
  const { booking } = await assertChatAccess(bookingId, actor);
  const conversation = await ChatConversation.findOne({ bookingId: booking._id });
  if (!conversation) {
    return { marked: 0, unreadCount: 0 };
  }

  const actorOid = new mongoose.Types.ObjectId(actor.id);
  const filter = {
    conversationId: conversation._id,
    bookingId: booking._id,
    senderId: { $ne: actorOid },
    'readBy.readerId': { $nin: [actorOid] },
  };

  const lane =
    channel ||
    (actor.role === CHAT_SENDER_ROLE.ADMIN ? CHAT_CHANNEL.USER_DRIVER : null);
  if (lane) filter.channel = lane;

  if (upToMessageId && mongoose.isValidObjectId(upToMessageId)) {
    const upTo = await ChatMessage.findOne({
      _id: upToMessageId,
      bookingId: booking._id,
    })
      .select('createdAt')
      .lean();
    if (upTo?.createdAt) {
      filter.createdAt = { $lte: upTo.createdAt };
    }
  }

  const now = new Date();
  const result = await ChatMessage.updateMany(filter, {
    $push: {
      readBy: {
        readerId: actor.id,
        readerRole: actor.role,
        readAt: now,
      },
    },
  });

  const marked = result.modifiedCount || 0;
  const unreadCount = await countUnreadForActor(conversation._id, actor, lane);

  const payload = {
    bookingId: String(booking._id),
    conversationId: String(conversation._id),
    channel: lane,
    readerId: actor.id,
    readerRole: actor.role,
    readAt: now.toISOString(),
    upToMessageId: upToMessageId || null,
    marked,
  };

  emitToBookingChat(booking._id, S2C_EVENTS.CHAT_MESSAGE_READ, payload);

  return { marked, unreadCount, ...payload };
}

/**
 * Socket-safe wrappers that return structured errors instead of throwing
 * through Express.
 */
export async function socketJoinChat(bookingId, principal) {
  const actor = resolveChatActor({ principal });
  const access = await assertChatAccess(bookingId, actor);
  const conversation = await getOrCreateConversation(access.booking);
  const unreadCount = await countUnreadForActor(conversation._id, actor);
  return {
    ok: true,
    conversation: serializeConversation(conversation),
    canWrite: access.canWrite,
    unreadCount,
    bookingId: String(access.booking._id),
  };
}

export async function socketSendChatMessage(bookingId, principal, payload) {
  return sendChatMessageService(bookingId, { principal }, payload);
}

export async function socketMarkChatRead(bookingId, principal, payload) {
  return markChatReadService(bookingId, { principal }, payload);
}
