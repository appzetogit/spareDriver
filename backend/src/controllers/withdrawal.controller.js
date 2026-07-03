import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  getDriverWithdrawalLimitsService,
  createDriverWithdrawalService,
  listDriverWithdrawalsService,
  listWithdrawalsAdminService,
  rejectWithdrawalAdminService,
  processWithdrawalAdminService,
} from '../services/withdrawal.service.js';
import {
  createWithdrawalSchema,
  rejectWithdrawalSchema,
  processWithdrawalSchema,
} from '../validations/withdrawal.validation.js';

export const getDriverWithdrawalLimits = asyncHandler(async (req, res) => {
  const limits = await getDriverWithdrawalLimitsService(req.driver._id);
  return res.status(200).json(new ApiResponse(200, limits, 'Withdrawal limits fetched'));
});

export const createDriverWithdrawal = asyncHandler(async (req, res) => {
  const body = createWithdrawalSchema.parse(req.body);
  const withdrawal = await createDriverWithdrawalService(req.driver._id, {
    amount: body.amount,
    qrFile: req.file,
    isFullSettlement: body.isFullSettlement,
  });
  return res
    .status(201)
    .json(new ApiResponse(201, { withdrawal }, 'Withdrawal request submitted'));
});

export const listDriverWithdrawals = asyncHandler(async (req, res) => {
  const result = await listDriverWithdrawalsService(req.driver._id, {
    page: req.query.page,
    limit: req.query.limit,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Withdrawals fetched'));
});

export const listWithdrawalsAdmin = asyncHandler(async (req, res) => {
  const result = await listWithdrawalsAdminService({
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
    search: req.query.search,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Withdrawals fetched'));
});

export const rejectWithdrawalAdmin = asyncHandler(async (req, res) => {
  const body = rejectWithdrawalSchema.parse(req.body || {});
  const withdrawal = await rejectWithdrawalAdminService(req.params.id, body, req.staff);
  return res
    .status(200)
    .json(new ApiResponse(200, { withdrawal }, 'Withdrawal rejected'));
});

export const processWithdrawalAdmin = asyncHandler(async (req, res) => {
  const body = processWithdrawalSchema.parse(req.body || {});
  const result = await processWithdrawalAdminService(
    req.params.id,
    {
      proofFile: req.file,
      transactionDetails: {
        mode: body.mode,
        transactionId: body.transactionId,
        utr: body.utr,
        referenceNumber: body.referenceNumber,
        paidAt: body.paidAt || undefined,
        notes: body.notes,
      },
      adminNotes: body.adminNotes,
    },
    req.staff,
  );
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Withdrawal processed and wallet debited'));
});
