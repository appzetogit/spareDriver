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

/**
 * Quality gates every fix must clear, whichever producer sent it.
 *
 * These live server-side on purpose: they are returned with the tracking token,
 * so tightening or loosening them changes driver behaviour on the next refresh
 * instead of waiting on an app release.
 */
export const LOCATION_ACCURACY = Object.freeze({
  /**
   * Radius (metres) a fix must beat while a customer is watching the driver
   * move. On-trip acquisition runs `LocationAccuracy.high`, which returns
   * 5–20 m in the open and 20–60 m between tall buildings, so this rejects
   * almost nothing real — while excluding the tower fixes that put a driver a
   * kilometre from a customer they are standing next to.
   *
   * This is the number nothing was ever checking.
   */
  ON_TRIP_M: 100,

  /**
   * The same gate for an idle driver, where the position only has to keep them
   * in the dispatch pool.
   *
   * Deliberately looser, because idle acquisition is `LocationAccuracy.medium`
   * — that is the whole point of idle mode, and running high-accuracy GPS all
   * shift is what kills a driver's battery. Matching happens over a 2 km-plus
   * radius, so a 250 m error changes nothing about who gets offered the ride;
   * holding idle to the on-trip standard would drop honest drivers out of the
   * pool to buy precision nobody reads.
   */
  IDLE_M: 250,
});

/**
 * The loosest gate any fix may pass — worse than this is useless for every
 * purpose, so it never enters the pipeline at all. The stricter on-trip gate
 * is applied later, once we know whether a customer is actually watching.
 */
export const MAX_ACCEPTED_ACCURACY_M = LOCATION_ACCURACY.IDLE_M;

/**
 * Ground speed (m/s) past which two consecutive fixes describe a teleport
 * rather than a drive — ~200 km/h, comfortably above anything a car on an
 * Indian road does, and far below the thousands of km/h implied when a tower
 * fix lands in the next district.
 *
 * Checked against elapsed time, so a genuinely long gap between fixes stays
 * plausible: an hour of driving covers a lot of ground at a perfectly ordinary
 * speed.
 */
export const MAX_PLAUSIBLE_SPEED_MPS = 55;

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

/**
 * How long a native fix suppresses the WebView's socket stream.
 *
 * Both producers report the same driver, and for a while both were written
 * unconditionally — so whichever arrived last won, regardless of quality. The
 * browser's `watchPosition` is the weaker of the two by construction: it dies
 * when the WebView is frozen, and its first fix is deliberately a low-accuracy
 * network lookup so the map is not blank. Letting it overwrite a real GPS fix
 * is never the right outcome.
 *
 * So native wins while it is demonstrably alive, and the socket is only
 * believed once native has gone quiet for longer than its slowest cadence.
 * Idle uploads every 60s, on-trip every 10s, so this clears both with room for
 * one missed request — and stays well inside the 3-minute dispatch freshness
 * window, so a handover never drops the driver out of the matching pool.
 */
export const NATIVE_PRIORITY_WINDOW_MS = 90_000;
