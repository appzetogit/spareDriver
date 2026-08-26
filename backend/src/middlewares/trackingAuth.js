import { Driver } from '../models/driverModels/driver.model.js';
import { verifyAccessToken, inferAccountType } from '../utils/jwt.util.js';
import { ACCOUNT_DRIVER } from '../constants/roles.js';
import { COOKIE_NAMES } from '../utils/cookie.util.js';
import { isTrackingToken, resolveTrackingToken } from '../services/driverTrackingToken.service.js';

/**
 * Auth for the location ingest endpoint.
 *
 * Accepts either credential on `Authorization: Bearer`:
 *   - a tracking token (`sdtrk_…`) from the native background uploader
 *   - a normal driver access token, so the web app can use the same endpoint
 *     as an HTTP fallback when the socket is down
 *
 * Sets `req.driverId` (always a string) and a minimal `req.driver` so the
 * shared rate limiter can key on the driver.
 */

function readBearer(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[COOKIE_NAMES.accessToken] || null;
}

function authKind(req) {
  const token = readBearer(req);
  if (!token) return 'none';
  if (isTrackingToken(token)) return 'sdtrk';
  return 'jwt';
}

function fixCount(body) {
  if (Array.isArray(body?.fixes)) return body.fixes.length;
  if (body && body.lat != null && body.lng != null) return 1;
  return 0;
}

/** Log every native location POST the moment it hits Express — even 401s. */
export function logFlutterLocationHit(req, _res, next) {
  console.log(
    `[flutter] location HIT path=${req.originalUrl}` +
      ` auth=${authKind(req)}` +
      ` fixes=${fixCount(req.body)}` +
      ` ip=${req.ip || '-'}`,
  );
  next();
}

/** Log tracking-token mint attempts before JWT auth. */
export function logFlutterTokenHit(req, _res, next) {
  console.log(
    `[flutter] tracking-token HIT path=${req.originalUrl}` +
      ` auth=${authKind(req)}` +
      ` device=${req.body?.deviceId || '-'}` +
      ` platform=${req.body?.platform || '-'}`,
  );
  next();
}

function deny(req, res, status, message) {
  console.log(
    `[flutter] location AUTH-FAIL path=${req.originalUrl}` +
      ` auth=${authKind(req)}` +
      ` status=${status}` +
      ` reason=${message}`,
  );
  return res.status(status).json({ status, message });
}

export const protectDriverTracking = async (req, res, next) => {
  const token = readBearer(req);
  if (!token) return deny(req, res, 401, 'Not authorized, no token');

  try {
    if (isTrackingToken(token)) {
      const resolved = await resolveTrackingToken(token);
      if (!resolved) {
        // 401 tells the uploader to re-issue rather than back off; a revoked
        // or expired token is recoverable, a rejected payload is not.
        return deny(req, res, 401, 'Tracking token is invalid, revoked or expired');
      }

      const driver = await Driver.findById(resolved.driverId).select('_id isDeleted').lean();
      if (!driver || driver.isDeleted) {
        return deny(req, res, 401, 'Driver account not found or deactivated');
      }

      req.driverId = resolved.driverId;
      req.deviceId = resolved.deviceId;
      req.driver = { _id: driver._id };
      req.trackingAuth = 'tracking_token';
      return next();
    }

    const decoded = verifyAccessToken(token);
    if (inferAccountType(decoded) !== ACCOUNT_DRIVER) {
      return deny(req, res, 403, 'Access denied. Not a driver account.');
    }

    const driver = await Driver.findById(decoded.id).select('_id isDeleted').lean();
    if (!driver || driver.isDeleted) {
      return deny(req, res, 401, 'Driver account not found or deactivated');
    }

    req.driverId = String(driver._id);
    req.driver = { _id: driver._id };
    req.trackingAuth = 'access_token';
    return next();
  } catch (error) {
    const status = error.statusCode || 401;
    return deny(req, res, status, error.message || 'Not authorized');
  }
};
