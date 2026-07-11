import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  sendBulkPromotionalPushService,
  getBulkPushAudienceStatsService,
  listBulkPushHistoryService,
  listBulkPushRecipientsService,
} from '../services/adminBulkPush.service.js';

export const getBulkPushAudienceStats = asyncHandler(async (req, res) => {
  const result = await getBulkPushAudienceStatsService(req.query.audience);
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Audience stats fetched'));
});

export const listBulkPushRecipients = asyncHandler(async (req, res) => {
  const result = await listBulkPushRecipientsService(req.query);
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Recipients fetched'));
});

export const listBulkPushHistory = asyncHandler(async (req, res) => {
  const result = await listBulkPushHistoryService(req.query);
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Push history fetched'));
});

export const sendBulkPromotionalPush = asyncHandler(async (req, res) => {
  const result = await sendBulkPromotionalPushService({
    ...req.body,
    sentBy: req.staff?._id || null,
  });
  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      `Push sent to ${result.sent} of ${result.total} recipients`,
    ),
  );
});
