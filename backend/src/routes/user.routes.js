import express from 'express';
import { refreshAccessToken, logout } from '../controllers/common.controller.js';
import {
  loginUser,
  sendUserOtp,
  verifyUserOtpAndRegister,
  updateUserOnboardingStep,
  getUserProfile,
  getRegistrationStatus,
  addCar,
  getUserCars,
  deleteUserCar,
  listSavedLocations,
  addSavedLocation,
  deleteSavedLocation,
} from '../controllers/user.controller.js';
import {
  googleSignInUser,
  sendGoogleLinkPhoneOtp,
  linkGoogleUserPhone,
} from '../controllers/googleAuth.controller.js';
import {
  getActiveServicePricings,
  getActiveSubscriptionPlans,
  estimateFare,
  purchaseSubscription,
  verifySubscriptionPayment,
  getMySubscription,
} from '../controllers/pricing.controller.js';
import { getSubscriptionTerms } from '../controllers/legalDocument.controller.js';
import { registerUserFcmToken } from '../controllers/fcmToken.controller.js';
import { getNearbyDriversForUser } from '../controllers/driverLocation.controller.js';
import {
  createBooking,
  getMyBookings,
  getMyActiveBooking,
  getMyActiveBookings,
  getBookingById,
  cancelBooking,
  createBookingPayment,
  verifyBookingPayment,
  initiateBookingExtension,
  verifyBookingExtensionOtp,
  payBookingExtension,
  cancelBookingExtension,
  respondToNoShowPrompt,
  rateDriverByCustomer,
} from '../controllers/booking.controller.js';
import {
  getMyWallet,
  getMyWalletTransactions,
  createWalletTopupOrder,
  verifyWalletTopupPayment,
} from '../controllers/wallet.controller.js';
import { protectUser, protectProfileViewer } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Auth Public
router.post('/send-otp', sendUserOtp);
router.post('/verify-otp', verifyUserOtpAndRegister);
router.post('/login', loginUser);
router.post('/google', googleSignInUser);
router.post('/google/link-phone/otp', sendGoogleLinkPhoneOtp);
router.post('/refresh-token', refreshAccessToken);
router.post('/logout', logout);

// Public pricing reads (used by the booking flow before checkout)
router.get('/pricing/services', getActiveServicePricings);
router.get('/pricing/subscriptions', getActiveSubscriptionPlans);
router.get('/legal/subscription-terms', getSubscriptionTerms);

// Profile — customer (own id) or staff (any customer id)
router.get('/users/:userId/profile', protectProfileViewer, getUserProfile);

// Protected Onboarding & Cars
router.use(protectUser);

// Fare estimate (auth required so we can apply the user's subscription discount)
router.post('/bookings/estimate', estimateFare);

// Subscriptions — purchase + active subscription read
router.get('/subscriptions/me', getMySubscription);
router.post('/subscriptions/purchase', purchaseSubscription);
router.post('/subscriptions/verify-payment', verifySubscriptionPayment);

router.post('/fcm-token', registerUserFcmToken);

// Booking lifecycle (Phase 4)
router.post('/bookings', createBooking);
router.get('/bookings', getMyBookings);
router.get('/bookings/active', getMyActiveBooking);
router.get('/bookings/active-list', getMyActiveBookings);
router.get('/bookings/:id', getBookingById);
router.post('/bookings/:id/cancel', cancelBooking);
router.post('/bookings/:id/pay', createBookingPayment);
router.post('/bookings/:id/verify-payment', verifyBookingPayment);
// Extension flow is a 3-step handshake (initiate → driver OTP →
// customer verifies → customer pays). The old single-shot endpoint is
// gone; the service throws 410 if anything still calls it.
router.post('/bookings/:id/extensions/initiate', initiateBookingExtension);
router.post('/bookings/:id/extensions/verify-otp', verifyBookingExtensionOtp);
router.post('/bookings/:id/extensions/pay', payBookingExtension);
router.post('/bookings/:id/extensions/cancel', cancelBookingExtension);
router.post('/bookings/:id/noshow/respond', respondToNoShowPrompt);
// Post-trip rating — customer rates the driver who completed the trip.
// Once-only; a duplicate submit hits 409 from the service.
router.post('/bookings/:id/rate-driver', rateDriverByCustomer);

// Wallet — read + Razorpay top-up. Mutations go through the
// wallet service so the WalletTransaction ledger stays in sync.
router.get('/wallet', getMyWallet);
router.get('/wallet/transactions', getMyWalletTransactions);
router.post('/wallet/topup', createWalletTopupOrder);
router.post('/wallet/topup/verify', verifyWalletTopupPayment);

router.post('/google/link-phone', linkGoogleUserPhone);
router.get('/onboarding/status', getRegistrationStatus);
router.put('/onboarding/step', updateUserOnboardingStep);

// Cars management
router.post('/cars', addCar);
router.get('/cars', getUserCars);
router.delete('/cars/:id', deleteUserCar);

// Favourite / saved locations
router.get('/saved-locations', listSavedLocations);
router.post('/saved-locations', addSavedLocation);
router.delete('/saved-locations/:id', deleteSavedLocation);

// Nearby drivers (home screen widget + future surfaces)
router.get('/drivers/nearby', getNearbyDriversForUser);

export default router;
