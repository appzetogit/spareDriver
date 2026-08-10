import { C2S_EVENTS, S2C_EVENTS } from '../constants/socketEvents.js';
import { roomForBookingChat } from '../config/socket.js';
import { STAFF_ROLES } from '../constants/staffPermissions.js';
import { CHAT_SENDER_ROLE } from '../constants/chat.js';
import {
  socketJoinChat,
  socketSendChatMessage,
  socketMarkChatRead,
  resolveChatActor,
} from '../services/chat.service.js';
import { emitToBookingChat } from '../utils/socketEmitters.js';
import { sendChatMessageSchema, markChatReadSchema } from '../validations/chat.validation.js';
import { ApiError } from '../utils/apiError.js';

function ackOrEmit(socket, ack, event, payload) {
  if (typeof ack === 'function') {
    ack(payload);
    return;
  }
  if (event) socket.emit(event, payload);
}

function errorPayload(err) {
  return {
    ok: false,
    message: err?.message || 'Chat error',
    status: err?.statusCode || 500,
  };
}

function typingRole(principal) {
  if (principal.type === 'driver') return CHAT_SENDER_ROLE.DRIVER;
  if (STAFF_ROLES.includes(principal.role)) return CHAT_SENDER_ROLE.ADMIN;
  return CHAT_SENDER_ROLE.USER;
}

/**
 * Attach booking-scoped chat handlers to an authenticated socket.
 * Does NOT disconnect the socket on chat errors.
 */
export function attachChatSocketHandlers(socket) {
  socket.on(C2S_EVENTS.CHAT_JOIN, async (payload = {}, ack) => {
    try {
      const bookingId = payload?.bookingId;
      if (!bookingId) {
        return ackOrEmit(socket, ack, S2C_EVENTS.CHAT_ERROR, {
          ok: false,
          message: 'bookingId is required',
        });
      }

      const result = await socketJoinChat(bookingId, socket.data.principal);
      socket.join(roomForBookingChat(result.bookingId));
      if (!socket.data.chatRooms) socket.data.chatRooms = new Set();
      socket.data.chatRooms.add(String(result.bookingId));

      const response = { ok: true, ...result };
      ackOrEmit(socket, ack, S2C_EVENTS.CHAT_JOINED, response);
    } catch (err) {
      ackOrEmit(socket, ack, S2C_EVENTS.CHAT_ERROR, errorPayload(err));
    }
  });

  socket.on(C2S_EVENTS.CHAT_LEAVE, ({ bookingId } = {}, ack) => {
    if (bookingId) {
      socket.leave(roomForBookingChat(bookingId));
      socket.data.chatRooms?.delete(String(bookingId));
    }
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on(C2S_EVENTS.CHAT_MESSAGE_SEND, async (payload = {}, ack) => {
    try {
      const bookingId = payload?.bookingId;
      if (!bookingId) throw new ApiError(400, 'bookingId is required');

      const parsed = sendChatMessageSchema.parse({
        message: payload.message,
        messageType: payload.messageType,
        clientMessageId: payload.clientMessageId,
        recipientRole: payload.recipientRole,
      });

      const result = await socketSendChatMessage(
        bookingId,
        socket.data.principal,
        parsed,
      );
      ackOrEmit(socket, ack, null, { ok: true, ...result });
    } catch (err) {
      const zodMsg = err?.issues?.[0]?.message;
      ackOrEmit(
        socket,
        ack,
        S2C_EVENTS.CHAT_ERROR,
        errorPayload(zodMsg ? new ApiError(400, zodMsg) : err),
      );
    }
  });

  socket.on(C2S_EVENTS.CHAT_MESSAGE_READ, async (payload = {}, ack) => {
    try {
      const bookingId = payload?.bookingId;
      if (!bookingId) throw new ApiError(400, 'bookingId is required');
      const parsed = markChatReadSchema.parse({
        upToMessageId: payload.upToMessageId,
        channel: payload.channel,
      });
      const result = await socketMarkChatRead(
        bookingId,
        socket.data.principal,
        parsed,
      );
      ackOrEmit(socket, ack, null, { ok: true, ...result });
    } catch (err) {
      ackOrEmit(socket, ack, S2C_EVENTS.CHAT_ERROR, errorPayload(err));
    }
  });

  const emitTyping = (bookingId, channel, isTyping) => {
    if (!bookingId) return;
    if (!socket.data.chatRooms?.has(String(bookingId))) return;

    let actor;
    try {
      actor = resolveChatActor({ principal: socket.data.principal });
    } catch {
      return;
    }

    emitToBookingChat(bookingId, S2C_EVENTS.CHAT_TYPING, {
      bookingId: String(bookingId),
      channel: channel || null,
      senderId: actor.id,
      senderRole: actor.role || typingRole(socket.data.principal),
      isTyping: Boolean(isTyping),
      at: Date.now(),
    });
  };

  socket.on(C2S_EVENTS.CHAT_TYPING_START, ({ bookingId, channel } = {}) => {
    emitTyping(bookingId, channel, true);
  });

  socket.on(C2S_EVENTS.CHAT_TYPING_STOP, ({ bookingId, channel } = {}) => {
    emitTyping(bookingId, channel, false);
  });

  socket.on('disconnect', () => {
    socket.data.chatRooms?.clear();
  });
}
