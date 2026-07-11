import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { OTP } from '../models/otp.model.js';
import { ApiError } from '../utils/apiError.js';
import { verifyGoogleIdToken } from '../utils/googleAuth.util.js';
import { AUTH_PROVIDER } from '../constants/authProviders.js';
import { USER_ROLES } from '../constants/roles.js';
import {
  generateAccessToken,
  generateRefreshToken,
  tokenPayloadFromUser,
  tokenPayloadFromDriver,
} from '../utils/jwt.util.js';
import { isTestOtp, sendSmsOtp } from '../utils/otpService.js';
import { userNeedsEmail as computeUserNeedsEmail } from '../utils/email.util.js';
import { resolveAuthFcm } from './fcmToken.service.js';

function sanitizeUser(doc) {
  const o = doc.toObject();
  delete o.password;
  o.needsPhone = userNeedsPhone(doc);
  o.needsEmail = computeUserNeedsEmail(o);
  return o;
}

function sanitizeDriver(driver) {
  return {
    id: driver._id,
    name: driver.name,
    phone: driver.phone || '',
    email: driver.email || '',
    onboardingStep: driver.onboardingStep,
    approvalStatus: driver.approvalStatus,
    approvalNote: driver.approvalNote || '',
    authProvider: driver.authProvider,
    needsPhone: !driver.phone,
  };
}

function userNeedsPhone(user) {
  return !user.phone_no || !user.isPhoneVerified;
}

async function randomPasswordHash() {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(crypto.randomBytes(32).toString('hex'), salt);
}

/**
 * @param {'user'|'driver'} accountType
 */
export async function googleSignInService(credential, accountType, fcmInput = {}) {
  const profile = await verifyGoogleIdToken(credential);

  if (accountType === 'driver') {
    return googleSignInDriver(profile, fcmInput);
  }
  return googleSignInUser(profile, fcmInput);
}

async function googleSignInUser(profile, fcmInput) {
  let user =
    (await User.findOne({ googleId: profile.googleId, isDeleted: false })) ||
    (await User.findOne({ email: profile.email, isDeleted: false }));

  if (user && user.isDeleted) {
    throw new ApiError(401, 'Account is not available');
  }

  if (user) {
    if (user.role !== USER_ROLES.USER) {
      throw new ApiError(401, 'Use the correct sign-in page for your account type');
    }
    if (user.authProvider === AUTH_PROVIDER.LOCAL && !user.googleId) {
      user.googleId = profile.googleId;
      user.authProvider = AUTH_PROVIDER.GOOGLE;
      user.isEmailVerified = profile.emailVerified;
      if (profile.picture && !user.profilePicture) user.profilePicture = profile.picture;
      await user.save();
    } else if (user.googleId && user.googleId !== profile.googleId) {
      throw new ApiError(401, 'This email is linked to a different Google account');
    }
  } else {
    user = await User.create({
      name: profile.name,
      email: profile.email,
      googleId: profile.googleId,
      authProvider: AUTH_PROVIDER.GOOGLE,
      role: USER_ROLES.USER,
      profilePicture: profile.picture || '',
      isEmailVerified: profile.emailVerified,
      password: await randomPasswordHash(),
    });
  }

  const safeUser = await User.findById(user._id).select('-password');
  const payload = tokenPayloadFromUser(safeUser);
  const fcm = await resolveAuthFcm('user', safeUser._id, safeUser, fcmInput);

  return {
    user: sanitizeUser(safeUser),
    needsPhone: userNeedsPhone(safeUser),
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    fcm,
  };
}

async function googleSignInDriver(profile, fcmInput) {
  let driver =
    (await Driver.findOne({ googleId: profile.googleId, isDeleted: false })) ||
    (await Driver.findOne({ email: profile.email, isDeleted: false }));

  if (driver) {
    if (driver.authProvider === AUTH_PROVIDER.LOCAL && !driver.googleId) {
      driver.googleId = profile.googleId;
      driver.authProvider = AUTH_PROVIDER.GOOGLE;
      if (profile.picture && !driver.profilePicture) driver.profilePicture = profile.picture;
      await driver.save();
    } else if (driver.googleId && driver.googleId !== profile.googleId) {
      throw new ApiError(401, 'This email is linked to a different Google account');
    }
  } else {
    driver = new Driver({
      name: profile.name,
      email: profile.email,
      googleId: profile.googleId,
      authProvider: AUTH_PROVIDER.GOOGLE,
      profilePicture: profile.picture || '',
      password: await randomPasswordHash(),
      approvalStatus: 'pending',
    });
    await driver.save();
  }

  const payload = tokenPayloadFromDriver(driver);
  const fcm = await resolveAuthFcm('driver', driver._id, driver, fcmInput);

  return {
    driver: sanitizeDriver(driver),
    needsPhone: !driver.phone,
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    fcm,
  };
}

export async function linkGoogleUserPhoneService(userId, { phone, otp }) {
  if (!phone || phone.length !== 10 || !otp) {
    throw new ApiError(400, 'Phone and OTP are required');
  }

  const user = await User.findById(userId);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  if (!isTestOtp(otp)) {
    const otpRecord = await OTP.findOne({ phone, otp });
    if (!otpRecord) throw new ApiError(400, 'Invalid or expired OTP');
    await OTP.deleteOne({ _id: otpRecord._id });
  }

  const taken = await User.findOne({ phone_no: phone, _id: { $ne: userId }, isDeleted: false });
  if (taken) throw new ApiError(400, 'This number is already registered');

  user.phone_no = phone;
  user.isPhoneVerified = true;
  await user.save();

  const safeUser = await User.findById(user._id).select('-password');
  return { user: sanitizeUser(safeUser), needsPhone: false };
}

export async function linkGoogleDriverPhoneService(driverId, { phone, otp }) {
  if (!phone || phone.length !== 10 || !otp) {
    throw new ApiError(400, 'Phone and OTP are required');
  }

  const driver = await Driver.findById(driverId);
  if (!driver || driver.isDeleted) throw new ApiError(404, 'Driver not found');

  if (!isTestOtp(otp)) {
    const otpRecord = await OTP.findOne({ phone, otp });
    if (!otpRecord) throw new ApiError(400, 'Invalid or expired OTP');
    await OTP.deleteOne({ _id: otpRecord._id });
  }

  const taken = await Driver.findOne({ phone, _id: { $ne: driverId }, isDeleted: false });
  if (taken) throw new ApiError(400, 'This number is already registered');

  driver.phone = phone;
  // Ensure identity step is recorded once phone is linked (Google sign-up path).
  if (!driver.onboardingStep || driver.onboardingStep < 1) {
    driver.onboardingStep = 1;
  }
  await driver.save();

  return { driver: sanitizeDriver(driver), needsPhone: false };
}

export async function sendLinkPhoneOtpService(phone, accountType) {
  if (!phone || phone.length !== 10) {
    throw new ApiError(400, 'Valid 10-digit phone number required');
  }

  if (accountType === 'driver') {
    const existing = await Driver.findOne({ phone, isDeleted: false });
    if (existing) throw new ApiError(400, 'Number already exists, please login');
  } else {
    const existing = await User.findOne({ phone_no: phone, isDeleted: false });
    if (existing) throw new ApiError(400, 'Number already exists, please login');
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await OTP.findOneAndUpdate({ phone }, { otp, expiresAt }, { upsert: true, new: true });
  await sendSmsOtp(phone, otp);
  return { message: 'OTP sent successfully' };
}
