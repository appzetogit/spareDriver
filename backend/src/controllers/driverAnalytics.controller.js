import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  getAdminDriverAnalyticsService,
  listAdminDriverTripsService,
  listAdminDriverWithdrawalsService,
  listAdminDriverEarningsService,
} from '../services/adminDriverAnalytics.service.js';
import { buildDriverAnalyticsPdf } from '../services/driverAnalyticsPdf.service.js';

export const getAdminDriverAnalytics = asyncHandler(async (req, res) => {
  const result = await getAdminDriverAnalyticsService(req.params.driverId, req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Driver analytics fetched'));
});

export const getAdminDriverTrips = asyncHandler(async (req, res) => {
  const result = await listAdminDriverTripsService(req.params.driverId, req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Driver trips fetched'));
});

export const getAdminDriverWithdrawals = asyncHandler(async (req, res) => {
  const result = await listAdminDriverWithdrawalsService(req.params.driverId, req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Driver withdrawals fetched'));
});

export const getAdminDriverEarnings = asyncHandler(async (req, res) => {
  const result = await listAdminDriverEarningsService(req.params.driverId, req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Driver earnings fetched'));
});

export const downloadDriverAnalyticsPdf = asyncHandler(async (req, res) => {
  await buildDriverAnalyticsPdf(req.params.driverId, req.query, { res });
});
