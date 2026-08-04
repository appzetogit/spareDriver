import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Clock,
  SkipForward,
  Loader2,
  IndianRupee,
  Navigation,
  User as UserIcon,
  Car as CarIcon,
  CalendarClock,
  Zap,
} from 'lucide-react';
import useDriverIncomingOfferStore from '../../../../store/driver/useDriverIncomingOfferStore';
import { useSocketEvent } from '../../../../hooks/useSocket';
import { useNotificationSound } from '../../../../hooks/useNotificationSound';
import { S2C_EVENTS } from '../../../../constants/socketEvents';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import { BOOKING_TYPE } from '../../../../constants/bookingStatus';
import { formatDistance } from '../../../../utils/geo';
import Button from '../../../../components/Button';

/**
 * Visual themes for the three offer flavours: instant (amber), scheduled
 * (indigo), and outstation (emerald). Keeping them visually distinct helps
 * drivers immediately identify the type of ride at a glance.
 */
const OFFER_THEMES = {
  [BOOKING_TYPE.INSTANT]: {
    headerBg: 'bg-amber-50',
    headerRing: 'ring-2 ring-amber-300',
    headerText: 'text-amber-700',
    headerHeading: 'text-amber-900',
    pillBg: 'bg-amber-200/70',
    pillText: 'text-amber-900',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-white',
    progressBar: 'bg-amber-500',
    label: 'Instant ride',
    Icon: Zap,
  },
  [BOOKING_TYPE.SCHEDULED]: {
    headerBg: 'bg-indigo-50',
    headerRing: 'ring-2 ring-indigo-300',
    headerText: 'text-indigo-700',
    headerHeading: 'text-indigo-900',
    pillBg: 'bg-indigo-200/70',
    pillText: 'text-indigo-900',
    badgeBg: 'bg-indigo-500',
    badgeText: 'text-white',
    progressBar: 'bg-indigo-500',
    label: 'Scheduled ride',
    Icon: CalendarClock,
  },
  [BOOKING_TYPE.OUTSTATION]: {
    headerBg: 'bg-emerald-50',
    headerRing: 'ring-2 ring-emerald-300',
    headerText: 'text-emerald-700',
    headerHeading: 'text-emerald-900',
    pillBg: 'bg-emerald-200/70',
    pillText: 'text-emerald-900',
    badgeBg: 'bg-emerald-600',
    badgeText: 'text-white',
    progressBar: 'bg-emerald-500',
    label: 'Outstation trip',
    Icon: CalendarClock,
  },
};

/** The asset that rings when a new offer arrives. Reused across the app. */
const OFFER_ALERT_SRC = '/audio/alert_.mp3';

