import { useState, useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useUserAuthStore from '../store/useUserAuthStore';
import api from '../utils/api';
import { Loader2 } from 'lucide-react';
import { MAX_USER_CARS } from '../utils/constants';
import { UserFcmBridge } from '../components/FcmBridge';
import { userNeedsPhone } from '../features/auth/utils/authNavigation';

// Garage pages double as everyday "manage my vehicles" surfaces, so they
// remain reachable post-onboarding (e.g. when adding a car from booking).
const GARAGE_PATHS = ['/user/my-cars', '/user/add-car'];

const UserOnboardingGuard = () => {
  const { isAuthenticated, user, setAuth, onboarding, setOnboarding } = useUserAuthStore();
  const location = useLocation();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const pathWhenFetchedRef = useRef(null);

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

  if (!onPath(GARAGE_PATHS)) {
    return <Navigate to="/user/my-cars" replace />;
  }

  if (carCount >= MAX_USER_CARS && path.includes('/user/add-car')) {
    return <Navigate to="/user/my-cars" replace />;
  }

  return (
    <>
      <UserFcmBridge />
      <Outlet />
    </>
  );
};

export default UserOnboardingGuard;
