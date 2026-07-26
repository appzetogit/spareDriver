import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  generateAccessToken,
  generateRefreshToken,
  tokenPayloadFromUser,
} from '../utils/jwt.util.js';
import { USER_ROLES } from '../constants/roles.js';

import { isPlaceholderUserEmail, userNeedsEmail as computeUserNeedsEmail } from '../utils/email.util.js';
import { EmailVerification } from '../models/emailVerification.model.js';
import { sendEmail } from './email.service.js';
import { resolveAuthFcm } from './fcmToken.service.js';

function sanitizeUser(doc) {
  const o = doc.toObject();
  delete o.password;
  o.needsPhone = !o.phone_no || !o.isPhoneVerified;
  o.needsEmail = computeUserNeedsEmail(o);
  return o;
}

import { OTP } from '../models/otp.model.js';
import { isTestOtp, sendSmsOtp } from '../utils/otpService.js';
import { RegistrationDraft } from '../models/registrationDraft.model.js';

const REGISTRATION_DRAFT_TTL_MS = 30 * 60 * 1000;

function assertValidEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ApiError(400, 'Valid email address required');
  }
  if (isPlaceholderUserEmail(normalized)) {
    throw new ApiError(400, 'Valid email address required');
  }
  return normalized;
}

async function assertPhoneAvailable(phone) {
  const existingUser = await User.findOne({ phone_no: phone, isDeleted: false });
  if (existingUser) {
    throw new ApiError(400, 'This number is already registered. Please login to continue.');
  }
}

async function assertEmailAvailable(email, { excludeUserId } = {}) {
  const filter = { email, isDeleted: false, isEmailVerified: true };
  if (excludeUserId) filter._id = { $ne: excludeUserId };
  const taken = await User.findOne(filter);
  if (taken) {
    throw new ApiError(400, 'This email is already registered to another account');
  }
}

