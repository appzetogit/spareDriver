import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  listOnlineTransactionsService,
  getOnlineTransactionService,
} from '../services/onlineTransaction.service.js';

/** GET /admin/online-transactions */
export const listOnlineTransactions = asyncHandler(async (req, res) => {
  const result = await listOnlineTransactionsService({
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
    purpose: req.query.purpose,
    subjectType: req.query.subjectType,
    search: req.query.search,
    from: req.query.from,
    to: req.query.to,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Online transactions fetched'));
});

/** GET /admin/online-transactions/:id */
export const getOnlineTransaction = asyncHandler(async (req, res) => {
  const transaction = await getOnlineTransactionService(req.params.id);
  return res
    .status(200)
    .json(new ApiResponse(200, { transaction }, 'Online transaction fetched'));
});
