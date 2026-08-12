import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useUserAuthStore from '../store/useUserAuthStore';
import useUserActiveBookingStore from '../store/user/useUserActiveBookingStore';
import useUserWalletStore from '../store/user/useUserWalletStore';
import { useSocketEvent } from '../hooks/useSocket';
import { S2C_EVENTS } from '../constants/socketEvents';
import { SERVICE_TYPES } from '../constants/serviceTypes';
import { BOOKING_STATUS } from '../constants/bookingStatus';
import NoShowPromptModal from '../features/user/booking/components/NoShowPromptModal';
import ExtendRideModal from '../features/user/booking/components/ExtendRideModal';
import { useRideTimer } from '../features/user/booking/hooks/useRideTimer';
import { useInAppAlertRing } from '../hooks/useInAppAlertRing';

/**
 * User-wide booking alerts (any authenticated page, including trip flow):
 *   - FCM / SW notification click → navigate or open extend sheet
 *   - "Are you on your way?" no-show prompt
 *   - "Ride ending soon — extend?" sheet + 5s ring
 */
export function UserBookingAlertsBridge() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAuthenticated = useUserAuthStore((s) => s.isAuthenticated);
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);
  const respondToNoShow = useUserActiveBookingStore((s) => s.respondToNoShow);
  const applyUpdate = useUserActiveBookingStore((s) => s.applyUpdate);
  const initiateExtension = useUserActiveBookingStore((s) => s.initiateExtension);
  const verifyExtensionOtp = useUserActiveBookingStore((s) => s.verifyExtensionOtp);
  const payExtension = useUserActiveBookingStore((s) => s.payExtension);
  const cancelExtension = useUserActiveBookingStore((s) => s.cancelExtension);
  const extensionPromptOpen = useUserActiveBookingStore((s) => s.extensionPromptOpen);
  const extensionPromptDismissedAt = useUserActiveBookingStore((s) => s.extensionPromptDismissedAt);
  const extensionRejection = useUserActiveBookingStore((s) => s.extensionRejection);
  const openExtensionPrompt = useUserActiveBookingStore((s) => s.openExtensionPrompt);
  const closeExtensionPrompt = useUserActiveBookingStore((s) => s.closeExtensionPrompt);
  const setExtensionRejection = useUserActiveBookingStore((s) => s.setExtensionRejection);
  const clearExtensionRejection = useUserActiveBookingStore((s) => s.clearExtensionRejection);
  const wallet = useUserWalletStore((s) => s.wallet);
  const fetchWallet = useUserWalletStore((s) => s.fetchWallet);
  const rideTimer = useRideTimer(booking);
  const { play: playRideEndingAlert } = useInAppAlertRing();
  const lastExtendRingAtRef = useRef(0);

  const [noShowPrompt, setNoShowPrompt] = useState(null);

  const openExtendWithRing = () => {
    const alreadyOpen = useUserActiveBookingStore.getState().extensionPromptOpen;
    openExtensionPrompt();
    if (Date.now() - lastExtendRingAtRef.current < 4_000) return;
    lastExtendRingAtRef.current = Date.now();
    playRideEndingAlert();
    if (!alreadyOpen) {
      toast('Your trip is about to end — do you want to extend?', { duration: 5000 });
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setNoShowPrompt(null);
      return undefined;
    }
    fetchActive().catch(() => null);
    fetchWallet().catch(() => null);
    return undefined;
  }, [isAuthenticated, fetchActive, fetchWallet]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const onSwMessage = (event) => {
      const msg = event?.data;
      if (!msg || msg.type !== 'SD_NOTIFICATION_OPEN') return;
      const url = typeof msg.url === 'string' ? msg.url.trim() : '';
      const data = msg.payload || {};
      const kind = data.kind || '';
      if (kind === 'ride_ending_soon' || url.includes('extend=1')) {
        openExtendWithRing();
        return;
      }
      const path =
        (url.startsWith('/') && url)
        || (typeof data.path === 'string' && data.path.startsWith('/') ? data.path : '')
        || (data.bookingId ? `/user/book/assigned/${data.bookingId}` : '');
      if (!path || path === '/') return;
      if (window.location.pathname === path.split('?')[0]) return;
      navigate(path);
    };

    navigator.serviceWorker?.addEventListener?.('message', onSwMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
    };
  }, [isAuthenticated, navigate, openExtensionPrompt, playRideEndingAlert]);

  useSocketEvent(S2C_EVENTS.BOOKING_EXTENSION_OFFERED, (payload) => {
    if (!isAuthenticated || !payload?.bookingId) return;
    if (booking?._id && String(payload.bookingId) !== String(booking._id)) {
      fetchActive().catch(() => null);
    }
    openExtendWithRing();
  });

  useSocketEvent(S2C_EVENTS.BOOKING_EXTENSION_RESOLVED, (payload) => {
    if (payload?.stage !== 'dismissed_by_driver') return;
    if (booking?._id && String(booking._id) !== String(payload.bookingId)) return;
    setExtensionRejection({
      extensionId: payload.extensionId,
      additionalHours: payload.additionalHours,
      fareDelta: payload.fareDelta,
      at: Date.now(),
    });
    toast.error('Driver dismissed this extension. You can try again.', { duration: 5000 });
    openExtensionPrompt();
  });

  useEffect(() => {
    if (!rideTimer.shouldPromptExtension) return;
    if (extensionPromptOpen) return;
    if (extensionPromptDismissedAt && Date.now() - extensionPromptDismissedAt < 60_000) return;
    openExtendWithRing();
  }, [
    rideTimer.shouldPromptExtension,
    extensionPromptOpen,
    extensionPromptDismissedAt,
  ]);

  useEffect(() => {
    if (searchParams.get('extend') !== '1') return;
    if (booking?.status !== BOOKING_STATUS.STARTED) return;
    openExtendWithRing();
    const next = new URLSearchParams(searchParams);
    next.delete('extend');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, booking?.status, booking?._id]);

  const pendingExtension = useMemo(() => {
    const list = booking?.extensions || [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const e = list[i];
      if (e?.status === 'pending_otp' || e?.status === 'pending_payment') {
        return e;
      }
    }
    return null;
  }, [booking?.extensions]);

  useEffect(() => {
    if (!pendingExtension) return;
    if (extensionPromptOpen) return;
    if (pendingExtension.status !== 'pending_payment') return;
    if (extensionPromptDismissedAt && Date.now() - extensionPromptDismissedAt < 30_000) return;
    openExtensionPrompt();
  }, [pendingExtension, extensionPromptOpen, extensionPromptDismissedAt, openExtensionPrompt]);

  useSocketEvent(S2C_EVENTS.BOOKING_NOSHOW_PROMPT, (payload) => {
    if (!isAuthenticated || !payload?.bookingId) return;
    if (booking?.serviceType === SERVICE_TYPES.OUTSTATION) return;
    setNoShowPrompt({
      bookingId: String(payload.bookingId),
      promptDeadlineAt: payload.promptDeadlineAt,
      graceMinutes: payload.graceMinutes,
      promptIndex: payload.promptIndex,
      maxPrompts: payload.maxPrompts,
      isFinal: !!payload.isFinal,
    });
  });

  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, (payload) => {
    if (!payload?.bookingId) return;
    applyUpdate(payload);
    if (
      payload.status === BOOKING_STATUS.CANCELLED
      || payload.status === BOOKING_STATUS.COMPLETED
      || payload.status === BOOKING_STATUS.STARTED
    ) {
      setNoShowPrompt((prev) =>
        prev && String(prev.bookingId) === String(payload.bookingId) ? null : prev,
      );
    }
    if (payload.status === BOOKING_STATUS.COMPLETED && payload.bookingId) {
      if (payload.rating?.customer?.stars != null) return;
      const path = window.location.pathname || '';
      if (
        path.startsWith('/user/tracking/completed')
        || path.startsWith('/user/tracking/rate')
        || path.includes('/user/book/assigned')
      ) {
        return;
      }
      const id = String(payload.bookingId);
      navigate(`/user/tracking/completed?bookingId=${id}`);
    }
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    if (booking?.serviceType === SERVICE_TYPES.OUTSTATION) {
      setNoShowPrompt(null);
      return;
    }
    if (!booking || booking.status !== BOOKING_STATUS.ARRIVED) {
      setNoShowPrompt((prev) =>
        prev && booking && String(prev.bookingId) === String(booking._id)
          ? null
          : prev,
      );
      return;
    }
    const deadline = booking?.noShow?.promptDeadlineAt;
    const response = booking?.noShow?.customerResponse;
    if (!deadline || response) {
      if (response) {
        setNoShowPrompt((prev) =>
          prev && String(prev.bookingId) === String(booking._id) ? null : prev,
        );
      }
      return;
    }
    const remaining = new Date(deadline).getTime() - Date.now();
    if (remaining <= 0) {
      setNoShowPrompt((prev) =>
        prev && String(prev.bookingId) === String(booking._id) ? null : prev,
      );
      return;
    }
    setNoShowPrompt((prev) => {
      if (prev && String(prev.bookingId) === String(booking._id)) return prev;
      const firedFor = Number(booking?.noShow?.firedFor || 0);
      return {
        bookingId: String(booking._id),
        promptDeadlineAt: deadline,
        graceMinutes: null,
        promptIndex: firedFor || null,
        maxPrompts: null,
        isFinal: false,
      };
    });
  }, [
    isAuthenticated,
    booking?._id,
    booking?.status,
    booking?.serviceType,
    booking?.noShow?.promptDeadlineAt,
    booking?.noShow?.customerResponse,
    booking?.noShow?.firedFor,
  ]);

  const handleNoShowAnswer = async (answer) => {
    const bookingId = noShowPrompt?.bookingId || booking?._id;
    if (!bookingId) return;
    try {
      await respondToNoShow(answer, bookingId);
      setNoShowPrompt(null);
      if (answer === 'on_my_way') {
        toast.success('Thanks — we let your driver know.');
      } else {
        toast('Trip closed as a no-show. A no-show fee applies; the rest is refunded.', {
          icon: '\u26A0\uFE0F',
        });
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Could not send response',
      );
    }
  };

  const isOutstation = booking?.serviceType === SERVICE_TYPES.OUTSTATION;
  const extraHourRate = extraHourRateFromBooking(booking);
  const outstationHourlyRate = outstationHourlyRateFromBooking(booking);
  const outstationPerDayRate = outstationPerDayRateFromBooking(booking);

  if (!isAuthenticated) return null;

  return (
    <>
      <NoShowPromptModal
        open={Boolean(noShowPrompt)}
        deadline={noShowPrompt?.promptDeadlineAt}
        promptIndex={noShowPrompt?.promptIndex}
        maxPrompts={noShowPrompt?.maxPrompts}
        isFinal={noShowPrompt?.isFinal}
        onYes={() => handleNoShowAnswer('on_my_way')}
        onNo={() => handleNoShowAnswer('not_coming')}
      />
      <ExtendRideModal
        open={extensionPromptOpen && booking?.status === BOOKING_STATUS.STARTED}
        onClose={() => {
          closeExtensionPrompt();
          fetchWallet().catch(() => {});
        }}
        onInitiate={(amount, opts) => initiateExtension(amount, opts)}
        onVerifyOtp={(args) => verifyExtensionOtp(args)}
        onPay={async (args) => {
          const result = await payExtension(args);
          fetchWallet().catch(() => {});
          return result;
        }}
        onCancelExtension={async (args) => {
          await cancelExtension(args);
          fetchWallet().catch(() => {});
        }}
        pendingExtension={pendingExtension}
        extensionRejection={extensionRejection}
        onClearRejection={() => clearExtensionRejection()}
        onWalletRefresh={() => fetchWallet().catch(() => {})}
        extraHourRate={isOutstation ? outstationHourlyRate : extraHourRate}
        walletBalance={
          wallet?.availableRupees != null
            ? Number(wallet.availableRupees)
            : Math.max(0, Number(wallet?.balance || 0) - Number(wallet?.heldRupees || 0))
        }
        remainingMinutes={
          rideTimer.remainingSeconds != null
            ? Math.ceil(rideTimer.remainingSeconds / 60)
            : 0
        }
        minHours={0.25}
        maxHours={8}
        unit={isOutstation ? 'outstation' : 'hours'}
        perDayRate={outstationPerDayRate}
        minDays={1}
        maxDays={14}
      />
    </>
  );
}

