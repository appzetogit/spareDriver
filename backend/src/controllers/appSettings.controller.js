import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  getSupportConfigService,
  updateSupportConfigService,
  getGstDetailsService,
  updateGstDetailsService,
  getDriverDocumentRequirementsService,
  updateDriverDocumentRequirementsService,
  getPaymentMethodsConfigService,
  updatePaymentMethodsConfigService,
  getPublicPaymentMethodsConfigService,
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

export const getAdminDriverDocumentRequirements = asyncHandler(async (_req, res) => {
  const config = await getDriverDocumentRequirementsService();
  return res
    .status(200)
    .json(new ApiResponse(200, config, 'Driver document requirements fetched'));
});

export const updateAdminDriverDocumentRequirements = asyncHandler(async (req, res) => {
  const staffId = req.staff?._id || null;
  const config = await updateDriverDocumentRequirementsService(req.body, staffId);
  return res
    .status(200)
    .json(new ApiResponse(200, config, 'Driver document requirements updated'));
});

export const getPublicDriverDocumentRequirements = asyncHandler(async (_req, res) => {
  const config = await getDriverDocumentRequirementsService();
  return res
    .status(200)
    .json(new ApiResponse(200, config, 'Driver document requirements fetched'));
});

export const getAdminPaymentMethods = asyncHandler(async (_req, res) => {
  const config = await getPaymentMethodsConfigService({ fresh: true });
  return res.status(200).json(new ApiResponse(200, config, 'Payment methods fetched'));
});

export const updateAdminPaymentMethods = asyncHandler(async (req, res) => {
  const staffId = req.staff?._id || null;
  const config = await updatePaymentMethodsConfigService(req.body, staffId);
  return res.status(200).json(new ApiResponse(200, config, 'Payment methods updated'));
});

/** Public read — both apps use this to decide which rails to render. */
export const getPublicPaymentMethods = asyncHandler(async (_req, res) => {
  const config = await getPublicPaymentMethodsConfigService();
  return res.status(200).json(new ApiResponse(200, config, 'Payment methods fetched'));
});
