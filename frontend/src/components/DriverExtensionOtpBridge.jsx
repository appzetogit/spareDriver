import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useDriverAuthStore from '../store/useDriverAuthStore';
import useDriverActiveTripStore from '../store/driver/useDriverActiveTripStore';
import useDriverExtensionOtpStore from '../store/driver/useDriverExtensionOtpStore';
import { useSocketEvent } from '../hooks/useSocket';
import { S2C_EVENTS } from '../constants/socketEvents';
import { DRIVER_NOTIFICATION } from '../constants/notificationTypes';
import { useInAppAlertRing } from '../hooks/useInAppAlertRing';
import ExtensionOtpBanner from '../features/driver/trips/components/ExtensionOtpBanner';

function isExtensionOtpKind(kind) {
  return kind === DRIVER_NOTIFICATION.EXTENSION_OTP || kind === 'extension_otp';
}

function isOnThisTripPage(pathname, bookingId) {
  if (!bookingId) return false;
  return pathname === `/driver/trip/${bookingId}`;
}

/**
 * Driver-wide extend-OTP surface.
 *
 * The handshake used to live only on `DriverActiveTripPage`, so a
 * customer request was silent if the driver was on Home / Earnings or
 * the app was backgrounded. This bridge:
 *   - listens for the socket OTP on every driver route
 *   - hydrates from the active booking (REST now includes the code)
 *   - applies FCM / notification-click payloads
 *   - shows a floating banner when the driver is not on the trip page
 */
export function DriverExtensionOtpBridge() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAuthenticated = useDriverAuthStore((s) => s.isAuthenticated);
  const booking = useDriverActiveTripStore((s) => s.booking);
  const fetchActive = useDriverActiveTripStore((s) => s.fetchActive);
  const fetchById = useDriverActiveTripStore((s) => s.fetchById);
  const dismissExtension = useDriverActiveTripStore((s) => s.dismissExtension);
  const banner = useDriverExtensionOtpStore((s) => s.banner);
  const applyOtpPayload = useDriverExtensionOtpStore((s) => s.applyOtpPayload);
  const applyResolved = useDriverExtensionOtpStore((s) => s.applyResolved);
  const applyPaid = useDriverExtensionOtpStore((s) => s.applyPaid);
  const hydrateFromBooking = useDriverExtensionOtpStore((s) => s.hydrateFromBooking);
  const clear = useDriverExtensionOtpStore((s) => s.clear);
  const { play: playExtendAlert } = useInAppAlertRing();
  const lastAlertKeyRef = useRef('');

  useEffect(() => {
    if (!isAuthenticated) {
      clear();
      lastAlertKeyRef.current = '';
      return undefined;
    }
    const refresh = () => {
      fetchActive().catch(() => null);
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isAuthenticated, fetchActive, clear]);

  useEffect(() => {
    if (!isAuthenticated) return;
    hydrateFromBooking(booking);
  }, [isAuthenticated, booking, hydrateFromBooking]);

  useSocketEvent(S2C_EVENTS.BOOKING_EXTENSION_OTP, (payload) => {
    if (!isAuthenticated) return;
    applyOtpPayload(payload);
  });

  useSocketEvent(S2C_EVENTS.BOOKING_EXTENSION_RESOLVED, (payload) => {
    if (!isAuthenticated) return;
    applyResolved(payload);
  });

  useSocketEvent(S2C_EVENTS.BOOKING_EXTENSION_PAID, (payload) => {
    if (!isAuthenticated) return;
    applyPaid(payload);
    if (payload?.bookingId) {
      fetchById(payload.bookingId).catch(() => {});
    }
  });

  useEffect(() => {
    if (!banner?.expiresAt || banner.stage === 'paid') return undefined;
    const ms = banner.expiresAt - Date.now();
    if (ms <= 0) {
      clear();
      return undefined;
    }
    const t = setTimeout(() => clear(), ms);
    return () => clearTimeout(t);
  }, [banner?.expiresAt, banner?.stage, banner?.extensionId, clear]);

  useEffect(() => {
    if (!banner || banner.stage !== 'otp' || !banner.otp) return;
    const key = `${banner.extensionId}:${banner.otp}`;
    if (lastAlertKeyRef.current === key) return;
    lastAlertKeyRef.current = key;
    playExtendAlert();
  }, [banner, playExtendAlert]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const applyFromFcm = (data = {}) => {
      if (!isExtensionOtpKind(data.kind || data.type)) return false;
      applyOtpPayload(data);
      return true;
    };

    const onSwMessage = (event) => {
      const msg = event?.data;
      if (!msg || msg.type !== 'SD_NOTIFICATION_OPEN') return;
      const data = msg.payload || {};
      if (!applyFromFcm(data)) return;
      const url = typeof msg.url === 'string' ? msg.url.trim() : '';
      const path =
        (url.startsWith('/') && url)
        || (typeof data.path === 'string' && data.path.startsWith('/') ? data.path : '')
        || (data.bookingId ? `/driver/trip/${data.bookingId}` : '');
      if (!path) return;
      const current = `${window.location.pathname}${window.location.search}`;
      if (current === path) return;
      navigate(path);
    };

    navigator.serviceWorker?.addEventListener?.('message', onSwMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
    };
  }, [isAuthenticated, applyOtpPayload, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const onFcm = (event) => {
      if (event.detail?.audience !== 'driver') return;
      const data = event.detail?.data || {};
      const kind = event.detail?.kind || data.kind || '';
      if (!isExtensionOtpKind(kind)) return;
      applyOtpPayload(data);
    };
    window.addEventListener('sd:fcm-foreground', onFcm);
    return () => window.removeEventListener('sd:fcm-foreground', onFcm);
  }, [isAuthenticated, applyOtpPayload]);

  const showOverlay = Boolean(
    isAuthenticated
    && banner
    && !isOnThisTripPage(pathname, banner.bookingId),
  );

  if (!showOverlay) return null;

  const handleDismiss = async () => {
    const stage = banner.stage;
    if ((stage === 'otp' || stage === 'verified') && banner.extensionId) {
      try {
        if (!useDriverActiveTripStore.getState().booking && banner.bookingId) {
          await fetchById(banner.bookingId);
        }
        await dismissExtension(banner.extensionId);
        toast.success('Extension dismissed');
      } catch (err) {
        toast.error(
          err?.response?.data?.message
          || err?.message
          || 'Could not dismiss extension',
        );
        return;
      }
    }
    clear();
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[70] pointer-events-none">
      <div className="max-w-lg mx-auto px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-auto">
        <ExtensionOtpBanner
          banner={banner}
          onDismiss={handleDismiss}
          footer={banner.bookingId ? (
            <button
              type="button"
              onClick={() => navigate(`/driver/trip/${banner.bookingId}`)}
              className="mt-2 w-full h-9 rounded-xl bg-white text-indigo-700 text-xs font-semibold"
            >
              Open trip
            </button>
          ) : null}
        />
      </div>
    </div>
  );
}
