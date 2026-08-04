import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import StepIndicator from '../../../../components/StepIndicator';
import Modal from '../../../../components/Modal';
import OtpResendRow from '../../../../components/OtpResendRow';
import { ArrowLeft, User, Phone, Lock } from 'lucide-react';
import api from '../../../../utils/api';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { driverNeedsPhone, navigateDriverAfterAuth } from '../../../auth/utils/authNavigation';
import { withFcmAuthPayload } from '../../../../utils/fcmTokenClient';
import { useOtpResendCooldown } from '../../../../hooks/useOtpResendCooldown';

import { DRIVER_ONBOARDING_STEPS } from '../../../../utils/driverOnboarding';

const IdentityDetailsPage = () => {
  const navigate = useNavigate();
  const { driver, isAuthenticated, setAuth } = useDriverAuthStore();
  const otpCooldown = useOtpResendCooldown();
  
  useEffect(() => {
    if (!isAuthenticated || !driver) return;
    if (driverNeedsPhone(driver)) {
      navigate('/driver/link-phone', { replace: true });
      return;
    }
    if (driver.onboardingStep >= 1) {
      navigateDriverAfterAuth(navigate, driver);
    }
  }, [isAuthenticated, driver?.id, driver?.phone, driver?.onboardingStep, driver?.approvalStatus, navigate]);

  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  const handleSendOtp = async () => {
    try {
      setLoading(true);
      setError('');
      await api.post('/driver/auth/send-otp', { phone: form.phone });
      setShowOtpModal(true);
      setOtp('');
      otpCooldown.start();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    try {
      setLoading(true);
      setError('');
      // This endpoint verifies OTP and registers the user
      const res = await api.post('/driver/auth/verify-otp', await withFcmAuthPayload({
        phone: form.phone,
        otp,
        name: form.name,
        password: form.password,
      }));

      setAuth(res.data.data.driver);
      
      setIsPhoneVerified(true);
      setShowOtpModal(false);
      otpCooldown.reset();
      navigate('/driver/register/credentials');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (isPhoneVerified) {
      navigate('/driver/register/credentials');
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh">
      <div className="px-4 pt-4">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
      <div className="px-4 sm:px-6 pt-2 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">Identity Legal</h1>
          <span className="text-xs text-text-muted bg-bg px-2 py-1 rounded-full">1/5</span>
        </div>
        <StepIndicator steps={DRIVER_ONBOARDING_STEPS} currentStep={1} />
        <p className="text-xs text-text-muted mt-3">Secure account creation</p>
      </div>
      
      <div className="flex-1 flex flex-col px-4 sm:px-6 pb-8">
        <div className="flex-1 space-y-4 animate-fade-in-up">
          {/*
          <GoogleSignInButton
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            text="signup_with"
            disabled={googleLoading || isPhoneVerified}
          />
          <AuthDivider label="or register with phone" />
          */}
          <Input label="Full name" placeholder="As per Govt. ID" value={form.name} onChange={handleChange('name')} icon={User} />
          <Input label="Password" type="password" placeholder="Min 6 characters" value={form.password} onChange={handleChange('password')} icon={Lock} />
          
          <div>
            <label className="text-sm font-medium text-text mb-1.5 block">Mobile number</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary font-semibold border-r pr-2 border-border flex items-center gap-1.5 z-10 pointer-events-none">
                <Phone className="w-4 h-4 text-text-muted" />
                <span>+91</span>
              </div>
              <Input
                type="tel"
                placeholder="10-digit number"
                value={form.phone}
                onChange={handleChange('phone')}
                maxLength={10}
                disabled={isPhoneVerified}
                className="pl-[4.5rem]"
                containerClassName="w-full"
              />
              {form.phone.length === 10 && !isPhoneVerified && (
                <button 
                  type="button"
                  onClick={handleSendOtp}
                  disabled={loading || !form.name || !form.password}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-primary text-text text-xs font-bold rounded-lg disabled:opacity-50 z-10"
                >
                  {loading ? 'Sending...' : 'Verify'}
                </button>
              )}
              {isPhoneVerified && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-success text-xs font-bold z-10">
                  ✓ Verified
                </span>
              )}
            </div>
            {error && <p className="text-danger text-xs mt-1">{error}</p>}
          </div>

        </div>
        
        <Button 
          fullWidth 
          onClick={handleContinue} 
          disabled={!isPhoneVerified}
          className="mt-6 rounded-full py-4 text-base font-bold shadow-lg shadow-primary/20"
        >
          {isPhoneVerified ? 'CONTINUE' : 'VERIFY PHONE TO CONTINUE'}
        </Button>
      </div>

      {/* OTP Modal */}
      <Modal isOpen={showOtpModal} onClose={() => setShowOtpModal(false)} title="Enter OTP">
        <div className="p-2">
          <p className="text-sm text-text-secondary mb-4">We sent a 6-digit code to +91 {form.phone}</p>
          <Input 
            type="text" 
            placeholder="000000" 
            value={otp} 
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} 
            maxLength={6} 
            className="text-center text-xl tracking-widest font-mono"
          />
          {error && <p className="text-danger text-xs mt-2 text-center">{error}</p>}
          <Button 
            fullWidth 
            className="mt-6" 
            onClick={handleVerifyOtp} 
            disabled={otp.length !== 6 || loading}
          >
            {loading ? 'Verifying...' : 'Verify & Create Account'}
          </Button>
          <OtpResendRow
            className="mt-4"
            canResend={otpCooldown.canResend}
            remaining={otpCooldown.remaining}
            onResend={handleSendOtp}
            loading={loading}
          />
        </div>
      </Modal>
    </div>
  );
};

export default IdentityDetailsPage;
