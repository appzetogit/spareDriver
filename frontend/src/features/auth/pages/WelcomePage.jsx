import { useNavigate } from 'react-router-dom';
import Button from '../../../components/Button';

const WelcomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col bg-white min-h-dvh relative">
      <div className="flex-1 flex flex-col items-center justify-center px-8  relative z-10">
        <div className="text-center m-4 mt-8 animate-fade-in-up w-full max-w-[400px] mx-auto" style={{ animationDelay: '0.1s' }}>
          <img src="/images/logo-white.png" alt="SpareDriver Logo" className="w-full max-h-[100px] object-contain" />
        </div>
        <p className="text-black text-[28px] font-semibold  text-center"><span>Your Car</span><br /> Our Professional Driver</p>
        <p className="text-black text-md font-semibold mt-4 text-center">Safe . Verified . On-Time</p>
        <div className="flex-1 flex items-center justify-center w-full max-w-xs mx-auto animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <img src="/images/car-driver.png" alt="Driver with car" className="w-full h-auto object-contain drop-shadow-xl" />
        </div>
      </div>

      <div className="px-6 pb-12 space-y-4 relative z-10 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
        <Button fullWidth onClick={() => navigate('/login')} className="rounded-full py-4 text-base font-bold shadow-lg shadow-primary/20">
          Login
        </Button>
        <Button variant="outline" fullWidth onClick={() => navigate('/register')} className="rounded-full py-4 bg-black text-black font-bold border-gray-200 text-text hover:bg-gray-100 text-black">
          Sign Up
        </Button>
        {/*
        <AuthDivider />
        <div className="w-full flex justify-center items-center items-center">
          <GoogleSignInButton
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            disabled={googleLoading}
          />
        </div>
        */}
      </div>
    </div>
  );
};

export default WelcomePage;
