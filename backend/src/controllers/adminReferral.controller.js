import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  adminGetReferralByIdService,
  adminListReferralsService,
  adminRejectReferralService,
  getReferralSettingsService,
  updateReferralSettingsService,
} from '../services/referral.service.js';
import {
  adminRejectReferralSchema,
  updateReferralSettingsSchema,
} from '../validations/referral.validation.js';

export const getAdminReferralSettings = asyncHandler(async (req, res) => {
  const settings = await getReferralSettingsService();
  return res.status(200).json(new ApiResponse(200, { settings }, 'Referral settings fetched'));
});

export const updateAdminReferralSettings = asyncHandler(async (req, res) => {
  const parsed = updateReferralSettingsSchema.parse(req.body || {});
  const settings = await updateReferralSettingsService(parsed, req.staff._id);
  return res.status(200).json(new ApiResponse(200, { settings }, 'Referral settings updated'));
});

export const listAdminReferrals = asyncHandler(async (req, res) => {
  const result = await adminListReferralsService(req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Referrals fetched'));
});

export const getAdminReferralById = asyncHandler(async (req, res) => {
  const referral = await adminGetReferralByIdService(req.params.id);
  return res.status(200).json(new ApiResponse(200, { referral }, 'Referral fetched'));
});

export const rejectAdminReferral = asyncHandler(async (req, res) => {
  const parsed = adminRejectReferralSchema.parse(req.body || {});
  const referral = await adminRejectReferralService(req.staff, req.params.id, parsed.reason);
  return res.status(200).json(new ApiResponse(200, { referral }, 'Referral rejected'));
});