async function upsertRegistrationDraft(phone, patch = {}) {
  const expiresAt = new Date(Date.now() + REGISTRATION_DRAFT_TTL_MS);
  return RegistrationDraft.findOneAndUpdate(
    { phone },
    { ...patch, expiresAt },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;

function buildEmailVerificationHtml(name, otp) {
  return `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
    <h1 style="margin:0 0 8px;font-size:18px;color:#0f172a;">Verify your email</h1>
    <p style="margin:0 0 16px;color:#64748b;font-size:14px;">Hi ${name || 'there'}, use this code to verify your SpareDriver account email.</p>
    <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.2em;color:#0f172a;">${otp}</p>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">This code expires in 10 minutes.</p>
  </div>
</body></html>`;
}

export const sendUserOtpService = async (phone) => {
  if (!phone || phone.length !== 10) {
    throw new ApiError(400, 'Valid 10-digit phone number required');
  }

  await assertPhoneAvailable(phone);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await OTP.findOneAndUpdate({ phone }, { otp, expiresAt }, { upsert: true, new: true });

  await sendSmsOtp(phone, otp);
  return { message: 'OTP sent successfully' };
};

export const verifyRegistrationPhoneOtpService = async (phone, otp) => {
  if (!phone || phone.length !== 10 || !otp) {
    throw new ApiError(400, 'Phone and OTP are required');
  }

  await assertPhoneAvailable(phone);

  if (!isTestOtp(otp)) {
    const otpRecord = await OTP.findOne({ phone, otp });
    if (!otpRecord || otpRecord.expiresAt < new Date()) {
      throw new ApiError(400, 'Invalid or expired OTP');
    }
    await OTP.deleteOne({ _id: otpRecord._id });
  }

  const draft = await upsertRegistrationDraft(phone, {
    phoneVerified: true,
    emailVerified: false,
    email: '',
  });

  return { phoneVerified: true, emailVerified: draft.emailVerified };
};

export const sendRegistrationEmailOtpService = async (phone, email) => {
  if (!phone || phone.length !== 10) {
    throw new ApiError(400, 'Valid 10-digit phone number required');
  }

  const normalizedEmail = assertValidEmail(email);

  const draft = await RegistrationDraft.findOne({ phone, phoneVerified: true });
  if (!draft) {
    throw new ApiError(400, 'Verify your mobile number first');
  }

  await assertEmailAvailable(normalizedEmail);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + EMAIL_OTP_TTL_MS);

  await EmailVerification.findOneAndUpdate(
    { phone },
    { phone, email: normalizedEmail, otp, expiresAt, userId: null },
    { upsert: true, new: true },
  );

  await upsertRegistrationDraft(phone, {
    email: normalizedEmail,
    emailVerified: false,
  });

  await sendEmail({
    to: normalizedEmail,
    subject: 'Your SpareDriver email verification code',
    html: buildEmailVerificationHtml('', otp),
    text: `Your SpareDriver verification code is: ${otp}. It expires in 10 minutes.`,
  });

  return { message: 'Verification code sent to your email' };
};

export const verifyRegistrationEmailOtpService = async (phone, email, otp) => {
  if (!phone || phone.length !== 10) {
    throw new ApiError(400, 'Valid phone number required');
  }

  const normalizedEmail = assertValidEmail(email);
  if (!otp) {
    throw new ApiError(400, 'Verification code is required');
  }

  const draft = await RegistrationDraft.findOne({ phone, phoneVerified: true });
  if (!draft) {
    throw new ApiError(400, 'Verify your mobile number first');
  }

  if (!isTestOtp(otp)) {
    const record = await EmailVerification.findOne({
      phone,
      email: normalizedEmail,
      otp,
    });
    if (!record || record.expiresAt < new Date()) {
      throw new ApiError(400, 'Invalid or expired verification code');
    }
    await EmailVerification.deleteOne({ _id: record._id });
  }

  await upsertRegistrationDraft(phone, {
    email: normalizedEmail,
    emailVerified: true,
  });

  return { phoneVerified: true, emailVerified: true };
};

export const completeRegistrationService = async ({ name, phone, email, password, fcmToken, token, platform }) => {
  if (!name?.trim() || !phone || !password) {
    throw new ApiError(400, 'All fields are required');
  }
  if (password.length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters');
  }

  const normalizedEmail = assertValidEmail(email);

  const draft = await RegistrationDraft.findOne({
    phone,
    phoneVerified: true,
    emailVerified: true,
    email: normalizedEmail,
  });
  if (!draft) {
    throw new ApiError(400, 'Please verify your mobile number and email first');
  }

  await assertPhoneAvailable(phone);
  await assertEmailAvailable(normalizedEmail);

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    phone_no: phone,
    password: hashedPassword,
    role: USER_ROLES.USER,
    authProvider: 'local',
    isPhoneVerified: true,
    isEmailVerified: true,
  });

  await RegistrationDraft.deleteOne({ _id: draft._id });

  const payload = tokenPayloadFromUser(user);
  const { notifyAdminNewUserRegistration } = await import('../utils/notificationDispatch.js');
  notifyAdminNewUserRegistration(user).catch(() => null);
  const fcm = await resolveAuthFcm('user', user._id, user, { fcmToken, token, platform });
  return {
    user: sanitizeUser(user),
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    fcm,
  };
};

