import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { OTP } from '../models/otp.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import Zone from '../models/zone.model.js';
import { ApiError } from '../utils/apiError.js';
import { isTestOtp, sendSmsOtp } from '../utils/otpService.js';
import {
  generateAccessToken,
  generateRefreshToken,
  tokenPayloadFromDriver,
} from '../utils/jwt.util.js';
import { mergeDocumentsByType, dedupeDocumentsByType } from '../utils/driverDocuments.util.js';
import TrainingVideo from '../models/trainingVideo.model.js';
import {
  getActiveTrainingVideos,
  mergeTrainingProgress,
  isDriverTrainingComplete,
  isWatchComplete,
  getWatchThresholdSeconds,
} from '../utils/driverTraining.util.js';
import { syncDriverKitEligibility, getDriverKitEligibility } from '../utils/kitEligibility.util.js';
import { DRIVER_ONBOARDING_STEP, createEmptyStepReviews } from '../constants/driverOnboarding.js';
import {
  hasCompletedLiveVerification,
  isApplicationSubmitted,
} from '../utils/driverOnboarding.util.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';
import { resolveAuthFcm } from './fcmToken.service.js';
import { isActiveBankName } from './platform.service.js';

/** Optional emergency / alternate mobile. Empty string when omitted. */
function normalizeAlternatePhone(alternatePhone, primaryPhone) {
  const value = String(alternatePhone || '').trim();
  if (!value) return '';
  if (!/^[0-9]{10}$/.test(value)) {
    throw new ApiError(400, 'Emergency / alternate mobile must be a valid 10-digit number');
  }
  if (primaryPhone && value === String(primaryPhone).trim()) {
    throw new ApiError(400, 'Emergency / alternate mobile must be different from your primary number');
  }
  return value;
}

/** Validate + normalize bank payout fields (onboarding step 3 + profile edits). */
const parseBankDetailsInput = async (bankDetails = {}) => {
  const { accountHolderName, accountNumber, ifscCode, bankName, upiId } = bankDetails;

  if (!accountHolderName || !accountHolderName.trim()) {
    throw new ApiError(400, 'Account holder name is required');
  }
  if (accountHolderName.trim().length < 3 || !/^[a-zA-Z\s.]+$/.test(accountHolderName)) {
    throw new ApiError(
      400,
      'Account holder name must be at least 3 characters and contain only letters, spaces, and dots',
    );
  }

  if (!accountNumber || !accountNumber.trim()) {
    throw new ApiError(400, 'Account number is required');
  }
  if (
    !/^\d+$/.test(accountNumber.trim()) ||
    accountNumber.trim().length < 9 ||
    accountNumber.trim().length > 18
  ) {
    throw new ApiError(400, 'Account number must be between 9 and 18 digits');
  }

  if (!ifscCode || !ifscCode.trim()) {
    throw new ApiError(400, 'IFSC code is required');
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifscCode.trim())) {
    throw new ApiError(400, 'Invalid IFSC code format (e.g., SBIN0001234)');
  }

  if (!bankName || !bankName.trim()) {
    throw new ApiError(400, 'Bank name is required');
  }
  const allowedBank = await isActiveBankName(bankName.trim());
  if (!allowedBank) {
    throw new ApiError(400, 'Please select a bank from the list');
  }

  if (upiId && upiId.trim() && !/^[\w.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/.test(upiId.trim())) {
    throw new ApiError(400, 'Invalid UPI ID format (e.g., user@upi)');
  }

  return {
    accountHolderName: accountHolderName.trim(),
    accountNumber: accountNumber.trim(),
    ifscCode: ifscCode.trim().toUpperCase(),
    bankName: bankName.trim(),
    upiId: upiId ? upiId.trim() : '',
    isVerified: false,
  };
};

