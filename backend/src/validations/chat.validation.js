import { z } from 'zod';
import {
  CHAT_CHANNEL,
  CHAT_CHANNEL_LIST,
  CHAT_HISTORY_DEFAULT_LIMIT,
  CHAT_HISTORY_MAX_LIMIT,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_MESSAGE_TYPE,
  CHAT_SENDER_ROLE,
} from '../constants/chat.js';

const objectIdString = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');

export const chatHistoryQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CHAT_HISTORY_MAX_LIMIT)
    .optional()
    .default(CHAT_HISTORY_DEFAULT_LIMIT),
  before: z.string().trim().min(1).optional(),
  channel: z.enum(CHAT_CHANNEL_LIST).optional(),
});

export const sendChatMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(CHAT_MESSAGE_MAX_LENGTH, `Message must be at most ${CHAT_MESSAGE_MAX_LENGTH} characters`),
  messageType: z.enum([CHAT_MESSAGE_TYPE.TEXT]).optional().default(CHAT_MESSAGE_TYPE.TEXT),
  clientMessageId: z.string().trim().min(1).max(64).optional(),
  recipientRole: z.enum([
    CHAT_SENDER_ROLE.USER,
    CHAT_SENDER_ROLE.DRIVER,
    CHAT_SENDER_ROLE.ADMIN,
  ]),
});

export const markChatReadSchema = z.object({
  upToMessageId: objectIdString.optional(),
  channel: z.enum(CHAT_CHANNEL_LIST).optional(),
});

export const chatBookingIdParamSchema = z.object({
  id: objectIdString,
});
