import express from 'express';
import {
  loginAdmin,
  getStaffMe,
  getCustomers,
  getAdminUserTrips,
  getAdminUserSubscriptions,
  getDrivers,
  getDriverById,
  updateDriverStatus,
  suspendDriver,
  unsuspendDriver,
  addAdminMember,
  getAdminTeam,
  updateAdminMember,
  deleteAdminMember,
} from '../controllers/admin.controller.js';
import { protectStaff, restrictTo } from '../middlewares/authMiddleware.js';
import { ROUTE_ROLES } from '../constants/staffPermissions.js';
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
} from '../controllers/platform.controller.js';
import {
  adminListLegalDocuments,
  adminUpsertSubscriptionTerms,
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
import { getLiveDriversSnapshot } from '../controllers/driverLocation.controller.js';
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
} from '../controllers/pricing.controller.js';
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
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from '../controllers/notification.controller.js';
import {
  listFailedJobs,
  retryFailedJob,
  resolveFailedJob,
} from '../controllers/failedJob.controller.js';
import {
  listAdminSos,
  getAdminSosDetail,
} from '../controllers/sos.controller.js';
import { listPlatformRevenue } from '../controllers/revenue.controller.js';
import {
  getAdminBookings,
  getAdminBookingById,
  adminUpdateBookingStatus,
  getEmergencyPoolBookings,
  getEmergencyPoolAvailableDrivers,
  assignDriverToEmergencyPoolBooking,
  getScheduledJobs,
  getOutstationAssignments,
  getOutstationAssignmentDetail,
  getOutstationAssignmentDrivers,
  assignDriverToOutstation,
  probeOutstationDriverConflict,
} from '../controllers/booking.controller.js';
import {
  adminListAds,
  adminCreateAd,
  adminUpdateAd,
  adminDeleteAd,
  adminUploadAdMedia,
} from '../controllers/ad.controller.js';
import { downloadDriverProfilePdf } from '../controllers/driverPdf.controller.js';
import { uploadAdMedia, upload } from '../middlewares/multer.js';

const router = express.Router();
const { ALL_STAFF, OPERATIONS, SUPER_ADMIN } = ROUTE_ROLES;

router.post('/auth/login', loginAdmin);
router.get('/auth/me', protectStaff, restrictTo(...ALL_STAFF), getStaffMe);