export const sendOtpService = async (phone) => {
  if (!phone || phone.length !== 10) {
    throw new ApiError(400, 'Valid 10-digit phone number required');
  }

  const existingDriver = await Driver.findOne({ phone });
  if (existingDriver) {
    throw new ApiError(400, 'Number already exists, please login');
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await OTP.findOneAndUpdate(
    { phone, purpose: 'registration' },
    { otp, expiresAt, purpose: 'registration' },
    { upsert: true, new: true },
  );

  await sendSmsOtp(phone, otp);
  return { message: 'OTP sent successfully' };
};

export const verifyOtpAndRegisterService = async (data) => {
  const { phone, otp, name, password, alternatePhone, referralCode, fcmToken, token, platform } = data;

  if (!phone || !otp || !name || !password) {
    throw new ApiError(400, 'Missing required fields');
  }

  const normalizedAlternatePhone = normalizeAlternatePhone(alternatePhone, phone);

  const {
    ensureDriverReferralCode,
    storeDriverAppliedReferralCode,
    validateReferralCodeService,
  } = await import('./referral.service.js');
  const { REFERRAL_ROLE } = await import('../constants/referral.js');

  if (referralCode) {
    await validateReferralCodeService(referralCode, REFERRAL_ROLE.DRIVER);
  }

  if (!isTestOtp(otp)) {
    const otpRecord = await OTP.findOne({ phone, otp, purpose: 'registration' });
    if (!otpRecord) {
      throw new ApiError(400, 'Invalid or expired OTP');
    }
    await OTP.deleteOne({ _id: otpRecord._id });
  }

  let driver = await Driver.findOne({ phone });
  const createdNewDriver = !driver;
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  if (driver) {
    driver.name = name;
    driver.password = hashedPassword;
    driver.authProvider = 'local';
    if (normalizedAlternatePhone) driver.alternatePhone = normalizedAlternatePhone;
    if (driver.onboardingStep < 1) driver.onboardingStep = 1;
    await driver.save();
  } else {
    driver = new Driver({
      name,
      phone,
      alternatePhone: normalizedAlternatePhone,
      password: hashedPassword,
      authProvider: 'local',
      onboardingStep: 1,
      approvalStatus: 'pending',
    });
    await driver.save();
  }

  try {
    await ensureDriverReferralCode(driver._id);
    if (referralCode) {
      await storeDriverAppliedReferralCode(driver, referralCode);
    }
  } catch (err) {
    if (createdNewDriver) {
      await Driver.deleteOne({ _id: driver._id });
    }
    throw err;
  }

  const payload = tokenPayloadFromDriver(driver);
  const fcm = await resolveAuthFcm('driver', driver._id, driver, { fcmToken, token, platform });

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    driver: {
      id: driver._id,
      driverNumber: driver.driverNumber || '',
      name: driver.name,
      phone: driver.phone,
      alternatePhone: driver.alternatePhone || '',
      email: driver.email,
      onboardingStep: driver.onboardingStep,
      approvalStatus: driver.approvalStatus,
    },
    fcm,
  };
};

export const loginDriverService = async ({ phone, password, fcmToken, token, platform } = {}) => {
  if (!phone || !password) {
    throw new ApiError(400, 'Phone and password required');
  }

  const driver = await Driver.findOne({ phone }).select('+password');
  if (!driver || driver.isDeleted) {
    throw new ApiError(401, 'Phone number not registered. Please sign up.');
  }

  if (driver.authProvider === 'google') {
    throw new ApiError(401, 'This account uses Google sign-in');
  }

  const isMatch = await bcrypt.compare(password, driver.password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid credentials');
  }

  driver.password = undefined;
  await Driver.ensureNumber(driver);
  const payload = tokenPayloadFromDriver(driver);
  const fcm = await resolveAuthFcm('driver', driver._id, driver, { fcmToken, token, platform });

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    driver: {
      id: driver._id,
      driverNumber: driver.driverNumber || '',
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      onboardingStep: driver.onboardingStep,
      approvalStatus: driver.approvalStatus,
      approvalNote: driver.approvalNote || '',
    },
    fcm,
  };
};

