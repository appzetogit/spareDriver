import { createHash, randomBytes } from 'node:crypto';
import { DriverTrackingToken } from '../models/driverModels/driverTrackingToken.model.js';
import { TRACKING_TOKEN, TRACKING_CADENCE, LOCATION_BATCH, LOCATION_STALE_AFTER_MS } from '../constants/driverTracking.js';

/**
 * Issue / verify / revoke the long-lived credential the native uploader uses.
 *
 * The raw token leaves this module exactly once, in the return value of
 * `issueTrackingToken`. Everything after that works on the hash.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Only touch `lastUsedAt` this often — ingest runs every few seconds. */
const LAST_USED_THROTTLE_MS = 5 * 60_000;

function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

function mintRaw() {
  return `${TRACKING_TOKEN.PREFIX}${randomBytes(TRACKING_TOKEN.BYTES).toString('base64url')}`;
}

/** True when a bearer value looks like one of ours (vs. a driver JWT). */
export function isTrackingToken(value) {
  return typeof value === 'string' && value.startsWith(TRACKING_TOKEN.PREFIX);
}

/**
 * Mint a token for one driver + device, replacing any existing one for that
 * device. Safe to call on every go-online — the client should only call it
 * when it has none or the one it holds is inside the refresh window.
 *
 * @returns {Promise<{ token:string; expiresAt:Date; refreshAfter:Date }>}
 */
export async function issueTrackingToken({ driverId, deviceId, platform, appVersion }) {
  const raw = mintRaw();
  const now = Date.now();
  const expiresAt = new Date(now + TRACKING_TOKEN.TTL_DAYS * DAY_MS);

  await DriverTrackingToken.findOneAndUpdate(
    { driverId, deviceId },
    {
      $set: {
        tokenHash: hashToken(raw),
        platform: platform || 'android',
        appVersion: appVersion || '',
        expiresAt,
        revokedAt: null,
        lastUsedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return {
    token: raw,
    expiresAt,
    refreshAfter: new Date(expiresAt.getTime() - TRACKING_TOKEN.REFRESH_BEFORE_DAYS * DAY_MS),
  };
}

/**
 * Resolve a raw token to a driverId, or null when it is unknown, revoked or
 * expired. The TTL index removes expired rows eventually; the explicit
 * `expiresAt` check closes the window before the sweeper runs.
 *
 * @returns {Promise<{ driverId: string; deviceId: string } | null>}
 */
export async function resolveTrackingToken(raw) {
  if (!isTrackingToken(raw)) return null;

  const row = await DriverTrackingToken.findOne({ tokenHash: hashToken(raw) })
    .select('driverId deviceId revokedAt expiresAt lastUsedAt')
    .lean();

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  const lastUsed = row.lastUsedAt ? row.lastUsedAt.getTime() : 0;
  if (Date.now() - lastUsed > LAST_USED_THROTTLE_MS) {
    DriverTrackingToken.updateOne({ _id: row._id }, { $set: { lastUsedAt: new Date() } }).catch(
      (err) => console.warn('[trackingToken] lastUsedAt touch failed:', err.message),
    );
  }

  return { driverId: String(row.driverId), deviceId: row.deviceId };
}

/**
 * Revoke one device's token, or every token the driver holds when `deviceId`
 * is omitted (logout-everywhere, admin suspension).
 */
export async function revokeTrackingTokens({ driverId, deviceId = null }) {
  const filter = { driverId, revokedAt: null };
  if (deviceId) filter.deviceId = deviceId;

  const res = await DriverTrackingToken.updateMany(filter, {
    $set: { revokedAt: new Date() },
  });
  return { revoked: res.modifiedCount || 0 };
}

/**
 * Everything the native uploader needs to configure itself, handed over with
 * the token so cadence stays server-controlled.
 */
export function trackingClientConfig() {
  return {
    uploadPath: '/api/v1/driver/location',
    maxFixesPerBatch: LOCATION_BATCH.MAX_FIXES,
    maxFixAgeMs: LOCATION_BATCH.MAX_AGE_MS,
    staleAfterMs: LOCATION_STALE_AFTER_MS,
    cadence: TRACKING_CADENCE,
  };
}
