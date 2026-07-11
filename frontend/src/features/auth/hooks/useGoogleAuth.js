import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import useUserAuthStore from '../../../store/useUserAuthStore';
import useDriverAuthStore from '../../../store/useDriverAuthStore';
import {
  navigateUserAfterAuth,
  navigateDriverAfterAuth,
} from '../utils/authNavigation';
import { withFcmAuthPayload } from '../../../utils/fcmTokenClient';

/**
 * @param {'user' | 'driver'} accountType
 */
export function useGoogleAuth(accountType) {
  const navigate = useNavigate();
  const setUserAuth = useUserAuthStore((s) => s.setAuth);
  const setDriverAuth = useDriverAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);

  const handleGoogleSuccess = useCallback(
    async (credentialResponse) => {
      const credential = credentialResponse?.credential;
      if (!credential) {
        toast.error('Google sign-in was cancelled');
        return;
      }

      setLoading(true);
      try {
        const endpoint =
          accountType === 'driver' ? '/driver/auth/google' : '/auth/google';
        const res = await api.post(endpoint, await withFcmAuthPayload({ credential }));
        const { needsPhone } = res.data.data;

        if (accountType === 'driver') {
          const { driver } = res.data.data;
          const sessionDriver = { ...driver, needsPhone: Boolean(needsPhone) };
          setDriverAuth(sessionDriver);
          navigateDriverAfterAuth(navigate, sessionDriver, needsPhone);
        } else {
          const { user } = res.data.data;
          const sessionUser = { ...user, needsPhone: Boolean(needsPhone) };
          setUserAuth(sessionUser);
          navigateUserAfterAuth(navigate, sessionUser, needsPhone);
        }
      } catch (err) {
        toast.error(err.response?.data?.message || 'Google sign-in failed');
      } finally {
        setLoading(false);
      }
    },
    [accountType, navigate, setDriverAuth, setUserAuth],
  );

  const handleGoogleError = useCallback(() => {
    toast.error('Google sign-in failed. Please try again.');
  }, []);

  return { handleGoogleSuccess, handleGoogleError, loading };
}

export default useGoogleAuth;
