import express from 'express';
import {
  sendOtp,
  verifyOtpAndRegister,
  loginDriver,
  sendDriverForgotPasswordOtp,
  verifyDriverForgotPasswordOtp,
  resetDriverPasswordWithOtp,
  updateOnboardingStep,
  submitApplication,
  getProfile,
  updateVehicleExperience,
  updateBankDetails,
  getTraining,
  updateTrainingProgress,
  uploadLiveVerification,
  reopenRejectedApplication,
  updateOutstationAvailability,
} from '../controllers/driver.controller.js';
import { downloadDriverIdCardPdf } from '../controllers/driverPdf.controller.js';
import { registerDriverFcmToken, unregisterDriverFcmToken } from '../controllers/fcmToken.controller.js';
import {
  getDriverNotifications,
  getDriverUnreadNotifications,
  markDriverNotificationRead,
  markAllDriverNotificationsRead,
  deleteDriverNotification,
  deleteDriverNotifications,
} from '../controllers/notification.controller.js';
import {
  googleSignInDriver,
  linkGoogleDriverPhone,
} from '../controllers/googleAuth.controller.js';
import { protectDriver } from '../middlewares/authMiddleware.js';
import { getMandatoryKit, getAvailableKits } from '../controllers/kit.controller.js';
import {
  createKitOrder,
  getMyKitOrders,
  getMyActiveKitOrder,
  retryKitOrderPayment,
  markKitOrderPaymentFailed,
} from '../controllers/kitOrder.controller.js';
import { verifyKitPayment } from '../controllers/payment.controller.js';
import { getOnlineStatus, setOnlineStatus } from '../controllers/driverOnline.controller.js';
import {
  issueDriverTrackingToken,
  revokeDriverTrackingToken,
  ingestDriverLocation,
} from '../controllers/driverTracking.controller.js';
import { protectDriverTracking } from '../middlewares/trackingAuth.js';
import { getDriverFirebaseToken } from '../controllers/firebaseAuth.controller.js';
import { driverLocationRateLimiter } from '../middlewares/rateLimit.js';
import {
  getMyOrders,
  getMyOrderById,
  getMyPaymentHistory,
} from '../controllers/driverHistory.controller.js';
import {
  getDriverHomeSummary,
  getDriverTripsList,
  getDriverEarnings,
  getDriverEarningsLedger,
} from '../controllers/driverTrips.controller.js';
import {
  getDriverActiveBooking,
  driverAcceptBooking,
  driverRejectBooking,
  driverGetBookingById,
  driverMarkEnRoute,
  driverMarkArrived,
  driverStartTrip,
  driverCompleteTrip,
  driverCancelBooking,
  driverDismissBookingExtension,
  rateCustomerByDriver,
  getDriverPendingOffer,
  getDriverIncomingScheduled,
  getDriverIncomingScheduledCount,
  driverAcceptSubscription,
  driverRejectSubscription,
  getDriverAssignedSubscriptions,
  getDriverAssignedSubscriptionById,
} from '../controllers/booking.controller.js';
import {
  getDriverWithdrawalLimits,
  createDriverWithdrawal,
  listDriverWithdrawals,
} from '../controllers/withdrawal.controller.js';
import {
  getMyDriverAccountDeletionRequest,
  requestDriverAccountDeletion,
} from '../controllers/accountDeletion.controller.js';
import {
  getBookingChat,
  listBookingChatMessages,
  sendBookingChatMessage,
  markBookingChatRead,
  getBookingChatUnread,
} from '../controllers/chat.controller.js';
import { uploadVideo as uploadVideoMiddleware, upload } from '../middlewares/multer.js';

const router = express.Router();

router.post('/auth/send-otp', sendOtp);
router.post('/auth/verify-otp', verifyOtpAndRegister);
router.post('/auth/login', loginDriver);
router.post('/auth/forgot-password/send-otp', sendDriverForgotPasswordOtp);
router.post('/auth/forgot-password/verify-otp', verifyDriverForgotPasswordOtp);
router.post('/auth/forgot-password/reset', resetDriverPasswordWithOtp);
router.post('/auth/google', googleSignInDriver);

router.put('/onboarding/step', protectDriver, updateOnboardingStep);
router.post(
  '/onboarding/live-verification',
  protectDriver,
  uploadVideoMiddleware.single('video'),
  uploadLiveVerification,
);
router.post('/auth/google/link-phone', protectDriver, linkGoogleDriverPhone);
router.get('/training', protectDriver, getTraining);
router.put('/training/progress', protectDriver, updateTrainingProgress);
router.post('/onboarding/submit', protectDriver, submitApplication);
router.post('/application/reopen', protectDriver, reopenRejectedApplication);
router.get('/profile', protectDriver, getProfile);
router.get('/id-card/pdf', protectDriver, downloadDriverIdCardPdf);
router.put('/profile/vehicle-experience', protectDriver, updateVehicleExperience);
router.put('/profile/bank-details', protectDriver, updateBankDetails);
router.post('/fcm-token', protectDriver, registerDriverFcmToken);
router.delete('/fcm-token', protectDriver, unregisterDriverFcmToken);

