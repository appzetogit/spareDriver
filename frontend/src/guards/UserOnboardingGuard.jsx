import { useState, useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useUserAuthStore from '../store/useUserAuthStore';
import api from '../utils/api';
import { Loader2 } from 'lucide-react';
import { MAX_USER_CARS } from '../utils/constants';
import { UserFcmBridge } from '../components/FcmBridge';
import { userNeedsPhone } from '../features/auth/utils/authNavigation';

// `/user/checklist` is the only page that's strictly part of the
// one-time onboarding funnel — once the user has finished it, we
// bounce them back to home if they revisit. The garage pages
// (`/user/add-car`, `/user/my-cars`) double as everyday "manage my
// vehicles" surfaces, so they must remain reachable post-onboarding
// (e.g. when the customer hits "Add car" from the booking flow).
const GARAGE_PATHS = ['/user/my-cars', '/user/add-car'];

const UserOnboardingGuard = () => {
  const { isAuthenticated, user, setAuth, onboarding, setOnboarding } = useUserAuthStore();
  const location = useLocation();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const pathWhenFetchedRef = useRef(null);

  // Status is only valid for the route it was fetched on. After navigation we must
  // wait for a fresh fetch — otherwise the first paint still has carCount: 0 and
  // incorrectly redirects to /user/add-car (useLayoutEffect runs too late).
  const statusIsStale =
    isAuthenticated && pathWhenFetchedRef.current !== location.pathname;

  const hasOptimisticCars = statusIsStale && Boolean(onboarding?.hasCar);
  const showLoader = (loading || statusIsStale) && !hasOptimisticCars;

  useEffect(() => {
    let cancelled = false;

    const checkStatus = async () => {
      if (!isAuthenticated) {
        if (!cancelled) setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await api.get('/auth/onboarding/status');
        if (cancelled) return;
        const data = res.data.data;
        setStatus(data);
        setOnboarding({
          carCount: data.carCount,
          hasCar: data.hasCar,
          hasChecklist: data.hasChecklist,
        });
        pathWhenFetchedRef.current = location.pathname;
        if (data.user) setAuth(data.user);
      } catch (err) {
        console.error('Failed to fetch onboarding status', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, setAuth, setOnboarding, location.pathname]);

  if (showLoader) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-dvh">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const path = location.pathname;

  if (userNeedsPhone(user) && path !== '/link-phone') {
    return <Navigate to="/link-phone" replace />;
  }
  const resolved = hasOptimisticCars ? { ...status, ...onboarding } : status;
  const carCount = resolved?.carCount ?? 0;
  const hasChecklist = Boolean(resolved?.hasChecklist);
  const onPath = (paths) => paths.some((p) => path.startsWith(p));

  if (hasChecklist) {
    // Completed user trying to revisit the checklist — send them home.
    // Garage paths and the dashboard remain accessible.
    if (path.startsWith('/user/checklist')) {
      return <Navigate to="/user/home" replace />;
    }
    // Already at the car cap — send them to the garage instead of an
    // add-car form that the API would reject anyway.
    if (
      carCount >= MAX_USER_CARS &&
      path.startsWith('/user/add-car')
    ) {
      return <Navigate to="/user/my-cars" replace />;
    }
    return (
      <>
        <UserFcmBridge />
        <Outlet />
      </>
    );
  }

  if (carCount === 0) {
    if (!path.includes('/user/add-car')) {
      return <Navigate to="/user/add-car" replace />;
    }
    return (
      <>
        <UserFcmBridge />
        <Outlet />
      </>
    );
  }

  if (!onPath([...GARAGE_PATHS, '/user/checklist'])) {
    return <Navigate to="/user/checklist" replace />;
  }

  if (carCount >= MAX_USER_CARS && path.includes('/user/add-car')) {
    return <Navigate to="/user/checklist" replace />;
  }

  return (
    <>
      <UserFcmBridge />
      <Outlet />
    </>
  );
};

export default UserOnboardingGuard;
