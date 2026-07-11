import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { getAdminReportsOverviewService } from '../services/adminReportsOverview.service.js';
import { getAdminUserReportsService } from '../services/adminUserReports.service.js';
import { getAdminDriverReportsService } from '../services/adminDriverReports.service.js';
import { getAdminBookingReportsService } from '../services/adminBookingReports.service.js';
import {
  getAdminRevenueReportsService,
  exportAdminRevenueReportsCsv,
} from '../services/adminRevenueReports.service.js';
import {
  getAdminGstReportService,
  exportAdminGstReportCsv,
} from '../services/adminGstReport.service.js';

export const getAdminReportsOverview = asyncHandler(async (req, res) => {
  const result = await getAdminReportsOverviewService(req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Reports overview fetched'));
});

export const getAdminUserReports = asyncHandler(async (req, res) => {
  const result = await getAdminUserReportsService(req.query);
  return res.status(200).json(new ApiResponse(200, result, 'User reports fetched'));
});

export const getAdminDriverReports = asyncHandler(async (req, res) => {
  const result = await getAdminDriverReportsService(req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Driver reports fetched'));
});

export const getAdminBookingReports = asyncHandler(async (req, res) => {
  const result = await getAdminBookingReportsService(req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Booking reports fetched'));
});

export const getAdminRevenueReports = asyncHandler(async (req, res) => {
  const result = await getAdminRevenueReportsService(req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Revenue reports fetched'));
});

export const exportAdminRevenueReports = asyncHandler(async (req, res) => {
  const csv = await exportAdminRevenueReportsCsv(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="platform-revenue-report-${Date.now()}.csv"`,
  );
  return res.status(200).send(csv);
});

export const getAdminGstReport = asyncHandler(async (req, res) => {
  const result = await getAdminGstReportService(req.query);
  return res.status(200).json(new ApiResponse(200, result, 'GST report fetched'));
});

export const exportAdminGstReport = asyncHandler(async (req, res) => {
  const csv = await exportAdminGstReportCsv(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="gst-report-${Date.now()}.csv"`,
  );
  return res.status(200).send(csv);
});
