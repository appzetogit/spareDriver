import { Navigate, Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { isApplicationSubmitted } from '../utils/driverOnboarding';
import { useStoreHydration } from '../hooks/useStoreHydration';
import { DriverLocationBridge } from '../components/DriverLocationBridge';

const DriverGuard = () => {
  const hydrated = useStoreHydration(useDriverAuthStore);
  const { isAuthenticated, driver } = useDriverAuthStore();

  if (!hydrated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-dvh">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !driver) {
    return <Navigate to="/driver/login" replace />;
  }

  if (driver.approvalStatus === 'rejected' || driver.approvalStatus === 'under_review') {
    return <Navigate to="/driver/register/approval" replace />;
  }

  const step = driver.onboardingStep ?? 0;
  const submitted = isApplicationSubmitted(driver);

  if (!submitted && step < 6 && driver.approvalStatus !== 'approved') {
    if (step < 1) return <Navigate to="/driver/register/identity" replace />;
    if (step === 1) return <Navigate to="/driver/register/credentials" replace />;
    if (step === 2) return <Navigate to="/driver/register/bank" replace />;
    if (step === 3) return <Navigate to="/driver/register/safety" replace />;
    if (step === 4) return <Navigate to="/driver/register/verification" replace />;
    if (step === 5) return <Navigate to="/driver/register/training" replace />;
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
