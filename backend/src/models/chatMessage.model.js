import mongoose from 'mongoose';
import {
  CHAT_CHANNEL,
  CHAT_CHANNEL_LIST,
  CHAT_MESSAGE_TYPE,
  CHAT_MESSAGE_TYPE_LIST,
  CHAT_SENDER_ROLE_LIST,
} from '../constants/chat.js';

const readReceiptSchema = new mongoose.Schema(
  {
    readerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    readerRole: { type: String, enum: CHAT_SENDER_ROLE_LIST, required: true },
    readAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const chatMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatConversation',
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    senderRole: {
      type: String,
      enum: CHAT_SENDER_ROLE_LIST,
      required: true,
      index: true,
    },
    recipientRole: {
      type: String,
      enum: CHAT_SENDER_ROLE_LIST,
      default: null,
      index: true,
    },
    channel: {
      type: String,
      enum: CHAT_CHANNEL_LIST,
      default: CHAT_CHANNEL.USER_DRIVER,
      index: true,
    },
    /** Display name snapshot at send time (survives profile renames). */
    senderName: { type: String, default: '', trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 1500 },
    messageType: {
      type: String,
      enum: CHAT_MESSAGE_TYPE_LIST,
      default: CHAT_MESSAGE_TYPE.TEXT,
    },
    /**
     * Client-generated id for optimistic UI + idempotent retries.
     * Unique per (bookingId, senderId, clientMessageId) when present.
     */
    clientMessageId: { type: String, default: null, trim: true, maxlength: 64 },
    readBy: { type: [readReceiptSchema], default: [] },
  },
  { timestamps: true },
);

chatMessageSchema.index({ bookingId: 1, channel: 1, createdAt: -1 });
chatMessageSchema.index({ bookingId: 1, createdAt: -1 });
chatMessageSchema.index({ conversationId: 1, createdAt: -1 });
chatMessageSchema.index(
  { bookingId: 1, senderId: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMessageId: { $type: 'string' } },
  },
);

const ChatMessage =
  mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatMessageSchema);

export default ChatMessage;
