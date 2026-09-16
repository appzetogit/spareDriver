import express from 'express';
import {
  loginAdmin,
  getStaffMe,
  getAdminDashboard,
  getAdminSidebarCounts,
  getCustomers,
  getAdminUserTrips,
  getAdminUserSubscriptions,
  getDrivers,
  getDriverById,
  updateDriverStatus,
  updateDriverStepReview,
  suspendDriver,
  unsuspendDriver,
  addAdminMember,
  getAdminTeam,
  updateAdminMember,
  deleteAdminMember,
  getAdminTeamMemberAnalytics,
  adminGlobalSearch,
} from '../controllers/admin.controller.js';
import { protectStaff, protectPanel, protectDeveloper, restrictTo } from '../middlewares/authMiddleware.js';
import { ROUTE_ROLES } from '../constants/staffPermissions.js';
import {
  registerStaffFcmToken,
  unregisterStaffFcmToken,
} from '../controllers/fcmToken.controller.js';
import {
  createCarType,
  updateCarType,
  deleteCarType,
  createCondition,
  updateCondition,
  deleteCondition,
  createTrainingVideo,
  getAdminCarTypes,
  getAdminConditions,
  getAdminTrainingVideos,
  updateTrainingVideo,
  deleteTrainingVideo,
  createBank,
  getAdminBanks,
  updateBank,
  deleteBank,
} from '../controllers/platform.controller.js';
import {
  adminListLegalDocuments,
  adminUpsertSubscriptionTerms,
  adminUpsertSiteLegalDocument,
  adminUpdateLegalDocument,
} from '../controllers/legalDocument.controller.js';
import {
  getAdminFuelTypes,
  createFuelType,
  updateFuelType,
  deleteFuelType,
  getAdminCarBrands,
  createCarBrand,
  updateCarBrand,
  deleteCarBrand,
  getAdminCarModels,
  createCarModel,
  updateCarModel,
  deleteCarModel,
} from '../controllers/vehicleCatalog.controller.js';
import {
  createKit,
  getKits,
  getKitById,
  updateKit,
  deleteKit,
} from '../controllers/kit.controller.js';
import {
  getAdminKitOrders,
  getAdminKitOrderById,
  approveKitOrder,
  rejectKitOrder,
  dispatchKitOrder,
  deliverKitOrder,
} from '../controllers/kitOrder.controller.js';
import {
  getLiveDriversSnapshot,
  getDriverLocationsSnapshot,
} from '../controllers/driverLocation.controller.js';
import { getStaffFirebaseToken } from '../controllers/firebaseAuth.controller.js';
import {
  createZone,
  listZones,
  getZoneById,
  updateZone,
  deleteZone,
} from '../controllers/zone.controller.js';
import {
  adminListServicePricings,
  adminUpsertServicePricing,
  adminUpdateServicePricing,
  adminDeleteServicePricing,
  adminListSubscriptionPlans,
  adminCreateSubscriptionPlan,
  adminUpdateSubscriptionPlan,
  adminDeleteSubscriptionPlan,
  adminListUserSubscriptions,
  adminListSubscriptionAvailableDrivers,
  adminAssignDriverToSubscription,
  adminReleaseSubscriptionDriver,
  adminListSubscriptionRevenue,
  adminGetSubscriptionDriverPayouts,
  adminPaySubscriptionDrivers,
  adminUpdateUserSubscriptionStatus,
  adminRescheduleUserSubscription,
  adminReviewSubscriptionCancellation,
} from '../controllers/pricing.controller.js';
import {
  adminListCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminDeleteCoupon,
  adminCouponAnalytics,
} from '../controllers/coupon.controller.js';
import {
  getTaskAssignees,
  getTaskSummary,
  listTasks,
  listTaskActivity,
  getTaskByResource,
  assignTasks,
  assignTask,
  claimTask,
  syncReviewTasks,
} from '../controllers/adminTask.controller.js';
import {
  listRefunds,
  updateRefundStatus,
  getRefundSubjectWallet,
  createAdminManualRefund,
} from '../controllers/refund.controller.js';
import {
  listOnlineTransactions,
  getOnlineTransaction,
} from '../controllers/onlineTransaction.controller.js';
import {
  listWithdrawalsAdmin,
  rejectWithdrawalAdmin,
  processWithdrawalAdmin,
} from '../controllers/withdrawal.controller.js';
import {
  listAccountDeletionsAdmin,
  rejectAccountDeletionAdmin,
  completeAccountDeletionAdmin,
  markAccountDeletionInProgressAdmin,
  getAccountDeletionBlockersAdmin,
  settleUserWalletForDeletionAdmin,
} from '../controllers/accountDeletion.controller.js';
import {
  getAdminNotifications,
  getAdminUnreadNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  deleteAdminNotification,
  deleteAdminNotifications,
} from '../controllers/notification.controller.js';
import {
  listFailedJobs,
  retryFailedJob,
  resolveFailedJob,
} from '../controllers/failedJob.controller.js';
import {
  listAdminSos,
  getAdminSosDetail,
  assignAdminSos,
} from '../controllers/sos.controller.js';
import {
  adminListSupportTickets,
  adminGetSupportTicket,
  adminUpdateSupportTicket,
  adminAssignSupportTicket,
} from '../controllers/support.controller.js';
import {
  getAdminSupportConfig,
  updateAdminSupportConfig,
  getAdminGstDetails,
  updateAdminGstDetails,
  getAdminSubscriptionDispatch,
  updateAdminSubscriptionDispatch,
  getAdminDriverDocumentRequirements,
  updateAdminDriverDocumentRequirements,
  getAdminPaymentMethods,
  updateAdminPaymentMethods,
} from '../controllers/appSettings.controller.js';
import { listPlatformRevenue, listKitRevenue } from '../controllers/revenue.controller.js';
import {
  getAdminBookings,
  getAdminBookingById,
  adminUpdateBookingStatus,
  getAdminBookingAvailableDrivers,
  assignDriverToAdminBooking,
  getEmergencyPoolBookings,
  getEmergencyPoolCount,
  getEmergencyPoolAvailableDrivers,
  assignDriverToEmergencyPoolBooking,
  getScheduledJobs,
  getScheduledBookingAvailableDrivers,
  assignDriverToScheduledBooking,
  getScheduledQueueJobs,
  getOutstationAssignments,
  getOutstationAssignmentDetail,
  getOutstationAssignmentDrivers,
  assignDriverToOutstation,
  probeOutstationDriverConflict,
  settleOutstationArrived,
} from '../controllers/booking.controller.js';
import {
  getBookingChat,
  listBookingChatMessages,
  sendBookingChatMessage,
  markBookingChatRead,
  getBookingChatUnread,
} from '../controllers/chat.controller.js';
import {
  adminListAds,
  adminCreateAd,
  adminUpdateAd,
  adminDeleteAd,
  adminUploadAdMedia,
} from '../controllers/ad.controller.js';
import {
  getBulkPushAudienceStats,
  sendBulkPromotionalPush,
  listBulkPushHistory,
  listBulkPushRecipients,
} from '../controllers/adminBulkPush.controller.js';
import { downloadDriverProfilePdf } from '../controllers/driverPdf.controller.js';
import {
  getAdminUserAnalytics,
  getAdminUserWalletTransactions,
  downloadUserAnalyticsPdf,
} from '../controllers/userAnalytics.controller.js';
import {
  getAdminDriverAnalytics,
  getAdminDriverTrips,
  getAdminDriverWithdrawals,
  getAdminDriverEarnings,
  downloadDriverAnalyticsPdf,
} from '../controllers/driverAnalytics.controller.js';
import {
  getAdminReportsOverview,
  getAdminUserReports,
  getAdminDriverReports,
  getAdminBookingReports,
  getAdminRevenueReports,
  exportAdminReportsOverview,
  exportAdminUserReports,
  exportAdminDriverReports,
  exportAdminBookingReports,
  exportAdminRevenueReports,
  getAdminGstReport,
  exportAdminGstReport,
  exportAccountRevenue,
  exportSubscriptionRevenue,
  exportKitRevenue,
  exportRefunds,
  exportWithdrawals,
} from '../controllers/reports.controller.js';
import {
  listDevBookings,
  getDevBookingDetail,
  patchDevBooking,
  runDevBookingAction,
} from '../controllers/adminDevBookingTest.controller.js';
import {
  getAdminReferralSettings,
  updateAdminReferralSettings,
  listAdminReferrals,
  getAdminReferralById,
  rejectAdminReferral,
} from '../controllers/adminReferral.controller.js';
import { uploadAdMedia, upload } from '../middlewares/multer.js';

