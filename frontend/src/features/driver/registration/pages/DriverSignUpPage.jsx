import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Button from '../../../../components/Button';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { navigateDriverAfterAuth } from '../../../auth/utils/authNavigation';
import { useStoreHydration } from '../../../../hooks/useStoreHydration';

const DriverSignUpPage = () => {
  const navigate = useNavigate();
  const hydrated = useStoreHydration(useDriverAuthStore);
  const { isAuthenticated, driver } = useDriverAuthStore();

  useEffect(() => {
    if (!hydrated || !isAuthenticated || !driver) return;
    navigateDriverAfterAuth(navigate, driver);
  }, [hydrated, isAuthenticated, driver, navigate]);

  if (!hydrated || (isAuthenticated && driver)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-primary min-h-dvh">
        <Loader2 className="w-8 h-8 text-text animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-primary min-h-dvh relative">
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-12 pb-6">
        <div className="text-center mb-8 animate-fade-in-up w-full max-w-[440px] mx-auto">
          <img
            src="/images/black-logo.png"
            alt="SpareDriver Logo"
            className="w-full max-h-[160px] object-contain"
          />
        </div>
        <p className="text-black text-[20px] font-medium mt-4">Drive. Earn. Grow.</p>

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
        className="px-6 pb-12 space-y-3 animate-fade-in-up"
        style={{ animationDelay: '0.3s' }}
      >
        <Button
          variant="dark"
          fullWidth
          onClick={() => navigate('/driver/register/identity')}
          className="rounded-full py-4 text-base font-bold"
        >
          Sign Up
        </Button>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => navigate('/driver/login')}
          className="rounded-full py-4 font-bold"
        >
          Login
        </Button>
      </div>
    </div>
  );
};

export default DriverSignUpPage;
