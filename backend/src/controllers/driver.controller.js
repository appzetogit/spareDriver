import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { setAuthCookies } from '../utils/cookie.util.js';
import * as driverService from '../services/driver.service.js';

export const sendOtp = asyncHandler(async (req, res) => {
  const result = await driverService.sendOtpService(req.body.phone);
  return res.status(200).json(new ApiResponse(200, result, 'OTP sent successfully'));
});

export const verifyOtpAndRegister = asyncHandler(async (req, res) => {
  const result = await driverService.verifyOtpAndRegisterService(req.body);

  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });

  return res.status(200).json(new ApiResponse(200, { driver: result.driver }, 'Registration step 1 completed'));
});

export const loginDriver = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const result = await driverService.loginDriverService(phone, password);

  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });

  return res.status(200).json(new ApiResponse(200, { driver: result.driver }, 'Login successful'));
});

export const sendDriverForgotPasswordOtp = asyncHandler(async (req, res) => {
  const result = await driverService.sendDriverForgotPasswordOtpService(req.body.phone);
  return res.status(200).json(new ApiResponse(200, result, result.message));
});

export const verifyDriverForgotPasswordOtp = asyncHandler(async (req, res) => {
  const result = await driverService.verifyDriverForgotPasswordOtpService(req.body);
  return res.status(200).json(new ApiResponse(200, result, 'OTP verified'));
});

export const resetDriverPasswordWithOtp = asyncHandler(async (req, res) => {
  const result = await driverService.resetDriverPasswordWithOtpService(req.body);
  return res.status(200).json(new ApiResponse(200, result, result.message));
});

export const updateOnboardingStep = asyncHandler(async (req, res) => {
  const result = await driverService.updateOnboardingStepService(req.driver._id, req.body);
  return res.status(200).json(new ApiResponse(200, result, `Step ${req.body.stepNumber} completed successfully`));
});

export const submitApplication = asyncHandler(async (req, res) => {
  const result = await driverService.submitApplicationService(req.driver._id);
  return res.status(200).json(new ApiResponse(200, result, "Application submitted for review"));
});

export const getProfile = asyncHandler(async (req, res) => {
  const result = await driverService.getProfileService(req.driver._id);
  return res.status(200).json(new ApiResponse(200, result, "Driver profile retrieved"));
});

export const getTraining = asyncHandler(async (req, res) => {
  const result = await driverService.getDriverTrainingService(req.driver._id);
  return res.status(200).json(new ApiResponse(200, result, 'Training modules fetched'));
});

export const updateTrainingProgress = asyncHandler(async (req, res) => {
  const result = await driverService.updateTrainingProgressService(req.driver._id, req.body);
  return res.status(200).json(new ApiResponse(200, result, 'Training progress updated'));
});

export const reopenRejectedApplication = asyncHandler(async (req, res) => {
  const result = await driverService.reopenRejectedApplicationService(req.driver._id);
  return res.status(200).json(new ApiResponse(200, result, 'Application reopened for updates'));
});

export const uploadLiveVerification = asyncHandler(async (req, res) => {
  const durationSeconds = req.body.durationSeconds;
  const result = await driverService.uploadLiveVerificationService(
    req.driver._id,
    req.file,
    durationSeconds,
  );
  return res.status(200).json(new ApiResponse(200, result, 'Live verification video saved'));
});

/**
 * Toggle the driver's outstation opt-in. Outstation bookings are
 * dispatched manually from the admin queue; only drivers with this
 * flag set will appear in the picker. Body: `{ available: boolean }`.
 */
export const updateOutstationAvailability = asyncHandler(async (req, res) => {
  const { available, zoneIds, allIndiaOk, maxDrivingHoursPerDay } = req.body || {};
  const result = await driverService.updateOutstationAvailabilityService(
    req.driver._id,
    {
      available: !!available,
      zoneIds: Array.isArray(zoneIds) ? zoneIds : undefined,
      allIndiaOk,
      maxDrivingHoursPerDay,
    },
  );
  const message = result.availableForOutstation
    ? "You're now visible for outstation assignments"
    : "You've opted out of outstation assignments";
  return res.status(200).json(new ApiResponse(200, result, message));
});
