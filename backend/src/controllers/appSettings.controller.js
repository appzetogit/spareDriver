import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  getSupportConfigService,
  updateSupportConfigService,
  getGstDetailsService,
  updateGstDetailsService,
} from '../services/appSettings.service.js';

export const getAdminSupportConfig = asyncHandler(async (_req, res) => {
  const config = await getSupportConfigService();
  return res.status(200).json(new ApiResponse(200, config, 'Support config fetched'));
});

export const updateAdminSupportConfig = asyncHandler(async (req, res) => {
  const staffId = req.staff?._id || null;
  const config = await updateSupportConfigService(req.body, staffId);
  return res.status(200).json(new ApiResponse(200, config, 'Support config updated'));
});

export const getAdminGstDetails = asyncHandler(async (_req, res) => {
  const details = await getGstDetailsService();
  return res.status(200).json(new ApiResponse(200, details, 'GST details fetched'));
});

export const updateAdminGstDetails = asyncHandler(async (req, res) => {
  const staffId = req.staff?._id || null;
  const details = await updateGstDetailsService(req.body, staffId);
  return res.status(200).json(new ApiResponse(200, details, 'GST details updated'));
});

export const getAdminSubscriptionDispatch = asyncHandler(async (_req, res) => {
  const {
    getSubscriptionDispatchConfigService,
  } = await import('../services/subscriptionDispatch.service.js');
  const config = await getSubscriptionDispatchConfigService();
  return res
    .status(200)
    .json(new ApiResponse(200, config, 'Subscription dispatch config fetched'));
});

export const updateAdminSubscriptionDispatch = asyncHandler(async (req, res) => {
  const staffId = req.staff?._id || null;
  const {
    updateSubscriptionDispatchConfigService,
  } = await import('../services/subscriptionDispatch.service.js');
  const config = await updateSubscriptionDispatchConfigService(req.body, staffId);
  return res
    .status(200)
    .json(new ApiResponse(200, config, 'Subscription dispatch config updated'));
});