const router = express.Router();
const { ALL_STAFF, OPERATIONS, SUPER_ADMIN } = ROUTE_ROLES;

router.post('/auth/login', loginAdmin);
router.get('/auth/me', protectPanel, getStaffMe);
router.post('/fcm-token', protectStaff, restrictTo(...ALL_STAFF), registerStaffFcmToken);
router.delete('/fcm-token', protectStaff, restrictTo(...ALL_STAFF), unregisterStaffFcmToken);
router.get('/dashboard', protectStaff, restrictTo(...SUPER_ADMIN), getAdminDashboard);
router.get('/sidebar-counts', protectStaff, restrictTo(...ALL_STAFF), getAdminSidebarCounts);
router.get('/search', protectStaff, restrictTo(...ALL_STAFF), adminGlobalSearch);

/* ---- Reports & Analytics (super-admin only) --------------------------- */
router.get('/reports/overview', protectStaff, restrictTo(...SUPER_ADMIN), getAdminReportsOverview);
router.get('/reports/overview/export', protectStaff, restrictTo(...SUPER_ADMIN), exportAdminReportsOverview);
router.get('/reports/users', protectStaff, restrictTo(...SUPER_ADMIN), getAdminUserReports);
router.get('/reports/users/export', protectStaff, restrictTo(...SUPER_ADMIN), exportAdminUserReports);
router.get('/reports/drivers', protectStaff, restrictTo(...SUPER_ADMIN), getAdminDriverReports);
router.get('/reports/drivers/export', protectStaff, restrictTo(...SUPER_ADMIN), exportAdminDriverReports);
router.get('/reports/bookings', protectStaff, restrictTo(...SUPER_ADMIN), getAdminBookingReports);
router.get('/reports/bookings/export', protectStaff, restrictTo(...SUPER_ADMIN), exportAdminBookingReports);
router.get('/reports/revenue', protectStaff, restrictTo(...SUPER_ADMIN), getAdminRevenueReports);
router.get('/reports/revenue/export', protectStaff, restrictTo(...SUPER_ADMIN), exportAdminRevenueReports);
router.get('/reports/gst', protectStaff, restrictTo(...SUPER_ADMIN), getAdminGstReport);
router.get('/reports/gst/export', protectStaff, restrictTo(...SUPER_ADMIN), exportAdminGstReport);

