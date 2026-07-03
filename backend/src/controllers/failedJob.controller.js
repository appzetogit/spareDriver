import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  listFailedJobsService,
  retryFailedJobService,
  resolveFailedJobService,
} from '../services/failedJob.service.js';

export const listFailedJobs = asyncHandler(async (req, res) => {
  const data = await listFailedJobsService({
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
  });
  return res.status(200).json(new ApiResponse(200, data, 'Failed jobs fetched'));
});

export const retryFailedJob = asyncHandler(async (req, res) => {
  const data = await retryFailedJobService(req.params.id, req.admin);
  return res.status(200).json(new ApiResponse(200, data, 'Failed job retried'));
});

export const resolveFailedJob = asyncHandler(async (req, res) => {
  const data = await resolveFailedJobService(req.params.id, req.body, req.admin);
  return res.status(200).json(new ApiResponse(200, data, 'Failed job resolved'));
});
