import { useState, useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useUserAuthStore from '../store/useUserAuthStore';
import api from '../utils/api';
import { MAX_USER_CARS } from '../utils/constants';
import { userNeedsPhone, userNeedsEmail } from '../features/auth/utils/authNavigation';
import { useStoreHydration } from '../hooks/useStoreHydration';
import { BootstrapShellSkeleton } from '../components/skeleton/SectionSkeletons';

/** Garage / account paths reachable while car checklist is incomplete. */
const GARAGE_PATHS = ['/user/my-cars', '/user/add-car', '/user/account', '/user/profile', '/user/wallet'];

function hasUsableOnboarding(onboarding) {
  if (!onboarding || typeof onboarding !== 'object') return false;
  return (
    typeof onboarding.carCount === 'number' ||
    typeof onboarding.hasCar === 'boolean' ||
    typeof onboarding.hasChecklist === 'boolean'
  );
}

const UserOnboardingGuard = () => {
  const hydrated = useStoreHydration(useUserAuthStore);
  const { isAuthenticated, user, setAuth, onboarding, setOnboarding } = useUserAuthStore();
  const location = useLocation();
  const [status, setStatus] = useState(() => (hasUsableOnboarding(onboarding) ? onboarding : null));
  const [loading, setLoading] = useState(() => !hasUsableOnboarding(onboarding));
  const fetchedOnceRef = useRef(false);

  // Bootstrap already hits `/auth/onboarding/status`. Reuse that snapshot so
  // every in-app navigation does not block on a duplicate full-page fetch.
  useEffect(() => {
    let cancelled = false;

    const checkStatus = async () => {
      if (!hydrated) return;

      if (!isAuthenticated) {
        fetchedOnceRef.current = false;
        if (!cancelled) setLoading(false);
        return;
      }

      if (hasUsableOnboarding(onboarding) && !fetchedOnceRef.current) {
        fetchedOnceRef.current = true;
        if (!cancelled) {
          setStatus((prev) => prev ?? onboarding);
          setLoading(false);
        }
        return;
      }

      if (fetchedOnceRef.current) {
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
        fetchedOnceRef.current = true;
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
  }, [hydrated, isAuthenticated, onboarding, setAuth, setOnboarding]);

  // Keep local status in sync when AddCar / MyCars mutate the auth store.
  useEffect(() => {
    if (!hasUsableOnboarding(onboarding)) return;
    setStatus((prev) => ({ ...(prev || {}), ...onboarding }));
  }, [onboarding]);

  const resolved = status ?? (hasUsableOnboarding(onboarding) ? onboarding : null);
  const canRenderOptimistically = Boolean(resolved) || !isAuthenticated;

  // Only block the tree when we truly have nothing to decide redirects with.
  if (!hydrated || (loading && !canRenderOptimistically)) {
    return <BootstrapShellSkeleton />;
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
    const carCountOptimistic = resolved?.carCount ?? 0;
    const checklistOk = Boolean(resolved?.hasChecklist);
    if (carCountOptimistic === 0) {
      return <Navigate to="/user/add-car" replace />;
    }
    if (!checklistOk) {
      return <Navigate to="/user/my-cars" replace />;
    }
    return <Navigate to="/user/home" replace />;
  }

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
