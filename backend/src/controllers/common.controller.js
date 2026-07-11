import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { COOKIE_NAMES, setAuthCookies, clearAuthCookies } from '../utils/cookie.util.js';
import * as commonService from '../services/common.service.js';

export const uploadImage = asyncHandler(async (req, res) => {
  const result = await commonService.uploadImageService(req.file, req.body.oldPublicId);
  return res.status(200).json(new ApiResponse(200, result, 'Image uploaded successfully'));
});

export const uploadVideo = asyncHandler(async (req, res) => {
  const result = await commonService.uploadVideoService(req.file, req.body.oldPublicId);
  return res.status(200).json(new ApiResponse(200, result, 'Video uploaded successfully'));
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies[COOKIE_NAMES.refreshToken] || req.body.refreshToken;
  const tokens = await commonService.refreshSessionTokens(incomingRefreshToken);
  setAuthCookies(res, tokens);
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
      'Token refreshed successfully',
    ),
  );
});

export const logout = asyncHandler(async (req, res) => {
  clearAuthCookies(res);
  return res.status(200).json(new ApiResponse(200, {}, 'Logged out successfully'));
});