router.get('/users', protectStaff, restrictTo(...ALL_STAFF), getCustomers);
router.get('/users/:userId/trips', protectStaff, restrictTo(...ALL_STAFF), getAdminUserTrips);
router.get(
  '/users/:userId/subscriptions',
  protectStaff,
  restrictTo(...ALL_STAFF),
  getAdminUserSubscriptions,
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
/* ---- Scheduled Jobs (BullMQ snapshot) --------------------------------- */
// Mounted under /bookings/* so it lives in the same admin sub-section as
// the all-bookings table. Listed before /bookings/:id so the static
// segment wins over the param route.
router.get(
  '/bookings/scheduled-jobs',
  protectStaff,
  restrictTo(...OPERATIONS),
  getScheduledJobs,
);
router.get('/bookings/:id', protectStaff, restrictTo(...ALL_STAFF), getAdminBookingById);
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

router.get('/drivers', protectStaff, restrictTo(...ALL_STAFF), getDrivers);
router.get('/drivers/live', protectStaff, restrictTo(...ALL_STAFF), getLiveDriversSnapshot);
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
router.patch('/drivers/:id/suspend', protectStaff, restrictTo(...ALL_STAFF), suspendDriver);
router.patch('/drivers/:id/unsuspend', protectStaff, restrictTo(...ALL_STAFF), unsuspendDriver);

/* ---- Ads (admin + sub_admin manage; users get the public feed) ------ */
// Admins upload either an image OR a short video to Cloudinary via
// the existing /common/upload* endpoints, then POST the resulting
// URL + publicId here. Only OPERATIONS (admin/sub_admin) can mutate;
// the team_member role isn't trusted with promotional content.
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
router.put('/team/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateAdminMember);
router.delete('/team/:id', protectStaff, restrictTo(...SUPER_ADMIN), deleteAdminMember);

router.get('/settings/car-types', protectStaff, restrictTo(...OPERATIONS), getAdminCarTypes);
router.post('/settings/car-types', protectStaff, restrictTo(...OPERATIONS), createCarType);
router.put('/settings/car-types/:id', protectStaff, restrictTo(...OPERATIONS), updateCarType);
router.delete('/settings/car-types/:id', protectStaff, restrictTo(...OPERATIONS), deleteCarType);

router.get('/settings/fuel-types', protectStaff, restrictTo(...OPERATIONS), getAdminFuelTypes);
router.post('/settings/fuel-types', protectStaff, restrictTo(...OPERATIONS), createFuelType);
router.put('/settings/fuel-types/:id', protectStaff, restrictTo(...OPERATIONS), updateFuelType);
router.delete('/settings/fuel-types/:id', protectStaff, restrictTo(...OPERATIONS), deleteFuelType);

router.get('/settings/car-brands', protectStaff, restrictTo(...OPERATIONS), getAdminCarBrands);
router.post('/settings/car-brands', protectStaff, restrictTo(...OPERATIONS), createCarBrand);
router.put('/settings/car-brands/:id', protectStaff, restrictTo(...OPERATIONS), updateCarBrand);
router.delete('/settings/car-brands/:id', protectStaff, restrictTo(...OPERATIONS), deleteCarBrand);

router.get('/settings/car-models', protectStaff, restrictTo(...OPERATIONS), getAdminCarModels);
router.post('/settings/car-models', protectStaff, restrictTo(...OPERATIONS), createCarModel);
router.put('/settings/car-models/:id', protectStaff, restrictTo(...OPERATIONS), updateCarModel);
router.delete('/settings/car-models/:id', protectStaff, restrictTo(...OPERATIONS), deleteCarModel);

router.get('/settings/conditions', protectStaff, restrictTo(...OPERATIONS), getAdminConditions);
router.post('/settings/conditions', protectStaff, restrictTo(...OPERATIONS), createCondition);
router.put('/settings/conditions/:id', protectStaff, restrictTo(...OPERATIONS), updateCondition);
router.delete('/settings/conditions/:id', protectStaff, restrictTo(...OPERATIONS), deleteCondition);

router.get('/settings/training-videos', protectStaff, restrictTo(...OPERATIONS), getAdminTrainingVideos);
router.post('/settings/training-videos', protectStaff, restrictTo(...OPERATIONS), createTrainingVideo);
router.put('/settings/training-videos/:id', protectStaff, restrictTo(...OPERATIONS), updateTrainingVideo);
router.delete('/settings/training-videos/:id', protectStaff, restrictTo(...OPERATIONS), deleteTrainingVideo);

router.get('/settings/legal-documents', protectStaff, restrictTo(...OPERATIONS), adminListLegalDocuments);
router.post('/settings/subscription-terms', protectStaff, restrictTo(...OPERATIONS), adminUpsertSubscriptionTerms);
router.put('/settings/legal-documents/:id', protectStaff, restrictTo(...OPERATIONS), adminUpdateLegalDocument);

router.post('/kits', protectStaff, restrictTo(...OPERATIONS), createKit);
router.get('/kits', protectStaff, restrictTo(...ALL_STAFF), getKits);
router.get('/kits/:id', protectStaff, restrictTo(...ALL_STAFF), getKitById);
router.put('/kits/:id', protectStaff, restrictTo(...OPERATIONS), updateKit);
router.delete('/kits/:id', protectStaff, restrictTo(...OPERATIONS), deleteKit);

router.get('/zones', protectStaff, restrictTo(...OPERATIONS), listZones);
router.post('/zones', protectStaff, restrictTo(...OPERATIONS), createZone);
router.get('/zones/:id', protectStaff, restrictTo(...OPERATIONS), getZoneById);
router.put('/zones/:id', protectStaff, restrictTo(...OPERATIONS), updateZone);
router.delete('/zones/:id', protectStaff, restrictTo(...OPERATIONS), deleteZone);

router.get('/pricing/services', protectStaff, restrictTo(...OPERATIONS), adminListServicePricings);
router.post('/pricing/services', protectStaff, restrictTo(...OPERATIONS), adminUpsertServicePricing);
router.put('/pricing/services/:id', protectStaff, restrictTo(...OPERATIONS), adminUpdateServicePricing);
router.delete('/pricing/services/:id', protectStaff, restrictTo(...OPERATIONS), adminDeleteServicePricing);

router.get('/pricing/subscriptions', protectStaff, restrictTo(...OPERATIONS), adminListSubscriptionPlans);
router.post('/pricing/subscriptions', protectStaff, restrictTo(...OPERATIONS), adminCreateSubscriptionPlan);
router.put('/pricing/subscriptions/:id', protectStaff, restrictTo(...OPERATIONS), adminUpdateSubscriptionPlan);
router.delete('/pricing/subscriptions/:id', protectStaff, restrictTo(...OPERATIONS), adminDeleteSubscriptionPlan);

router.get('/subscriptions/users', protectStaff, restrictTo(...ALL_STAFF), adminListUserSubscriptions);
router.get(
  '/subscriptions/revenue',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  adminListSubscriptionRevenue,
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

/* ---- Account → Refunds ----------------------------------------------- */
// The cancellation pipeline writes Refund documents; admins review and
// PATCH the status as they manually move the money on the Razorpay
// dashboard. There is no automated retry — the gateway call is human-
// driven and the PATCH is the authoritative state-transition.
router.get('/refunds', protectStaff, restrictTo(...SUPER_ADMIN), listRefunds);
router.get(
  '/refunds/subject-wallet/:subjectType/:subjectId',
  protectStaff,
  restrictTo(...SUPER_ADMIN),
  getRefundSubjectWallet,
);
router.post('/refunds/manual', protectStaff, restrictTo(...SUPER_ADMIN), createAdminManualRefund);
router.patch('/refunds/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateRefundStatus);

router.get('/withdrawals', protectStaff, restrictTo(...SUPER_ADMIN), listWithdrawalsAdmin);
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

router.get('/notifications', protectStaff, restrictTo(...ALL_STAFF), getAdminNotifications);
router.patch('/notifications/read-all', protectStaff, restrictTo(...ALL_STAFF), markAllAdminNotificationsRead);
router.patch('/notifications/:id/read', protectStaff, restrictTo(...ALL_STAFF), markAdminNotificationRead);

router.get('/failed-jobs', protectStaff, restrictTo(...SUPER_ADMIN), listFailedJobs);
router.post('/failed-jobs/:id/retry', protectStaff, restrictTo(...SUPER_ADMIN), retryFailedJob);
router.post('/failed-jobs/:id/resolve', protectStaff, restrictTo(...SUPER_ADMIN), resolveFailedJob);

/* ---- Account → Revenue ----------------------------------------------- */
// Read-only paginated view over the `PlatformRevenue` ledger. Each row
// represents a rupee event the platform kept (trip-completion
// commission, company share of a cancellation fee, etc.) — writes are
// done by the booking pipelines, not here.
router.get('/revenue', protectStaff, restrictTo(...SUPER_ADMIN), listPlatformRevenue);

router.get('/sos', protectStaff, restrictTo(...ALL_STAFF), listAdminSos);
router.get('/sos/:id', protectStaff, restrictTo(...ALL_STAFF), getAdminSosDetail);

export default router;