export const verifyUserOtpAndRegisterService = async ({ name, phone, password, otp, email, fcmToken, token, platform }) => {
  if (!name || !phone || !password || !otp) {
    throw new ApiError(400, 'All fields are required');
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new ApiError(400, 'Valid email address required');
  }
  if (isPlaceholderUserEmail(normalizedEmail)) {
    throw new ApiError(400, 'Valid email address required');
  }

  const existingPhone = await User.findOne({ phone_no: phone, isDeleted: false });
  if (existingPhone) {
    throw new ApiError(400, 'This number is already registered. Please login to continue.');
  }

  const emailTaken = await User.findOne({
    email: normalizedEmail,
    isDeleted: false,
    isEmailVerified: true,
  });
  if (emailTaken) {
    throw new ApiError(400, 'This email is already registered to another account');
  }

  if (!isTestOtp(otp)) {
    const otpRecord = await OTP.findOne({ phone, otp });
    if (!otpRecord) {
      throw new ApiError(400, 'Invalid or expired OTP');
    }
    await OTP.deleteOne({ _id: otpRecord._id });
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const user = await User.create({
    name,
    email: normalizedEmail,
    phone_no: phone,
    password: hashedPassword,
    role: USER_ROLES.USER,
    authProvider: 'local',
    isPhoneVerified: true,
    isEmailVerified: false,
  });

  const payload = tokenPayloadFromUser(user);
  const { notifyAdminNewUserRegistration } = await import('../utils/notificationDispatch.js');
  notifyAdminNewUserRegistration(user).catch(() => null);
  const fcm = await resolveAuthFcm('user', user._id, user, { fcmToken, token, platform });
  return {
    user: sanitizeUser(user),
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    fcm,
  };
};

export const loginUserService = async ({ phone, email, password, fcmToken, token, platform } = {}) => {
  if (!password) {
    throw new ApiError(400, 'Password is required');
  }
  if (!phone && !email) {
    throw new ApiError(400, 'Phone or email is required');
  }

  let user;
  if (phone) {
    if (phone.length !== 10) {
      throw new ApiError(400, 'Valid 10-digit phone number required');
    }
    user = await User.findOne({ phone_no: phone }).select('+password');
  } else {
    const normalized = assertValidEmail(email);
    user = await User.findOne({
      email: normalized,
      isDeleted: false,
      isEmailVerified: true,
    }).select('+password');
  }

  if (!user || user.isDeleted) {
    throw new ApiError(401, 'Phone number not registered. Please sign up.');
  }

  if (user.role !== USER_ROLES.USER) {
    throw new ApiError(401, 'Use the correct sign-in page for your account type');
  }

  if (user.authProvider === 'google') {
    throw new ApiError(401, 'This account uses Google sign-in');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const safeUser = await User.findById(user._id).select('-password');
  const payload = tokenPayloadFromUser(safeUser);
  const fcm = await resolveAuthFcm('user', safeUser._id, safeUser, { fcmToken, token, platform });
  return {
    user: sanitizeUser(safeUser),
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    fcm,
  };
};

import Car from '../models/user/car.model.js';
import Booking from '../models/booking.model.js';
import UserSubscription from '../models/userSubscription.model.js';
import PlatformCondition from '../models/platformCondition.model.js';
import { validateCarCatalogRefs } from './vehicleCatalog.service.js';

// ... (existing sanitize, etc.)

// ─── User Onboarding & Vehicle Services ──────────────────────────────────────

function buildConditionAnswerMap(conditions) {
  return new Map(
    (conditions || []).map((c) => [
      String(c.conditionId?._id ?? c.conditionId),
      c.value,
    ]),
  );
}

function isConditionSetComplete(activeConditions, answerMap) {
  if (!activeConditions.length) return true;

  const allAnswered = activeConditions.every(
    (c) => answerMap.get(String(c._id)) === true || answerMap.get(String(c._id)) === false,
  );
  const requiredMet = activeConditions
    .filter((c) => c.isRequired)
    .every((c) => answerMap.get(String(c._id)) === true);

  return allAnswered && requiredMet;
}

function validateAndNormalizeConditionsPayload(activeConditions, conditionsPayload) {
  if (!activeConditions.length) return [];

  const payloadMap = buildConditionAnswerMap(conditionsPayload);
  if (!isConditionSetComplete(activeConditions, payloadMap)) {
    throw new ApiError(400, 'Please answer all safety checklist questions and accept required items');
  }

  return activeConditions.map((c) => ({
    conditionId: c._id,
    value: payloadMap.get(String(c._id)),
  }));
}

function isCarChecklistComplete(car, activeConditions, legacyUserConditions) {
  const source = car.conditions?.length ? car.conditions : legacyUserConditions;
  return isConditionSetComplete(activeConditions, buildConditionAnswerMap(source));
}

/** Copy legacy user-level answers onto cars that predate per-car checklists. */
async function migrateUserConditionsToCars(user, cars) {
  if (!user.conditions?.length) return cars;

  const stale = cars.filter((c) => !c.conditions?.length);
  if (!stale.length) return cars;

  const snapshot = user.conditions.map((c) => ({
    conditionId: c.conditionId,
    value: c.value,
  }));

  await Promise.all(
    stale.map(async (car) => {
      car.conditions = snapshot;
      await car.save();
    }),
  );

  return Car.find({ userId: user._id, isActive: true })
    .populate('carTypeId', 'name')
    .populate('brandId', 'name')
    .populate('modelId', 'name')
    .populate('fuelTypeId', 'name')
    .sort({ createdAt: -1 });
}

async function isOnboardingComplete(user, cars) {
  if (!cars.length) return false;

  const activeConditions = await PlatformCondition.find({ isActive: true }).lean();
  return cars.every((car) => isCarChecklistComplete(car, activeConditions, user.conditions));
}

function buildChecklistView(activeConditions, answerMap) {
  return activeConditions.map((c) => ({
    _id: c._id,
    question: c.question,
    isRequired: c.isRequired,
    value: answerMap.get(String(c._id)) ?? null,
  }));
}

export const getUserProfileService = async (userId, { includeInactiveCars = false } = {}) => {
  const user = await User.findById(userId);
  if (!user || user.isDeleted || user.role !== USER_ROLES.USER) {
    throw new ApiError(404, 'User not found');
  }

  const carFilter = includeInactiveCars
    ? { userId }
    : { userId, isActive: true };

  let cars = await Car.find(carFilter)
    .populate('carTypeId', 'name')
    .populate('brandId', 'name')
    .populate('modelId', 'name')
    .populate('fuelTypeId', 'name')
    .populate('conditions.conditionId')
    .sort({ createdAt: -1 });

  cars = await migrateUserConditionsToCars(user, cars);

  const activeConditions = await PlatformCondition.find({ isActive: true }).lean();
  const carsWithChecklist = cars.map((car) => {
    const answerMap = buildConditionAnswerMap(
      car.conditions?.length ? car.conditions : user.conditions,
    );
    return {
      ...car.toObject(),
      checklist: buildChecklistView(activeConditions, answerMap),
      hasChecklist: isCarChecklistComplete(car, activeConditions, user.conditions),
    };
  });

  return {
    user: sanitizeUser(user),
    cars: carsWithChecklist,
    carsCount: carsWithChecklist.filter((c) => c.isActive !== false).length,
    hasChecklist: await isOnboardingComplete(user, cars.filter((c) => c.isActive !== false)),
  };
};

export const getRegistrationStatusService = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  let cars = await Car.find({ userId, isActive: true });
  cars = await migrateUserConditionsToCars(user, cars);
  const carCount = cars.length;

  return {
    hasCar: carCount > 0,
    hasChecklist: await isOnboardingComplete(user, cars),
    carCount,
    needsPhone: !user.phone_no || !user.isPhoneVerified,
    needsEmail: computeUserNeedsEmail(user),
    user: sanitizeUser(user),
  };
};

export const sendUserEmailVerificationOtpService = async (userId, email) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ApiError(400, 'Valid email address required');
  }
  if (isPlaceholderUserEmail(normalized)) {
    throw new ApiError(400, 'Please enter your personal email address');
  }

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  const taken = await User.findOne({
    email: normalized,
    _id: { $ne: userId },
    isDeleted: false,
    isEmailVerified: true,
  });
  if (taken) {
    throw new ApiError(400, 'This email is already registered to another account');
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + EMAIL_OTP_TTL_MS);

  await EmailVerification.findOneAndUpdate(
    { userId },
    { email: normalized, otp, expiresAt },
    { upsert: true, new: true },
  );

  await sendEmail({
    to: normalized,
    subject: 'Your SpareDriver email verification code',
    html: buildEmailVerificationHtml(user.name, otp),
    text: `Your SpareDriver verification code is: ${otp}. It expires in 10 minutes.`,
  });

  return { message: 'Verification code sent to your email' };
};

