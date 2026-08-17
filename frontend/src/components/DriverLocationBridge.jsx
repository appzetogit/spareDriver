import { useEffect } from 'react';
import { useDriverLocation } from '../hooks/useDriverLocation';
import { useDriverOnlineStore } from '../store/driver/useDriverOnlineStore';
import useDriverActiveTripStore from '../store/driver/useDriverActiveTripStore';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { onAuthTokensChanged } from '../utils/authTokens';
import { syncNativeBackgroundLocation } from '../utils/nativeBackgroundLocation';
import {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
} from '../constants/bookingStatus';

const ONLINE_CACHE_KEY = 'driver-online-status';

const ON_TRIP_STATUSES = new Set(
  ACTIVE_BOOKING_STATUSES.filter(
    (s) =>
      s !== BOOKING_STATUS.NO_DRIVERS_FOUND &&
      s !== BOOKING_STATUS.PENDING_ASSIGNMENT &&
      s !== BOOKING_STATUS.SEARCHING,
  ),
);

/**
 * Keeps the driver GPS → Firebase pipeline alive across every protected
 * driver route. Previously `useDriverLocation` only ran on Home, so the
 * customer map froze the moment the driver opened the active-trip page.
 */
export function DriverLocationBridge() {
  const authOnline = useDriverAuthStore((s) => s.driver?.isOnline === true);
  const onlineEntry = useDriverOnlineStore((s) => s.entries[ONLINE_CACHE_KEY]);
  const storeOnline = onlineEntry?.data?.isOnline === true;
  const bookingStatus = useDriverActiveTripStore((s) => s.booking?.status);
  const onTrip = Boolean(bookingStatus && ON_TRIP_STATUSES.has(bookingStatus));

  const enabled = authOnline || storeOnline || onTrip;
  const driverId = useDriverAuthStore((s) => s.driver?._id);

  useEffect(() => {
    useDriverOnlineStore.getState().fetch(ONLINE_CACHE_KEY, {}).catch(() => {});
    useDriverActiveTripStore.getState().fetchActive?.().catch(() => {});
  }, []);

  useEffect(() => {
    const sync = () => syncNativeBackgroundLocation({ enabled, driverId });
    sync();
    return onAuthTokensChanged(sync);
  }, [enabled, driverId]);

  useEffect(() => () => syncNativeBackgroundLocation({ enabled: false }), []);

  useDriverLocation({ enabled });

  return null;
}

export default DriverLocationBridge;
