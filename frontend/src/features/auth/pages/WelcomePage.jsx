import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../components/Button';
import useUserAuthStore from '../../../store/useUserAuthStore';
import { navigateUserAfterAuth } from '../utils/authNavigation';
import { useStoreHydration } from '../../../hooks/useStoreHydration';
import { BootstrapShellSkeleton } from '../../../components/skeleton/SectionSkeletons';
import { usePrimaryBleedBg } from '../../../hooks/usePrimaryBleedBg';

const WelcomePage = () => {
  const navigate = useNavigate();
  const hydrated = useStoreHydration(useUserAuthStore);
  const { user, isAuthenticated } = useUserAuthStore();
  usePrimaryBleedBg();

  useEffect(() => {
    if (!hydrated || !isAuthenticated || !user) return;
    navigateUserAfterAuth(navigate, user);
  }, [hydrated, isAuthenticated, user, navigate]);

  if (!hydrated || (isAuthenticated && user)) {
    return <BootstrapShellSkeleton />;
  }

  return (
    <div className="flex flex-col bg-primary min-h-dvh relative">
      <div className="flex-1 flex flex-col items-center justify-center px-8 relative z-10">
        <div
          className="text-center m-4 mt-8 animate-fade-in-up w-full max-w-[440px] mx-auto"
          style={{ animationDelay: '0.1s' }}
        >
          <img
            src="/images/black-logo.png"
            alt="SpareDriver Logo"
            className="w-full max-h-[160px] object-contain"
          />
        </div>
        <p className="text-black text-[28px] font-semibold text-center">
          <span>Your Car</span>
          <br /> Our Professional Driver
        </p>
        <p className="text-black text-md font-semibold mt-4 text-center">
          Safe . Verified . On-Time
        </p>
        <div
          className="flex-1 flex items-center justify-center w-full max-w-xs mx-auto animate-fade-in-up"
          style={{ animationDelay: '0.15s' }}
        >
          <img
            src="/images/car-driver.png"
            alt="Driver with car"
            className="w-full h-auto object-contain drop-shadow-xl"
          />
        </div>
      </div>

      <div
        className="px-6 pb-12 space-y-3 relative z-10 animate-fade-in-up"
        style={{ animationDelay: '0.4s' }}
      >
        <Button
          variant="dark"
          fullWidth
          onClick={() => navigate('/login')}
          className="rounded-full py-4 text-base font-bold"
        >
          Login
        </Button>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => navigate('/register')}
          className="rounded-full py-4 font-bold"
        >
          Sign Up
        </Button>
      </div>
    </div>
  );
};

export default WelcomePage;
