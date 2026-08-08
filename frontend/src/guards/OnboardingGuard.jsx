import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { driverNeedsPhone } from '../features/auth/utils/authNavigation';
import { isApplicationSubmitted } from '../utils/driverOnboarding';
import { useStoreHydration } from '../hooks/useStoreHydration';
import { BootstrapShellSkeleton } from '../components/skeleton/SectionSkeletons';

const OnboardingGuard = () => {
  const hydrated = useStoreHydration(useDriverAuthStore);
  const { isAuthenticated, driver } = useDriverAuthStore();
  const location = useLocation();
  const path = location.pathname;

  if (!hydrated) {
    return <BootstrapShellSkeleton />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/driver/login" replace />;
  }

  if (driverNeedsPhone(driver)) {
    return <Navigate to="/driver/link-phone" replace />;
  }

  if (driver?.approvalStatus === 'suspended') {
    return <Navigate to="/driver/suspended" replace />;
  }

  const step = driver?.onboardingStep ?? 0;
  const submitted = isApplicationSubmitted(driver);
  const revising = driver?.approvalStatus === 'rejected' && Boolean(driver?.revisionInProgress);

  // Training is post-approval only
  if (path.includes('/register/training')) {
    if (driver?.approvalStatus === 'approved') {
      return <Outlet />;
    }
    if (driver?.approvalStatus === 'rejected' || driver?.approvalStatus === 'under_review' || submitted) {
      return <Navigate to="/driver/register/approval" replace />;
    }
    return <Navigate to="/driver/register/verification" replace />;
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

  // Rejected: show reasons until they start revising; then allow onboarding again
  if (driver?.approvalStatus === 'rejected' && !revising) {
    if (!path.includes('/register/approval')) {
      return <Navigate to="/driver/register/approval" replace />;
    }
    return <Outlet />;
  }

  // While revising, allow moving freely across steps (no lock to step 5)
  if (revising) {
    if (path.includes('/register/approval')) {
      return <Navigate to="/driver/register/credentials" replace />;
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
  if (path.includes('/register/approval')) {
    if (['under_review', 'rejected'].includes(driver?.approvalStatus)) {
      return <Outlet />;
    }
    return <Navigate to="/driver/register/verification" replace />;
  }

  return <Outlet />;
};

export default OnboardingGuard;