router.get('/notifications', protectDriver, getDriverNotifications);
router.get('/notifications/unread', protectDriver, getDriverUnreadNotifications);
router.patch('/notifications/read-all', protectDriver, markAllDriverNotificationsRead);
router.patch('/notifications/:id/read', protectDriver, markDriverNotificationRead);
router.delete('/notifications', protectDriver, deleteDriverNotifications);
router.delete('/notifications/:id', protectDriver, deleteDriverNotification);
// Driver-side preferences \u2014 currently only the outstation opt-in
// for the admin-managed outstation queue.
router.put(
  '/preferences/outstation-availability',
  protectDriver,
  updateOutstationAvailability,
);

router.get('/kits', protectDriver, getAvailableKits);
router.get('/kits/mandatory', protectDriver, getMandatoryKit);
router.get('/kit-orders', protectDriver, getMyKitOrders);
router.get('/kit-orders/active', protectDriver, getMyActiveKitOrder);
router.post('/kit-orders', protectDriver, createKitOrder);
router.post('/kit-orders/:id/pay', protectDriver, retryKitOrderPayment);
router.post('/kit-orders/:id/payment-failed', protectDriver, markKitOrderPaymentFailed);
router.get('/orders', protectDriver, getMyOrders);
router.get('/orders/:id', protectDriver, getMyOrderById);
router.get('/payments/history', protectDriver, getMyPaymentHistory);
router.post('/payments/verify', protectDriver, verifyKitPayment);

router.get('/online/status', protectDriver, getOnlineStatus);
router.put('/online', protectDriver, setOnlineStatus);

// Live tracking — the native background uploader.
//
// MERGE NOTE: `main` also registered `POST /location` here, bound to
// `postDriverLocation` with `protectDriver`. Two registrations of the same
// path is not an error in Express — the first one wins and the second becomes
// unreachable — so this had to be collapsed to one. The surviving handler is
// the superset: it takes a batch, dedupes replays, and accepts EITHER the
// long-lived tracking token (which is what lets the background service keep
// posting once the 15-minute access token has expired) OR a driver access
// token. It also still accepts the single-fix body `main` was sending.
//
// `/tracking/token` is driver-authenticated because the app has a fresh access
// token at the moment the driver goes online, which is exactly when it is called.
router.post('/tracking/token', protectDriver, issueDriverTrackingToken);
router.delete('/tracking/token', protectDriver, revokeDriverTrackingToken);
router.post('/location', protectDriverTracking, driverLocationRateLimiter, ingestDriverLocation);
router.get('/firebase-token', protectDriver, getDriverFirebaseToken);

// Dashboard: today summary, paginated trip history, earnings analytics
router.get('/home/summary', protectDriver, getDriverHomeSummary);
router.get('/trips', protectDriver, getDriverTripsList);
router.get('/earnings', protectDriver, getDriverEarnings);
router.get('/earnings/ledger', protectDriver, getDriverEarningsLedger);

// Booking lifecycle for the driver (Phase 4)
router.get('/bookings/active', protectDriver, getDriverActiveBooking);
router.get('/bookings/pending-offer', protectDriver, getDriverPendingOffer);
router.get('/bookings/incoming-scheduled', protectDriver, getDriverIncomingScheduled);
router.get('/bookings/incoming-scheduled/count', protectDriver, getDriverIncomingScheduledCount);
router.get('/subscriptions', protectDriver, getDriverAssignedSubscriptions);
router.get('/subscriptions/:id', protectDriver, getDriverAssignedSubscriptionById);
router.post('/subscriptions/:id/accept', protectDriver, driverAcceptSubscription);
router.post('/subscriptions/:id/reject', protectDriver, driverRejectSubscription);
router.get('/bookings/:id', protectDriver, driverGetBookingById);
router.get('/bookings/:id/chat', protectDriver, getBookingChat);
router.get('/bookings/:id/chat/messages', protectDriver, listBookingChatMessages);
router.get('/bookings/:id/chat/unread', protectDriver, getBookingChatUnread);
router.post('/bookings/:id/chat/messages', protectDriver, sendBookingChatMessage);
router.patch('/bookings/:id/chat/read', protectDriver, markBookingChatRead);
router.post('/bookings/:id/accept', protectDriver, driverAcceptBooking);
router.post('/bookings/:id/reject', protectDriver, driverRejectBooking);

// Post-accept trip execution
router.post('/bookings/:id/en-route', protectDriver, driverMarkEnRoute);
router.post('/bookings/:id/arrived', protectDriver, driverMarkArrived);
router.post('/bookings/:id/start', protectDriver, driverStartTrip);
router.post('/bookings/:id/complete', protectDriver, driverCompleteTrip);
router.post('/bookings/:id/cancel', protectDriver, driverCancelBooking);
router.post(
  '/bookings/:id/extensions/dismiss',
  protectDriver,
  driverDismissBookingExtension,
);
// Post-trip rating — driver rates the customer they just drove.
// Once-only; a duplicate submit hits 409 from the service.
router.post('/bookings/:id/rate-customer', protectDriver, rateCustomerByDriver);

router.get('/withdrawals/limits', protectDriver, getDriverWithdrawalLimits);
router.get('/withdrawals', protectDriver, listDriverWithdrawals);
router.post(
  '/withdrawals',
  protectDriver,
  upload.single('qrImage'),
  createDriverWithdrawal,
);

router.get('/account/deletion-request', protectDriver, getMyDriverAccountDeletionRequest);
router.post(
  '/account/deletion-request',
  protectDriver,
  upload.single('qrImage'),
  requestDriverAccountDeletion,
);

export default router;
