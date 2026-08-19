/**
 * Contract for the native background location uploader.
 *
 * These values are returned to the Flutter driver app when it requests a
 * tracking token, so cadence lives in one place instead of being hardcoded
 * on both sides. Changing a number here changes driver behaviour on the next
 * token refresh — no app release required.
 */

export const TRACKING_TOKEN = Object.freeze({
  /** Raw entropy per token. 32 bytes → 43 chars base64url. */
  BYTES: 32,
  /** Prefix so the auth middleware can tell a tracking token from a JWT. */
  PREFIX: 'sdtrk_',
  /** Absolute lifetime. The token is also revoked on logout / go-offline. */
  TTL_DAYS: 30,
  /**
   * Re-issue when the client sees fewer than this many days left. Returned
   * to the client so it knows when to call the token endpoint again.
   */
  REFRESH_BEFORE_DAYS: 7,
});

export const LOCATION_BATCH = Object.freeze({
  /**
   * Max fixes per request. Kept low because `express.json` is capped at 16kb
   * app-wide — 100 fixes is roughly 11kb, which leaves comfortable headroom.
   * At the on-trip cadence this is ~8 minutes of buffered history per call.
   */
  MAX_FIXES: 100,
  /** Older than this is history, not live. Dropped silently. */
  MAX_AGE_MS: 2 * 60 * 60 * 1000,
  /** Tolerated clock skew for `capturedAt` in the future. */
  MAX_FUTURE_SKEW_MS: 60_000,
});

/**
 * Acquisition + upload cadence, by what the driver is currently doing.
 * `onTrip` is the accurate/expensive mode; `idle` is the all-day mode that
 * keeps the dispatch pool fresh without draining the battery.
 */
export const TRACKING_CADENCE = Object.freeze({
  onTrip: Object.freeze({
    intervalMs: 5_000,
    distanceFilterM: 20,
    uploadEveryMs: 10_000,
    highAccuracy: true,
  }),
  idle: Object.freeze({
    intervalMs: 30_000,
    distanceFilterM: 100,
    uploadEveryMs: 60_000,
    highAccuracy: false,
  }),
});

/**
 * How long a fix stays trustworthy. Consumers (customer map, dispatch match)
 * treat anything older as stale rather than live. Phase 4 wires this into the
 * RTDB payload and the UI; it is defined here now so the client can already
 * reason about its own buffer.
 */
export const LOCATION_STALE_AFTER_MS = 45_000;
