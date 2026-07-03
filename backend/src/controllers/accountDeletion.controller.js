import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ACCOUNT_DELETION_SUBJECT } from '../constants/withdrawal.js';
import {
  getMyAccountDeletionRequestService,
  requestUserAccountDeletionService,
  requestDriverAccountDeletionService,
  listAccountDeletionsAdminService,
  rejectAccountDeletionAdminService,
  completeAccountDeletionAdminService,
  markAccountDeletionInProgressAdminService,
  getAccountDeletionBlockersAdminService,
  settleUserWalletForDeletionAdminService,
} from '../services/accountDeletion.service.js';
import {
  accountDeletionRequestSchema,
  rejectAccountDeletionSchema,
  completeAccountDeletionSchema,
  settleWalletDeletionSchema,
} from '../validations/withdrawal.validation.js';

export const getMyUserAccountDeletionRequest = asyncHandler(async (req, res) => {
  const request = await getMyAccountDeletionRequestService({
    userId: req.user._id,
    subjectType: ACCOUNT_DELETION_SUBJECT.USER,
  });
  return res.status(200).json(new ApiResponse(200, { request }, 'Account deletion request fetched'));
});

export const requestUserAccountDeletion = asyncHandler(async (req, res) => {
  const body = accountDeletionRequestSchema.parse(req.body);
  const request = await requestUserAccountDeletionService(req.user._id, body);
  return res
    .status(201)
    .json(new ApiResponse(201, { request }, 'Account deletion request submitted'));
});

export const getMyDriverAccountDeletionRequest = asyncHandler(async (req, res) => {
  const request = await getMyAccountDeletionRequestService({
    driverId: req.driver._id,
    subjectType: ACCOUNT_DELETION_SUBJECT.DRIVER,
  });
  return res.status(200).json(new ApiResponse(200, { request }, 'Account deletion request fetched'));
});

export const requestDriverAccountDeletion = asyncHandler(async (req, res) => {
  const body = accountDeletionRequestSchema.parse(req.body);
  const result = await requestDriverAccountDeletionService(req.driver._id, {
    reason: body.reason,
    withdrawAmount: body.withdrawAmount,
    qrFile: req.file,
  });
  return res
    .status(201)
    .json(new ApiResponse(201, result, 'Account deletion request submitted'));
});

export const listAccountDeletionsAdmin = asyncHandler(async (req, res) => {
  const result = await listAccountDeletionsAdminService({
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
    subjectType: req.query.subjectType,
    search: req.query.search,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Account deletion requests fetched'));
});

export const rejectAccountDeletionAdmin = asyncHandler(async (req, res) => {
  const body = rejectAccountDeletionSchema.parse(req.body);
  const request = await rejectAccountDeletionAdminService(req.params.id, body, req.staff);
  return res
    .status(200)
    .json(new ApiResponse(200, { request }, 'Account deletion request rejected'));
});

export const completeAccountDeletionAdmin = asyncHandler(async (req, res) => {
  const body = completeAccountDeletionSchema.parse(req.body || {});
  const request = await completeAccountDeletionAdminService(req.params.id, body, req.staff);
  return res
    .status(200)
    .json(new ApiResponse(200, { request }, 'Account deleted successfully'));
});

export const markAccountDeletionInProgressAdmin = asyncHandler(async (req, res) => {
  const request = await markAccountDeletionInProgressAdminService(req.params.id, req.staff);
  return res
    .status(200)
    .json(new ApiResponse(200, { request }, 'Account deletion marked in progress'));
});

export const getAccountDeletionBlockersAdmin = asyncHandler(async (req, res) => {
  const result = await getAccountDeletionBlockersAdminService(req.params.id);
  return res.status(200).json(new ApiResponse(200, result, 'Deletion blockers fetched'));
});

export const settleUserWalletForDeletionAdmin = asyncHandler(async (req, res) => {
  const body = settleWalletDeletionSchema.parse(req.body || {});
  const result = await settleUserWalletForDeletionAdminService(req.params.id, body, req.staff);
  return res.status(200).json(new ApiResponse(200, result, 'User wallet settled'));
});