export const updateOnboardingStepService = async (driverId, data) => {
  const { stepData, stepNumber } = data;

  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  if (driver.approvalStatus === 'under_review') {
    throw new ApiError(400, 'Application is under review and cannot be edited');
  }
  if (driver.approvalStatus === 'rejected' && !driver.revisionInProgress) {
    throw new ApiError(400, 'Reopen your application before updating details');
  }
  if (driver.approvalStatus === 'approved') {
    throw new ApiError(400, 'Approved profiles cannot use onboarding update');
  }

  if (stepNumber === 2) {
    const licenseNumber = stepData.drivingLicense?.number || '';
    if (licenseNumber.includes('-')) {
      throw new ApiError(400, "License number must not contain hyphens ('-')");
    }
    if (licenseNumber.length !== 15) {
      throw new ApiError(400, 'License number must be exactly 15 characters');
    }

    const {
      normalizeDriverVehicleExperience,
      syncCarTypeExperienceFromVehicles,
    } = await import('../utils/driverVehicleExperience.util.js');

    driver.drivingLicense = stepData.drivingLicense;
    driver.experienceYears = stepData.experienceYears;
    driver.availability = stepData.availability;

    if (stepData.vehicleExperience?.length) {
      const vehicles = await normalizeDriverVehicleExperience(stepData.vehicleExperience);
      driver.vehicleExperience = vehicles;
      driver.carTypeExperience = syncCarTypeExperienceFromVehicles(vehicles);
    } else if (stepData.carTypeExperience?.length) {
      driver.carTypeExperience = stepData.carTypeExperience;
    } else {
      throw new ApiError(400, 'Add at least one vehicle you have experience driving');
    }

    if (stepData.documents) mergeDocumentsByType(driver.documents, stepData.documents);
    if (driver.onboardingStep < 2) driver.onboardingStep = 2;
  } else if (stepNumber === 3) {
    driver.bankDetails = await parseBankDetailsInput(stepData.bankDetails || {});
    if (driver.onboardingStep < 3) driver.onboardingStep = 3;
  } else if (stepNumber === 4) {
    if (stepData.safetyDeclaration) {
      driver.safetyDeclaration = { agreed: stepData.safetyDeclaration.agreed, agreedAt: new Date() };
    }
    if (stepData.documents) mergeDocumentsByType(driver.documents, stepData.documents);

    const hasDoc = (type) =>
      (driver.documents || []).some((d) => d?.type === type && d?.fileUrl);

    if (!hasDoc('aadhaar_front') || !hasDoc('aadhaar_back')) {
      throw new ApiError(400, 'Aadhaar front and back are required');
    }

    const { getDriverDocumentRequirementsService } = await import('./appSettings.service.js');
    const { policeVerificationRequired } = await getDriverDocumentRequirementsService();
    if (policeVerificationRequired && !hasDoc('police_verification')) {
      throw new ApiError(
        400,
        'Police Verification Certificate / Yellow Board Certificate is required',
      );
    }

    if (driver.onboardingStep < 4) driver.onboardingStep = 4;
  } else {
    throw new ApiError(400, 'Invalid step number');
  }

  await driver.save();
  return driver;
};

const LIVE_VERIFICATION_MIN_SECONDS = 15;
const LIVE_VERIFICATION_MAX_SECONDS = 180;

export const uploadLiveVerificationService = async (driverId, file, durationSeconds) => {
  if (!file) {
    throw new ApiError(400, 'Recorded video is required');
  }

  const driver = await Driver.findById(driverId);
  if (!driver) throw new ApiError(404, 'Driver not found');

  if (isApplicationSubmitted(driver)) {
    throw new ApiError(400, 'Application already submitted');
  }
  if (driver.approvalStatus === 'rejected' && !driver.revisionInProgress) {
    throw new ApiError(400, 'Reopen your application before updating live verification');
  }

  if (driver.onboardingStep < DRIVER_ONBOARDING_STEP.SAFETY) {
    throw new ApiError(400, 'Complete safety documents before live verification');
  }

  const reportedDuration = Number(durationSeconds) || 0;
  if (reportedDuration < LIVE_VERIFICATION_MIN_SECONDS) {
    throw new ApiError(
      400,
      `Recording must be at least ${LIVE_VERIFICATION_MIN_SECONDS} seconds`,
    );
  }
  if (reportedDuration > LIVE_VERIFICATION_MAX_SECONDS) {
    throw new ApiError(400, 'Recording is too long. Please record again.');
  }

  const oldPublicId = driver.liveVerificationVideo?.cloudinaryPublicId;
  const uploadResult = await uploadToCloudinary(file.buffer, 'sparedriver/live-verification', {
    resourceType: 'video',
  });

  if (oldPublicId) {
    await deleteFromCloudinary(oldPublicId, 'video');
  }

  const cloudDuration = Math.round(uploadResult.duration || reportedDuration);

  driver.liveVerificationVideo = {
    videoUrl: uploadResult.secure_url,
    cloudinaryPublicId: uploadResult.public_id,
    recordedAt: new Date(),
    durationSeconds: cloudDuration,
  };

  if (driver.onboardingStep < DRIVER_ONBOARDING_STEP.LIVE_VERIFICATION) {
    driver.onboardingStep = DRIVER_ONBOARDING_STEP.LIVE_VERIFICATION;
  }

  await driver.save();

  return {
    liveVerificationVideo: driver.liveVerificationVideo,
    onboardingStep: driver.onboardingStep,
  };
};

