import useUserAuthStore from '../store/useUserAuthStore';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { useFcmRegistration } from '../hooks/useFcmRegistration';

export function UserFcmBridge() {
  const isAuthenticated = useUserAuthStore((s) => s.isAuthenticated);
  useFcmRegistration({ enabled: isAuthenticated, audience: 'user' });
  return null;
}

export function DriverFcmBridge() {
  const isAuthenticated = useDriverAuthStore((s) => s.isAuthenticated);
  useFcmRegistration({ enabled: isAuthenticated, audience: 'driver' });
  return null;
}
