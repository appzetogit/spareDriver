import { useState, useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useUserAuthStore from '../store/useUserAuthStore';
import api from '../utils/api';
import { Loader2 } from 'lucide-react';
import { MAX_USER_CARS } from '../utils/constants';
import { userNeedsPhone, userNeedsEmail } from '../features/auth/utils/authNavigation';
import { useStoreHydration } from '../hooks/useStoreHydration';

/** Garage / account paths reachable while car checklist is incomplete. */
const GARAGE_PATHS = ['/user/my-cars', '/user/add-car', '/user/account', '/user/profile', '/user/wallet'];

const UserOnboardingGuard = () => {
  const hydrated = useStoreHydration(useUserAuthStore);
  const { isAuthenticated, user, setAuth, onboarding, setOnboarding } = useUserAuthStore();
  const location = useLocation();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const pathWhenFetchedRef = useRef(null);

  const statusIsStale =
    hydrated && isAuthenticated && pathWhenFetchedRef.current !== location.pathname;

  const hasOptimisticCars = statusIsStale && Boolean(onboarding?.hasCar);
  const showLoader =
    !hydrated || ((loading || statusIsStale) && !hasOptimisticCars);

  useEffect(() => {
    let cancelled = false;

    const checkStatus = async () => {
      if (!hydrated) return;

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
  }, [hydrated, isAuthenticated, setAuth, setOnboarding, location.pathname]);

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

  if (userNeedsEmail(user) && path !== '/user/verify-email') {
    return <Navigate to="/user/verify-email" replace />;
  }

  // Email already verified — don't linger on the verify screen.
  if (!userNeedsEmail(user) && path === '/user/verify-email') {
    const carCountOptimistic = status?.carCount ?? onboarding?.carCount ?? 0;
    const checklistOk = Boolean(status?.hasChecklist ?? onboarding?.hasChecklist);
    if (carCountOptimistic === 0) {
      return <Navigate to="/user/add-car" replace />;
    }
    if (!checklistOk) {
      return <Navigate to="/user/my-cars" replace />;
    }
    return <Navigate to="/user/home" replace />;
  }

  const resolved = hasOptimisticCars ? { ...status, ...onboarding } : status;
  const carCount = resolved?.carCount ?? 0;
  const hasChecklist = Boolean(resolved?.hasChecklist);
  const onPath = (paths) => paths.some((p) => path.startsWith(p));

  if (hasChecklist) {
    if (carCount >= MAX_USER_CARS && path.startsWith('/user/add-car')) {
      return <Navigate to="/user/my-cars" replace />;
    }
    return <Outlet />;
  }

  // No cars yet → only the add-car flow.
  if (carCount === 0) {
    if (!path.includes('/user/add-car')) {
      return <Navigate to="/user/add-car" replace />;
    }
    return <Outlet />;
  }

  // Has cars but checklist incomplete (e.g. admin added a new question).
  // Send them to edit existing cars — never bounce them through add-car again.
  if (path.startsWith('/user/add-car') && !location.state?.editCar) {
    return <Navigate to="/user/my-cars" replace />;
  }

  if (!onPath(GARAGE_PATHS)) {
    return <Navigate to="/user/my-cars" replace />;
  }

  if (carCount >= MAX_USER_CARS && path.includes('/user/add-car') && !location.state?.editCar) {
    return <Navigate to="/user/my-cars" replace />;
  }

  return <Outlet />;
};

export default UserOnboardingGuard;
