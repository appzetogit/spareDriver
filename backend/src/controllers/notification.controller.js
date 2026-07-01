import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { NOTIFICATION_AUDIENCE } from '../constants/notificationTypes.js';
import {
  listNotificationsService,
  listUnreadNotificationsService,
  markNotificationReadService,
  markAllNotificationsReadService,
  listAdminNotificationsService,
} from '../services/notification.service.js';

export const getUserNotifications = asyncHandler(async (req, res) => {
  const data = await listNotificationsService({
    audience: NOTIFICATION_AUDIENCE.USER,
    userId: req.user._id,
    page: req.query.page,
    limit: req.query.limit,
  });
  return res.status(200).json(new ApiResponse(200, data, 'Notifications fetched'));
});

export const getUserUnreadNotifications = asyncHandler(async (req, res) => {
  const data = await listUnreadNotificationsService({
    audience: NOTIFICATION_AUDIENCE.USER,
    userId: req.user._id,
  });
  return res.status(200).json(new ApiResponse(200, data, 'Unread notifications fetched'));
});

export const markUserNotificationRead = asyncHandler(async (req, res) => {
  const data = await markNotificationReadService(req.params.id, {
    audience: NOTIFICATION_AUDIENCE.USER,
    userId: req.user._id,
  });
  return res.status(200).json(new ApiResponse(200, data, 'Notification marked as read'));
});

export const markAllUserNotificationsRead = asyncHandler(async (req, res) => {
  const data = await markAllNotificationsReadService({
    audience: NOTIFICATION_AUDIENCE.USER,
    userId: req.user._id,
  });
  return res.status(200).json(new ApiResponse(200, data, 'All notifications marked as read'));
});

export const getDriverNotifications = asyncHandler(async (req, res) => {
  const data = await listNotificationsService({
    audience: NOTIFICATION_AUDIENCE.DRIVER,
    driverId: req.driver._id,
    page: req.query.page,
    limit: req.query.limit,
  });
  return res.status(200).json(new ApiResponse(200, data, 'Notifications fetched'));
});

export const getDriverUnreadNotifications = asyncHandler(async (req, res) => {
  const data = await listUnreadNotificationsService({
    audience: NOTIFICATION_AUDIENCE.DRIVER,
    driverId: req.driver._id,
  });
  return res.status(200).json(new ApiResponse(200, data, 'Unread notifications fetched'));
});

export const markDriverNotificationRead = asyncHandler(async (req, res) => {
  const data = await markNotificationReadService(req.params.id, {
    audience: NOTIFICATION_AUDIENCE.DRIVER,
    driverId: req.driver._id,
  });
  return res.status(200).json(new ApiResponse(200, data, 'Notification marked as read'));
});

export const markAllDriverNotificationsRead = asyncHandler(async (req, res) => {
  const data = await markAllNotificationsReadService({
    audience: NOTIFICATION_AUDIENCE.DRIVER,
    driverId: req.driver._id,
  });
  return res.status(200).json(new ApiResponse(200, data, 'All notifications marked as read'));
});

export const getAdminNotifications = asyncHandler(async (req, res) => {
  const data = await listAdminNotificationsService({
    page: req.query.page,
    limit: req.query.limit,
  });
  return res.status(200).json(new ApiResponse(200, data, 'Admin notifications fetched'));
});

export const markAdminNotificationRead = asyncHandler(async (req, res) => {
  const data = await markNotificationReadService(req.params.id, {
    audience: NOTIFICATION_AUDIENCE.ADMIN,
  });
  return res.status(200).json(new ApiResponse(200, data, 'Notification marked as read'));
});

export const markAllAdminNotificationsRead = asyncHandler(async (req, res) => {
  const data = await markAllNotificationsReadService({
    audience: NOTIFICATION_AUDIENCE.ADMIN,
  });
  return res.status(200).json(new ApiResponse(200, data, 'All notifications marked as read'));
});
