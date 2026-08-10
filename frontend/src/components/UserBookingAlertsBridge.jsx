import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useUserAuthStore from '../store/useUserAuthStore';
import useUserActiveBookingStore from '../store/user/useUserActiveBookingStore';
import { useSocketEvent } from '../hooks/useSocket';
import { S2C_EVENTS } from '../constants/socketEvents';
import { SERVICE_TYPES } from '../constants/serviceTypes';
import { BOOKING_STATUS } from '../constants/bookingStatus';
import NoShowPromptModal from '../features/user/booking/components/NoShowPromptModal';

/**
 * User-wide booking alerts:
 *   - FCM / SW notification click → navigate to `path` (trip page)
 *   - "Are you on your way?" no-show prompt on any authenticated page
 */
export function UserBookingAlertsBridge() {
  const navigate = useNavigate();
  const isAuthenticated = useUserAuthStore((s) => s.isAuthenticated);
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);
  const respondToNoShow = useUserActiveBookingStore((s) => s.respondToNoShow);
  const applyUpdate = useUserActiveBookingStore((s) => s.applyUpdate);

  const [noShowPrompt, setNoShowPrompt] = useState(null);

  // Cold / warm start: hydrate active booking so a pending prompt reappears
  // even if the user is on Home / Account / etc.
  useEffect(() => {
    if (!isAuthenticated) {
      setNoShowPrompt(null);
      return undefined;
    }
    fetchActive().catch(() => null);
    return undefined;
  }, [isAuthenticated, fetchActive]);

  // FCM notification click → deep-link into the trip (or any `path`).
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const onSwMessage = (event) => {
      const msg = event?.data;
      if (!msg || msg.type !== 'SD_NOTIFICATION_OPEN') return;
      const url = typeof msg.url === 'string' ? msg.url.trim() : '';
      const data = msg.payload || {};
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
  }, [isAuthenticated, navigate]);

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
    // Round-trip (and any) completions while the user is elsewhere in
    // the app — nudge them onto the same rating screen used by the live
    // assigned-page flow. Skip if already on completed/rate or the live
    // assigned page (that page owns the redirect).
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

  // Rehydrate from the active booking after refresh / navigation.
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

  if (!isAuthenticated) return null;

  return (
    <NoShowPromptModal
      open={Boolean(noShowPrompt)}
      deadline={noShowPrompt?.promptDeadlineAt}
      promptIndex={noShowPrompt?.promptIndex}
      maxPrompts={noShowPrompt?.maxPrompts}
      isFinal={noShowPrompt?.isFinal}
      onYes={() => handleNoShowAnswer('on_my_way')}
      onNo={() => handleNoShowAnswer('not_coming')}
    />
  );
}
