import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Hash,
  Headphones,
  Loader2,
  MapPin,
  Phone,
  Sparkles,
} from 'lucide-react';
import Button from '../../../../components/Button';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import useBookingDraftStore from '../../../../store/user/useBookingDraftStore';
import useUserWalletStore from '../../../../store/user/useUserWalletStore';
import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUS,
  BOOKING_TYPE,
} from '../../../../constants/bookingStatus';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';
import api from '../../../../utils/api';
import {
  buildUserCancelConfirmMessage,
  previewUserCancellation,
} from '../utils/cancellationPreview';

function formatWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function pickupLabel(booking) {
  return (
    booking?.pickup?.address
    || booking?.outstation?.pickup?.address
    || booking?.hourly?.pickup?.address
    || ''
  );
}

function scheduledAt(booking, isOutstation) {
  if (isOutstation) {
    return booking?.outstation?.pickupAt || booking?.outstation?.startDate || null;
  }
  return booking?.hourly?.scheduledStartAt || booking?.scheduledStartAt || null;
}

/**
 * Post-book success for scheduled hourly, outstation, and subscription.
 * Instant rides still use SearchingDriverPage.
 */
const ScheduledConfirmedPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const kind = searchParams.get('kind') === 'subscription' ? 'subscription' : 'booking';

  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);
  const cancelBooking = useUserActiveBookingStore((s) => s.cancelBooking);
  const clearActiveBooking = useUserActiveBookingStore((s) => s.clear);
  const draftReset = useBookingDraftStore((s) => s.reset);
  const fetchWallet = useUserWalletStore((s) => s.fetchWallet);

  const [supportPhone, setSupportPhone] = useState('');
  const [hydrating, setHydrating] = useState(kind === 'booking' && !booking);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    draftReset();
  }, [draftReset]);

  useEffect(() => {
    if (kind !== 'booking') return undefined;
    if (booking?._id) {
      setHydrating(false);
      return undefined;
    }
    let cancelled = false;
    setHydrating(true);
    fetchActive()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, booking?._id, fetchActive]);

  useEffect(() => {
    api
      .get('/common/support-config')
      .then((res) => {
        setSupportPhone(res?.data?.data?.supportPhone || '');
      })
      .catch(() => {});
  }, []);

  const bookingId = booking?._id;
  const isOutstation =
    booking?.serviceType === SERVICE_TYPES.OUTSTATION
    || booking?.bookingType === BOOKING_TYPE.OUTSTATION;
  const inEmergency = booking?.status === BOOKING_STATUS.IN_EMERGENCY_POOL;
  const whenLabel = formatWhen(scheduledAt(booking, isOutstation));
  const whereLabel = pickupLabel(booking);
  const bookingNumber =
    booking?.bookingNumber || (bookingId ? String(bookingId).slice(-6).toUpperCase() : '');

  const title =
    kind === 'subscription'
      ? 'Subscription booked'
      : isOutstation
        ? 'Outstation ride booked'
        : 'Your ride is booked';
  const subtitle =
    kind === 'subscription'
      ? 'We\'ll match you with a dedicated driver shortly.'
      : inEmergency
        ? 'Our team is assigning a driver for you right now.'
        : 'We\'ll assign the best available driver before pickup.';

  const statusChip =
    kind === 'subscription'
      ? { label: 'Processing', tone: 'bg-slate-900 text-primary' }
      : inEmergency
        ? { label: 'Manual assign', tone: 'bg-amber-100 text-amber-800' }
        : { label: 'Finding driver', tone: 'bg-emerald-100 text-emerald-800' };

  const canCancel =
    kind === 'booking'
    && !!bookingId
    && ACTIVE_BOOKING_STATUSES.includes(booking?.status);

  const cancelPreview = useMemo(
    () => (canCancel ? previewUserCancellation(booking) : null),
    [canCancel, booking],
  );

  const handleTrack = () => {
    if (kind === 'subscription') {
      navigate('/user/account/subscription', { replace: true });
      return;
    }
    if (bookingId) {
      navigate(`/user/trips/${bookingId}`, { replace: true });
      return;
    }
    navigate('/user/activity', { replace: true });
  };

  const handleCancelConfirm = async () => {
    if (cancelling || !canCancel) return;
    setCancelling(true);
    try {
      const tripStarted = !!cancelPreview?.tripStarted;
      const result = await cancelBooking(
        tripStarted ? 'cancelled_by_user_after_start' : 'cancelled_by_user',
      );
      fetchWallet().catch(() => {});
      setCancelConfirmOpen(false);

      const fee = Number(result?.cancellation?.feeCharged) || Number(cancelPreview?.feeCharged) || 0;
      const refund = Number(result?.cancellation?.refundAmount) || Number(cancelPreview?.refundAmount) || 0;
      if (fee > 0 && refund > 0) {
        toast.success(`Ride cancelled. Fee ₹${fee} · refund ₹${refund}`);
      } else if (refund > 0) {
        toast.success(`Ride cancelled. ₹${refund} refunded to your wallet`);
      } else if (fee > 0) {
        toast.success(`Ride cancelled. Cancellation fee ₹${fee}`);
      } else {
        toast.success('Ride cancelled');
      }

      draftReset();
      clearActiveBooking();
      navigate('/user/home', { replace: true });
    } catch (err) {
      setCancelConfirmOpen(false);
      if (err?.alreadyTerminal || err?.code === 'BOOKING_ALREADY_TERMINAL') {
        fetchWallet().catch(() => {});
        draftReset();
        clearActiveBooking();
        navigate('/user/home', { replace: true });
        return;
      }
      toast.error(err?.response?.data?.message || err?.message || 'Could not cancel');
    } finally {
      setCancelling(false);
    }
  };

  if (hydrating) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white min-h-dvh">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col bg-white h-dvh max-h-dvh overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.14),_transparent_70%)]"
      />

      <div className="relative flex-1 flex flex-col justify-center px-5 py-3 min-h-0">
        <div className="w-full max-w-sm mx-auto animate-fade-in-up">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-3">
              <div className="absolute -inset-2 rounded-full bg-emerald-400/10" />
              <div className="relative w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 ring-4 ring-emerald-100 flex items-center justify-center shadow-sm">
                {kind === 'subscription' ? (
                  <Sparkles className="w-8 h-8" />
                ) : (
                  <CheckCircle2 className="w-8 h-8" />
                )}
              </div>
            </div>

            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusChip.tone}`}>
              <Clock3 className="w-3 h-3" />
              {statusChip.label}
            </span>

            <h1 className="mt-2.5 text-xl font-bold text-slate-900 tracking-tight">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-500 max-w-[18rem] leading-snug">
              {subtitle}
            </p>
          </div>

          {kind === 'booking' && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 overflow-hidden">
              {bookingNumber && (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-slate-200/80">
                  <div className="w-8 h-8 rounded-xl bg-white text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
                    <Hash className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                      Booking ID
                    </p>
                    <p className="text-sm font-bold text-slate-900 font-mono truncate">
                      {bookingNumber}
                    </p>
                  </div>
                </div>
              )}

              {whenLabel && (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-slate-200/80">
                  <div className="w-8 h-8 rounded-xl bg-white text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
                    <CalendarClock className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                      Pickup time
                    </p>
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {whenLabel}
                    </p>
                  </div>
                </div>
              )}

              {whereLabel && (
                <div className="flex items-start gap-2.5 px-3.5 py-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                      Pickup
                    </p>
                    <p className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug">
                      {whereLabel}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-primary flex items-center justify-center shrink-0">
              <Headphones className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-semibold text-slate-900">Need help?</p>
              <p className="text-[11px] text-slate-500 leading-snug">
                Support is available if anything looks off.
              </p>
            </div>
            {supportPhone ? (
              <a
                href={`tel:${supportPhone}`}
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-slate-900 text-white text-[11px] font-semibold px-2.5 py-1.5"
              >
                <Phone className="w-3 h-3 text-primary" />
                Call
              </a>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/user/help-support')}
                className="shrink-0 text-[11px] font-semibold text-slate-900 underline underline-offset-2"
              >
                Help
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="relative shrink-0 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2 border-t border-slate-100 bg-white">
        <Button fullWidth size="lg" onClick={handleTrack} icon={MapPin}>
          {kind === 'subscription' ? 'View subscription' : 'Track your ride'}
        </Button>
        {canCancel && (
          <Button
            fullWidth
            size="lg"
            variant="danger"
            loading={cancelling}
            disabled={cancelling}
            onClick={() => setCancelConfirmOpen(true)}
          >
            Cancel ride
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={cancelConfirmOpen}
        onClose={() => !cancelling && setCancelConfirmOpen(false)}
        onConfirm={handleCancelConfirm}
        title="Cancel this ride?"
        description={buildUserCancelConfirmMessage(cancelPreview)}
        confirmLabel="Yes, cancel"
        cancelLabel="Keep booking"
        variant="danger"
        loading={cancelling}
      />
    </div>
  );
};

export default ScheduledConfirmedPage;
