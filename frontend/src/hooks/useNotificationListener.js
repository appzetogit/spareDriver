import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { S2C_EVENTS } from '../constants/socketEvents';
import { notificationTypeLabel } from '../constants/notificationTypes';
import useSocketStore from '../store/useSocketStore';

/**
 * Subscribes to `notification:new` and shows in-app toasts.
 */
export function useNotificationListener({ enabled = false, onNotification } = {}) {
  const socket = useSocketStore((s) => s.socket);

  useEffect(() => {
    if (!enabled || !socket) return undefined;

    const handler = (payload) => {
      const { title, body, severity = 'info', data = {}, type } = payload || {};
      const kind = type || data?.kind || data?.type || 'general';
      const typeLabel = data?.typeLabel || notificationTypeLabel(kind);
      const toastFn =
        severity === 'error' ? toast.error
          : severity === 'success' ? toast.success
            : toast;

      const text = body || title || 'New notification';
      toastFn(typeLabel ? `${typeLabel}: ${text}` : text, {
        id: `notif-${kind}-${data?.bookingId || Date.now()}`,
        duration: 5000,
      });

      onNotification?.(payload);
    };

    socket.on(S2C_EVENTS.NOTIFICATION, handler);
    return () => socket.off(S2C_EVENTS.NOTIFICATION, handler);
  }, [enabled, socket, onNotification]);
}
