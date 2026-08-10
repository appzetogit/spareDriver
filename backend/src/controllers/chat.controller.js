import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  getChatForBookingService,
  listChatMessagesService,
  sendChatMessageService,
  markChatReadService,
  getChatUnreadCountService,
} from '../services/chat.service.js';
import {
  chatHistoryQuerySchema,
  sendChatMessageSchema,
  markChatReadSchema,
  chatBookingIdParamSchema,
} from '../validations/chat.validation.js';

function actorFromReq(req) {
  return {
    user: req.user || null,
    driver: req.driver || null,
    staff: req.staff || null,
  };
}

export const getBookingChat = asyncHandler(async (req, res) => {
  const { id } = chatBookingIdParamSchema.parse(req.params);
  const data = await getChatForBookingService(id, actorFromReq(req));
  return res.status(200).json(new ApiResponse(200, data, 'Chat fetched'));
});

export const listBookingChatMessages = asyncHandler(async (req, res) => {
  const { id } = chatBookingIdParamSchema.parse(req.params);
  const query = chatHistoryQuerySchema.parse(req.query || {});
  const data = await listChatMessagesService(id, actorFromReq(req), query);
  return res.status(200).json(new ApiResponse(200, data, 'Messages fetched'));
});

export const sendBookingChatMessage = asyncHandler(async (req, res) => {
  const { id } = chatBookingIdParamSchema.parse(req.params);
  const body = sendChatMessageSchema.parse(req.body || {});
  const data = await sendChatMessageService(id, actorFromReq(req), body);
  return res.status(201).json(new ApiResponse(201, data, 'Message sent'));
});

export const markBookingChatRead = asyncHandler(async (req, res) => {
  const { id } = chatBookingIdParamSchema.parse(req.params);
  const body = markChatReadSchema.parse(req.body || {});
  const data = await markChatReadService(id, actorFromReq(req), body);
  return res.status(200).json(new ApiResponse(200, data, 'Messages marked read'));
});

export const getBookingChatUnread = asyncHandler(async (req, res) => {
  const { id } = chatBookingIdParamSchema.parse(req.params);
  const { channel } = chatHistoryQuerySchema.pick({ channel: true }).parse(req.query || {});
  const data = await getChatUnreadCountService(id, actorFromReq(req), { channel });
  return res.status(200).json(new ApiResponse(200, data, 'Unread count fetched'));
});
