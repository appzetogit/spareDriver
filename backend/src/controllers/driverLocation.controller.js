import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { driverLocationUpdateSchema } from '../validations/driver.validation.js';
import { recordDriverLocationHttp } from '../services/driverLocation.service.js';

/**
 * Native (Flutter) background GPS ingest. Foreground location still goes
 * over Socket.IO; this exists because the WebView is frozen when backgrounded.
 */
export const postDriverLocation = asyncHandler(async (req, res) => {
  const coords = driverLocationUpdateSchema.parse(req.body || {});
  const result = await recordDriverLocationHttp(req.driver, coords);
  return res.status(200).json(new ApiResponse(200, result, result.accepted ? 'Location recorded' : result.reason));
});