router.get('/users', protectStaff, restrictTo(...ALL_STAFF), getCustomers);
router.get('/users/:userId/trips', protectStaff, restrictTo(...ALL_STAFF), getAdminUserTrips);
router.get(
  '/users/:userId/subscriptions',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getAdminUserSubscriptions,
);
router.get(
  '/users/:userId/analytics',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getAdminUserAnalytics,
);
router.get(
  '/users/:userId/analytics/pdf',
  protectStaff,
  restrictTo(...ALL_STAFF),
  downloadUserAnalyticsPdf,
);
router.get(
  '/users/:userId/wallet-transactions',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getAdminUserWalletTransactions,
);

router.get('/tasks/assignees', protectStaff, restrictTo(...OPERATIONS), getTaskAssignees);
router.get('/tasks/activity', protectStaff, restrictTo(...SUPER_ADMIN), listTaskActivity);
router.get('/tasks/summary', protectStaff, restrictTo(...ALL_STAFF), getTaskSummary);
router.get('/tasks', protectStaff, restrictTo(...ALL_STAFF), listTasks);
router.get('/tasks/by-resource', protectStaff, restrictTo(...ALL_STAFF), getTaskByResource);
router.post('/tasks/assign', protectStaff, restrictTo(...OPERATIONS), assignTasks);
router.post('/tasks/sync', protectStaff, restrictTo(...OPERATIONS), syncReviewTasks);
router.patch('/tasks/:id/assign', protectStaff, restrictTo(...OPERATIONS), assignTask);
router.post('/tasks/:id/claim', protectStaff, restrictTo(...OPERATIONS), claimTask);

