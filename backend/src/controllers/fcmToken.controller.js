import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  registerUserFcmTokenService,
  registerDriverFcmTokenService,
  unregisterUserFcmTokenService,
  unregisterDriverFcmTokenService,
} from '../services/fcmToken.service.js';

function fcmRegisteredResponse(res, platform, updated) {
  return res.status(200).json(new ApiResponse(200, {
    platform,
    registered: true,
    hasWeb: Boolean(updated.fcmTokenWeb),
    hasMobile: Boolean(updated.fcmTokenMobile),
  }, 'FCM token registered'));
}

export const registerUserFcmToken = asyncHandler(async (req, res) => {
  const { token, platform = 'web' } = req.body || {};
  const updated = await registerUserFcmTokenService(req.user._id, { token, platform });
  return fcmRegisteredResponse(res, platform, updated);
});

export const registerDriverFcmToken = asyncHandler(async (req, res) => {
  const { token, platform = 'web' } = req.body || {};
  const updated = await registerDriverFcmTokenService(req.driver._id, { token, platform });
  return fcmRegisteredResponse(res, platform, updated);
});

/** Staff (admin / sub_admin / team_member) share the User model FCM fields. */
export const registerStaffFcmToken = asyncHandler(async (req, res) => {
  const { token, platform = 'web' } = req.body || {};
  const updated = await registerUserFcmTokenService(req.staff._id, { token, platform });
  return fcmRegisteredResponse(res, platform, updated);
});

export const unregisterUserFcmToken = asyncHandler(async (req, res) => {
  const { platform = 'all' } = req.body || {};
  await unregisterUserFcmTokenService(req.user._id, { platform });
  return res.status(200).json(new ApiResponse(200, { cleared: true }, 'FCM token cleared'));
});

export const unregisterDriverFcmToken = asyncHandler(async (req, res) => {
  const { platform = 'all' } = req.body || {};
  await unregisterDriverFcmTokenService(req.driver._id, { platform });
  return res.status(200).json(new ApiResponse(200, { cleared: true }, 'FCM token cleared'));
});

export const unregisterStaffFcmToken = asyncHandler(async (req, res) => {
  const { platform = 'all' } = req.body || {};
  await unregisterUserFcmTokenService(req.staff._id, { platform });
  return res.status(200).json(new ApiResponse(200, { cleared: true }, 'FCM token cleared'));
});