export const verifyUserEmailOtpService = async (userId, { email, otp }) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !otp) {
    throw new ApiError(400, 'Email and verification code are required');
  }

  if (!isTestOtp(otp)) {
    const record = await EmailVerification.findOne({ userId, email: normalized, otp });
    if (!record || record.expiresAt < new Date()) {
      throw new ApiError(400, 'Invalid or expired verification code');
    }
    await EmailVerification.deleteOne({ _id: record._id });
  }

  const taken = await User.findOne({
    email: normalized,
    _id: { $ne: userId },
    isDeleted: false,
    isEmailVerified: true,
  });
  if (taken) {
    throw new ApiError(400, 'This email is already registered to another account');
  }

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  user.email = normalized;
  user.isEmailVerified = true;
  await user.save();

  return sanitizeUser(user);
};

export const updateUserOnboardingStepService = async (userId, data) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  await user.save();
  return sanitizeUser(user);
};

export const addCarService = async (userId, carData) => {
  const {
    carTypeId,
    brandId,
    modelId,
    fuelTypeId,
    vehicleNumber,
    transmission,
    image,
    insuranceExpiry,
    pucExpiry,
    conditions: conditionsPayload,
  } = carData;

  if (!carTypeId || !brandId || !modelId || !fuelTypeId || !vehicleNumber || !transmission) {
    throw new ApiError(400, 'All vehicle details are required');
  }

  const cleanNum = String(vehicleNumber).trim().replace(/[\s-]/g, '').toUpperCase();
  const vehicleRegex = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$|^BH\d{2}[A-Z]{1,2}\d{4}$/;
  if (!vehicleRegex.test(cleanNum)) {
    throw new ApiError(400, 'Invalid vehicle number format. Please enter a valid registration number (e.g. MP09 AB 1234)');
  }
  if (!insuranceExpiry || !pucExpiry) {
    throw new ApiError(400, 'Insurance expiry and PUC expiry dates are required');
  }

  const insuranceAt = new Date(insuranceExpiry);
  const pucAt = new Date(pucExpiry);
  if (!Number.isFinite(insuranceAt.getTime()) || !Number.isFinite(pucAt.getTime())) {
    throw new ApiError(400, 'Insurance expiry and PUC expiry must be valid dates');
  }

  await validateCarCatalogRefs({ carTypeId, brandId, modelId, fuelTypeId });

  const activeConditions = await PlatformCondition.find({ isActive: true }).lean();
  const normalizedConditions = validateAndNormalizeConditionsPayload(
    activeConditions,
    conditionsPayload,
  );

  const existingCount = await Car.countDocuments({ userId, isActive: true });
  if (existingCount >= 5) {
    throw new ApiError(400, 'You can only register up to 5 vehicles');
  }

  const exists = await Car.findOne({ vehicleNumber: vehicleNumber.toUpperCase(), isActive: true });
  if (exists) {
    throw new ApiError(400, 'This vehicle number is already registered');
  }

  const car = await Car.create({
    userId,
    carTypeId,
    brandId,
    modelId,
    fuelTypeId,
    vehicleNumber: vehicleNumber.toUpperCase(),
    transmission: String(transmission).toLowerCase(),
    image: image || '',
    insuranceExpiry: insuranceAt,
    pucExpiry: pucAt,
    conditions: normalizedConditions,
  });

  const populated = await Car.findById(car._id)
    .populate('carTypeId', 'name')
    .populate('brandId', 'name')
    .populate('modelId', 'name')
    .populate('fuelTypeId', 'name');

  const user = await User.findById(userId);
  const carCount = await Car.countDocuments({ userId, isActive: true });
  const allCars = await Car.find({ userId, isActive: true });
  return {
    car: populated,
    carCount,
    hasChecklist: await isOnboardingComplete(user, allCars),
  };
};

