import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { driverNeedsPhone } from '../features/auth/utils/authNavigation';
import { isApplicationSubmitted } from '../utils/driverOnboarding';
import { useStoreHydration } from '../hooks/useStoreHydration';

const OnboardingGuard = () => {
  const hydrated = useStoreHydration(useDriverAuthStore);
  const { isAuthenticated, driver } = useDriverAuthStore();
  const location = useLocation();
  const path = location.pathname;

  if (!hydrated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-dvh">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/driver/login" replace />;
  }

  if (driverNeedsPhone(driver)) {
    return <Navigate to="/driver/link-phone" replace />;
  }

  const step = driver?.onboardingStep ?? 0;
  const submitted = isApplicationSubmitted(driver);

  if (
    driver?.approvalStatus === 'approved' &&
    path.includes('/register/training')
  ) {
    return <Outlet />;
  }

  if (driver?.approvalStatus === 'approved' && (step >= 6 || submitted)) {
    return <Navigate to="/driver/home" replace />;
  }

  if (submitted || driver?.approvalStatus === 'under_review') {
    if (!path.includes('/register/approval')) {
      return <Navigate to="/driver/register/approval" replace />;
    }
    return <Outlet />;
  }

  // Rejected: always show rejection reason first; onboarding only after "Update application"
  if (driver?.approvalStatus === 'rejected') {
    if (!path.includes('/register/approval')) {
      return <Navigate to="/driver/register/approval" replace />;
    }
    return <Outlet />;
  }

  if (path.includes('/register/credentials') && step < 1) {
    return <Navigate to="/driver/register/identity" replace />;
  }
  if (path.includes('/register/bank') && step < 2) {
    return <Navigate to="/driver/register/credentials" replace />;
  }
  if (path.includes('/register/safety') && step < 3) {
    return <Navigate to="/driver/register/bank" replace />;
  }
  if (path.includes('/register/verification') && step < 4) {
    return <Navigate to="/driver/register/safety" replace />;
  }
  if (path.includes('/register/training') && step < 5) {
    return <Navigate to="/driver/register/verification" replace />;
  }
  if (path.includes('/register/approval')) {
    if (['under_review', 'rejected'].includes(driver?.approvalStatus)) {
      return <Outlet />;
    }
    return <Navigate to="/driver/register/training" replace />;
  }

  return <Outlet />;
};

export default OnboardingGuard;
