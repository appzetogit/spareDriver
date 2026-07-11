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

function pickClear(platform) {
  if (platform === 'web') {
    return { fcmTokenWeb: '', fcmToken: '' };
  }
  if (platform === 'mobile') {
    return { fcmTokenMobile: '' };
  }
  return { fcmToken: '', fcmTokenWeb: '', fcmTokenMobile: '' };
}

export async function unregisterUserFcmTokenService(userId, { platform = 'all' } = {}) {
  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: pickClear(platform) },
    { new: true },
  ).select('fcmToken fcmTokenWeb fcmTokenMobile');
  if (!updated) throw new ApiError(404, 'User not found');
  return updated;
}

export async function unregisterDriverFcmTokenService(driverId, { platform = 'all' } = {}) {
  const updated = await Driver.findByIdAndUpdate(
    driverId,
    { $set: pickClear(platform) },
    { new: true },
  ).select('fcmToken fcmTokenWeb fcmTokenMobile');
  if (!updated) throw new ApiError(404, 'Driver not found');
  return updated;
}

export function normalizeFcmAuthInput({ fcmToken, token, platform } = {}) {
  const clean = String(fcmToken || token || '').trim();
  if (!clean) return null;
  return { token: clean, platform: platform === 'mobile' ? 'mobile' : 'web' };
}

/** Best-effort FCM save during signup/login — must not block auth. */
export async function applyFcmOnAuth(audience, id, input) {
  const normalized = normalizeFcmAuthInput(input);
  if (!normalized) return null;
  try {
    if (audience === 'user') {
      return registerUserFcmTokenService(id, normalized);
    }
    return registerDriverFcmTokenService(id, normalized);
  } catch {
    return null;
  }
}

export function fcmAuthResponse(doc, platform) {
  const plat = platform === 'mobile' ? 'mobile' : platform === 'web' ? 'web' : null;
  let fcmToken = null;
  if (doc) {
    if (plat === 'mobile') fcmToken = doc.fcmTokenMobile || null;
    else if (plat === 'web') fcmToken = doc.fcmTokenWeb || doc.fcmToken || null;
    else fcmToken = doc.fcmTokenWeb || doc.fcmTokenMobile || doc.fcmToken || null;
  }
  return {
    fcmToken: fcmToken || null,
    platform: plat,
    hasWeb: Boolean(doc?.fcmTokenWeb || doc?.fcmToken),
    hasMobile: Boolean(doc?.fcmTokenMobile),
  };
}

export async function resolveAuthFcm(audience, id, doc, input) {
  const normalized = normalizeFcmAuthInput(input);
  let fcmDoc = doc;
  if (normalized) {
    const updated = await applyFcmOnAuth(audience, id, input);
    if (updated) fcmDoc = updated;
  }
  return fcmAuthResponse(fcmDoc, normalized?.platform);
}
