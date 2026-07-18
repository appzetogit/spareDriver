import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Headphones,
  Loader2,
  MapPin,
  Sparkles,
} from 'lucide-react';
import Button from '../../../../components/Button';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import useBookingDraftStore from '../../../../store/user/useBookingDraftStore';
import { BOOKING_TYPE } from '../../../../constants/bookingStatus';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';
import api from '../../../../utils/api';

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
  const draftReset = useBookingDraftStore((s) => s.reset);

  const [supportPhone, setSupportPhone] = useState('');
  const [hydrating, setHydrating] = useState(kind === 'booking' && !booking);

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
  const title =
    kind === 'subscription'
      ? 'Subscription booked'
      : isOutstation
        ? 'Outstation ride booked'
        : 'Your ride is booked';
  const subtitle =
    kind === 'subscription'
      ? 'We will find the best dedicated driver and assign them to you shortly.'
      : 'We will find the best driver and assign them to you shortly.';

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

  if (hydrating) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg min-h-dvh">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
        <div className="w-20 h-20 rounded-full bg-success/15 text-success flex items-center justify-center mb-5">
          {kind === 'subscription' ? (
            <Sparkles className="w-10 h-10" />
          ) : (
            <CheckCircle2 className="w-10 h-10" />
          )}
        </div>

        <h1 className="text-2xl font-bold text-text tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-text-secondary max-w-sm leading-relaxed">
          {subtitle}
        </p>

        <div className="mt-6 w-full max-w-sm rounded-2xl border border-border-light bg-surface px-4 py-3.5 text-left">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Headphones className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">Need help?</p>
              <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                If you face any issue, contact customer support
                {supportPhone ? (
                  <>
                    {' '}
                    at{' '}
                    <a
                      href={`tel:${supportPhone}`}
                      className="text-primary font-semibold"
                    >
                      {supportPhone}
                    </a>
                  </>
                ) : (
                  '.'
                )}
              </p>
              <button
                type="button"
                onClick={() => navigate('/user/help-support')}
                className="mt-2 text-xs font-semibold text-primary"
              >
                Open help & support
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 p-4 bg-bg/95 backdrop-blur border-t border-border-light space-y-2">
        <Button fullWidth size="lg" onClick={handleTrack} icon={MapPin}>
          {kind === 'subscription' ? 'View subscription' : 'Track your ride'}
        </Button>
        <Button
          fullWidth
          variant="ghost"
          onClick={() => navigate('/user/home', { replace: true })}
        >
          Back to home
        </Button>
      </div>
    </div>
  );
};

export default ScheduledConfirmedPage;
