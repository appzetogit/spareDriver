import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  listRefundsService,
  updateRefundStatusService,
  getRefundSubjectWalletService,
  createAdminManualRefundService,
} from '../services/refund.service.js';
import { createAdminManualRefundSchema } from '../validations/refund.validation.js';

/**
 * Admin-only refund endpoints. The "Account → Refunds" admin page reads
 * these — the refund records themselves are written by the booking
 * cancellation services.
 *
 * Refunds are processed MANUALLY on the Razorpay dashboard. Once the
 * admin confirms the refund, they PATCH the record to `processed` with
 * the gateway refund id; if Razorpay rejects the refund they PATCH to
 * `failed` with a note.
 */

export const listRefunds = asyncHandler(async (req, res) => {
  const result = await listRefundsService({
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
    search: req.query.search,
    from: req.query.from,
    to: req.query.to,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Refunds fetched'));
});

/**
 * PATCH /admin/refunds/:id
 * body: { status: 'processed' | 'failed', razorpayRefundId?, error? }
 */
export const updateRefundStatus = asyncHandler(async (req, res) => {
  const refund = await updateRefundStatusService(
    req.params.id,
    req.body || {},
    req.staff,
  );
  return res
    .status(200)
    .json(new ApiResponse(200, { refund }, 'Refund status updated'));
});

/** GET /admin/refunds/subject-wallet/:subjectType/:subjectId */
export const getRefundSubjectWallet = asyncHandler(async (req, res) => {
  const result = await getRefundSubjectWalletService(
    req.params.subjectType,
    req.params.subjectId,
  );
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Subject wallet fetched'));
});

/** POST /admin/refunds/manual */
export const createAdminManualRefund = asyncHandler(async (req, res) => {
  const body = createAdminManualRefundSchema.parse(req.body);
  const result = await createAdminManualRefundService(body, req.staff);
  return res
    .status(201)
    .json(new ApiResponse(201, result, 'Refund created'));
});