export const getUserCarsService = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  let cars = await Car.find({ userId, isActive: true });
  cars = await migrateUserConditionsToCars(user, cars);

  const populated = await Car.find({ userId, isActive: true })
    .populate('carTypeId', 'name')
    .populate('brandId', 'name')
    .populate('modelId', 'name')
    .populate('fuelTypeId', 'name')
    .populate('conditions.conditionId', 'question description isRequired')
    .sort({ createdAt: -1 });

  const activeConditions = await PlatformCondition.find({ isActive: true }).lean();

  return populated.map((car) => {
    const answerMap = buildConditionAnswerMap(
      car.conditions?.length ? car.conditions : user.conditions,
    );
    return {
      ...car.toObject(),
      checklist: buildChecklistView(activeConditions, answerMap),
      hasChecklist: isCarChecklistComplete(car, activeConditions, user.conditions),
    };
  });
};

export const deleteUserCarService = async (userId, carId) => {
  const car = await Car.findOne({ _id: carId, userId, isActive: true });
  if (!car) throw new ApiError(404, 'Car not found');

  const [bookingCount, subscriptionCount] = await Promise.all([
    Booking.countDocuments({ carId, isDeleted: false }),
    UserSubscription.countDocuments({ carId }),
  ]);

  if (bookingCount > 0) {
    throw new ApiError(
      409,
      'This vehicle cannot be removed because it is linked to a trip. Contact support if you need help.',
    );
  }
  if (subscriptionCount > 0) {
    throw new ApiError(
      409,
      'This vehicle cannot be removed because it is linked to a subscription.',
    );
  }

  car.isActive = false;
  await car.save();
  return { id: carId };
};