function CountdownBar({ expiresAt, barColorClass = 'bg-primary' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const total = 30_000;
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Decide soon</span>
        <span className="font-bold text-text">{seconds}s</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full transition-[width] duration-200 ease-linear ${barColorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const BookingOfferModal = () => {
  const offer = useDriverIncomingOfferStore((s) => s.offer);
  const busy = useDriverIncomingOfferStore((s) => s.busy);
  const error = useDriverIncomingOfferStore((s) => s.error);
  const hydrateOffer = useDriverIncomingOfferStore((s) => s.hydrateOffer);
  const clearOffer = useDriverIncomingOfferStore((s) => s.clearOffer);
  const syncExpiry = useDriverIncomingOfferStore((s) => s.syncExpiry);
  const acceptOffer = useDriverIncomingOfferStore((s) => s.accept);
  const rejectOffer = useDriverIncomingOfferStore((s) => s.reject);
  const navigate = useNavigate();

  // Looping alert tone that rings while an offer is on screen. Stops the
  // moment the offer is cleared (accept / skip / server-side withdrawal /
  // local hard expiry).
  const { play: playAlert, stop: stopAlert, prime: primeAlert } = useNotificationSound(
    OFFER_ALERT_SRC,
    {
      loop: true,
      volume: 0.9,
    },
  );

  // Unlock autoplay after an explicit user gesture (Go Online).
  useEffect(() => {
    const onPrime = () => primeAlert();
    window.addEventListener('sd:prime-offer-audio', onPrime);
    return () => window.removeEventListener('sd:prime-offer-audio', onPrime);
  }, [primeAlert]);

  // Inbound offer from server → timed ringing modal for instant only.
  // Scheduled / outstation / subscription inbox items go to the Incoming
  // list store (no countdown, no ringtone).
  useSocketEvent(S2C_EVENTS.BOOKING_OFFERED, (payload) => {
    if (
      payload?.inbox
      || payload?.bookingType === BOOKING_TYPE.SCHEDULED
      || payload?.bookingType === BOOKING_TYPE.OUTSTATION
      || payload?.bookingType === 'subscription'
      || payload?.kind === 'subscription'
      || payload?.serviceType === SERVICE_TYPES.OUTSTATION
    ) {
      return;
    }
    hydrateOffer(payload);
  });

  // Server withdrew the offer (timeout / cancellation / picked someone else).
  useSocketEvent(S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, (payload) => {
    const current = useDriverIncomingOfferStore.getState().offer;
    if (!current || String(current.bookingId) === String(payload?.bookingId)) {
      clearOffer();
    }
  });

  // After WebView/tab freeze we can miss the server withdraw — re-check
  // wall-clock expiry whenever the page becomes visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncExpiry();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [syncExpiry]);

  // Ring while there's an active offer; silence otherwise. Keyed on the
  // bookingId so a back-to-back new offer restarts the tone instead of
  // continuing the previous loop.
  useEffect(() => {
    if (offer?.bookingId) {
      playAlert();
      return () => stopAlert();
    }
    stopAlert();
    return undefined;
  }, [offer?.bookingId, playAlert, stopAlert]);

  if (!offer) return null;

  const handleAccept = async () => {
    try {
      const booking = await acceptOffer();
      stopAlert();
      if (booking?._id) {
        navigate(`/driver/trip/${booking._id}`);
      }
    } catch {
      /* error surfaced inline */
    }
  };

  const handleSkip = async () => {
    try {
      await rejectOffer();
      stopAlert();
    } catch {
      /* error surfaced inline */
    }
  };

  const title =
    offer.serviceType === SERVICE_TYPES.OUTSTATION
      ? `${offer.outstation?.days || 1}-day Outstation`
      : `${offer.hourly?.durationHours || ''}h ${SERVICE_TYPE_LABELS.hourly}`;

  // Distance from the driver to the customer's pickup (server-computed during
  // dispatch). Helps the driver decide whether the offer is worth taking.
  const pickupDistanceLabel =
    typeof offer.distanceMeters === 'number'
      ? formatDistance(offer.distanceMeters)
      : null;

  // Pick the colour scheme based on whether this is an instant or
  // scheduled offer so drivers can identify the ride type at a glance.
  // Falls back to the instant theme when bookingType is missing (older
  // server payloads).
  const theme =
    OFFER_THEMES[offer.bookingType] || OFFER_THEMES[BOOKING_TYPE.INSTANT];
  const ThemeIcon = theme.Icon;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-slide-up ${theme.headerRing}`}
      >
        <div className={`relative ${theme.headerBg} px-5 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${theme.badgeBg} ${theme.badgeText}`}
                >
                  <ThemeIcon className="w-3 h-3" />
                  {theme.label}
                </span>
              </div>
              <p
                className={`text-xs font-semibold uppercase tracking-wider mt-2 ${theme.headerText}`}
              >
                New booking offer
              </p>
              <h2 className={`text-xl font-bold mt-1 ${theme.headerHeading}`}>
                {title}
              </h2>
            </div>
            {pickupDistanceLabel && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${theme.pillBg} ${theme.pillText}`}
              >
                <Navigation className="w-3 h-3" />
                {pickupDistanceLabel} to pickup
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">#{offer.bookingNumber}</p>
        </div>

        <div className="p-5 space-y-4">
          {offer.customer && offer.customer.name && (
            <div className="flex items-start gap-3 rounded-2xl bg-bg/60 p-3">
              {offer.customer.profilePicture ? (
                <img
                  src={offer.customer.profilePicture}
                  alt=""
                  className="w-9 h-9 rounded-xl object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <UserIcon className="w-4 h-4 text-primary-dark" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-text-muted">Customer</p>
                <p className="text-sm font-semibold text-text truncate">
                  {offer.customer.name || 'Customer'}
                </p>
              </div>
            </div>
          )}

          {offer.car && (offer.car.vehicleNumber || offer.car.carTypeName) && (
            <div className="flex items-start gap-3 rounded-2xl bg-bg/60 p-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <CarIcon className="w-4 h-4 text-text-secondary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-text-muted">Vehicle</p>
                <p className="text-sm font-semibold text-text truncate">
                  {[offer.car.brandName, offer.car.modelName].filter(Boolean).join(' ') ||
                    offer.car.carTypeName ||
                    'Vehicle'}
                </p>
                <p className="text-[11px] text-text-secondary">
                  {[offer.car.carTypeName, offer.car.transmission, offer.car.fuelTypeName]
                    .filter(Boolean)
                    .join(' · ')}
                  {offer.car.vehicleNumber ? ` · ${offer.car.vehicleNumber}` : ''}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-success mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-text-muted">Pickup</p>
              <p className="text-sm font-medium text-text break-words">{offer.pickup?.address}</p>
              {pickupDistanceLabel && (
                <p className="text-[11px] text-primary-dark font-semibold mt-0.5">
                  {pickupDistanceLabel} away from you
                </p>
              )}
            </div>
          </div>

          {offer.serviceType === SERVICE_TYPES.OUTSTATION && offer.outstation?.destinationAddress && (
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-danger mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-text-muted">Destination</p>
                <p className="text-sm font-medium text-text break-words">
                  {offer.outstation.destinationAddress}
                </p>
              </div>
            </div>
          )}

          {offer.serviceType === SERVICE_TYPES.HOURLY && offer.hourly?.scheduledStartAt && (
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-text-muted">Scheduled start</p>
                <p className="text-sm font-medium text-text">
                  {new Date(offer.hourly.scheduledStartAt).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* The driver only ever sees their own earning — the customer's
              gross fare and the platform commission are never sent to
              the driver app. Server has already subtracted the commission
              for us in `offer.fare.driverEarning`. */}
          <div className="flex items-center justify-between bg-emerald-50 rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-emerald-700" />
              <div>
                <p className="text-[11px] text-emerald-700 font-semibold uppercase tracking-wide">
                  Your earning
                </p>
                <p className="text-base font-bold text-text">
                  {'\u20B9'}{offer.fare?.driverEarning ?? 0}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  After platform commission
                </p>
              </div>
            </div>
            {offer.offerExpiresAt && (
              <CountdownBar
                expiresAt={offer.offerExpiresAt}
                barColorClass={theme.progressBar}
              />
            )}
          </div>

          {error && (
            <div className="text-xs text-danger bg-danger/10 rounded-xl px-3 py-2">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={handleSkip}
              disabled={busy === 'accept'}
              loading={busy === 'reject'}
              icon={SkipForward}
            >
              Skip
            </Button>
            <Button
              fullWidth
              onClick={handleAccept}
              disabled={busy === 'reject'}
              loading={busy === 'accept'}
            >
              {busy === 'accept' ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Accepting…
                </span>
              ) : (
                'Accept'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingOfferModal;
