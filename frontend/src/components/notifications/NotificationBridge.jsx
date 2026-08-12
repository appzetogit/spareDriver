import useUserAuthStore from '../../store/useUserAuthStore';
import useDriverAuthStore from '../../store/useDriverAuthStore';
import useAdminAuthStore from '../../store/useAdminAuthStore';
import { useUserNotificationStore, useDriverNotificationStore, useAdminNotificationStore } from '../../store/useNotificationStore';
import { useNotificationListener } from '../../hooks/useNotificationListener';
import { useFcmRegistration } from '../../hooks/useFcmRegistration';
import { useSocketEvent } from '../../hooks/useSocket';
import { S2C_EVENTS } from '../../constants/socketEvents';
import { useInAppAlertRing } from '../../hooks/useInAppAlertRing';
import { ADMIN_NOTIFICATION } from '../../constants/notificationTypes';

export function UserNotificationBridge() {
  const isAuthenticated = useUserAuthStore((s) => s.isAuthenticated);
  const fetchUnread = useUserNotificationStore((s) => s.fetchUnread);

  useFcmRegistration({ enabled: isAuthenticated, audience: 'user' });
  useNotificationListener({
    enabled: isAuthenticated,
    onNotification: () => fetchUnread({ force: true }).catch(() => null),
  });

  return null;
}

export function DriverNotificationBridge() {
  const isAuthenticated = useDriverAuthStore((s) => s.isAuthenticated);
  const fetchUnread = useDriverNotificationStore((s) => s.fetchUnread);

  useFcmRegistration({ enabled: isAuthenticated, audience: 'driver' });
  useNotificationListener({
    enabled: isAuthenticated,
    onNotification: () => fetchUnread({ force: true }).catch(() => null),
  });

  return null;
}

export function AdminNotificationBridge() {
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated);
  const fetchUnread = useAdminNotificationStore((s) => s.fetchUnread);
  const { play: playEmergencyAlert } = useInAppAlertRing();

  useFcmRegistration({ enabled: isAuthenticated, audience: 'admin' });
  useNotificationListener({
    enabled: isAuthenticated,
    onNotification: () => fetchUnread({ force: true }).catch(() => null),
  });

  useSocketEvent(S2C_EVENTS.ADMIN_ALERT, (payload) => {
    if (!isAuthenticated) return;
    if (payload?.kind === ADMIN_NOTIFICATION.EMERGENCY_POOL_ENTERED) {
      playEmergencyAlert();
    }
  });

  return null;
}
