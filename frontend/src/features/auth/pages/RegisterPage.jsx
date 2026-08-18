import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import OtpResendRow from '../../../components/OtpResendRow';
import { User, Phone, Lock, Mail, ArrowLeft } from 'lucide-react';
import api from '../../../utils/api';
import useUserAuthStore from '../../../store/useUserAuthStore';
import { navigateUserAfterAuth } from '../utils/authNavigation';
import { withFcmAuthPayload } from '../../../utils/fcmTokenClient';
import { useOtpResendCooldown } from '../../../hooks/useOtpResendCooldown';
import { isValidUserEmail, normalizeUserEmail, sanitizeEmailInput } from '../../../utils/email';

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
      <CheckCircle2 className="w-4 h-4" />
      Verified
    </span>
  );
}

const RegisterPage = () => {
  const navigate = useNavigate();
  const setAuth = useUserAuthStore((state) => state.setAuth);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    alternatePhone: '',
  });
  const [phoneOtp, setPhoneOtp] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneAlreadyRegistered, setPhoneAlreadyRegistered] = useState(false);
  const phoneCooldown = useOtpResendCooldown();
  const emailCooldown = useOtpResendCooldown();

  const handleChange = (field) => (e) => {
    const raw = e.target.value;
    const value = field === 'email' ? sanitizeEmailInput(raw) : raw;
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
    if (phoneAlreadyRegistered) setPhoneAlreadyRegistered(false);

    if (field === 'phone') {
      setPhoneVerified(false);
      setPhoneOtpSent(false);
      setPhoneOtp('');
      phoneCooldown.reset();
      setEmailVerified(false);
      setEmailOtpSent(false);
      setEmailOtp('');
      emailCooldown.reset();
    }
    if (field === 'email') {
      setEmailVerified(false);
      setEmailOtpSent(false);
      setEmailOtp('');
      emailCooldown.reset();
    }
  };

  const handleSendPhoneOtp = async () => {
    if (!/^[0-9]{10}$/.test(formData.phone)) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setPhoneLoading(true);
    setError('');
    setPhoneAlreadyRegistered(false);
    try {
      await api.post('/auth/send-otp', { phone: formData.phone });
      setPhoneOtpSent(true);
      setPhoneOtp('');
      phoneCooldown.start();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to send OTP';
      setError(message);
      if (message.toLowerCase().includes('already registered')) {
        setPhoneAlreadyRegistered(true);
      }
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (phoneOtp.length !== 6) return;
    setPhoneLoading(true);
    setError('');
    try {
      await api.post('/auth/register/verify-phone', {
        phone: formData.phone,
        otp: phoneOtp,
      });
      setPhoneVerified(true);
      setPhoneOtpSent(false);
      setPhoneOtp('');
      phoneCooldown.reset();
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid mobile OTP');
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleSendEmailOtp = async () => {
    const email = normalizeUserEmail(formData.email);
    if (!isValidUserEmail(email)) {
      setError('Enter a valid email address (example: name@gmail.com)');
      return;
    }
    if (!phoneVerified) {
      setError('Verify your mobile number first');
      return;
    }
    setEmailLoading(true);
    setError('');
    try {
      await api.post('/auth/register/email/send-otp', {
        phone: formData.phone,
        email,
      });
      setEmailOtpSent(true);
      setEmailOtp('');
      emailCooldown.start();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send email code');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (emailOtp.length !== 6) return;
    setEmailLoading(true);
    setError('');
    try {
      await api.post('/auth/register/email/verify', {
        phone: formData.phone,
        email: normalizeUserEmail(formData.email),
        otp: emailOtp,
      });
      setEmailVerified(true);
      setEmailOtpSent(false);
      setEmailOtp('');
      emailCooldown.reset();
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email OTP');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleContinue = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!phoneVerified || !emailVerified) {
      setError('Verify mobile and email before continuing');
      return;
    }
    const alternatePhone = formData.alternatePhone.trim();
    if (alternatePhone) {
      if (!/^[0-9]{10}$/.test(alternatePhone)) {
        setError('Emergency / alternate mobile must be a valid 10-digit number');
        return;
      }
      if (alternatePhone === formData.phone) {
        setError('Emergency / alternate mobile must be different from your primary number');
        return;
      }
    }

    setSubmitLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/register/complete', await withFcmAuthPayload({
        name: formData.name.trim(),
        phone: formData.phone,
        email: normalizeUserEmail(formData.email),
        password: formData.password,
        ...(alternatePhone ? { alternatePhone } : {}),
      }));
      const { user } = res.data.data;
      setAuth(user);
      navigateUserAfterAuth(navigate, user);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create account');
    } finally {
      setSubmitLoading(false);
    }
  };

  const canVerifyPhone = /^[0-9]{10}$/.test(formData.phone) && !phoneVerified;
  const emailLooksInvalid = formData.email.length > 0 && !isValidUserEmail(formData.email);
  const canVerifyEmail =
    phoneVerified &&
    isValidUserEmail(formData.email) &&
    !emailVerified;

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh">
      <div className="px-4 pt-4">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-text" />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-4 sm:px-6 pt-4 pb-8">
        <div className="mb-6 animate-fade-in-up">
          <h1 className="text-2xl font-bold text-text mb-1">Create Account</h1>
          <p className="text-text-secondary text-sm">Verify mobile and email, then continue</p>
        </div>

        <form onSubmit={handleContinue} className="space-y-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <Input
            label="Full Name"
            placeholder="Enter your full name"
            value={formData.name}
            onChange={handleChange('name')}
            icon={User}
            required
          />

          <Input
            label="Password"
            type="password"
            placeholder="Min 6 characters"
            value={formData.password}
            onChange={handleChange('password')}
            icon={Lock}
            required
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-text">Mobile Number</label>
              {phoneVerified && <VerifiedBadge />}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-grow flex-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary font-semibold border-r pr-2 border-border flex items-center gap-1.5 z-10 pointer-events-none">
                  <Phone className="w-4 h-4 text-text-muted" />
                  <span>+91</span>
                </div>
                <Input
                  type="tel"
                  placeholder="10-digit number"
                  value={formData.phone}
                  onChange={handleChange('phone')}
                  maxLength={10}
                  disabled={phoneVerified}
                  required
                  className="pl-[4.5rem]"
                  containerClassName="w-full"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="md"
                className="shrink-0 h-12 px-3 sm:px-4 text-sm font-semibold rounded-xl"
                disabled={!canVerifyPhone || phoneLoading}
                loading={phoneLoading && !phoneOtpSent}
                onClick={phoneOtpSent ? handleVerifyPhoneOtp : handleSendPhoneOtp}
              >
                {phoneVerified ? 'Done' : phoneOtpSent ? 'Confirm' : 'Verify'}
              </Button>
            </div>
            {phoneOtpSent && !phoneVerified && (
              <div className="mt-2 space-y-2 animate-fade-in">
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter 6-digit mobile OTP"
                  value={phoneOtp}
                  onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                />
                <OtpResendRow
                  canResend={phoneCooldown.canResend}
                  remaining={phoneCooldown.remaining}
                  onResend={handleSendPhoneOtp}
                  loading={phoneLoading}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-text">Email Address</label>
              {emailVerified && <VerifiedBadge />}
            </div>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange('email')}
                icon={Mail}
                autoComplete="email"
                maxLength={254}
                disabled={emailVerified || !phoneVerified}
                required
                containerClassName="flex-grow flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="md"
                className="shrink-0 h-12 px-3 sm:px-4 text-sm font-semibold rounded-xl"
                disabled={!canVerifyEmail || emailLoading}
                loading={emailLoading && !emailOtpSent}
                onClick={emailOtpSent ? handleVerifyEmailOtp : handleSendEmailOtp}
              >
                {emailVerified ? 'Done' : emailOtpSent ? 'Confirm' : 'Verify'}
              </Button>
            </div>
            {!phoneVerified && (
              <p className="text-xs text-text-muted">Verify mobile number first to enable email verification.</p>
            )}
            {phoneVerified && emailLooksInvalid && (
              <p className="text-xs text-rose-600">Enter a valid email address (example: name@gmail.com)</p>
            )}
            {emailOtpSent && !emailVerified && (
              <div className="mt-2 space-y-2 animate-fade-in">
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter 6-digit email OTP"
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                />
                <OtpResendRow
                  canResend={emailCooldown.canResend}
                  remaining={emailCooldown.remaining}
                  onResend={handleSendEmailOtp}
                  loading={emailLoading}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text">
              Emergency Contact / Alternative Mobile{' '}
              <span className="font-normal text-text-muted">(optional)</span>
            </label>
            <div className="relative">
              <div className="absolute left-3 top-0 h-12 text-sm text-text-secondary font-semibold border-r pr-2 border-border flex items-center gap-1.5 z-10 pointer-events-none">
                <Phone className="w-4 h-4 text-text-muted" />
                <span>+91</span>
              </div>
              <Input
                type="tel"
                placeholder="10-digit alternate number"
                value={formData.alternatePhone}
                onChange={handleChange('alternatePhone')}
                maxLength={10}
                className="pl-[4.5rem]"
                containerClassName="w-full"
              />
            </div>
            <p className="text-xs text-text-muted">
              Used if we cannot reach you on your primary number
            </p>
          </div>

          {error && <p className="text-danger text-xs font-medium">{error}</p>}

          {phoneAlreadyRegistered && (
            <p className="text-sm text-text-secondary">
              Already have an account?{' '}
              <Link to="/login" className="text-primary font-semibold hover:underline">
                Login here
              </Link>
            </p>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              fullWidth
              loading={submitLoading}
              disabled={!phoneVerified || !emailVerified}
              className="rounded-full py-4 text-base font-bold shadow-lg shadow-primary/20"
            >
              Continue
            </Button>
          </div>
        </form>

        <p className="text-center text-sm text-text-secondary mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-semibold hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
