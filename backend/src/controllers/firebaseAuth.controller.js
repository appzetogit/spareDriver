import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  mintUserTripToken,
  mintStaffToken,
  mintDriverTripToken,
  isFirebaseAuthReady,
} from '../services/firebaseAuthToken.service.js';

/**
 * Realtime Database sign-in tokens.
 *
 * Each role gets a token carrying only the claims its own database rules
 * need. Clients call `signInWithCustomToken` with the result, then subscribe.
 * When Firebase is not configured the token is null and the caller falls back
 * to the socket location channel.
 */

export const getUserFirebaseToken = asyncHandler(async (req, res) => {
  const result = await mintUserTripToken(req.user._id);
  return res.status(200).json(
    new ApiResponse(
      200,
      { ...result, ready: isFirebaseAuthReady() },
      result.token ? 'Firebase token issued' : 'No active booking to watch',
    ),
  );
});

export const getDriverFirebaseToken = asyncHandler(async (req, res) => {
  const result = await mintDriverTripToken(req.driver._id);
  return res.status(200).json(
    new ApiResponse(200, { ...result, ready: isFirebaseAuthReady() }, 'Firebase token issued'),
  );
});

export const getStaffFirebaseToken = asyncHandler(async (req, res) => {
  const result = await mintStaffToken(req.staff._id);
  return res.status(200).json(
    new ApiResponse(200, { ...result, ready: isFirebaseAuthReady() }, 'Firebase token issued'),
  );
});
