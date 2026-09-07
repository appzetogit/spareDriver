import { useCallback, useEffect, useRef } from 'react';
import useUserAuthStore from '../../store/useUserAuthStore';
import useDriverAuthStore from '../../store/useDriverAuthStore';
import useAdminAuthStore from '../../store/useAdminAuthStore';
import { useUserNotificationStore, useDriverNotificationStore, useAdminNotificationStore } from '../../store/useNotificationStore';
import { useNotificationListener } from '../../hooks/useNotificationListener';
import { useFcmRegistration } from '../../hooks/useFcmRegistration';
import { useSocketEvent } from '../../hooks/useSocket';
import { S2C_EVENTS } from '../../constants/socketEvents';
import { useInAppAlertRing } from '../../hooks/useInAppAlertRing';
import { ADMIN_NOTIFICATION, DRIVER_NOTIFICATION } from '../../constants/notificationTypes';
import { BOOKING_STATUS } from '../../constants/bookingStatus';
import { syncDriverDashboardFromBookingUpdate } from '../../store/driver/useDriverActiveTripStore';

function isAdminAlertKind(kind) {
  return (
    kind === ADMIN_NOTIFICATION.EMERGENCY_POOL_ENTERED
    || kind === ADMIN_NOTIFICATION.SOS_TRIGGERED
  );
}

function isDriverAssignedKind(kind) {
  return kind === DRIVER_NOTIFICATION.ORDER_ASSIGNED || kind === 'order_assigned';
}

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
  const { play: playAssignedAlert } = useInAppAlertRing();
  const lastAssignedKeyRef = useRef('');

  const ringIfAssigned = useCallback((kind, data = {}) => {
    if (!isDriverAssignedKind(kind || data.kind || data.type)) return;
    syncDriverDashboardFromBookingUpdate({
      status: data.status || BOOKING_STATUS.DRIVER_ASSIGNED,
      bookingId: data.bookingId,
    });
    const key = String(data.bookingId || Date.now());
    if (lastAssignedKeyRef.current === key) return;
    lastAssignedKeyRef.current = key;
    playAssignedAlert();
  }, [playAssignedAlert]);

  useFcmRegistration({ enabled: isAuthenticated, audience: 'driver' });
  useNotificationListener({
    enabled: isAuthenticated,
    onNotification: (payload) => {
      fetchUnread({ force: true }).catch(() => null);
      ringIfAssigned(payload?.type || payload?.data?.kind, payload?.data);
    },
  });

  useEffect(() => {
    if (!isAuthenticated) {
      lastAssignedKeyRef.current = '';
      return undefined;
    }
    const onFcm = (event) => {
      if (event.detail?.audience !== 'driver') return;
      const data = event.detail?.data || {};
      ringIfAssigned(event.detail?.kind || data.kind, data);
    };
    window.addEventListener('sd:fcm-foreground', onFcm);
    return () => window.removeEventListener('sd:fcm-foreground', onFcm);
  }, [isAuthenticated, playAssignedAlert, ringIfAssigned]);

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
    if (isAdminAlertKind(payload?.kind)) {
      playEmergencyAlert();
    }
  });

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const onFcm = (event) => {
      if (event.detail?.audience !== 'admin') return;
      if (isAdminAlertKind(event.detail?.kind)) {
        playEmergencyAlert();
      }
    };
    window.addEventListener('sd:fcm-foreground', onFcm);
    return () => window.removeEventListener('sd:fcm-foreground', onFcm);
  }, [isAuthenticated, playEmergencyAlert]);

  return null;
}
