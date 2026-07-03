import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { setAuthCookies } from '../utils/cookie.util.js';
import * as userService from '../services/user.service.js';

export const sendUserOtp = asyncHandler(async (req, res) => {
  const result = await userService.sendUserOtpService(req.body.phone);
  return res.status(200).json(new ApiResponse(200, result, 'OTP sent successfully'));
});

export const verifyUserOtpAndRegister = asyncHandler(async (req, res) => {
  const result = await userService.verifyUserOtpAndRegisterService(req.body);
  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
  return res.status(201).json(new ApiResponse(201, { user: result.user }, 'Registration successful'));
});

export const verifyRegistrationPhoneOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  const result = await userService.verifyRegistrationPhoneOtpService(phone, otp);
  return res.status(200).json(new ApiResponse(200, result, 'Mobile number verified'));
});

export const sendRegistrationEmailOtp = asyncHandler(async (req, res) => {
  const { phone, email } = req.body;
  const result = await userService.sendRegistrationEmailOtpService(phone, email);
  return res.status(200).json(new ApiResponse(200, result, 'Verification code sent'));
});

export const verifyRegistrationEmailOtp = asyncHandler(async (req, res) => {
  const { phone, email, otp } = req.body;
  const result = await userService.verifyRegistrationEmailOtpService(phone, email, otp);
  return res.status(200).json(new ApiResponse(200, result, 'Email verified'));
});

export const completeRegistration = asyncHandler(async (req, res) => {
  const result = await userService.completeRegistrationService(req.body);
  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
  return res.status(201).json(new ApiResponse(201, { user: result.user }, 'Registration successful'));
});

export const loginUser = asyncHandler(async (req, res) => {
  const result = await userService.loginUserService(req.body);
  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
  return res.status(200).json(new ApiResponse(200, { user: result.user }, 'Login successful'));
});

export const updateUserOnboardingStep = asyncHandler(async (req, res) => {
  const result = await userService.updateUserOnboardingStepService(req.user._id, req.body);
  return res.status(200).json(new ApiResponse(200, result, 'Onboarding step updated'));
});

export const getUserProfile = asyncHandler(async (req, res) => {
  const result = await userService.getUserProfileService(req.params.userId, {
    includeInactiveCars: Boolean(req.staff),
  });
  return res.status(200).json(new ApiResponse(200, result, 'User profile fetched'));
});

export const getRegistrationStatus = asyncHandler(async (req, res) => {
  const result = await userService.getRegistrationStatusService(req.user._id);
  return res.status(200).json(new ApiResponse(200, result, 'Registration status fetched'));
});

export const sendUserEmailVerificationOtp = asyncHandler(async (req, res) => {
  const result = await userService.sendUserEmailVerificationOtpService(
    req.user._id,
    req.body.email,
  );
  return res.status(200).json(new ApiResponse(200, result, 'Verification code sent'));
});

export const verifyUserEmailOtp = asyncHandler(async (req, res) => {
  const user = await userService.verifyUserEmailOtpService(req.user._id, req.body);
  return res.status(200).json(new ApiResponse(200, { user }, 'Email verified successfully'));
});

// Car Controllers (Consolidated)
export const addCar = asyncHandler(async (req, res) => {
  const result = await userService.addCarService(req.user._id, req.body);
  return res.status(201).json(new ApiResponse(201, result, 'Car added successfully'));
});

export const getUserCars = asyncHandler(async (req, res) => {
  const cars = await userService.getUserCarsService(req.user._id);
  return res.status(200).json(new ApiResponse(200, cars, 'Cars fetched successfully'));
});

export const deleteUserCar = asyncHandler(async (req, res) => {
  await userService.deleteUserCarService(req.user._id, req.params.id);
  return res.status(200).json(new ApiResponse(200, null, 'Car deleted successfully'));
});

export const updateCar = asyncHandler(async (req, res) => {
  const result = await userService.updateCarService(req.user._id, req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, result, 'Car details updated successfully'));
});

// Saved (favourite) locations
export const listSavedLocations = asyncHandler(async (req, res) => {
  const result = await userService.listSavedLocationsService(req.user._id);
  return res.status(200).json(new ApiResponse(200, result, 'Saved locations fetched'));
});

export const addSavedLocation = asyncHandler(async (req, res) => {
  const result = await userService.addSavedLocationService(req.user._id, req.body);
  return res.status(201).json(new ApiResponse(201, result, 'Location saved'));
});

export const deleteSavedLocation = asyncHandler(async (req, res) => {
  await userService.deleteSavedLocationService(req.user._id, req.params.id);
  return res.status(200).json(new ApiResponse(200, null, 'Saved location removed'));
});

export const sendForgotPasswordOtp = asyncHandler(async (req, res) => {
  const result = await userService.sendForgotPasswordOtpService(req.body);
  return res.status(200).json(new ApiResponse(200, result, result.message));
});

export const verifyForgotPasswordOtp = asyncHandler(async (req, res) => {
  const result = await userService.verifyForgotPasswordOtpService(req.body);
  return res.status(200).json(new ApiResponse(200, result, 'OTP verified'));
});

export const resetPasswordWithOtp = asyncHandler(async (req, res) => {
  const result = await userService.resetPasswordWithOtpService(req.body);
  return res.status(200).json(new ApiResponse(200, result, result.message));
});