export const updateCarService = async (userId, carId, carData) => {
  const {
    carTypeId,
    brandId,
    modelId,
    fuelTypeId,
    vehicleNumber,
    transmission,
    image,
    insuranceExpiry,
    pucExpiry,
    conditions: conditionsPayload,
  } = carData;

  if (!carTypeId || !brandId || !modelId || !fuelTypeId || !vehicleNumber || !transmission) {
    throw new ApiError(400, 'All vehicle details are required');
  }

  const cleanNum = String(vehicleNumber).trim().replace(/[\s-]/g, '').toUpperCase();
  const vehicleRegex = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$|^BH\d{2}[A-Z]{1,2}\d{4}$/;
  if (!vehicleRegex.test(cleanNum)) {
    throw new ApiError(400, 'Invalid vehicle number format. Please enter a valid registration number (e.g. MP09 AB 1234)');
  }
  if (!insuranceExpiry || !pucExpiry) {
    throw new ApiError(400, 'Insurance expiry and PUC expiry dates are required');
  }

  const insuranceAt = new Date(insuranceExpiry);
  const pucAt = new Date(pucExpiry);
  if (!Number.isFinite(insuranceAt.getTime()) || !Number.isFinite(pucAt.getTime())) {
    throw new ApiError(400, 'Insurance expiry and PUC expiry must be valid dates');
  }

  const car = await Car.findOne({ _id: carId, userId, isActive: true });
  if (!car) {
    throw new ApiError(404, 'Car not found');
  }

  await validateCarCatalogRefs({ carTypeId, brandId, modelId, fuelTypeId });

  const activeConditions = await PlatformCondition.find({ isActive: true }).lean();
  const normalizedConditions = validateAndNormalizeConditionsPayload(
    activeConditions,
    conditionsPayload,
  );

  if (vehicleNumber.toUpperCase() !== car.vehicleNumber) {
    const exists = await Car.findOne({ vehicleNumber: vehicleNumber.toUpperCase(), isActive: true });
    if (exists) {
      throw new ApiError(400, 'This vehicle number is already registered');
    }
  }

  car.carTypeId = carTypeId;
  car.brandId = brandId;
  car.modelId = modelId;
  car.fuelTypeId = fuelTypeId;
  car.vehicleNumber = vehicleNumber.toUpperCase();
  car.transmission = String(transmission).toLowerCase();
  car.image = image || '';
  car.insuranceExpiry = insuranceAt;
  car.pucExpiry = pucAt;
  car.conditions = normalizedConditions;

  await car.save();

  const populated = await Car.findById(car._id)
    .populate('carTypeId', 'name')
    .populate('brandId', 'name')
    .populate('modelId', 'name')
    .populate('fuelTypeId', 'name');

  const user = await User.findById(userId);
  const allCars = await Car.find({ userId, isActive: true });
  return {
    car: populated,
    carCount: allCars.length,
    hasChecklist: await isOnboardingComplete(user, allCars),
  };
};

