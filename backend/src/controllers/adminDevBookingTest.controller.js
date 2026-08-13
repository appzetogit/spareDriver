import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  listDevBookingsService,
  getDevBookingDetailService,
  patchDevBookingService,
  devBookingActionService,
} from '../services/adminDevBookingTest.service.js';

export const listDevBookings = asyncHandler(async (req, res) => {
  const result = await listDevBookingsService(req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Dev bookings fetched'));
});

export const getDevBookingDetail = asyncHandler(async (req, res) => {
  const result = await getDevBookingDetailService(req.params.id);
  return res.status(200).json(new ApiResponse(200, result, 'Dev booking detail fetched'));
});

export const patchDevBooking = asyncHandler(async (req, res) => {
  const result = await patchDevBookingService(req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, result, 'Booking patched'));
});

export const runDevBookingAction = asyncHandler(async (req, res) => {
  const { action, ...payload } = req.body || {};
  const result = await devBookingActionService(req.params.id, action, payload);
  return res.status(200).json(new ApiResponse(200, result, `Action "${action}" completed`));
});
