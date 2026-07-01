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
  getTraining,
  updateTrainingProgress,
  uploadLiveVerification,
  reopenRejectedApplication,
  updateOutstationAvailability,
} from '../controllers/driver.controller.js';
import { registerDriverFcmToken, unregisterDriverFcmToken } from '../controllers/fcmToken.controller.js';
import {
  getDriverNotifications,
  getDriverUnreadNotifications,
  markDriverNotificationRead,
  markAllDriverNotificationsRead,
} from '../controllers/notification.controller.js';
import { uploadVideo as uploadVideoMiddleware } from '../middlewares/multer.js';
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
} from '../controllers/booking.controller.js';

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
router.post('/fcm-token', protectDriver, registerDriverFcmToken);
router.delete('/fcm-token', protectDriver, unregisterDriverFcmToken);

router.get('/notifications', protectDriver, getDriverNotifications);
router.get('/notifications/unread', protectDriver, getDriverUnreadNotifications);
router.patch('/notifications/read-all', protectDriver, markAllDriverNotificationsRead);
router.patch('/notifications/:id/read', protectDriver, markDriverNotificationRead);
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

// Dashboard: today summary, paginated trip history, earnings analytics
router.get('/home/summary', protectDriver, getDriverHomeSummary);
router.get('/trips', protectDriver, getDriverTripsList);
router.get('/earnings', protectDriver, getDriverEarnings);
router.get('/earnings/ledger', protectDriver, getDriverEarningsLedger);

// Booking lifecycle for the driver (Phase 4)
router.get('/bookings/active', protectDriver, getDriverActiveBooking);
router.get('/bookings/:id', protectDriver, driverGetBookingById);
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

export default router;
