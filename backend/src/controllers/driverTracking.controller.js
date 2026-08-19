import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import {
  issueTrackingTokenSchema,
  revokeTrackingTokenSchema,
  locationBatchSchema,
} from '../validations/driverTracking.validation.js';
import {
  issueTrackingToken,
  revokeTrackingTokens,
  trackingClientConfig,
} from '../services/driverTrackingToken.service.js';
import { ingestDriverLocationBatch } from '../services/driverLocationIngest.service.js';
import { isLiveLocationReady } from '../services/driverLocation.service.js';

/**
 * POST /driver/tracking/token
 *
 * Called by the Flutter wrapper when the driver goes online and it holds no
 * usable tracking token. Returns the credential plus the cadence the native
 * service should run at, so timing stays server-controlled.
 *
 * The raw token is shown exactly once — only its hash is stored.
 */
export const issueDriverTrackingToken = asyncHandler(async (req, res) => {
  const body = issueTrackingTokenSchema.parse(req.body);

  const { token, expiresAt, refreshAfter } = await issueTrackingToken({
    driverId: req.driver._id,
    deviceId: body.deviceId,
    platform: body.platform,
    appVersion: body.appVersion,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        token,
        expiresAt,
        refreshAfter,
        config: trackingClientConfig(),
        liveLocationReady: isLiveLocationReady(),
      },
      'Tracking token issued',
    ),
  );
});

/**
 * DELETE /driver/tracking/token
 *
 * Go-offline and logout both land here. `allDevices` is for logout; a plain
 * go-offline should pass only the calling device's id so the driver's other
 * phone keeps working.
 *
 * Reads the query string as well as the body. A DELETE body is legal but some
 * proxies and CDNs drop it, and losing this call silently would leave a
 * 30-day location credential alive on a signed-out phone. `?allDevices=true`
 * always works.
 */
export const revokeDriverTrackingToken = asyncHandler(async (req, res) => {
  const source = {
    ...(req.query?.deviceId ? { deviceId: String(req.query.deviceId) } : {}),
    ...(req.query?.allDevices !== undefined
      ? { allDevices: String(req.query.allDevices) === 'true' }
      : {}),
    ...(req.body ?? {}),
  };
  const body = revokeTrackingTokenSchema.parse(source);

  if (!body.allDevices && !body.deviceId) {
    throw new ApiError(400, 'Provide deviceId, or set allDevices to revoke every device');
  }

  const { revoked } = await revokeTrackingTokens({
    driverId: req.driver._id,
    deviceId: body.allDevices ? null : body.deviceId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { revoked }, revoked ? 'Tracking token revoked' : 'No active token to revoke'));
});

/**
 * POST /driver/location
 *
 * Batch ingest from the native uploader. Idempotent: replaying a batch is
 * counted as `deduped` and changes nothing.
 *
 * The response carries `stopTracking` and `mode` — the uploader reads them on
 * every call, so toggling offline anywhere stands the service down without
 * waiting for a push.
 */
export const ingestDriverLocation = asyncHandler(async (req, res) => {
  const body = locationBatchSchema.parse(req.body);
  const result = await ingestDriverLocationBatch(req.driverId, body.fixes);

  return res.status(200).json(new ApiResponse(200, result, 'Location batch processed'));
});
