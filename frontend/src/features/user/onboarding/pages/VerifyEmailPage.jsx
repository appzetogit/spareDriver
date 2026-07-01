import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import Modal from '../../../../components/Modal';
import api from '../../../../utils/api';
import useUserAuthStore from '../../../../store/useUserAuthStore';
import { userNeedsEmail } from '../../../auth/utils/authNavigation';

function isRealEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return normalized && !normalized.endsWith('@phone.sparedriver.local');
}

const VerifyEmailPage = () => {
  const navigate = useNavigate();
  const redirectedRef = useRef(false);
  const { user, isAuthenticated, setAuth } = useUserAuthStore();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailLocked, setEmailLocked] = useState(false);

  useEffect(() => {
    if (user && isRealEmail(user.email)) {
      setEmail(user.email);
      setEmailLocked(true);
    }
  }, [user]);

  useEffect(() => {
    if (redirectedRef.current) return;

    if (!isAuthenticated) {
      redirectedRef.current = true;
      navigate('/login', { replace: true });
      return;
    }

    if (!userNeedsEmail(user)) {
      redirectedRef.current = true;
      navigate('/user/add-car', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleSendOtp = async () => {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/onboarding/email/send-otp', { email: trimmed });
      setShowOtpModal(true);
      toast.success('Verification code sent');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/onboarding/email/verify', {
        email: email.trim(),
        otp,
      });
      const verifiedUser = res.data?.data?.user;
      if (verifiedUser) setAuth(verifiedUser);
      setShowOtpModal(false);
      toast.success('Email verified');
      navigate('/user/add-car', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh">
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          className="p-2 -ml-2 rounded-xl hover:bg-gray-100"
        >
          <ArrowLeft className="w-5 h-5 text-text" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-text">Verify your email</h1>
          <p className="text-xs text-text-muted">
            Confirm your email to complete your profile. You can also finish this step after logging in.
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 sm:px-6 pt-6 pb-8">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <Mail className="w-6 h-6 text-primary" />
        </div>

        <Input
          label="Email address"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => !emailLocked && setEmail(e.target.value)}
          autoComplete="email"
          disabled={emailLocked}
        />

        {emailLocked && (
          <p className="text-xs text-text-muted mt-2">
            This is the email you entered during sign up.
          </p>
        )}

        {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}

        <div className="mt-8 space-y-3">
          <Button onClick={handleSendOtp} loading={loading} className="w-full">
            Send verification code
          </Button>
        </div>
      </div>

      <Modal
        isOpen={showOtpModal}
        onClose={() => !loading && setShowOtpModal(false)}
        title="Enter verification code"
      >
        <p className="text-sm text-text-muted mb-4">
          We sent a 6-digit code to <strong>{email}</strong>
        </p>
        <Input
          label="Verification code"
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
        <Button
          onClick={handleVerify}
          loading={loading}
          disabled={otp.length !== 6}
          className="w-full mt-4"
        >
          Verify email
        </Button>
      </Modal>
    </div>
  );
};

export default VerifyEmailPage;
