import { Navigate, Outlet } from 'react-router-dom';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { isApplicationSubmitted } from '../utils/driverOnboarding';
import { useStoreHydration } from '../hooks/useStoreHydration';
import { DriverLocationBridge } from '../components/DriverLocationBridge';
import { BootstrapShellSkeleton } from '../components/skeleton/SectionSkeletons';

const DriverGuard = () => {
  const hydrated = useStoreHydration(useDriverAuthStore);
  const { isAuthenticated, driver } = useDriverAuthStore();

  if (!hydrated) {
    return <BootstrapShellSkeleton />;
  }

  if (!isAuthenticated || !driver) {
    return <Navigate to="/driver/login" replace />;
  }

  if (driver.approvalStatus === 'suspended') {
    return <Navigate to="/driver/suspended" replace />;
  }

  const revising = driver.approvalStatus === 'rejected' && Boolean(driver.revisionInProgress);

  if (driver.approvalStatus === 'under_review') {
    return <Navigate to="/driver/register/approval" replace />;
  }

  if (driver.approvalStatus === 'rejected' && !revising) {
    return <Navigate to="/driver/register/approval" replace />;
  }

  if (revising) {
    const step = driver.onboardingStep ?? 0;
    if (step <= 1) return <Navigate to="/driver/register/credentials" replace />;
    if (step === 2) return <Navigate to="/driver/register/bank" replace />;
    if (step === 3) return <Navigate to="/driver/register/safety" replace />;
    if (step >= 4 && step < 6) return <Navigate to="/driver/register/verification" replace />;
    return <Navigate to="/driver/register/credentials" replace />;
  }

  const step = driver.onboardingStep ?? 0;
  const submitted = isApplicationSubmitted(driver);

  if (!submitted && step < 6 && driver.approvalStatus !== 'approved') {
    if (step < 1) return <Navigate to="/driver/register/identity" replace />;
    if (step === 1) return <Navigate to="/driver/register/credentials" replace />;
    if (step === 2) return <Navigate to="/driver/register/bank" replace />;
    if (step === 3) return <Navigate to="/driver/register/safety" replace />;
    if (step >= 4) return <Navigate to="/driver/register/verification" replace />;
    return <Navigate to="/driver/register/credentials" replace />;
  }

  if (driver.approvalStatus !== 'approved') {
    return <Navigate to="/driver/register/approval" replace />;
  }

  return (
    <>
      <DriverLocationBridge />
      <Outlet />
    </>
  );
};

export default DriverGuard;