export const reopenRejectedApplicationService = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) throw new ApiError(404, 'Driver not found');

  if (driver.approvalStatus !== 'rejected') {
    throw new ApiError(400, 'Only rejected applications can be updated');
  }

  // Stay rejected until they re-submit — avoids admin "pending" while editing.
  driver.revisionInProgress = true;
  // Step 1 = identity already done; resume from credentials and allow free back/forward while revising.
  driver.onboardingStep = DRIVER_ONBOARDING_STEP.IDENTITY;
  await driver.save();

  return {
    id: driver._id,
    onboardingStep: driver.onboardingStep,
    approvalStatus: driver.approvalStatus,
    revisionInProgress: driver.revisionInProgress,
    approvalNote: driver.approvalNote,
    onboardingStepReviews: driver.onboardingStepReviews,
    liveVerificationVideo: driver.liveVerificationVideo,
    submissionCount: driver.submissionCount || 0,
  };
};

export const getDriverTrainingService = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) throw new ApiError(404, 'Driver not found');

  const videos = await getActiveTrainingVideos();
  const items = mergeTrainingProgress(videos, driver.trainingProgress);
  const requiredVideos = items.filter((v) => v.isRequired);
  const allRequiredComplete = requiredVideos.length
    ? requiredVideos.every((v) => v.completed)
    : true;

  return {
    videos: items,
    allRequiredComplete,
    canTrain: driver.approvalStatus === 'approved',
  };
};

export const updateTrainingProgressService = async (driverId, data) => {
  const { trainingVideoId, watchedSeconds, completed } = data;

  if (!trainingVideoId) {
    throw new ApiError(400, 'Training video ID is required');
  }

  const driver = await Driver.findById(driverId);
  if (!driver) throw new ApiError(404, 'Driver not found');

  if (driver.approvalStatus !== 'approved') {
    throw new ApiError(400, 'Complete verification and get approved before training');
  }

  const video = await TrainingVideo.findOne({ _id: trainingVideoId, isActive: true });
  if (!video) throw new ApiError(404, 'Training video not found');

  const safeWatched = Math.max(0, Math.min(Number(watchedSeconds) || 0, video.durationSeconds || Number.MAX_SAFE_INTEGER));
  const autoComplete = isWatchComplete(safeWatched, video.durationSeconds);
  const markComplete = Boolean(completed) || autoComplete;

  if (Boolean(completed) && !autoComplete) {
    throw new ApiError(
      400,
      `Please watch at least ${getWatchThresholdSeconds(video.durationSeconds)} seconds before completing this video`,
    );
  }

  const progressIndex = driver.trainingProgress.findIndex(
    (p) => String(p.trainingVideoId) === String(trainingVideoId),
  );

  const entry = {
    trainingVideoId: video._id,
    watchedSeconds: safeWatched,
    completed: markComplete,
    completedAt: markComplete ? new Date() : null,
  };

  if (progressIndex >= 0) {
    if (driver.trainingProgress[progressIndex].completed) {
      entry.completed = true;
      entry.completedAt = driver.trainingProgress[progressIndex].completedAt || new Date();
    }
    driver.trainingProgress[progressIndex] = entry;
  } else {
    driver.trainingProgress.push(entry);
  }

  await driver.save();
  const eligibility = await syncDriverKitEligibility(driverId);

  const merged = mergeTrainingProgress([video.toObject()], driver.trainingProgress)[0];
  return {
    ...merged,
    allRequiredComplete: await isDriverTrainingComplete(driver),
    canGoOnline: eligibility.allowed,
    eligibilityReasons: eligibility.reasons,
    eligibilityCode: eligibility.code,
  };
};

