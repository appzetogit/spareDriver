import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { listPlatformRevenueService } from '../services/platformRevenue.service.js';
import { listKitRevenueService } from '../services/kitRevenue.service.js';

/**
 * Admin-only platform revenue endpoints.
 *
 * The admin "Account → Revenue" page reads these. Revenue rows
 * themselves are written by the services that produce the income
 * (booking trip completion → commission, booking cancellation →
 * company share of the fee).
 */

export const listPlatformRevenue = asyncHandler(async (req, res) => {
  const result = await listPlatformRevenueService({
    page: req.query.page,
    limit: req.query.limit,
    source: req.query.source,
    search: req.query.search,
    serviceType: req.query.serviceType,
    from: req.query.from,
    to: req.query.to,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Platform revenue fetched'));
});

/** Admin Account → Kit Revenue — paid driver kit purchases. */
export const listKitRevenue = asyncHandler(async (req, res) => {
  const result = await listKitRevenueService({
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search,
    adminStatus: req.query.adminStatus,
    fulfillmentStatus: req.query.fulfillmentStatus,
    paymentStatus: req.query.paymentStatus,
    from: req.query.from,
    to: req.query.to,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Kit revenue fetched'));
});
