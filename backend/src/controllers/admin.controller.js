import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { setAuthCookies } from '../utils/cookie.util.js';
import * as adminService from '../services/admin.service.js';
import { getAdminDashboardService, getAdminSidebarCountsService } from '../services/adminDashboard.service.js';
import {
  listAdminUserTripsService,
  listAdminUserSubscriptionsService,
} from '../services/adminUserActivity.service.js';
import { getStaffMemberAnalyticsService } from '../services/staffAnalytics.service.js';

export const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password, fcmToken, token, platform } = req.body;
  const result = await adminService.loginStaffService(email, password, {
    fcmToken,
    token,
    platform,
  });

  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        admin: result.admin,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        fcm: result.fcm,
      },
      'Staff login successful',
    ),
  );
});

export const getStaffMe = asyncHandler(async (req, res) => {
  const admin = await adminService.getStaffProfileService(req.staff._id);
  return res.status(200).json(new ApiResponse(200, { admin }, 'Profile fetched successfully'));
});

export const getAdminDashboard = asyncHandler(async (_req, res) => {
  const result = await getAdminDashboardService();
  return res.status(200).json(new ApiResponse(200, result, 'Dashboard fetched'));
});

export const getAdminSidebarCounts = asyncHandler(async (req, res) => {
  const result = await getAdminSidebarCountsService({ staff: req.staff });
  return res.status(200).json(new ApiResponse(200, result, 'Sidebar counts fetched'));
});

export const getCustomers = asyncHandler(async (req, res) => {
  const result = await adminService.getCustomersService(req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Users fetched successfully'));
});

export const getAdminUserTrips = asyncHandler(async (req, res) => {
  const result = await listAdminUserTripsService(req.params.userId, req.query);
  return res.status(200).json(new ApiResponse(200, result, 'User trips fetched'));
});

export const getAdminUserSubscriptions = asyncHandler(async (req, res) => {
  const result = await listAdminUserSubscriptionsService(req.params.userId, req.query);
  return res.status(200).json(new ApiResponse(200, result, 'User subscriptions fetched'));
});

export const getDrivers = asyncHandler(async (req, res) => {
  const result = await adminService.getDriversService(req.staff, req.query);
  return res.status(200).json(new ApiResponse(200, result, "Drivers fetched successfully"));
});

export const getDriverById = asyncHandler(async (req, res) => {
  const result = await adminService.getDriverByIdService(req.staff, req.params.id);
  return res.status(200).json(new ApiResponse(200, result, 'Driver profile fetched successfully'));
});

export const updateDriverStatus = asyncHandler(async (req, res) => {
  const result = await adminService.updateDriverStatusService(req.staff, req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, result, `Driver status updated successfully`));
});

export const updateDriverStepReview = asyncHandler(async (req, res) => {
  const result = await adminService.updateDriverStepReviewService(req.staff, req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, result, 'Step review updated successfully'));
});

export const suspendDriver = asyncHandler(async (req, res) => {
  const result = await adminService.suspendDriverService(req.staff, req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, result, 'Driver suspended successfully'));
});

export const unsuspendDriver = asyncHandler(async (req, res) => {
  const result = await adminService.unsuspendDriverService(req.staff, req.params.id);
  return res.status(200).json(new ApiResponse(200, result, 'Driver unsuspended successfully'));
});

export const addAdminMember = asyncHandler(async (req, res) => {
  const result = await adminService.addAdminMemberService(req.body);
  return res.status(201).json(new ApiResponse(201, result, "Admin team member added successfully"));
});

export const getAdminTeam = asyncHandler(async (req, res) => {
  const result = await adminService.getAdminTeamService(req.query);
  return res.status(200).json(new ApiResponse(200, result, "Admin team fetched successfully"));
});

export const updateAdminMember = asyncHandler(async (req, res) => {
  const result = await adminService.updateAdminMemberService(req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, result, "Admin team member updated successfully"));
});

export const deleteAdminMember = asyncHandler(async (req, res) => {
  const result = await adminService.deleteAdminMemberService(req.params.id);
  return res.status(200).json(new ApiResponse(200, result, "Admin team member removed successfully"));
});

export const getAdminTeamMemberAnalytics = asyncHandler(async (req, res) => {
  const result = await getStaffMemberAnalyticsService(req.params.id, req.query);
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Team member analytics fetched successfully'));
});

export const adminGlobalSearch = asyncHandler(async (req, res) => {
  const result = await adminService.adminGlobalSearchService(req.staff, req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Search results fetched'));
});