router.get('/bookings', protectStaff, restrictTo(...ALL_STAFF), getAdminBookings);
/* ---- Scheduled Bookings (Mongo list + manual assign) ---------------- */
// ALL_STAFF: team_members see/assign only within assignedZones (service).
// Listed before /bookings/:id so the static segment wins.
router.get(
  '/bookings/scheduled-jobs',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getScheduledJobs,
);
router.get(
  '/bookings/scheduled-jobs/:id/available-drivers',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getScheduledBookingAvailableDrivers,
);
router.post(
  '/bookings/scheduled-jobs/:id/assign-driver',
  protectStaff,
  restrictTo(...ALL_STAFF),
  assignDriverToScheduledBooking,
);
router.get(
  '/queues/scheduled-booking',
  protectStaff,
  restrictTo(...OPERATIONS),
  getScheduledQueueJobs,
);
router.get('/bookings/:id', protectStaff, restrictTo(...ALL_STAFF), getAdminBookingById);
router.get(
  '/bookings/:id/chat',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getBookingChat,
);
router.get(
  '/bookings/:id/chat/messages',
  protectStaff,
  restrictTo(...ALL_STAFF),
  listBookingChatMessages,
);
router.get(
  '/bookings/:id/chat/unread',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getBookingChatUnread,
);
router.post(
  '/bookings/:id/chat/messages',
  protectStaff,
  restrictTo(...ALL_STAFF),
  sendBookingChatMessage,
);
router.patch(
  '/bookings/:id/chat/read',
  protectStaff,
  restrictTo(...ALL_STAFF),
  markBookingChatRead,
);
router.get(
  '/bookings/:id/available-drivers',
  protectStaff,
  restrictTo(...OPERATIONS),
  getAdminBookingAvailableDrivers,
);
router.post(
  '/bookings/:id/assign-driver',
  protectStaff,
  restrictTo(...OPERATIONS),
  assignDriverToAdminBooking,
);
router.patch(
  '/bookings/:id/status',
  protectStaff,
  restrictTo(...OPERATIONS),
  adminUpdateBookingStatus,
);

/* ---- Emergency Pool (scheduled-ride manual assignment) ---------------- */
// `ALL_STAFF` is used here because team_members must be able to view
// the pool too — the service itself scopes by `assignedZones` for them.
// Driver assignment is restricted to OPERATIONS (admin + sub_admin),
// matching the "admin manually assigns" requirement.
router.get(
  '/emergency-pool',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getEmergencyPoolBookings,
);
router.get(
  '/emergency-pool/count',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getEmergencyPoolCount,
);
router.get(
  '/emergency-pool/:id/available-drivers',
  protectStaff,
  restrictTo(...OPERATIONS),
  getEmergencyPoolAvailableDrivers,
);
router.post(
  '/emergency-pool/:id/assign-driver',
  protectStaff,
  restrictTo(...OPERATIONS),
  assignDriverToEmergencyPoolBooking,
);

/* ---- Outstation Assignments (manual driver pick for round trips) ---- */
// Outstation bookings never auto-dispatch — they sit in
// PENDING_ASSIGNMENT until staff manually assign a driver here.
// `ALL_STAFF` for read endpoints because team_members must see their
// zone's queue; mutation endpoints are OPERATIONS-only so only
// admin/sub_admin can actually commit an assignment.
router.get(
  '/outstation-assignments',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getOutstationAssignments,
);
router.get(
  '/outstation-assignments/:id',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getOutstationAssignmentDetail,
);
router.get(
  '/outstation-assignments/:id/available-drivers',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getOutstationAssignmentDrivers,
);
router.get(
  '/outstation-assignments/:id/driver-conflict',
  protectStaff,
  restrictTo(...ALL_STAFF),
  probeOutstationDriverConflict,
);
router.post(
  '/outstation-assignments/:id/assign-driver',
  protectStaff,
  restrictTo(...OPERATIONS),
  assignDriverToOutstation,
);
router.post(
  '/outstation-assignments/:id/settle-arrived',
  protectStaff,
  restrictTo(...OPERATIONS),
  settleOutstationArrived,
);

router.get('/drivers', protectStaff, restrictTo(...ALL_STAFF), getDrivers);
router.get('/drivers/live', protectStaff, restrictTo(...ALL_STAFF), getLiveDriversSnapshot);
router.get('/drivers/locations', protectStaff, restrictTo(...ALL_STAFF), getDriverLocationsSnapshot);
router.get('/firebase-token', protectStaff, restrictTo(...ALL_STAFF), getStaffFirebaseToken);
router.get(
  '/drivers/:driverId/analytics',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getAdminDriverAnalytics,
);
router.get(
  '/drivers/:driverId/trips',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getAdminDriverTrips,
);
router.get(
  '/drivers/:driverId/withdrawals',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getAdminDriverWithdrawals,
);
router.get(
  '/drivers/:driverId/earnings',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getAdminDriverEarnings,
);
router.get(
  '/drivers/:driverId/analytics/pdf',
  protectStaff,
  restrictTo(...ALL_STAFF),
  downloadDriverAnalyticsPdf,
);
router.get('/drivers/:id', protectStaff, restrictTo(...ALL_STAFF), getDriverById);
/* ---- Driver profile PDF export -------------------------------------- */
// Streams a one-click PDF dossier of the driver (identity, licence,
// bank, vehicles, every uploaded document image). Used by ops to
// share offline copies of the profile for verification audits.
router.get(
  '/drivers/:id/pdf',
  protectStaff,
  restrictTo(...ALL_STAFF),
  downloadDriverProfilePdf,
);
router.put('/drivers/:id/status', protectStaff, restrictTo(...ALL_STAFF), updateDriverStatus);
router.put('/drivers/:id/step-review', protectStaff, restrictTo(...ALL_STAFF), updateDriverStepReview);
router.patch('/drivers/:id/suspend', protectStaff, restrictTo(...ALL_STAFF), suspendDriver);
router.patch('/drivers/:id/unsuspend', protectStaff, restrictTo(...ALL_STAFF), unsuspendDriver);

