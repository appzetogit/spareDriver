import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import * as couponService from '../services/coupon.service.js';

export const adminListCoupons = asyncHandler(async (_req, res) => {
  const list = await couponService.listCouponsService({ onlyActive: false });
  return res.status(200).json(new ApiResponse(200, list, 'Coupons fetched'));
});

export const adminCreateCoupon = asyncHandler(async (req, res) => {
  const staffId = req.staff?._id || null;
  const coupon = await couponService.createCouponService(req.body, staffId);
  return res.status(201).json(new ApiResponse(201, coupon, 'Coupon created'));
});

export const adminUpdateCoupon = asyncHandler(async (req, res) => {
  const coupon = await couponService.updateCouponService(req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, coupon, 'Coupon updated'));
});

export const adminDeleteCoupon = asyncHandler(async (req, res) => {
  await couponService.deleteCouponService(req.params.id);
  return res.status(200).json(new ApiResponse(200, null, 'Coupon deleted'));
});

export const validateCoupon = asyncHandler(async (req, res) => {
  const { code, serviceType, subtotal } = req.body || {};
  const result = await couponService.validateCouponService({ code, serviceType, subtotal });
  return res.status(200).json(new ApiResponse(200, result, 'Coupon is valid'));
});
