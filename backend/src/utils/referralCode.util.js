import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';

/** Uppercase alphanumeric without O/0, I/1, S/5. */
const CODE_CHARSET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
const USER_CODE_LENGTH = 6;
const DRIVER_PREFIX = 'DR';
const DRIVER_SUFFIX_LENGTH = 4;

function randomFromCharset(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  }
  return out;
}

export function normalizeReferralCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function isDriverReferralCode(code) {
  return normalizeReferralCode(code).startsWith(DRIVER_PREFIX);
}

export function isUserReferralCode(code) {
  const normalized = normalizeReferralCode(code);
  return normalized.length === USER_CODE_LENGTH && !normalized.startsWith(DRIVER_PREFIX);
}

async function codeExists(code) {
  const normalized = normalizeReferralCode(code);
  const [userHit, driverHit] = await Promise.all([
    User.exists({ referralCode: normalized, isDeleted: false }),
    Driver.exists({ referralCode: normalized, isDeleted: false }),
  ]);
  return Boolean(userHit || driverHit);
}

export async function generateUniqueUserReferralCode(maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const code = randomFromCharset(USER_CODE_LENGTH);
    if (!(await codeExists(code))) return code;
  }
  throw new Error('Failed to generate unique user referral code');
}

export async function generateUniqueDriverReferralCode(maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const code = `${DRIVER_PREFIX}${randomFromCharset(DRIVER_SUFFIX_LENGTH)}`;
    if (!(await codeExists(code))) return code;
  }
  throw new Error('Failed to generate unique driver referral code');
}