// ─── Saved (favourite) locations ─────────────────────────────────────────────

const MAX_SAVED_LOCATIONS = 20;

function normalizeSavedLocationInput(payload = {}) {
  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  const address = typeof payload.address === 'string' ? payload.address.trim() : '';
  const label = typeof payload.label === 'string' ? payload.label.trim().slice(0, 60) : '';
  const city = typeof payload.city === 'string' ? payload.city.trim().slice(0, 120) : '';

  if (!address) throw new ApiError(400, 'Address is required');
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new ApiError(400, 'Invalid latitude');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new ApiError(400, 'Invalid longitude');

  return { label, address: address.slice(0, 300), city, lat, lng };
}

export const listSavedLocationsService = async (userId) => {
  const user = await User.findById(userId).select('savedLocations');
  if (!user) throw new ApiError(404, 'User not found');
  // Newest first
  return [...(user.savedLocations || [])].sort(
    (a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0),
  );
};

export const addSavedLocationService = async (userId, payload) => {
  const next = normalizeSavedLocationInput(payload);

  const user = await User.findById(userId).select('savedLocations');
  if (!user) throw new ApiError(404, 'User not found');

  if ((user.savedLocations?.length || 0) >= MAX_SAVED_LOCATIONS) {
    throw new ApiError(400, `You can save up to ${MAX_SAVED_LOCATIONS} favourite locations`);
  }

  // De-dup on coords + label (rounded ~10m) so accidental double-taps don't
  // pile up identical entries.
  const dupe = (user.savedLocations || []).find(
    (loc) =>
      loc.label?.toLowerCase() === next.label.toLowerCase() &&
      Math.abs(loc.lat - next.lat) < 0.0001 &&
      Math.abs(loc.lng - next.lng) < 0.0001,
  );
  if (dupe) return dupe;

  user.savedLocations.push(next);
  await user.save();
  return user.savedLocations[user.savedLocations.length - 1];
};

export const deleteSavedLocationService = async (userId, locationId) => {
  const user = await User.findById(userId).select('savedLocations');
  if (!user) throw new ApiError(404, 'User not found');

  const before = user.savedLocations?.length || 0;
  user.savedLocations = (user.savedLocations || []).filter(
    (loc) => String(loc._id) !== String(locationId),
  );
  if (user.savedLocations.length === before) {
    throw new ApiError(404, 'Saved location not found');
  }
  await user.save();
  return { id: locationId };
};

// ─── Forgot / Reset Password ──────────────────────────────────────────────────

/**
 * Send a forgot-password OTP via phone (SMS) or email.
 * Does NOT require the user to be authenticated.
 * Pass { phone } or { email } in the options object.
 */
