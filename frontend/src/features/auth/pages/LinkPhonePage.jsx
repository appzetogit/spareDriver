import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Modal from '../../../components/Modal';
import api from '../../../utils/api';
import useUserAuthStore from '../../../store/useUserAuthStore';
import useDriverAuthStore from '../../../store/useDriverAuthStore';
import { userNeedsPhone, userNeedsEmail, driverNeedsPhone } from '../utils/authNavigation';

/**
 * @param {{ accountType: 'user' | 'driver' }} props
 */
const LinkPhonePage = ({ accountType = 'user' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectedRef = useRef(false);
  const isDriver = accountType === 'driver';
  const { user, isAuthenticated: userAuthed, setAuth: setUserAuth } = useUserAuthStore();
  const { driver, isAuthenticated: driverAuthed, setAuth: setDriverAuth } = useDriverAuthStore();

  const isAuthenticated = isDriver ? driverAuthed : userAuthed;
  const profile = isDriver ? driver : user;
  const loginPath = isDriver ? '/driver/login' : '/login';

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (redirectedRef.current) return;

    if (!isAuthenticated) {
      redirectedRef.current = true;
      navigate(loginPath, { replace: true });
      return;
    }

    if (isDriver && !driverNeedsPhone(driver)) {
      redirectedRef.current = true;
      navigate('/driver/register/credentials', { replace: true });
    } else if (!isDriver && !userNeedsPhone(user)) {
      redirectedRef.current = true;
      if (userNeedsEmail(user)) {
        navigate('/user/verify-email', { replace: true });
      } else {
        navigate('/user/home', { replace: true });
      }
    }
  }, [isAuthenticated, user, driver, isDriver, navigate, loginPath, location.pathname]);

  const handleSendOtp = async () => {
    if (!/^[0-9]{10}$/.test(phone)) {
      setError('Enter a valid 10-digit number');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/google/link-phone/otp', {
        phone,
        accountType: isDriver ? 'driver' : 'user',
      });
      setShowOtpModal(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const endpoint = isDriver
        ? '/driver/auth/google/link-phone'
        : '/auth/google/link-phone';
      const res = await api.post(endpoint, { phone, otp });

      if (isDriver) {
        const linkedDriver = { ...res.data.data.driver, needsPhone: false };
        setDriverAuth(linkedDriver);
        navigate('/driver/register/credentials', { replace: true });
      } else {
        const linkedUser = { ...res.data.data.user, needsPhone: false };
        setUserAuth(linkedUser);
        if (userNeedsEmail(linkedUser)) {
          navigate('/user/verify-email', { replace: true });
        } else {
          navigate('/user/add-car', { replace: true });
        }
      }
      toast.success('Phone number linked');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh">
      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-xl hover:bg-gray-100"
        >
          <ArrowLeft className="w-5 h-5 text-text" />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-4 sm:px-6 pt-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text mb-1">Link your mobile</h1>
          <p className="text-text-secondary text-sm">
            {profile?.name ? `Hi ${profile.name}, ` : ''}
            add your phone number to continue with SpareDriver.
          </p>
        </div>

        <div className="space-y-4">
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
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                  if (error) setError('');
                }}
                maxLength={10}
                className="pl-[4.5rem]"
                containerClassName="w-full"
              />
            </div>
            {error && !showOtpModal && (
              <p className="text-danger text-xs mt-1">{error}</p>
            )}
          </div>

          <Button
            fullWidth
            loading={loading}
            onClick={handleSendOtp}
            disabled={phone.length !== 10}
            className="rounded-full py-4 text-base font-bold"
          >
            Send OTP
          </Button>
        </div>
      </div>

      <Modal isOpen={showOtpModal} onClose={() => setShowOtpModal(false)} title="Verify mobile">
        <div className="p-2 text-center">
          <p className="text-sm text-text-secondary mb-6">
            Code sent to <span className="font-bold text-text">+91 {phone}</span>
          </p>
          <Input
            type="text"
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            maxLength={6}
            className="text-center text-2xl tracking-widest font-mono"
            autoFocus
          />
          {error && <p className="text-danger text-xs mt-2">{error}</p>}
          <Button
            fullWidth
            className="mt-8 rounded-full py-4"
            onClick={handleVerify}
            disabled={otp.length !== 6 || loading}
            loading={loading}
          >
            Verify &amp; continue
          </Button>
          <button
            type="button"
            onClick={handleSendOtp}
            disabled={loading}
            className="mt-6 text-sm font-bold text-primary hover:underline disabled:opacity-50"
          >
            Resend code
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default LinkPhonePage;
