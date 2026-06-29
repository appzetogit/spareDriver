import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

// Layouts + guards stay eager — they're small, used on every route, and
// keeping them out of the Suspense boundary avoids a double spinner on every
// navigation.
import MobileLayout from './layouts/MobileLayout';
import AuthLayout from './layouts/AuthLayout';
import { UserDashboardLayout, DriverDashboardLayout } from './layouts/DashboardLayout';
import AdminGuard from './guards/AdminGuard';
import DriverGuard from './guards/DriverGuard';
import OnboardingGuard from './guards/OnboardingGuard';
import UserOnboardingGuard from './guards/UserOnboardingGuard';
import SuperAdminOnlyGuard from './guards/SuperAdminOnlyGuard';
import AdminLayout from './layouts/AdminLayout';

// Side-effect: starts the global Socket.IO lifecycle (auto-connects when any
// auth store has a session, auto-disconnects on logout).
import './store/useSocketStore';

// Auth
const WelcomePage = lazy(() => import('./features/auth/pages/WelcomePage'));
const LoginPage = lazy(() => import('./features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('./features/auth/pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./features/auth/pages/ForgotPasswordPage'));
const LinkPhonePage = lazy(() => import('./features/auth/pages/LinkPhonePage'));

// Developer-only sandbox screens. Bundled in every build (so a tester can
// reach `/dev/map-simulator` against the deployed dev/staging frontend),
// but never linked from the user-facing UI. Safe to remove once the live
// driver pipeline is fully validated in production.
const MapSimulatorPage = lazy(() => import('./features/dev/pages/MapSimulatorPage'));

// User Onboarding
const AddCarPage = lazy(() => import('./features/user/onboarding/pages/AddCarPage'));
const MyCarsPage = lazy(() => import('./features/user/onboarding/pages/MyCarsPage'));

// User Home
const UserHomePage = lazy(() => import('./features/user/home/pages/UserHomePage'));

// User Booking
const SelectServicePage = lazy(() => import('./features/user/booking/pages/SelectServicePage'));
const SelectVariantPage = lazy(() => import('./features/user/booking/pages/SelectVariantPage'));
const SelectPickupPage = lazy(() => import('./features/user/booking/pages/SelectPickupPage'));
const SelectDurationPage = lazy(() => import('./features/user/booking/pages/SelectDurationPage'));
// Review + Confirm + Pay are merged into ConfirmAndPayPage. The
// /user/book/review route below stays as a redirect for any deep
// links / older clients still pointing at it.
const ConfirmAndPayPage = lazy(() => import('./features/user/booking/pages/ConfirmAndPayPage'));
const PaymentPage = lazy(() => import('./features/user/booking/pages/PaymentPage'));
const SearchingDriverPage = lazy(() => import('./features/user/booking/pages/SearchingDriverPage'));
const DriverAssignedPage = lazy(() => import('./features/user/booking/pages/DriverAssignedPage'));
const ScheduledConfirmedPage = lazy(
  () => import('./features/user/booking/pages/ScheduledConfirmedPage'),
);

// User Wallet
const WalletPage = lazy(() => import('./features/user/wallet/pages/WalletPage'));
// Hourly-specific flow (new)
const HourlyBookingTypePage = lazy(
  () => import('./features/user/booking/pages/hourly/HourlyBookingTypePage'),
);
const HourlyTripDetailsPage = lazy(
  () => import('./features/user/booking/pages/hourly/HourlyTripDetailsPage'),
);
const HourlySlabSelectionPage = lazy(
  () => import('./features/user/booking/pages/hourly/HourlySlabSelectionPage'),
);

// User Tracking
const DriverReachedPage = lazy(() => import('./features/user/tracking/pages/DriverReachedPage'));
const TripInProgressPage = lazy(() => import('./features/user/tracking/pages/TripInProgressPage'));
const TripCompletedPage = lazy(() => import('./features/user/tracking/pages/TripCompletedPage'));
const RatePayPage = lazy(() => import('./features/user/tracking/pages/RatePayPage'));
const InvoicePage = lazy(() => import('./features/user/tracking/pages/InvoicePage'));

// User Dashboard
const ActivityPage = lazy(() => import('./features/user/activity/pages/ActivityPage'));
const TripDetailsPage = lazy(
  () => import('./features/user/activity/pages/TripDetailsPage'),
);
const UserAccountPage = lazy(() => import('./features/user/account/pages/UserAccountPage'));
const SubscriptionsPage = lazy(() => import('./features/user/subscriptions/pages/SubscriptionsPage'));
const SubscribeCheckoutPage = lazy(
  () => import('./features/user/subscriptions/pages/SubscribeCheckoutPage'),
);
const MySubscriptionPage = lazy(() => import('./features/user/account/pages/MySubscriptionPage'));

// Driver Registration
const DriverLoginPage = lazy(() => import('./features/driver/auth/pages/DriverLoginPage'));
const DriverSignUpPage = lazy(() => import('./features/driver/registration/pages/DriverSignUpPage'));
const IdentityDetailsPage = lazy(() => import('./features/driver/registration/pages/IdentityDetailsPage'));
const DrivingCredentialsPage = lazy(() => import('./features/driver/registration/pages/DrivingCredentialsPage'));
const BankDetailsPage = lazy(() => import('./features/driver/registration/pages/BankDetailsPage'));
const SafetyProtocolPage = lazy(() => import('./features/driver/registration/pages/SafetyProtocolPage'));
const LiveVerificationPage = lazy(() => import('./features/driver/registration/pages/LiveVerificationPage'));
const TrainingPage = lazy(() => import('./features/driver/registration/pages/TrainingPage'));
const ProfileUnderReviewPage = lazy(() => import('./features/driver/registration/pages/ProfileUnderReviewPage'));

// Driver Home & Trips
const DriverHomePage = lazy(() => import('./features/driver/home/pages/DriverHomePage'));
const NewBookingRequestPage = lazy(() => import('./features/driver/trips/pages/NewBookingRequestPage'));
const NavigateToCustomerPage = lazy(() => import('./features/driver/trips/pages/NavigateToCustomerPage'));
const ArrivedStartTripPage = lazy(() => import('./features/driver/trips/pages/ArrivedStartTripPage'));
const DriverTripInProgressPage = lazy(() => import('./features/driver/trips/pages/DriverTripInProgressPage'));
const DriverTripCompletedPage = lazy(() => import('./features/driver/trips/pages/DriverTripCompletedPage'));
const PaymentStatusPage = lazy(() => import('./features/driver/trips/pages/PaymentStatusPage'));
const RateCustomerPage = lazy(() => import('./features/driver/trips/pages/RateCustomerPage'));
const MyTripsPage = lazy(() => import('./features/driver/trips/pages/MyTripsPage'));
const DriverActiveTripPage = lazy(() => import('./features/driver/trips/pages/DriverActiveTripPage'));

// Driver Dashboard
const EarningsPage = lazy(() => import('./features/driver/earnings/pages/EarningsPage'));
const DriverAccountPage = lazy(() => import('./features/driver/account/pages/DriverAccountPage'));
const DriverOrdersPage = lazy(() => import('./features/driver/account/pages/DriverOrdersPage'));
const DriverOrderDetailPage = lazy(() => import('./features/driver/account/pages/DriverOrderDetailPage'));
const DriverPaymentHistoryPage = lazy(() => import('./features/driver/account/pages/DriverPaymentHistoryPage'));

// Driver Kit
const DriverKitPage = lazy(() => import('./features/driver/kit/pages/DriverKitPage'));
const KitPurchaseHistoryPage = lazy(() => import('./features/driver/kit/pages/KitPurchaseHistoryPage'));

// Admin
const AdminLoginPage = lazy(() => import('./features/auth/pages/AdminLoginPage'));
const AccountInactive = lazy(() => import('./features/admin/pages/AccountInactive'));
const AdminHomeRedirect = lazy(() => import('./features/admin/pages/AdminHomeRedirect'));
const ManageDrivers = lazy(() => import('./features/admin/pages/ManageDrivers'));
const DriverProfilePage = lazy(() => import('./features/admin/pages/DriverProfilePage'));
const ManageUsers = lazy(() => import('./features/admin/pages/ManageUsers'));
const UserProfilePage = lazy(() => import('./features/admin/pages/UserProfilePage'));
const ManageBookings = lazy(() => import('./features/admin/pages/ManageBookings'));
const ManageEmergencyPool = lazy(() => import('./features/admin/pages/ManageEmergencyPool'));
const ManageOutstationAssignments = lazy(() => import('./features/admin/pages/ManageOutstationAssignments'));
const ManageUserSubscriptions = lazy(() => import('./features/admin/pages/ManageUserSubscriptions'));
const ManageScheduledJobs = lazy(() => import('./features/admin/pages/ManageScheduledJobs'));
const PlatformSettings = lazy(() => import('./features/admin/pages/PlatformSettings'));
const ManageTeam = lazy(() => import('./features/admin/pages/ManageTeam'));
const ManageKits = lazy(() => import('./features/admin/pages/ManageKits'));
const ManageZones = lazy(() => import('./features/admin/pages/ManageZones'));
const ManagePricing = lazy(() => import('./features/admin/pages/ManagePricing'));
const ManageRefunds = lazy(() => import('./features/admin/pages/ManageRefunds'));
const ManageRevenue = lazy(() => import('./features/admin/pages/ManageRevenue'));
const ManageSubscriptions = lazy(() => import('./features/admin/pages/ManageSubscriptions'));
const ManageSubscriptionRevenue = lazy(() => import('./features/admin/pages/ManageSubscriptionRevenue'));
const LiveDriverMap = lazy(() => import('./features/admin/pages/LiveDriverMap'));
const ManageKitOrders = lazy(() => import('./features/admin/pages/ManageKitOrders'));
const KitOrderDetailPage = lazy(() => import('./features/admin/pages/KitOrderDetailPage'));
const ManageTasks = lazy(() => import('./features/admin/pages/ManageTasks'));
const TaskActivityLogPage = lazy(() => import('./features/admin/pages/TaskActivityLogPage'));
const StaffProfilePage = lazy(() => import('./features/admin/pages/StaffProfilePage'));
const ManageAds = lazy(() => import('./features/admin/pages/ManageAds'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-dvh bg-bg">
      <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<MobileLayout />}>
          {/* ========== Auth Routes ========== */}
          <Route element={<AuthLayout />}>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/link-phone" element={<LinkPhonePage accountType="user" />} />
          </Route>

          <Route path="/driver/link-phone" element={<LinkPhonePage accountType="driver" />} />

          {/* ========== User Onboarding ========== */}
          <Route element={<UserOnboardingGuard />}>
            <Route path="/user/add-car" element={<AddCarPage />} />
            <Route path="/user/my-cars" element={<MyCarsPage />} />

            {/* ========== User Dashboard (with bottom nav) ========== */}
            <Route element={<UserDashboardLayout />}>
              <Route path="/user/home" element={<UserHomePage />} />
              <Route path="/user/book" element={<Navigate to="/user/book/service" replace />} />
              <Route path="/user/book/service" element={<SelectServicePage />} />
              <Route path="/user/activity" element={<ActivityPage />} />
              <Route path="/user/trips/:id" element={<TripDetailsPage />} />
              <Route path="/user/account" element={<UserAccountPage />} />
              <Route path="/user/account/subscription" element={<MySubscriptionPage />} />
              <Route path="/user/subscriptions" element={<SubscriptionsPage />} />
              <Route path="/user/wallet" element={<WalletPage />} />
              {/* Scheduled-ride parking lot: PENDING_ASSIGNMENT (worker hasn't
                  fired yet) and IN_EMERGENCY_POOL (admin is in the loop). */}
              <Route path="/user/book/scheduled" element={<ScheduledConfirmedPage />} />
            </Route>
          </Route>

          {/* ========== User Subscription Checkout ========== */}
          <Route path="/user/subscriptions/checkout/:planId" element={<SubscribeCheckoutPage />} />

          {/* ========== User Booking Flow ========== */}
          {/* Legacy / outstation flow */}
          <Route path="/user/book/variants" element={<SelectVariantPage />} />
          <Route path="/user/book/pickup" element={<SelectPickupPage />} />
          <Route path="/user/book/duration" element={<SelectDurationPage />} />
          {/* Review + Confirm pages have been merged. Old in-app links
              still navigate to /review — bounce them forward. */}
          <Route
            path="/user/book/review"
            element={<Navigate to="/user/book/confirm" replace />}
          />
          {/* Combined Review + Confirm + Pay screen (shared across
              hourly + outstation). */}
          <Route path="/user/book/confirm" element={<ConfirmAndPayPage />} />
          {/* Legacy Razorpay-after-accept screen, kept for fallback flows. */}
          <Route path="/user/book/payment" element={<PaymentPage />} />

          {/* New hourly flow: type → details → slab → searching → assigned */}
          <Route path="/user/book/hourly" element={<Navigate to="/user/book/hourly/type" replace />} />
          <Route path="/user/book/hourly/type" element={<HourlyBookingTypePage />} />
          <Route path="/user/book/hourly/details" element={<HourlyTripDetailsPage />} />
          <Route path="/user/book/hourly/slab" element={<HourlySlabSelectionPage />} />

          {/* Shared post-creation screens (used by both flows) */}
          <Route path="/user/book/searching" element={<SearchingDriverPage />} />
          <Route path="/user/book/assigned" element={<DriverAssignedPage />} />
          {/* Id-scoped variant so a hard refresh stays on the same
              booking — without the id, the page falls back to
              `/auth/bookings/active` which returns whichever booking
              the backend ranks highest (wrong when the user has
              multiple active bookings). */}
          <Route path="/user/book/assigned/:id" element={<DriverAssignedPage />} />

          {/* ========== User Tracking Flow ========== */}
          <Route path="/user/tracking/reached" element={<DriverReachedPage />} />
          <Route path="/user/tracking/in-progress" element={<TripInProgressPage />} />
          <Route path="/user/tracking/completed" element={<TripCompletedPage />} />
          <Route path="/user/tracking/rate" element={<RatePayPage />} />
          <Route path="/user/tracking/invoice" element={<InvoicePage />} />

          {/* ========== Driver Registration ========== */}
          <Route path="/driver/login" element={<DriverLoginPage />} />
          <Route path="/driver/signup" element={<DriverSignUpPage />} />
          <Route path="/driver/register/identity" element={<IdentityDetailsPage />} />

          <Route element={<OnboardingGuard />}>
            <Route path="/driver/register/credentials" element={<DrivingCredentialsPage />} />
            <Route path="/driver/register/bank" element={<BankDetailsPage />} />
            <Route path="/driver/register/safety" element={<SafetyProtocolPage />} />
            <Route path="/driver/register/verification" element={<LiveVerificationPage />} />
            <Route path="/driver/register/training" element={<TrainingPage />} />
            <Route path="/driver/register/approval" element={<ProfileUnderReviewPage />} />
          </Route>

          {/* ========== Protected Driver Routes ========== */}
          <Route element={<DriverGuard />}>
            {/* ========== Driver Dashboard (with bottom nav) ========== */}
            <Route element={<DriverDashboardLayout />}>
              <Route path="/driver/home" element={<DriverHomePage />} />
              <Route path="/driver/trips" element={<MyTripsPage />} />
              <Route path="/driver/earnings" element={<EarningsPage />} />
              <Route path="/driver/account" element={<DriverAccountPage />} />
            </Route>

            <Route path="/driver/kit" element={<DriverKitPage />} />
            <Route path="/driver/kit/history" element={<KitPurchaseHistoryPage />} />
            <Route path="/driver/orders" element={<DriverOrdersPage />} />
            <Route path="/driver/orders/:orderId" element={<DriverOrderDetailPage />} />
            <Route path="/driver/payments" element={<DriverPaymentHistoryPage />} />

            {/* ========== Driver Trip Flow ========== */}
            {/* Live status-driven page (the one BookingOfferModal navigates to) */}
            <Route path="/driver/trip/:id" element={<DriverActiveTripPage />} />
            {/* Legacy static mockups kept around for design reference; remove
                once Phase 5 ships the live equivalents. */}
            <Route path="/driver/trip/new-request" element={<NewBookingRequestPage />} />
            <Route path="/driver/trip/navigate" element={<NavigateToCustomerPage />} />
            <Route path="/driver/trip/arrived" element={<ArrivedStartTripPage />} />
            <Route path="/driver/trip/in-progress" element={<DriverTripInProgressPage />} />
            <Route path="/driver/trip/completed" element={<DriverTripCompletedPage />} />
            <Route path="/driver/trip/payment" element={<PaymentStatusPage />} />
            <Route path="/driver/trip/rate" element={<RateCustomerPage />} />
          </Route>

          {/* ========== Dev-only Sandbox ========== */}
          {/* Reachable directly via URL (e.g. /dev/map-simulator). Used by
              the team to verify the live-trip map's smooth animation,
              polyline, and follow-camera against a virtual driver feed
              before wiring up real drivers. */}
          <Route path="/dev/map-simulator" element={<MapSimulatorPage />} />

          {/* Catch all for mobile */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>

        {/* ========== Admin Web Panel (Outside MobileLayout) ========== */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/inactive" element={<AccountInactive />} />
        <Route element={<AdminGuard />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminHomeRedirect />} />
            <Route path="/admin/users" element={<ManageUsers />} />
            <Route path="/admin/users/:userId/profile" element={<UserProfilePage />} />
            <Route path="/admin/profile" element={<StaffProfilePage />} />
            <Route path="/admin/tasks" element={<ManageTasks />} />
            <Route element={<SuperAdminOnlyGuard />}>
              <Route path="/admin/tasks/activity" element={<TaskActivityLogPage />} />
              <Route path="/admin/settings/team" element={<ManageTeam />} />
            </Route>
            <Route path="/admin/drivers" element={<ManageDrivers />} />
            <Route path="/admin/drivers/live" element={<LiveDriverMap />} />
            <Route path="/admin/drivers/:driverId/profile" element={<DriverProfilePage />} />
            <Route path="/admin/kits" element={<Navigate to="/admin/settings/kits" replace />} />
            <Route path="/admin/kit-orders" element={<ManageKitOrders />} />
            <Route path="/admin/kit-orders/:orderId" element={<KitOrderDetailPage />} />
            <Route path="/admin/ads" element={<ManageAds />} />
            <Route path="/admin/bookings" element={<ManageBookings />} />
            <Route
              path="/admin/bookings/scheduled-jobs"
              element={<ManageScheduledJobs />}
            />
            <Route
              path="/admin/bookings/emergency-pool"
              element={<ManageEmergencyPool />}
            />
            <Route
              path="/admin/bookings/outstation-assignments"
              element={<ManageOutstationAssignments />}
            />
            <Route
              path="/admin/bookings/subscription-requests"
              element={<ManageUserSubscriptions />}
            />
            {/* Back-compat redirect for the old top-level emergency-pool URL. */}
            <Route
              path="/admin/emergency-pool"
              element={<Navigate to="/admin/bookings/emergency-pool" replace />}
            />
            <Route path="/admin/settings" element={<Navigate to="/admin/settings/platform" replace />} />
            <Route path="/admin/settings/platform" element={<PlatformSettings />} />
            <Route path="/admin/settings/kits" element={<ManageKits />} />
            <Route path="/admin/settings/zones" element={<ManageZones />} />
            <Route path="/admin/settings/pricing" element={<ManagePricing />} />
            <Route path="/admin/settings/subscriptions" element={<ManageSubscriptions />} />
            {/* Top-level /admin/revenue now forwards into the Account section
                so all revenue management lives under one roof. */}
            <Route path="/admin/revenue" element={<Navigate to="/admin/account/revenue" replace />} />
            {/* Account section */}
            <Route path="/admin/account" element={<Navigate to="/admin/account/revenue" replace />} />
            <Route path="/admin/account/refunds" element={<ManageRefunds />} />
            <Route path="/admin/account/revenue" element={<ManageRevenue />} />
            <Route path="/admin/account/subscription-revenue" element={<ManageSubscriptionRevenue />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