export const submitApplicationService = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  if (!hasCompletedLiveVerification(driver)) {
    throw new ApiError(400, 'Please complete live identity verification first');
  }

  // Revision resets onboardingStep; keep the prior recording if the driver does not re-record.
  if (
    driver.liveVerificationVideo?.videoUrl &&
    driver.onboardingStep < DRIVER_ONBOARDING_STEP.LIVE_VERIFICATION
  ) {
    driver.onboardingStep = DRIVER_ONBOARDING_STEP.LIVE_VERIFICATION;
  }

  if (driver.onboardingStep < DRIVER_ONBOARDING_STEP.LIVE_VERIFICATION) {
    throw new ApiError(400, 'Please complete all onboarding steps before submitting');
  }

  if (!driver.safetyDeclaration?.agreed) {
    throw new ApiError(400, 'Please complete the safety declaration first');
  }

  if (isApplicationSubmitted(driver) || driver.approvalStatus === 'under_review') {
    throw new ApiError(400, 'Application already submitted');
  }

  if (driver.approvalStatus === 'approved') {
    throw new ApiError(400, 'Application is already approved');
  }

  if (driver.approvalStatus === 'rejected' && !driver.revisionInProgress) {
    throw new ApiError(400, 'Reopen your application before submitting again');
  }

  driver.approvalStatus = 'under_review';
  driver.onboardingStep = DRIVER_ONBOARDING_STEP.SUBMITTED;
  driver.revisionInProgress = false;
  driver.submissionCount = (driver.submissionCount || 0) + 1;
  driver.approvalNote = '';
  driver.onboardingStepReviews = createEmptyStepReviews();
  driver.markModified('onboardingStepReviews');
  await driver.save();

  const { upsertDriverReviewTask } = await import('./adminTask.service.js');
  await upsertDriverReviewTask(driver);

  const { notifyAdminNewDriverRegistration } = await import('../utils/notificationDispatch.js');
  notifyAdminNewDriverRegistration(driver).catch(() => null);

  return driver;
};

const vehicleExperiencePopulate = [
  { path: 'vehicleExperience.carTypeId', select: 'name' },
  { path: 'vehicleExperience.brandId', select: 'name' },
  { path: 'vehicleExperience.modelId', select: 'name' },
  { path: 'vehicleExperience.fuelTypeId', select: 'name' },
  { path: 'carTypeExperience', select: 'name' },
  { path: 'preferredOutstationZones', select: 'name code city isActive' },
];

export const getProfileService = async (driverId) => {
  const driver = await Driver.findById(driverId).populate(vehicleExperiencePopulate);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }
  await Driver.ensureNumber(driver);
  driver.documents = dedupeDocumentsByType(driver.documents);

  const eligibility = await syncDriverKitEligibility(driverId);

  const doc = driver.toObject();
  doc.kitEligibility = {
    canGoOnline: eligibility.allowed,
    reasons: eligibility.reasons,
    code: eligibility.code,
  };
  return doc;
};

/**
 * Driver-side toggle for "I can take outstation (round-trip) bookings".
 *
 * Outstation rides are manually dispatched from the admin queue (see
 * `bookingOutstationAssignment.service.js`). The picker only lists
 * drivers with `availableForOutstation === true`, so flipping this
 * flag off means the driver won't appear in the queue at all —
 * useful for drivers who only want short local hourly trips, or who
 * are unavailable for multi-day trips this week.
 *
 * `zoneIds` is the driver's preferred set of pickup zones for
 * outstation. When toggling availability ON, at least one valid
 * active zone is required — the driver UI enforces this with a
 * picker sheet, but we re-validate here because a stale FE could
 * always submit `available: true` with an empty array. When
 * toggling OFF we keep the previously chosen zones intact so the
 * driver doesn't have to re-pick them next time.
 *
 * Returns the same shape `getProfileService` returns so the caller
 * can hand the result straight back to the FE store.
 */
