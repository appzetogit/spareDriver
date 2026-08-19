/**
 * Lightweight in-memory rate limiter for hot paths (SOS).
 * Resets per key on window expiry — good enough for single-instance
 * deployments; swap for Redis-backed limiter when horizontally scaled.
 */

const buckets = new Map();

function pruneExpired(now) {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

/**
 * @param {{ windowMs?: number; max?: number; keyPrefix?: string; keyFn?: (req) => string }} opts
 */
export function createRateLimiter({
  windowMs = 60_000,
  max = 5,
  keyPrefix = 'rl',
  keyFn,
} = {}) {
  return (req, res, next) => {
    const now = Date.now();
    if (buckets.size > 10_000) pruneExpired(now);

    const identity =
      keyFn?.(req) ||
      req.user?._id?.toString() ||
      req.driver?._id?.toString() ||
      req.staff?._id?.toString() ||
      req.ip ||
      'anon';

    const key = `${keyPrefix}:${identity}`;
    let entry = buckets.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        status: 429,
        message: 'Too many requests. Please try again later.',
      });
    }

    return next();
  };
}

export const sosCreateRateLimiter = createRateLimiter({
  keyPrefix: 'sos:create',
  windowMs: 5 * 60_000,
  max: 3,
});

export const sosLocationRateLimiter = createRateLimiter({
  keyPrefix: 'sos:location',
  windowMs: 60_000,
  max: 60,
});

/**
 * Location batch ingest. Generous on purpose — the native uploader batches, so
 * a healthy driver makes ~6 calls/min on trip and ~1/min idle. The ceiling is
 * there to stop a broken client from hammering, not to shape normal traffic.
 * Keyed per driver by the shared `keyFn` fallback (`req.driver._id`), which
 * `protectDriverTracking` sets before this runs.
 */
export const driverLocationRateLimiter = createRateLimiter({
  keyPrefix: 'driver:location',
  windowMs: 60_000,
  max: 40,
});