export const sendForgotPasswordOtpService = async ({ phone, email } = {}) => {
  // ── Phone flow ──────────────────────────────────────────────────────────────
  if (phone) {
    if (phone.length !== 10) {
      throw new ApiError(400, 'Valid 10-digit phone number required');
    }

    const user = await User.findOne({ phone_no: phone, isDeleted: false });
    if (!user) {
      return { message: 'If this number is registered, an OTP will be sent', via: 'phone' };
    }
    if (user.authProvider === 'google') {
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
  }

  // ── Email flow ──────────────────────────────────────────────────────────────
  if (email) {
    const normalized = assertValidEmail(email);

    const user = await User.findOne({ email: normalized, isDeleted: false, isEmailVerified: true });
    if (!user) {
      return { message: 'If this email is registered, an OTP will be sent', via: 'email' };
    }
    if (user.authProvider === 'google') {
      throw new ApiError(400, 'This account uses Google sign-in. Password reset is not available.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Reuse EmailVerification model — purpose differentiated by a prefix on userId
    await EmailVerification.findOneAndUpdate(
      { email: normalized, phone: 'forgot-password' },
      { email: normalized, phone: 'forgot-password', otp, expiresAt, userId: user._id },
      { upsert: true, new: true },
    );

    await sendEmail({
      to: normalized,
      subject: 'Your SpareDriver password reset OTP',
      html: buildEmailVerificationHtml(user.name, otp),
      text: `Your SpareDriver password reset OTP is: ${otp}. It expires in 10 minutes.`,
    });

    return { message: 'OTP sent to your registered email address', via: 'email' };
  }

  throw new ApiError(400, 'Provide a registered phone number or email address');
};

/**
 * Verify the OTP and set a new password.
 * Accepts { phone, otp, newPassword } or { email, otp, newPassword }.
 */
export const resetPasswordWithOtpService = async ({ phone, email, otp, newPassword } = {}) => {
  if (!otp) throw new ApiError(400, 'OTP is required');
  if (!newPassword || newPassword.length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters');
  }

  // ── Phone flow ──────────────────────────────────────────────────────────────
  if (phone) {
    if (phone.length !== 10) throw new ApiError(400, 'Valid 10-digit phone number required');

    let record = null;
    if (!isTestOtp(otp)) {
      record = await OTP.findOne({ phone, otp, purpose: 'forgot-password' });
      if (!record || record.expiresAt < new Date()) {
        throw new ApiError(400, 'Invalid or expired OTP');
      }
    }

    const user = await User.findOne({ phone_no: phone, isDeleted: false }).select('+password');
    if (!user) throw new ApiError(404, 'User not found');

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    if (record?._id) await OTP.deleteOne({ _id: record._id });

    return { message: 'Password changed successfully' };
  }

  // ── Email flow ──────────────────────────────────────────────────────────────
  if (email) {
    const normalized = assertValidEmail(email);

    let record = null;
    if (!isTestOtp(otp)) {
      record = await EmailVerification.findOne({
        email: normalized,
        phone: 'forgot-password',
        otp,
      });
      if (!record || record.expiresAt < new Date()) {
        throw new ApiError(400, 'Invalid or expired OTP');
      }
    }

    const user = isTestOtp(otp)
      ? await User.findOne({ email: normalized, isDeleted: false }).select('+password')
      : await User.findById(record.userId).select('+password');
    if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    if (record?._id) await EmailVerification.deleteOne({ _id: record._id });

    return { message: 'Password changed successfully' };
  }

  throw new ApiError(400, 'Provide a registered phone number or email address');
};

/**
 * Verify OTP validity only — does NOT consume the OTP or change the password.
 * Used by the UI to confirm the OTP before asking for a new password.
 */
export const verifyForgotPasswordOtpService = async ({ phone, email, otp } = {}) => {
  if (!otp) throw new ApiError(400, 'OTP is required');

  if (phone) {
    if (phone.length !== 10) throw new ApiError(400, 'Valid 10-digit phone number required');
    if (!isTestOtp(otp)) {
      const record = await OTP.findOne({ phone, otp, purpose: 'forgot-password' });
      if (!record || record.expiresAt < new Date()) {
        throw new ApiError(400, 'Invalid or expired OTP');
      }
    }
    return { valid: true };
  }

  if (email) {
    const normalized = assertValidEmail(email);
    if (!isTestOtp(otp)) {
      const record = await EmailVerification.findOne({
        email: normalized,
        phone: 'forgot-password',
        otp,
      });
      if (!record || record.expiresAt < new Date()) {
        throw new ApiError(400, 'Invalid or expired OTP');
      }
    }
    return { valid: true };
  }

  throw new ApiError(400, 'Provide a registered phone number or email address');
};