export const updateOutstationAvailabilityService = async (
  driverId,
  { available, zoneIds, allIndiaOk, maxDrivingHoursPerDay },
) => {
  const next = !!available;
  const existing = await Driver.findById(driverId)
    .select('preferredOutstationZones outstationPreferencesCompletedAt')
    .lean();
  if (!existing) throw new ApiError(404, 'Driver not found');

  // Same eligibility as going online: kit + training (and approval).
  if (next) {
    const eligibility = await getDriverKitEligibility(driverId);
    if (!eligibility.allowed) {
      throw new ApiError(
        403,
        eligibility.reasons?.[0] || 'Complete kit purchase and training before enabling outstation',
        {
          code: eligibility.code,
          reasons: eligibility.reasons,
        },
      );
    }
  }

  const update = {
    availableForOutstation: next,
    outstationAvailabilityUpdatedAt: new Date(),
  };

  if (next) {
    const needsPreferences = !existing.outstationPreferencesCompletedAt;
    if (needsPreferences) {
      if (allIndiaOk == null) {
        throw new ApiError(
          400,
          'Confirm whether you are OK with all-India multi-state outstation trips.',
        );
      }
      const hours = Number(maxDrivingHoursPerDay);
      if (!Number.isFinite(hours) || hours < 4 || hours > 16) {
        throw new ApiError(400, 'Set your per-day driving capacity between 4 and 16 hours.');
      }
      update.outstationAllIndiaOk = !!allIndiaOk;
      update.outstationMaxDrivingHoursPerDay = hours;
      update.outstationPreferencesCompletedAt = new Date();
    } else if (allIndiaOk != null || maxDrivingHoursPerDay != null) {
      if (allIndiaOk != null) update.outstationAllIndiaOk = !!allIndiaOk;
      if (maxDrivingHoursPerDay != null) {
        const hours = Number(maxDrivingHoursPerDay);
        if (!Number.isFinite(hours) || hours < 4 || hours > 16) {
          throw new ApiError(400, 'Per-day driving capacity must be between 4 and 16 hours.');
        }
        update.outstationMaxDrivingHoursPerDay = hours;
      }
    }

    let resolvedZoneIds = null;
    if (Array.isArray(zoneIds)) {
      const seen = new Set();
      const cleaned = [];
      for (const raw of zoneIds) {
        const id = String(raw || '').trim();
        if (!id || seen.has(id)) continue;
        if (!mongoose.Types.ObjectId.isValid(id)) continue;
        seen.add(id);
        cleaned.push(new mongoose.Types.ObjectId(id));
      }
      resolvedZoneIds = cleaned;
    }

    if (resolvedZoneIds === null) {
      resolvedZoneIds = (existing?.preferredOutstationZones || []).map(
        (id) => new mongoose.Types.ObjectId(String(id)),
      );
    }

    if (!resolvedZoneIds.length) {
      throw new ApiError(
        400,
        'Pick at least one preferred outstation zone before turning this on.',
      );
    }

    // Verify the zones exist and are active. We don't want a driver
    // pinned to an archived zone that admins are no longer dispatching.
    const activeZones = await Zone.find({
      _id: { $in: resolvedZoneIds },
      isActive: true,
    })
      .select('_id')
      .lean();
    if (activeZones.length !== resolvedZoneIds.length) {
      throw new ApiError(
        400,
        'One or more selected zones are no longer available. Refresh and try again.',
      );
    }

    update.preferredOutstationZones = resolvedZoneIds;
  }

  const driver = await Driver.findByIdAndUpdate(
    driverId,
    { $set: update },
    { new: true },
  ).populate(vehicleExperiencePopulate);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }
  driver.documents = dedupeDocumentsByType(driver.documents);
  return driver.toObject();
};

