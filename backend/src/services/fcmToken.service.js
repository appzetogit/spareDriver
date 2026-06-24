import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { ApiError } from '../utils/apiError.js';

const PLATFORMS = new Set(['web', 'mobile']);

function pickUpdate(platform, token) {
  if (platform === 'web') {
    return { fcmTokenWeb: token, fcmToken: token };
  }
  return { fcmTokenMobile: token };
}

export async function registerUserFcmTokenService(userId, { token, platform }) {
  const clean = String(token || '').trim();
  if (!clean) throw new ApiError(400, 'token is required');
  if (!PLATFORMS.has(platform)) {
    throw new ApiError(400, 'platform must be "web" or "mobile"');
  }
  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: pickUpdate(platform, clean) },
    { new: true },
  ).select('fcmToken fcmTokenWeb fcmTokenMobile');
  if (!updated) throw new ApiError(404, 'User not found');
  return updated;
}

export async function registerDriverFcmTokenService(driverId, { token, platform }) {
  const clean = String(token || '').trim();
  if (!clean) throw new ApiError(400, 'token is required');
  if (!PLATFORMS.has(platform)) {
    throw new ApiError(400, 'platform must be "web" or "mobile"');
  }
  const updated = await Driver.findByIdAndUpdate(
    driverId,
    { $set: pickUpdate(platform, clean) },
    { new: true },
  ).select('fcmToken fcmTokenWeb fcmTokenMobile');
  if (!updated) throw new ApiError(404, 'Driver not found');
  return updated;
}

export function collectFcmTokens(doc) {
  if (!doc) return [];
  const tokens = [doc.fcmTokenWeb, doc.fcmTokenMobile, doc.fcmToken]
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  return [...new Set(tokens)];
}
