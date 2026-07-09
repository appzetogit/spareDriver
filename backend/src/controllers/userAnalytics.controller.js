import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { getAdminUserAnalyticsService, listAdminUserWalletTransactionsService } from '../services/adminUserAnalytics.service.js';
import { buildUserAnalyticsPdf } from '../services/userAnalyticsPdf.service.js';

export const getAdminUserAnalytics = asyncHandler(async (req, res) => {
  const result = await getAdminUserAnalyticsService(req.params.userId, req.query);
  return res.status(200).json(new ApiResponse(200, result, 'User analytics fetched'));
});

export const getAdminUserWalletTransactions = asyncHandler(async (req, res) => {
  const result = await listAdminUserWalletTransactionsService(req.params.userId, req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Wallet transactions fetched'));
});

export const downloadUserAnalyticsPdf = asyncHandler(async (req, res) => {
  await buildUserAnalyticsPdf(req.params.userId, req.query, { res });
});