/* ---- Ads (admin + sub_admin manage; users get the public feed) ------ */
// Admins upload either an image OR a short video to Cloudinary via
// the existing /common/upload* endpoints, then POST the resulting
// URL + publicId here. Only OPERATIONS (admin/sub_admin) can mutate;
// the team_member role isn't trusted with promotional content.
router.get(
  '/notifications/bulk-push/stats',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  getBulkPushAudienceStats,
);
router.get(
  '/notifications/bulk-push/recipients',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  listBulkPushRecipients,
);
router.get(
  '/notifications/bulk-push/history',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  listBulkPushHistory,
);
router.post(
  '/notifications/bulk-push',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  sendBulkPromotionalPush,
);

router.get('/ads', protectStaff, restrictTo(...OPERATIONS), adminListAds);
router.post(
  '/ads/upload',
  protectStaff,
  restrictTo(...OPERATIONS),
  uploadAdMedia.single('media'),
  adminUploadAdMedia,
);
router.post('/ads', protectStaff, restrictTo(...OPERATIONS), adminCreateAd);
router.put('/ads/:id', protectStaff, restrictTo(...OPERATIONS), adminUpdateAd);
router.delete('/ads/:id', protectStaff, restrictTo(...OPERATIONS), adminDeleteAd);

router.post('/team', protectStaff, restrictTo(...SUPER_ADMIN), addAdminMember);
router.get('/team', protectStaff, restrictTo(...SUPER_ADMIN), getAdminTeam);
router.get(
  '/team/:id/analytics',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  getAdminTeamMemberAnalytics,
);
router.put('/team/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateAdminMember);
router.delete('/team/:id', protectStaff, restrictTo(...SUPER_ADMIN), deleteAdminMember);

router.get('/settings/car-types', protectStaff, restrictTo(...OPERATIONS), getAdminCarTypes);
router.post('/settings/car-types', protectStaff, restrictTo(...SUPER_ADMIN), createCarType);
router.put('/settings/car-types/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateCarType);
router.delete('/settings/car-types/:id', protectStaff, restrictTo(...SUPER_ADMIN), deleteCarType);

router.get('/settings/fuel-types', protectStaff, restrictTo(...OPERATIONS), getAdminFuelTypes);
router.post('/settings/fuel-types', protectStaff, restrictTo(...SUPER_ADMIN), createFuelType);
router.put('/settings/fuel-types/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateFuelType);
router.delete('/settings/fuel-types/:id', protectStaff, restrictTo(...SUPER_ADMIN), deleteFuelType);

router.get('/settings/car-brands', protectStaff, restrictTo(...OPERATIONS), getAdminCarBrands);
router.post('/settings/car-brands', protectStaff, restrictTo(...SUPER_ADMIN), createCarBrand);
router.put('/settings/car-brands/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateCarBrand);
router.delete('/settings/car-brands/:id', protectStaff, restrictTo(...SUPER_ADMIN), deleteCarBrand);

router.get('/settings/car-models', protectStaff, restrictTo(...OPERATIONS), getAdminCarModels);
router.post('/settings/car-models', protectStaff, restrictTo(...SUPER_ADMIN), createCarModel);
router.put('/settings/car-models/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateCarModel);
router.delete('/settings/car-models/:id', protectStaff, restrictTo(...SUPER_ADMIN), deleteCarModel);

router.get('/settings/conditions', protectStaff, restrictTo(...OPERATIONS), getAdminConditions);
router.post('/settings/conditions', protectStaff, restrictTo(...SUPER_ADMIN), createCondition);
router.put('/settings/conditions/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateCondition);
router.delete('/settings/conditions/:id', protectStaff, restrictTo(...SUPER_ADMIN), deleteCondition);

router.get('/settings/banks', protectStaff, restrictTo(...OPERATIONS), getAdminBanks);
router.post('/settings/banks', protectStaff, restrictTo(...SUPER_ADMIN), createBank);
router.put('/settings/banks/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateBank);
router.delete('/settings/banks/:id', protectStaff, restrictTo(...SUPER_ADMIN), deleteBank);

router.get('/settings/training-videos', protectStaff, restrictTo(...OPERATIONS), getAdminTrainingVideos);
router.post('/settings/training-videos', protectStaff, restrictTo(...SUPER_ADMIN), createTrainingVideo);
router.put('/settings/training-videos/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateTrainingVideo);
router.delete('/settings/training-videos/:id', protectStaff, restrictTo(...SUPER_ADMIN), deleteTrainingVideo);

router.get('/settings/legal-documents', protectStaff, restrictTo(...OPERATIONS), adminListLegalDocuments);
router.post('/settings/subscription-terms', protectStaff, restrictTo(...SUPER_ADMIN), adminUpsertSubscriptionTerms);
router.post('/settings/legal-documents/:type', protectStaff, restrictTo(...SUPER_ADMIN), adminUpsertSiteLegalDocument);
router.put('/settings/legal-documents/:id', protectStaff, restrictTo(...SUPER_ADMIN), adminUpdateLegalDocument);

router.get('/settings/support', protectStaff, restrictTo(...OPERATIONS), getAdminSupportConfig);
router.put('/settings/support', protectStaff, restrictTo(...SUPER_ADMIN), updateAdminSupportConfig);
router.get('/settings/gst', protectStaff, restrictTo(...OPERATIONS), getAdminGstDetails);
router.put('/settings/gst', protectStaff, restrictTo(...SUPER_ADMIN), updateAdminGstDetails);
router.get(
  '/settings/driver-documents',
  protectStaff,
  restrictTo(...OPERATIONS),
  getAdminDriverDocumentRequirements,
);
router.put(
  '/settings/driver-documents',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  updateAdminDriverDocumentRequirements,
);
router.get(
  '/settings/payment-methods',
  protectStaff,
  restrictTo(...OPERATIONS),
  getAdminPaymentMethods,
);
router.put(
  '/settings/payment-methods',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  updateAdminPaymentMethods,
);
router.get(
  '/settings/subscription-dispatch',
  protectStaff,
  restrictTo(...OPERATIONS),
  getAdminSubscriptionDispatch,
);
router.put(
  '/settings/subscription-dispatch',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  updateAdminSubscriptionDispatch,
);

router.get('/settings/referrals', protectStaff, restrictTo(...OPERATIONS), getAdminReferralSettings);
router.put('/settings/referrals', protectStaff, restrictTo(...SUPER_ADMIN), updateAdminReferralSettings);
router.get('/referrals', protectStaff, restrictTo(...OPERATIONS), listAdminReferrals);
router.get('/referrals/:id', protectStaff, restrictTo(...OPERATIONS), getAdminReferralById);
router.patch('/referrals/:id/reject', protectStaff, restrictTo(...OPERATIONS), rejectAdminReferral);

router.post('/kits', protectStaff, restrictTo(...SUPER_ADMIN), createKit);
router.get('/kits', protectStaff, restrictTo(...ALL_STAFF), getKits);
router.get('/kits/:id', protectStaff, restrictTo(...ALL_STAFF), getKitById);
router.put('/kits/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateKit);
router.delete('/kits/:id', protectStaff, restrictTo(...SUPER_ADMIN), deleteKit);

router.get('/zones', protectStaff, restrictTo(...OPERATIONS), listZones);
router.post('/zones', protectStaff, restrictTo(...SUPER_ADMIN), createZone);
router.get('/zones/:id', protectStaff, restrictTo(...OPERATIONS), getZoneById);
router.put('/zones/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateZone);
router.delete('/zones/:id', protectStaff, restrictTo(...SUPER_ADMIN), deleteZone);

router.get('/pricing/services', protectStaff, restrictTo(...OPERATIONS), adminListServicePricings);
router.post('/pricing/services', protectStaff, restrictTo(...SUPER_ADMIN), adminUpsertServicePricing);
router.put('/pricing/services/:id', protectStaff, restrictTo(...SUPER_ADMIN), adminUpdateServicePricing);
router.delete('/pricing/services/:id', protectStaff, restrictTo(...SUPER_ADMIN), adminDeleteServicePricing);

router.get('/pricing/subscriptions', protectStaff, restrictTo(...OPERATIONS), adminListSubscriptionPlans);
router.post('/pricing/subscriptions', protectStaff, restrictTo(...SUPER_ADMIN), adminCreateSubscriptionPlan);
router.put('/pricing/subscriptions/:id', protectStaff, restrictTo(...SUPER_ADMIN), adminUpdateSubscriptionPlan);
router.delete('/pricing/subscriptions/:id', protectStaff, restrictTo(...SUPER_ADMIN), adminDeleteSubscriptionPlan);

router.get('/coupons', protectStaff, restrictTo(...OPERATIONS), adminListCoupons);
router.post('/coupons', protectStaff, restrictTo(...SUPER_ADMIN), adminCreateCoupon);
router.get('/coupons/:id/analytics', protectStaff, restrictTo(...OPERATIONS), adminCouponAnalytics);
router.put('/coupons/:id', protectStaff, restrictTo(...SUPER_ADMIN), adminUpdateCoupon);
router.delete('/coupons/:id', protectStaff, restrictTo(...SUPER_ADMIN), adminDeleteCoupon);

router.get('/subscriptions/users', protectStaff, restrictTo(...ALL_STAFF), adminListUserSubscriptions);
router.get(
  '/subscriptions/revenue',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  adminListSubscriptionRevenue,
);
router.get(
  '/subscriptions/revenue/export',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  exportSubscriptionRevenue,
);
router.get(
  '/subscriptions/:id/driver-payouts',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  adminGetSubscriptionDriverPayouts,
);
router.post(
  '/subscriptions/:id/pay-drivers',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  adminPaySubscriptionDrivers,
);
router.get(
  '/subscriptions/users/:id/available-drivers',
  protectStaff,
  restrictTo(...ALL_STAFF),
  adminListSubscriptionAvailableDrivers,
);
router.post('/subscriptions/users/:id/assign', protectStaff, restrictTo(...OPERATIONS), adminAssignDriverToSubscription);
router.post('/subscriptions/users/:id/release', protectStaff, restrictTo(...OPERATIONS), adminReleaseSubscriptionDriver);

router.get('/kit-orders', protectStaff, restrictTo(...ALL_STAFF), getAdminKitOrders);
router.get('/kit-orders/:id', protectStaff, restrictTo(...ALL_STAFF), getAdminKitOrderById);
router.patch('/kit-orders/:id/approve', protectStaff, restrictTo(...ALL_STAFF), approveKitOrder);
router.patch('/kit-orders/:id/reject', protectStaff, restrictTo(...ALL_STAFF), rejectKitOrder);
router.patch('/kit-orders/:id/dispatch', protectStaff, restrictTo(...ALL_STAFF), dispatchKitOrder);
router.patch('/kit-orders/:id/deliver', protectStaff, restrictTo(...ALL_STAFF), deliverKitOrder);

/* ---- Account → Online Transactions (Razorpay ledger) ----------------- */
router.get(
  '/online-transactions',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  listOnlineTransactions,
);
router.get(
  '/online-transactions/:id',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  getOnlineTransaction,
);

/* ---- Account → Refunds ----------------------------------------------- */
// The cancellation pipeline writes Refund documents; admins review and
// PATCH the status as they manually move the money on the Razorpay
// dashboard. There is no automated retry — the gateway call is human-
// driven and the PATCH is the authoritative state-transition.
router.get('/refunds', protectStaff, restrictTo(...SUPER_ADMIN), listRefunds);
router.get('/refunds/export', protectStaff, restrictTo(...SUPER_ADMIN), exportRefunds);
router.get(
  '/refunds/subject-wallet/:subjectType/:subjectId',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  getRefundSubjectWallet,
);
router.post('/refunds/manual', protectStaff, restrictTo(...SUPER_ADMIN), createAdminManualRefund);
router.patch('/refunds/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateRefundStatus);

router.get('/withdrawals', protectStaff, restrictTo(...SUPER_ADMIN), listWithdrawalsAdmin);
router.get('/withdrawals/export', protectStaff, restrictTo(...SUPER_ADMIN), exportWithdrawals);
router.patch('/withdrawals/:id/reject', protectStaff, restrictTo(...SUPER_ADMIN), rejectWithdrawalAdmin);
router.post(
  '/withdrawals/:id/process',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  upload.single('paymentProof'),
  processWithdrawalAdmin,
);

router.get('/account-deletions', protectStaff, restrictTo(...SUPER_ADMIN), listAccountDeletionsAdmin);
router.get(
  '/account-deletions/:id/blockers',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  getAccountDeletionBlockersAdmin,
);
router.post(
  '/account-deletions/:id/settle-wallet',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  settleUserWalletForDeletionAdmin,
);
router.patch(
  '/account-deletions/:id/in-progress',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  markAccountDeletionInProgressAdmin,
);
router.patch(
  '/account-deletions/:id/reject',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  rejectAccountDeletionAdmin,
);
router.post(
  '/account-deletions/:id/complete',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  completeAccountDeletionAdmin,
);

router.patch(
  '/subscriptions/users/:id/status',
  protectStaff,
  restrictTo(...OPERATIONS),
  adminUpdateUserSubscriptionStatus,
);
router.post(
  '/subscriptions/users/:id/cancel-request/review',
  protectStaff,
  restrictTo(...OPERATIONS),
  adminReviewSubscriptionCancellation,
);
router.post(
  '/subscriptions/users/:id/reschedule',
  protectStaff,
  restrictTo(...OPERATIONS),
  adminRescheduleUserSubscription,
);

router.get('/notifications', protectStaff, restrictTo(...ALL_STAFF), getAdminNotifications);
router.get('/notifications/unread', protectStaff, restrictTo(...ALL_STAFF), getAdminUnreadNotifications);
router.patch('/notifications/read-all', protectStaff, restrictTo(...ALL_STAFF), markAllAdminNotificationsRead);
router.patch('/notifications/:id/read', protectStaff, restrictTo(...ALL_STAFF), markAdminNotificationRead);
router.delete('/notifications', protectStaff, restrictTo(...ALL_STAFF), deleteAdminNotifications);
router.delete('/notifications/:id', protectStaff, restrictTo(...ALL_STAFF), deleteAdminNotification);

router.get('/failed-jobs', protectStaff, restrictTo(...SUPER_ADMIN), listFailedJobs);
router.post('/failed-jobs/:id/retry', protectStaff, restrictTo(...SUPER_ADMIN), retryFailedJob);
router.post('/failed-jobs/:id/resolve', protectStaff, restrictTo(...SUPER_ADMIN), resolveFailedJob);

/* ---- Account → Revenue ----------------------------------------------- */
// Read-only paginated view over the `PlatformRevenue` ledger. Each row
// represents a rupee event the platform kept (trip-completion
// commission, company share of a cancellation fee, etc.) — writes are
// done by the booking pipelines, not here.
router.get('/revenue', protectStaff, restrictTo(...SUPER_ADMIN), listPlatformRevenue);
router.get('/revenue/export', protectStaff, restrictTo(...SUPER_ADMIN), exportAccountRevenue);
router.get('/kit-revenue', protectStaff, restrictTo(...SUPER_ADMIN), listKitRevenue);
router.get('/kit-revenue/export', protectStaff, restrictTo(...SUPER_ADMIN), exportKitRevenue);

router.get('/sos', protectStaff, restrictTo(...ALL_STAFF), listAdminSos);
router.get('/sos/:id', protectStaff, restrictTo(...ALL_STAFF), getAdminSosDetail);
router.patch('/sos/:id/assign', protectStaff, restrictTo(...OPERATIONS), assignAdminSos);

router.get('/support', protectStaff, restrictTo(...ALL_STAFF), adminListSupportTickets);
router.get('/support/:id', protectStaff, restrictTo(...ALL_STAFF), adminGetSupportTicket);
router.put('/support/:id', protectStaff, restrictTo(...ALL_STAFF), adminUpdateSupportTicket);
router.patch('/support/:id/assign', protectStaff, restrictTo(...OPERATIONS), adminAssignSupportTicket);

/* ---- Developer booking test lab (developer role only) ---------------- */
router.get('/dev/bookings', protectDeveloper, listDevBookings);
router.get('/dev/bookings/:id', protectDeveloper, getDevBookingDetail);
router.patch('/dev/bookings/:id', protectDeveloper, patchDevBooking);
router.post('/dev/bookings/:id/actions', protectDeveloper, runDevBookingAction);

export default router;