function extraHourRateFromBooking(booking) {
  const bd = booking?.fareSnapshot?.breakdown || {};
  if (bd.extraHourCharge && bd.extraHours) {
    return Math.round(bd.extraHourCharge / bd.extraHours);
  }
  if (bd.packagePrice && booking?.hourly?.durationHours) {
    return Math.round(bd.packagePrice / booking.hourly.durationHours);
  }
  return 0;
}

function outstationHourlyRateFromBooking(booking) {
  if (booking?.serviceType !== SERVICE_TYPES.OUTSTATION) return 0;
  const bd = booking?.fareSnapshot?.breakdown || {};
  const explicit =
    Number(bd.outstationExtraHourCharge) || Number(bd.extraHourChargeRate) || 0;
  if (explicit > 0) return Math.round(explicit);
  const daily = Number(bd.dailyRate) || 0;
  return daily > 0 ? Math.max(1, Math.round(daily / 24)) : 0;
}

function outstationPerDayRateFromBooking(booking) {
  if (booking?.serviceType !== SERVICE_TYPES.OUTSTATION) return 0;
  const bd = booking?.fareSnapshot?.breakdown || {};
  const dailyRate = Number(bd.dailyRate) || 0;
  const foodPerDay =
    booking?.outstation?.needsFood === false ? 0 : Number(bd.foodAllowancePerDay) || 0;
  const stayPerNight = Number(bd.stayAllowancePerNight) || 0;
  const hasOvernight = Number(booking?.outstation?.days) > 1;
  const stayShare = hasOvernight ? stayPerNight : 0;
  return Math.max(0, Math.round(dailyRate + foodPerDay + stayShare));
}
