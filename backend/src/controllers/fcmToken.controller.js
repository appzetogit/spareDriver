import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { registerUserFcmTokenService, registerDriverFcmTokenService } from '../services/fcmToken.service.js';

export const registerUserFcmToken = asyncHandler(async (req, res) => {
  const { token, platform = 'web' } = req.body || {};
  const updated = await registerUserFcmTokenService(req.user._id, { token, platform });
  return res.status(200).json(new ApiResponse(200, {
    platform,
    registered: true,
    hasWeb: Boolean(updated.fcmTokenWeb),
    hasMobile: Boolean(updated.fcmTokenMobile),
  }, 'FCM token registered'));
});

export const registerDriverFcmToken = asyncHandler(async (req, res) => {
  const { token, platform = 'web' } = req.body || {};
  const updated = await registerDriverFcmTokenService(req.driver._id, { token, platform });
  return res.status(200).json(new ApiResponse(200, {
    platform,
    registered: true,
    hasWeb: Boolean(updated.fcmTokenWeb),
    hasMobile: Boolean(updated.fcmTokenMobile),
  }, 'FCM token registered'));
});
