import { useCallback, useState } from 'react';
import api from '../utils/api';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { useDriverOnlineStore } from '../store/driver/useDriverOnlineStore';
import { useDriverKitActiveStore } from '../store/driver/useDriverKitStore';
import useDriverActiveTripStore from '../store/driver/useDriverActiveTripStore';
import {
  startNativeTracking,
  stopNativeTracking,
  TRACKING_MODE,
} from '../utils/nativeTracking';
import {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
} from '../constants/bookingStatus';

const ON_TRIP_STATUSES = new Set(
  ACTIVE_BOOKING_STATUSES.filter(
    (s) =>
      s !== BOOKING_STATUS.NO_DRIVERS_FOUND &&
      s !== BOOKING_STATUS.PENDING_ASSIGNMENT &&
      s !== BOOKING_STATUS.SEARCHING,
  ),
);

function driverIsOnTrip() {
  const status = useDriverActiveTripStore.getState().booking?.status;
  return Boolean(status && ON_TRIP_STATUSES.has(status));
}

export function useDriverOnlineToggle() {
  const updateDriver = useDriverAuthStore((s) => s.updateDriver);
  const [blocked, setBlocked] = useState(null);
  const [toggling, setToggling] = useState(false);

  const refreshStatus = useCallback(async () => {
    const key = 'driver-online-status';
    await useDriverOnlineStore.getState().refresh(key, {});
    return useDriverOnlineStore.getState().entries[key]?.data;
  }, []);

  const setOnline = useCallback(
    async (online) => {
      setToggling(true);
      setBlocked(null);
      try {
        const res = await api.put('/driver/online', { online });
        const data = res.data?.data;
        updateDriver({ isOnline: data.isOnline, canGoOnline: data.canGoOnline });
        useDriverOnlineStore.getState().invalidate('driver-online-status');
        if (data.isOnline) {
          void startNativeTracking(
            driverIsOnTrip() ? TRACKING_MODE.ON_TRIP : TRACKING_MODE.IDLE,
          );
        } else if (!driverIsOnTrip()) {
          void stopNativeTracking();
        }
        return { success: true, data };
      } catch (err) {
        const payload = err.response?.data;
        if (err.response?.status === 403) {
          setBlocked({
            message: 'Cannot go online',
            code: payload?.data?.code,
            reasons: payload?.data?.reasons || [payload?.message].filter(Boolean),
          });
          useDriverKitActiveStore.getState().invalidate('driver-kit-active');
          useDriverOnlineStore.getState().invalidate('driver-online-status');
        }
        return { success: false, error: payload?.message };
      } finally {
        setToggling(false);
      }
    },
    [updateDriver],
  );

  return {
    setOnline,
    toggling,
    blocked,
    showBlocked: (payload) =>
      setBlocked({
        message: payload?.message || 'Cannot go online',
        code: payload?.code,
        reasons: payload?.reasons || [],
      }),
    clearBlocked: () => setBlocked(null),
    refreshStatus,
  };
}
