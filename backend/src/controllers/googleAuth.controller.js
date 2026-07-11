import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { setAuthCookies } from '../utils/cookie.util.js';
import {
  googleSignInService,
  linkGoogleUserPhoneService,
  linkGoogleDriverPhoneService,
  sendLinkPhoneOtpService,
} from '../services/googleAuth.service.js';

export const googleSignInUser = asyncHandler(async (req, res) => {
  const { credential, fcmToken, token, platform } = req.body;
  const result = await googleSignInService(credential, 'user', { fcmToken, token, platform });

  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: result.user,
        needsPhone: result.needsPhone,
        fcm: result.fcm,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
      'Google sign-in successful',
    ),
  );
});

export const googleSignInDriver = asyncHandler(async (req, res) => {
  const { credential, fcmToken, token, platform } = req.body;
  const result = await googleSignInService(credential, 'driver', { fcmToken, token, platform });

  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        driver: result.driver,
        needsPhone: result.needsPhone,
        fcm: result.fcm,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
      'Google sign-in successful',
    ),
  );
});

export const sendGoogleLinkPhoneOtp = asyncHandler(async (req, res) => {
  const accountType = req.body.accountType === 'driver' ? 'driver' : 'user';
  const result = await sendLinkPhoneOtpService(req.body.phone, accountType);
  return res.status(200).json(new ApiResponse(200, result, 'OTP sent successfully'));
});

export const linkGoogleUserPhone = asyncHandler(async (req, res) => {
  const result = await linkGoogleUserPhoneService(req.user._id, req.body);
  return res.status(200).json(new ApiResponse(200, result, 'Phone linked successfully'));
});

export const linkGoogleDriverPhone = asyncHandler(async (req, res) => {
  const result = await linkGoogleDriverPhoneService(req.driver._id, req.body);
  return res.status(200).json(new ApiResponse(200, result, 'Driver phone linked successfully'));
});
