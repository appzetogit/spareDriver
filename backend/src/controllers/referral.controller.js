import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { REFERRAL_ROLE } from '../constants/referral.js';
import {
  getMyReferralSummaryService,
  getReferralSettingsService,
  listMyReferralsService,
  validateReferralCodeService,
} from '../services/referral.service.js';
import { validateReferralCodeSchema } from '../validations/referral.validation.js';

export const getMyUserReferralSummary = asyncHandler(async (req, res) => {
  const summary = await getMyReferralSummaryService(req.user._id, REFERRAL_ROLE.USER);
  return res.status(200).json(new ApiResponse(200, summary, 'Referral summary fetched'));
});

export const listMyUserReferrals = asyncHandler(async (req, res) => {
  const result = await listMyReferralsService(req.user._id, REFERRAL_ROLE.USER, {
    page: req.query.page,
    limit: req.query.limit,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Referrals fetched'));
});

export const validateUserReferralCode = asyncHandler(async (req, res) => {
  const parsed = validateReferralCodeSchema.parse(req.body || {});
  const result = await validateReferralCodeService(parsed.referralCode, REFERRAL_ROLE.USER);
  return res.status(200).json(new ApiResponse(200, result, 'Referral code is valid'));
});

export const getMyDriverReferralSummary = asyncHandler(async (req, res) => {
  const summary = await getMyReferralSummaryService(req.driver._id, REFERRAL_ROLE.DRIVER);
  return res.status(200).json(new ApiResponse(200, summary, 'Referral summary fetched'));
});

export const listMyDriverReferrals = asyncHandler(async (req, res) => {
  const result = await listMyReferralsService(req.driver._id, REFERRAL_ROLE.DRIVER, {
    page: req.query.page,
    limit: req.query.limit,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Referrals fetched'));
});

export const validateDriverReferralCode = asyncHandler(async (req, res) => {
  const parsed = validateReferralCodeSchema.parse(req.body || {});
  const result = await validateReferralCodeService(parsed.referralCode, REFERRAL_ROLE.DRIVER);
  return res.status(200).json(new ApiResponse(200, result, 'Referral code is valid'));
});

export const getPublicReferralConfig = asyncHandler(async (_req, res) => {
  const settings = await getReferralSettingsService();
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: { enabled: Boolean(settings.user?.enabled) },
        driver: { enabled: Boolean(settings.driver?.enabled) },
      },
      'Referral config fetched',
    ),
  );
});