/** Post-onboarding update: payout bank details. Resets isVerified. */
export const updateBankDetailsService = async (driverId, bankDetailsInput) => {
  const bankDetails = await parseBankDetailsInput(bankDetailsInput || {});

  const driver = await Driver.findByIdAndUpdate(
    driverId,
    { $set: { bankDetails } },
    { new: true, runValidators: true },
  ).populate(vehicleExperiencePopulate);

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  driver.documents = dedupeDocumentsByType(driver.documents);
  const doc = driver.toObject();
  const eligibility = await syncDriverKitEligibility(driverId);
  doc.kitEligibility = {
    canGoOnline: eligibility.allowed,
    reasons: eligibility.reasons,
    code: eligibility.code,
  };
  return doc;
};

/** Post-onboarding update: vehicle experience only (max 10). */
export const updateVehicleExperienceService = async (driverId, vehicleExperience) => {
  const {
    normalizeDriverVehicleExperience,
    syncCarTypeExperienceFromVehicles,
  } = await import('../utils/driverVehicleExperience.util.js');

  const vehicles = await normalizeDriverVehicleExperience(vehicleExperience);

  const driver = await Driver.findByIdAndUpdate(
    driverId,
    {
      $set: {
        vehicleExperience: vehicles,
        carTypeExperience: syncCarTypeExperienceFromVehicles(vehicles),
      },
    },
    { new: true, runValidators: true },
  ).populate(vehicleExperiencePopulate);

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  driver.documents = dedupeDocumentsByType(driver.documents);
  const doc = driver.toObject();
  const eligibility = await syncDriverKitEligibility(driverId);
  doc.kitEligibility = {
    canGoOnline: eligibility.allowed,
    reasons: eligibility.reasons,
    code: eligibility.code,
  };
  return doc;
};

// ─── Forgot / Reset Password (phone OTP only) ───────────────────────────────

export const sendDriverForgotPasswordOtpService = async (phone) => {
  if (!phone || phone.length !== 10) {
    throw new ApiError(400, 'Valid 10-digit phone number required');
  }

  const driver = await Driver.findOne({ phone, isDeleted: false });
  if (!driver) {
    throw new ApiError(404, 'No driver found with this mobile number');
  }
  if (driver.authProvider === 'google') {
    throw new ApiError(400, 'This account uses Google sign-in. Password reset is not available.');
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await OTP.findOneAndUpdate(
    { phone, purpose: 'forgot-password' },
    { otp, expiresAt, purpose: 'forgot-password' },
    { upsert: true, new: true },
  );

  await sendSmsOtp(phone, otp);
  return { message: 'OTP sent to your registered mobile number', via: 'phone' };
};

export const verifyDriverForgotPasswordOtpService = async ({ phone, otp } = {}) => {
  if (!otp) throw new ApiError(400, 'OTP is required');
  if (!phone || phone.length !== 10) {
    throw new ApiError(400, 'Valid 10-digit phone number required');
  }

  if (!isTestOtp(otp)) {
    const record = await OTP.findOne({ phone, otp, purpose: 'forgot-password' });
    if (!record || record.expiresAt < new Date()) {
      throw new ApiError(400, 'Invalid or expired OTP');
    }
  }
  return { valid: true };
};

export const resetDriverPasswordWithOtpService = async ({ phone, otp, newPassword } = {}) => {
  if (!otp) throw new ApiError(400, 'OTP is required');
  if (!phone || phone.length !== 10) {
    throw new ApiError(400, 'Valid 10-digit phone number required');
  }
  if (!newPassword || newPassword.length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters');
  }

  let record = null;
  if (!isTestOtp(otp)) {
    record = await OTP.findOne({ phone, otp, purpose: 'forgot-password' });
    if (!record || record.expiresAt < new Date()) {
      throw new ApiError(400, 'Invalid or expired OTP');
    }
  }

  const driver = await Driver.findOne({ phone, isDeleted: false }).select('+password');
  if (!driver) throw new ApiError(404, 'Driver not found');

  const salt = await bcrypt.genSalt(10);
  driver.password = await bcrypt.hash(newPassword, salt);
  await driver.save();
  if (record?._id) await OTP.deleteOne({ _id: record._id });

  return { message: 'Password changed successfully' };
};
