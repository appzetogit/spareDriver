import mongoose from 'mongoose';

/**
 * Device-scoped credential for the native background location uploader.
 *
 * Why not reuse the access token: it expires in 15 minutes and the Flutter
 * wrapper only ever scrapes it once, at login. A foreground service that runs
 * for an eight-hour shift needs something long-lived — and because it is
 * long-lived it must also be individually revocable, which a bare JWT is not.
 *
 * Only the SHA-256 of the token is stored. A leaked database dump does not
 * yield usable tokens.
 *
 * One row per (driver, device): re-issuing for the same device rotates the
 * secret rather than accumulating credentials the driver can never revoke.
 */
const driverTrackingTokenSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    /** SHA-256 hex of the raw token. The raw value is returned exactly once. */
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /** Stable per-install id from the client. Scopes revocation to one phone. */
    deviceId: {
      type: String,
      required: true,
      trim: true,
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
      default: 'android',
    },
    appVersion: {
      type: String,
      default: '',
      trim: true,
    },
    /** Touched on ingest, throttled — see driverTrackingToken.service.js. */
    lastUsedAt: {
      type: Date,
      default: null,
    },
    /** Set on logout / go-offline / admin action. Nulled again on re-issue. */
    revokedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0, // MongoDB TTL — the row disappears once it expires
    },
  },
  { timestamps: true },
);

// Rotation target: upsert on this pair so a device holds at most one token.
driverTrackingTokenSchema.index({ driverId: 1, deviceId: 1 }, { unique: true });

export const DriverTrackingToken =
  mongoose.models.DriverTrackingToken ||
  mongoose.model('DriverTrackingToken', driverTrackingTokenSchema);

export default DriverTrackingToken;
