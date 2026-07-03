import { useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { ChangePasswordWidget } from '../../../user/account/pages/UserProfilePage';

const DriverForgotPasswordPage = () => {
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh">
      <div className="px-4 pt-4 pb-2">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-5 pt-4 pb-8">
        <div className="mb-8 animate-fade-in-up">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
            <KeyRound className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Forgot Password?</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            Enter your registered mobile number and we&apos;ll send a one-time code to reset your password.
          </p>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: '0.08s' }}>
          <ChangePasswordWidget
            phoneOnly
            apiPrefix="/driver/auth/forgot-password"
            onSuccess={() => {}}
            onCancel={() => navigate('/driver/login')}
          />
        </div>
      </div>
    </div>
  );
};

export default DriverForgotPasswordPage;
