import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CalendarCheck2,
  CalendarClock,
  Car as CarIcon,
  CheckCircle2,
  Clock,
  Flag,
  HandCoins,
  KeyRound,
  Loader2,
  MapPin,
  Mountain,
  Moon,
  Navigation,
  Pencil,
  Phone,
  Play,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  UserRound,
  Wallet as WalletIcon,
  XCircle,
} from 'lucide-react';
import api from '../../../../utils/api';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Avatar from '../../../../components/Avatar';
import Badge from '../../../../components/Badge';
import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUS,
  isBookingContactRevealed,
} from '../../../../constants/bookingStatus';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import { SERVICE_CATALOG } from '../../home/constants/serviceCatalog';
import { useSocket, useSocketEvent } from '../../../../hooks/useSocket';
import { C2S_EVENTS, S2C_EVENTS } from '../../../../constants/socketEvents';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import { getCarBrandName, getCarModelName } from '../../../../utils/vehicleCatalog';
import { formatPickupDateTime } from '../../../../utils/datetime';
import { maskPersonName } from '../../../../utils/formatters';
import RescheduleBookingSheet, {
  canRescheduleBooking,
} from '../../booking/components/RescheduleBookingSheet';

/**
 * Per-booking detail screen, reachable from any card on /user/activity.
 *
 * Fetches the booking by id (so the page always shows *that* booking
 * even if a different one is currently active) and renders a consistent
 * read-only summary across every status:
 *   - hero header with status pill
 *   - trip details (service, datetime, duration, route)
 *   - driver block (name, photo, rating, call CTA)
 *   - fare breakdown (base + waiting + extensions + GST = total, with the
 *     payment ledger so the user can see what's been paid vs. outstanding)
 *   - status-specific footer (continue tracking for live trips, rate +
 *     invoice for completed, cancellation reason + refund for cancelled)
 */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const formatRupees = (amount) =>
  `\u20B9${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (booking) => {
  if (booking?.hourly?.durationHours) {
    const h = booking.hourly.durationHours;
    return `${h} hour${h > 1 ? 's' : ''}`;
  }
  if (booking?.outstation?.days) {
    const d = booking.outstation.days;
    return `${d} day${d > 1 ? 's' : ''}`;
  }
  return null;
};

const STATUS_STYLES = {
  [BOOKING_STATUS.COMPLETED]: {
    label: 'Completed',
    icon: CheckCircle2,
    pill: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    hero: 'from-emerald-500 to-emerald-700',
  },
  [BOOKING_STATUS.CANCELLED]: {
    label: 'Cancelled',
    icon: XCircle,
    pill: 'bg-rose-100 text-rose-700 border-rose-200',
    hero: 'from-rose-500 to-rose-700',
  },
  [BOOKING_STATUS.NO_DRIVERS_FOUND]: {
    label: 'No drivers found',
    icon: AlertCircle,
    pill: 'bg-rose-100 text-rose-700 border-rose-200',
    hero: 'from-rose-500 to-rose-700',
  },
  [BOOKING_STATUS.SEARCHING]: {
    label: 'Searching driver',
    icon: Loader2,
    pill: 'bg-amber-100 text-amber-700 border-amber-200',
    hero: 'from-amber-500 to-amber-700',
  },
  [BOOKING_STATUS.PENDING_ASSIGNMENT]: {
    label: 'Scheduled',
    icon: Calendar,
    pill: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    hero: 'from-indigo-500 to-indigo-700',
  },
  [BOOKING_STATUS.IN_EMERGENCY_POOL]: {
    label: 'Manual queue',
    icon: AlertCircle,
    pill: 'bg-amber-100 text-amber-700 border-amber-200',
    hero: 'from-amber-500 to-amber-700',
  },
  [BOOKING_STATUS.AWAITING_PAYMENT]: {
    label: 'Awaiting payment',
    icon: WalletIcon,
    pill: 'bg-amber-100 text-amber-700 border-amber-200',
    hero: 'from-amber-500 to-amber-700',
  },
  [BOOKING_STATUS.DRIVER_ASSIGNED]: {
    label: 'Driver assigned',
    icon: Navigation,
    pill: 'bg-sky-100 text-sky-700 border-sky-200',
    hero: 'from-sky-500 to-sky-700',
  },
  [BOOKING_STATUS.EN_ROUTE]: {
    label: 'Driver on the way',
    icon: Navigation,
    pill: 'bg-sky-100 text-sky-700 border-sky-200',
    hero: 'from-sky-500 to-sky-700',
  },
  [BOOKING_STATUS.ARRIVED]: {
    label: 'Driver arrived',
    icon: MapPin,
    pill: 'bg-sky-100 text-sky-700 border-sky-200',
    hero: 'from-sky-500 to-sky-700',
  },
  [BOOKING_STATUS.STARTED]: {
    label: 'Trip in progress',
    icon: Navigation,
    pill: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    hero: 'from-indigo-500 to-indigo-700',
  },
};

const FALLBACK_STATUS_STYLE = {
  label: 'Booking',
  icon: ReceiptText,
  pill: 'bg-gray-100 text-gray-700 border-gray-200',
  hero: 'from-slate-500 to-slate-700',
};

/**
 * Route that owns the live UX for an active booking status. Id-scoped
 * paths (e.g. `/user/book/assigned/:id`) are used wherever the page
 * supports them so a hard refresh keeps the user on the same
 * booking — falling back to the generic `/active` endpoint would
 * surface the wrong trip when the user has multiple active bookings.
 */
const liveRouteForStatus = (status, bookingId) => {
  switch (status) {
    case BOOKING_STATUS.PENDING_ASSIGNMENT:
    case BOOKING_STATUS.IN_EMERGENCY_POOL:
      return '/user/book/scheduled';
    case BOOKING_STATUS.SEARCHING:
      return '/user/book/searching';
    case BOOKING_STATUS.NO_DRIVERS_FOUND:
      return '/user/book/no-drivers';
    case BOOKING_STATUS.AWAITING_PAYMENT:
    case BOOKING_STATUS.DRIVER_ASSIGNED:
    case BOOKING_STATUS.EN_ROUTE:
    case BOOKING_STATUS.ARRIVED:
    // Trip-in-progress also routes to the assigned page so the user
    // stays on the same "one canvas with the live map" surface for
    // the whole post-acceptance lifecycle instead of bouncing into
    // the standalone `/user/tracking/in-progress` screen.
    case BOOKING_STATUS.STARTED:
      return bookingId
        ? `/user/book/assigned/${bookingId}`
        : '/user/book/assigned';
    default:
      return null;
  }
};

const TripDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { emit, isConnected } = useSocket();
  const setActiveBooking = useUserActiveBookingStore((s) => s.setBooking);

  const [booking, setBooking] = useState(() => {
    const active = useUserActiveBookingStore.getState().booking;
    return active && String(active._id) === id ? active : null;
  });
  const [loading, setLoading] = useState(!booking);
  const [error, setError] = useState(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const fetchBooking = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const res = await api.get(`/auth/bookings/${id}`);
      const data = res?.data?.data?.booking || null;
      setBooking(data);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Could not load this trip',
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  // Live refresh for active bookings — anyone watching this detail
  // page benefits from the same socket stream the live tracking pages
  // use. Joins the booking room so emits scoped to the room land too.
  useEffect(() => {
    const bookingId = booking?._id;
    if (!bookingId || !isConnected) return undefined;
    if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) return undefined;
    emit(C2S_EVENTS.BOOKING_JOIN, { bookingId });
    return () => emit(C2S_EVENTS.BOOKING_LEAVE, { bookingId });
  }, [booking?._id, booking?.status, isConnected, emit]);

  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, (payload) => {
    if (!payload?.bookingId) return;
    if (!booking?._id || String(payload.bookingId) !== String(booking._id)) return;
    // Re-pull the canonical record rather than try to merge a partial
    // patch — keeps this page's render math simple and correct.
    fetchBooking();
  });

  const status = booking?.status;
  const statusStyle = STATUS_STYLES[status] || FALLBACK_STATUS_STYLE;
  const StatusIcon = statusStyle.icon;
  const isLive = status && ACTIVE_BOOKING_STATUSES.includes(status);
  const liveRoute = liveRouteForStatus(status, booking?._id);

  const driverPhotoUrl = useMemo(() => {
    const driver = booking?.driverId;
    if (!driver) return null;
    const docs = Array.isArray(driver.documents) ? driver.documents : [];
    const selfie = docs.find((d) => d?.type === 'selfie' && d?.fileUrl);
    return selfie?.fileUrl || driver.profilePicture || null;
  }, [booking?.driverId]);

  const driver = booking?.driverId && typeof booking.driverId === 'object'
    ? booking.driverId
    : null;
  const contactRevealed = isBookingContactRevealed(booking);
  // Same rule as DriverAssignedPage: full name only once the ride has
  // started (or finished). Pre-start statuses keep the masked form.
  const displayDriverName =
    status === BOOKING_STATUS.STARTED || status === BOOKING_STATUS.COMPLETED
      ? driver?.name || 'Driver'
      : maskPersonName(driver?.name) || 'Driver';
  const driverPhone = contactRevealed
    ? driver?.phone_no || driver?.phone || null
    : null;
  const driverCallHref = driverPhone
    ? `tel:${String(driverPhone).replace(/[^+\d]/g, '')}`
    : null;

  const fareBreakdown = booking?.fareSnapshot?.breakdown || {};
  const baseTotal = Number(booking?.fareSnapshot?.total || 0);
  const waitingCharge = Number(booking?.waiting?.chargeRupees || 0);
  const extensions = Array.isArray(booking?.extensions) ? booking.extensions : [];
  const acceptedExtensions = extensions.filter((ext) => ext?.status === 'accepted');
  const extensionTotal = acceptedExtensions.reduce(
    (sum, ext) => sum + (Number(ext?.fareDelta) || 0),
    0,
  );
  const effectiveTotal = round2(baseTotal + waitingCharge + extensionTotal);
  const amountPaid = Number(booking?.payment?.amountPaidRupees || 0);
  const amountDue = Math.max(0, round2(effectiveTotal - amountPaid));

  const serviceLabel =
    SERVICE_TYPE_LABELS[booking?.serviceType] || booking?.serviceType || 'Trip';
  const catalogTitle = SERVICE_CATALOG[booking?.serviceType]?.title || serviceLabel;

  const isOutstation = booking?.serviceType === SERVICE_TYPES.OUTSTATION;
  const scheduledAt =
    (isOutstation
      ? booking?.outstation?.pickupAt || booking?.outstation?.startDate
      : booking?.hourly?.scheduledStartAt) ||
    booking?.timeline?.scheduledFor ||
    null;
  const expectedReturnAt = isOutstation
    ? booking?.outstation?.expectedReturnAt || booking?.outstation?.endDate || null
    : null;
  const createdAt = booking?.createdAt || booking?.timeline?.createdAt;
  const completedAt = booking?.timeline?.completedAt;
  const cancelledAt = booking?.timeline?.cancelledAt;
  const startedAt = booking?.timeline?.startedAt;
  const driverAssignedAt = booking?.timeline?.driverAssignedAt;
  const enRouteAt = booking?.timeline?.enRouteAt;
  const arrivedAt = booking?.timeline?.arrivedAt;

  // Pickup OTP is only meaningful while the driver is on the way to /
  // waiting at the customer. After STARTED it's been verified, before
  // DRIVER_ASSIGNED it doesn't exist yet.
  const otpCode = booking?.rideStartOtp?.code || null;
  const showOtp = otpCode && [
    BOOKING_STATUS.DRIVER_ASSIGNED,
    BOOKING_STATUS.EN_ROUTE,
    BOOKING_STATUS.ARRIVED,
  ].includes(status);

  const car = booking?.carId && typeof booking.carId === 'object'
    ? booking.carId
    : null;

  const handleContinueTracking = () => {
    if (!booking || !liveRoute) return;
    // Live pages call `fetchActive` on mount — seeding the store first
    // means the right booking renders without a flash.
    setActiveBooking(booking);
    navigate(liveRoute);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col bg-bg min-h-dvh items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="flex-1 flex flex-col bg-bg min-h-dvh">
        <PageHeader onBack={() => navigate(-1)} title="Trip details" />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
          <p className="text-sm text-text font-medium">{error || 'Trip not found'}</p>
          <Button variant="ghost" onClick={fetchBooking} className="mt-3">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <PageHeader onBack={() => navigate(-1)} title="Trip details" />

      {/* Hero — status + booking id + total */}
      <div
        className={`bg-gradient-to-br ${statusStyle.hero} text-white px-4 pt-4 pb-6`}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-[11px] font-semibold tracking-wide">
            <StatusIcon
              className={`w-3.5 h-3.5 ${
                status === BOOKING_STATUS.SEARCHING ? 'animate-spin' : ''
              }`}
            />
            {statusStyle.label}
          </span>
          <span className="text-[11px] font-mono text-white/80">
            #{booking.bookingNumber || String(booking._id).slice(-6).toUpperCase()}
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-bold">{catalogTitle}</h1>
        <p className="text-xs text-white/80 mt-0.5">
          {scheduledAt
            ? `Scheduled ${formatDateTime(scheduledAt)}`
            : createdAt
              ? `Booked ${formatDateTime(createdAt)}`
              : ''}
        </p>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-white/70">
              Trip total
            </p>
            <p className="text-2xl font-bold">{formatRupees(effectiveTotal)}</p>
          </div>
          {amountDue > 0 && (
            <span className="px-3 py-1 rounded-full bg-rose-500/30 border border-white/30 text-[11px] font-semibold">
              {formatRupees(amountDue)} due
            </span>
          )}
          {amountDue <= 0 && amountPaid > 0 && (
            <span className="px-3 py-1 rounded-full bg-white/15 border border-white/30 text-[11px] font-semibold">
              Paid
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 -mt-3 pb-28 space-y-3">
        <TripRouteCard
          booking={booking}
          serviceLabel={serviceLabel}
          startedAt={startedAt}
          completedAt={completedAt}
          scheduledAt={scheduledAt}
          expectedReturnAt={expectedReturnAt}
          canReschedule={canRescheduleBooking(booking)}
          onReschedule={() => setRescheduleOpen(true)}
        />

        {/* Pickup OTP — only visible during the driver-en-route window
            so the customer can read it out at pickup. After STARTED it
            stops being useful, before DRIVER_ASSIGNED it doesn't exist
            yet. */}
        {showOtp && (
          <OtpCard
            otp={otpCode}
            status={status}
          />
        )}

        {/* Scheduled-ride milestones — when a booking is queued for
            future search (PENDING_ASSIGNMENT) or sitting in the manual
            assignment pool (IN_EMERGENCY_POOL), surface the timestamps
            the customer's been told to expect so they can self-serve
            "is this still on?". */}
        {(status === BOOKING_STATUS.PENDING_ASSIGNMENT
          || status === BOOKING_STATUS.IN_EMERGENCY_POOL) && (
          <ScheduledTimelineCard booking={booking} />
        )}

        {driver && (
          <DriverCard
            name={displayDriverName}
            photo={driverPhotoUrl}
            phone={driverPhone}
            callHref={driverCallHref}
            rating={driver.rating}
            experienceYears={driver.experienceYears}
          />
        )}

        {/* Vehicle the user booked — populated on both the user and
            driver side of the booking-detail endpoint. */}
        {car && <VehicleCard car={car} />}

        {/* Outstation food + stay arrangement — mirrors the toggles on
            /user/book/confirm so the customer can verify what they
            agreed to handle. The backend stores `needsFood`/`needsStay`
            as the SAME boolean it passes to the pricing engine as
            `foodProvided`/`stayProvided` — so `true` means the customer
            is arranging it (no allowance charged) and `false` means the
            company pays the allowance. */}
        {isOutstation && (
          <FoodStayCard
            needsFood={booking.outstation?.needsFood}
            needsStay={booking.outstation?.needsStay}
            days={booking.outstation?.days || 1}
            nights={booking.outstation?.nights || 0}
          />
        )}

        <FareCard
          booking={booking}
          baseTotal={baseTotal}
          breakdown={fareBreakdown}
          waiting={booking.waiting}
          extensions={acceptedExtensions}
          effectiveTotal={effectiveTotal}
          amountPaid={amountPaid}
          amountDue={amountDue}
          paymentMethod={booking.paymentMethod}
          paymentStatus={booking.paymentStatus}
        />

        {booking.status === BOOKING_STATUS.CANCELLED && booking.cancellation && (
          <CancellationCard
            cancellation={booking.cancellation}
            refund={booking.refund}
            cancelledAt={cancelledAt}
          />
        )}

        {booking.status === BOOKING_STATUS.NO_DRIVERS_FOUND && (
          <Card className="bg-rose-50 border border-rose-100">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-rose-900">
                  No drivers were available
                </p>
                <p className="text-xs text-rose-800 mt-0.5">
                  Your payment is still held. Search again from the booking
                  screen, or cancel to get a full refund to your wallet.
                </p>
              </div>
            </div>
          </Card>
        )}

        <BookingTimeline
          status={status}
          createdAt={createdAt}
          driverAssignedAt={driverAssignedAt}
          enRouteAt={enRouteAt}
          arrivedAt={arrivedAt}
          startedAt={startedAt}
          completedAt={completedAt}
          cancelledAt={cancelledAt}
          paymentReceivedAt={booking?.timeline?.paymentReceivedAt}
          paymentStatus={booking?.paymentStatus}
          amountPaid={amountPaid}
          amountDue={amountDue}
          scheduledAt={scheduledAt}
          expectedReturnAt={expectedReturnAt}
        />
      </div>

      {/* Fixed footer actions */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-border-light px-4 py-3 z-30">
        {isLive && liveRoute ? (
          <Button fullWidth onClick={handleContinueTracking} icon={Navigation}>
            Continue tracking
          </Button>
        ) : booking.status === BOOKING_STATUS.COMPLETED ? (
          <Button
            fullWidth
            variant="primary"
            onClick={() => navigate('/user/book/service')}
            icon={CarIcon}
          >
            Book again
          </Button>
        ) : (
          <Button fullWidth variant="ghost" onClick={() => navigate(-1)}>
            Back to my trips
          </Button>
        )}
      </div>

      <RescheduleBookingSheet
        open={rescheduleOpen}
        booking={booking}
        onClose={() => setRescheduleOpen(false)}
        onSaved={(next) => {
          if (next) {
            setBooking(next);
            if (
              useUserActiveBookingStore.getState().booking
              && String(useUserActiveBookingStore.getState().booking._id) === String(next._id)
            ) {
              setActiveBooking(next);
            }
          } else {
            fetchBooking();
          }
        }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function PageHeader({ onBack, title }) {
  return (
    <div className="sticky top-0 bg-white px-4 py-3 shadow-sm z-30 flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="p-2 -ml-2 rounded-xl hover:bg-gray-100"
        aria-label="Back"
      >
        <ArrowLeft className="w-5 h-5 text-text" />
      </button>
      <h1 className="text-base font-bold text-text">{title}</h1>
    </div>
  );
}

function TripRouteCard({
  booking,
  serviceLabel,
  startedAt,
  completedAt,
  scheduledAt,
  expectedReturnAt,
  canReschedule = false,
  onReschedule,
}) {
  const isHourly = booking.serviceType === SERVICE_TYPES.HOURLY;
  const isOutstation = booking.serviceType === SERVICE_TYPES.OUTSTATION;
  const durationLabel = formatDuration(booking);
  const pickup = booking.pickup?.address;
  // Outstation persists its destination on `outstation.destinationAddress`
  // (the original schema) — fall back to the generic `dropoff` so we
  // never miss it on either side of the data model evolution.
  const dropoff = booking.dropoff?.address
    || (isOutstation ? booking.outstation?.destinationAddress : null);
  const distance = booking.fareSnapshot?.breakdown?.distanceKm;
  const days = booking.outstation?.days || 0;
  const nights = booking.outstation?.nights || 0;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">Trip route</h3>
        <span className="text-[11px] font-semibold uppercase tracking-wide bg-primary/10 text-primary-dark px-2 py-0.5 rounded-full inline-flex items-center gap-1">
          {isOutstation ? (
            <Mountain className="w-3 h-3" />
          ) : (
            <Clock className="w-3 h-3" />
          )}
          {serviceLabel}
        </span>
      </div>

      <div className="relative pl-7">
        <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />

        <div className="relative mb-3">
          <span className="absolute -left-7 top-1 inline-flex w-4 h-4 items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
          </span>
          <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">
            Pickup
          </p>
          <p className="text-sm text-text leading-snug">
            {pickup || 'Pickup location'}
          </p>
        </div>

        {dropoff ? (
          <div className="relative">
            <span className="absolute -left-7 top-1 inline-flex w-4 h-4 items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            </span>
            <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">
              {isOutstation ? 'Destination (round trip)' : 'Destination'}
            </p>
            <p className="text-sm text-text leading-snug">{dropoff}</p>
          </div>
        ) : (
          <div className="relative">
            <span className="absolute -left-7 top-1 inline-flex w-4 h-4 items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-primary bg-white" />
            </span>
            <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">
              {isHourly ? 'Around the city' : 'Multi-day trip'}
            </p>
            <p className="text-sm text-text leading-snug">
              Driver stays with you for the booked duration.
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border-light grid grid-cols-2 gap-3 text-xs">
        {scheduledAt && (
          <DetailTile
            icon={CalendarClock}
            label={isOutstation ? 'Pickup' : 'Scheduled'}
            value={formatPickupDateTime(scheduledAt)}
          />
        )}
        {isOutstation && expectedReturnAt && (
          <DetailTile
            icon={Calendar}
            label="Expected return"
            value={formatPickupDateTime(expectedReturnAt)}
          />
        )}
        {durationLabel && (
          <DetailTile
            icon={Clock}
            label={isOutstation ? 'Days' : 'Duration'}
            value={durationLabel}
          />
        )}
        {isOutstation && nights > 0 && (
          <DetailTile
            icon={Moon}
            label="Nights"
            value={`${nights} night${nights === 1 ? '' : 's'}`}
          />
        )}
        {distance ? (
          <DetailTile icon={Navigation} label="Distance" value={`${distance} km`} />
        ) : null}
        {startedAt && (
          <DetailTile icon={Calendar} label="Started" value={formatDateTime(startedAt)} />
        )}
        {completedAt && (
          <DetailTile
            icon={CheckCircle2}
            label="Completed"
            value={formatDateTime(completedAt)}
          />
        )}
        {isOutstation && days > 0 && nights === 0 && (
          <DetailTile
            icon={Sun}
            label="Same-day trip"
            value="No overnight stay"
          />
        )}
      </div>

      {canReschedule && (
        <button
          type="button"
          onClick={onReschedule}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 text-primary font-semibold text-sm py-2.5 hover:bg-primary/10 transition"
        >
          <Pencil className="w-3.5 h-3.5" />
          Change pickup time
        </button>
      )}
    </Card>
  );
}

function DetailTile({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 mt-0.5 text-text-muted shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">
          {label}
        </p>
        <p className="text-sm text-text font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function DriverCard({ name, photo, phone, callHref, rating, experienceYears }) {
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold mb-3">
        Driver
      </p>
      <div className="flex items-center gap-3">
        <Avatar src={photo} name={name || 'Driver'} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-text truncate">
              {name || 'Your driver'}
            </p>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
            {rating ? (
              <span className="inline-flex items-center gap-0.5 text-amber-600 font-medium">
                <Star className="w-3 h-3 fill-amber-500 stroke-amber-500" />
                {Number(rating).toFixed(1)}
              </span>
            ) : null}
            {experienceYears ? (
              <span className="truncate">{experienceYears}+ yrs experience</span>
            ) : null}
            {phone && (
              <span className="truncate">{phone}</span>
            )}
          </div>
        </div>
        {callHref && (
          <a
            href={callHref}
            className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm hover:bg-emerald-600 transition-colors"
            aria-label={`Call ${name || 'driver'}`}
          >
            <Phone className="w-4 h-4" />
          </a>
        )}
      </div>
    </Card>
  );
}

function FareCard({
  booking,
  baseTotal,
  breakdown,
  waiting,
  extensions,
  effectiveTotal,
  amountPaid,
  amountDue,
  paymentMethod,
  paymentStatus,
}) {
  const isOutstation = booking?.serviceType === SERVICE_TYPES.OUTSTATION;
  const isHourly = booking?.serviceType === SERVICE_TYPES.HOURLY;
  const lines = [];

  // Show the engine's component lines when we have them — otherwise
  // fall back to a single "Base fare" row so older bookings (which
  // didn't snapshot a granular breakdown) still render cleanly.
  if (isOutstation) {
    const days = Number(breakdown?.days) || booking?.outstation?.days || 0;
    const nights = Number(breakdown?.nights) || booking?.outstation?.nights || 0;
    const daily = Number(breakdown?.dailyRateTotal) || 0;
    const food = Number(breakdown?.foodAllowanceTotal) || 0;
    const stay = Number(breakdown?.stayAllowanceTotal) || 0;
    const legacy = Number(breakdown?.legacyAllowanceTotal) || 0;
    if (daily > 0) {
      lines.push({
        label: days > 0 ? `Daily rate \u00d7 ${days}` : 'Daily rate',
        value: daily,
      });
    }
    if (food > 0) {
      lines.push({
        label: days > 0 ? `Driver food \u00d7 ${days}` : 'Driver food',
        value: food,
      });
    }
    if (stay > 0) {
      lines.push({
        label: nights > 0 ? `Driver stay \u00d7 ${nights}` : 'Driver stay',
        value: stay,
      });
    }
    if (legacy > 0) {
      lines.push({
        label: nights > 0 ? `Driver allowance \u00d7 ${nights}` : 'Driver allowance',
        value: legacy,
      });
    }
    // If none of the granular fields landed in the snapshot (legacy
    // booking), drop back to the catch-all base-fare row.
    if (lines.length === 0 && baseTotal > 0) {
      lines.push({ label: 'Base fare', value: baseTotal });
    }
  } else if (isHourly) {
    const hours = Number(breakdown?.hours) || booking?.hourly?.durationHours || 0;
    const slabTotal = Number(breakdown?.slabTotal)
      || Number(breakdown?.hourlyTotal)
      || 0;
    if (slabTotal > 0 && hours > 0) {
      lines.push({
        label: `Hourly rate \u00d7 ${hours}h`,
        value: slabTotal,
      });
    } else if (baseTotal > 0) {
      lines.push({ label: 'Base fare', value: baseTotal });
    }
  } else if (baseTotal > 0) {
    lines.push({ label: 'Base fare', value: baseTotal });
  }

  const couponDiscount = Number(breakdown?.couponDiscount) || 0;
  if (couponDiscount > 0) {
    const code = booking?.fareSnapshot?.couponCode;
    lines.push({
      label: code ? `Coupon (${code})` : 'Coupon discount',
      value: -couponDiscount,
      muted: true,
    });
  }
  const serviceCharge =
    Number(breakdown?.platformFee ?? breakdown?.serviceCharge) || 0;
  if (serviceCharge > 0) {
    lines.push({ label: 'Platform fee', value: serviceCharge, muted: true });
  }
  const gst = Number(breakdown?.gst ?? breakdown?.gstAmount) || 0;
  if (gst > 0) {
    lines.push({ label: 'GST', value: gst, muted: true });
  }
  if (waiting?.chargeRupees > 0) {
    lines.push({
      label: `Waiting (${waiting.billableMinutes || 0} min)`,
      value: waiting.chargeRupees,
      pillNote: waiting.noShow ? 'No-show' : null,
    });
  }
  extensions.forEach((ext, idx) => {
    lines.push({
      label: `Extension ${extensions.length > 1 ? idx + 1 : ''} (+${ext.additionalHours}h)`,
      value: ext.fareDelta,
    });
  });
  const bufferRefund = Number(waiting?.bufferRefundRupees) || 0;
  // Surface any waiting-buffer money we sent back to the wallet as
  // its own muted row so the customer can reconcile it against their
  // wallet ledger. We render it with a "(refunded)" tag instead of a
  // negative number to avoid the awkward "₹-50.00" formatting.
  if (bufferRefund > 0) {
    lines.push({
      label: 'Waiting buffer refunded',
      value: bufferRefund,
      muted: true,
      refund: true,
    });
  }

  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold mb-3">
        Fare breakdown
      </p>
      <div className="space-y-1.5">
        {lines.length === 0 ? (
          <div className="text-sm text-text-muted">No charges recorded</div>
        ) : (
          lines.map((line, idx) => (
            <div
              key={`${line.label}-${idx}`}
              className="flex items-center justify-between gap-3"
            >
              <span
                className={`text-sm ${line.muted ? 'text-text-muted' : 'text-text'}`}
              >
                {line.label}
                {line.pillNote && (
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full">
                    {line.pillNote}
                  </span>
                )}
              </span>
              <span
                className={`text-sm tabular-nums ${
                  line.refund
                    ? 'text-emerald-700 font-medium'
                    : line.muted
                      ? 'text-text-muted'
                      : 'text-text font-medium'
                }`}
              >
                {line.refund ? '\u2212 ' : ''}
                {formatRupees(line.value)}
              </span>
            </div>
          ))
        )}

        <div className="mt-3 pt-3 border-t border-border-light flex items-center justify-between">
          <span className="text-sm font-semibold text-text">Total</span>
          <span className="text-base font-bold text-text tabular-nums">
            {formatRupees(effectiveTotal)}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-text-muted">Paid so far</span>
          <span className="text-text font-medium tabular-nums">
            {formatRupees(amountPaid)}
          </span>
        </div>
        {amountDue > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-rose-700 font-medium">Outstanding</span>
            <span className="text-rose-700 font-semibold tabular-nums">
              {formatRupees(amountDue)}
            </span>
          </div>
        )}
      </div>

      {(paymentMethod || paymentStatus) && (
        <div className="mt-3 pt-3 border-t border-border-light flex items-center justify-between text-xs">
          <span className="text-text-muted">
            Paid via{' '}
            <span className="text-text font-medium capitalize">
              {paymentMethod || '—'}
            </span>
          </span>
          {paymentStatus && (
            <Badge variant={paymentStatus === 'paid' ? 'success' : 'warning'}>
              {paymentStatus}
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}

function CancellationCard({ cancellation, refund, cancelledAt }) {
  const reasonKey = cancellation?.reason ? String(cancellation.reason) : '';
  const REASON_LABELS = {
    no_driver_by_ride_time:
      'No driver assigned by ride time — full refund issued',
    no_drivers_available: 'No drivers available',
    cancelled_by_user_after_no_drivers: 'Cancelled after no drivers found',
    cancelled_by_user: 'Cancelled by you',
    cancelled_by_user_after_start: 'Cancelled after trip started',
    cancelled_by_admin: 'Cancelled by support',
    cancelled_by_driver: 'Cancelled by driver',
    payment_timeout: 'Payment not completed in time',
  };
  const reasonText =
    REASON_LABELS[reasonKey] ||
    (reasonKey ? reasonKey.replace(/_/g, ' ') : 'Cancelled');
  const byLabel =
    cancellation?.cancelledBy === 'system'
      ? 'Auto-cancelled'
      : cancellation?.cancelledBy
        ? `Cancelled by ${cancellation.cancelledBy}`
        : 'Cancelled';
  return (
    <Card className="bg-rose-50 border border-rose-100">
      <div className="flex items-start gap-3">
        <XCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-rose-900 capitalize">
            {byLabel}
          </p>
          <p className="text-xs text-rose-800 mt-0.5">{reasonText}</p>
          {cancelledAt && (
            <p className="text-[11px] text-rose-700/80 mt-1">
              {formatDateTime(cancelledAt)}
            </p>
          )}
        </div>
      </div>
      {refund && refund.amount > 0 && (
        <div className="mt-3 pt-3 border-t border-rose-200/60 flex items-center justify-between text-xs">
          <span className="text-rose-700 font-medium">Refunded</span>
          <span className="text-rose-900 font-semibold">
            {formatRupees(refund.amount)} {refund.method ? `\u00B7 ${refund.method}` : ''}
          </span>
        </div>
      )}
    </Card>
  );
}

function BookingTimeline({
  status,
  createdAt,
  driverAssignedAt,
  enRouteAt,
  arrivedAt,
  startedAt,
  completedAt,
  cancelledAt,
  paymentReceivedAt,
  paymentStatus,
  amountPaid = 0,
  amountDue = 0,
  scheduledAt,
  expectedReturnAt,
}) {
  const isCancelled = status === BOOKING_STATUS.CANCELLED || !!cancelledAt;
  const paymentDone =
    !!paymentReceivedAt ||
    paymentStatus === 'paid' ||
    (amountDue <= 0 && amountPaid > 0 && status === BOOKING_STATUS.COMPLETED);

  const steps = buildTimelineSteps({
    status,
    isCancelled,
    createdAt,
    driverAssignedAt,
    enRouteAt,
    arrivedAt,
    startedAt,
    completedAt,
    cancelledAt,
    paymentReceivedAt,
    paymentDone,
  });

  const completedCount = steps.filter((s) => s.state === 'completed').length;
  const hasInProgress = steps.some((s) => s.state === 'current');
  const allDone = steps.every((s) => s.state === 'completed');

  let headerBadge;
  if (isCancelled) {
    headerBadge = {
      label: 'Cancelled',
      className: 'bg-rose-50 text-rose-700',
    };
  } else if (allDone) {
    headerBadge = {
      label: 'All completed',
      className: 'bg-emerald-50 text-emerald-700',
    };
  } else if (completedCount > 0 || hasInProgress) {
    headerBadge = {
      label: 'Completed till now',
      className: 'bg-emerald-50 text-emerald-700',
    };
  } else {
    headerBadge = {
      label: 'Upcoming',
      className: 'bg-slate-100 text-slate-600',
    };
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <CalendarClock className="w-4 h-4 text-amber-700" />
          </span>
          <h3 className="text-[11px] uppercase tracking-wide font-bold text-text">
            Booking Timeline
          </h3>
        </div>
        <span
          className={`inline-flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${headerBadge.className}`}
        >
          <Clock className="w-3 h-3" />
          {headerBadge.label}
        </span>
      </div>

      {(scheduledAt || expectedReturnAt) && (
        <div className="mt-3 mb-1 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 space-y-1">
          {scheduledAt && (
            <p className="text-[11px] text-text-muted">
              Scheduled for{' '}
              <span className="font-semibold text-text">{formatDateTime(scheduledAt)}</span>
            </p>
          )}
          {expectedReturnAt && (
            <p className="text-[11px] text-text-muted">
              Expected return{' '}
              <span className="font-semibold text-text">{formatDateTime(expectedReturnAt)}</span>
            </p>
          )}
        </div>
      )}

      <ol className="mt-2">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const next = steps[index + 1];
          return (
            <TimelineStepRow
              key={step.id}
              step={step}
              isLast={isLast}
              nextState={next?.state}
            />
          );
        })}
      </ol>
    </Card>
  );
}

function buildTimelineSteps({
  status,
  isCancelled,
  createdAt,
  driverAssignedAt,
  enRouteAt,
  arrivedAt,
  startedAt,
  completedAt,
  cancelledAt,
  paymentReceivedAt,
  paymentDone,
}) {
  const reached = {
    created: true,
    assigned:
      !!driverAssignedAt ||
      [
        BOOKING_STATUS.DRIVER_ASSIGNED,
        BOOKING_STATUS.AWAITING_PAYMENT,
        BOOKING_STATUS.EN_ROUTE,
        BOOKING_STATUS.ARRIVED,
        BOOKING_STATUS.STARTED,
        BOOKING_STATUS.COMPLETED,
      ].includes(status),
    enRoute:
      !!enRouteAt ||
      [
        BOOKING_STATUS.EN_ROUTE,
        BOOKING_STATUS.ARRIVED,
        BOOKING_STATUS.STARTED,
        BOOKING_STATUS.COMPLETED,
      ].includes(status),
    arrived:
      !!arrivedAt ||
      [BOOKING_STATUS.ARRIVED, BOOKING_STATUS.STARTED, BOOKING_STATUS.COMPLETED].includes(
        status,
      ),
    started:
      !!startedAt ||
      [BOOKING_STATUS.STARTED, BOOKING_STATUS.COMPLETED].includes(status),
    completed: !!completedAt || status === BOOKING_STATUS.COMPLETED,
    payment: paymentDone,
  };

  // Active booking status → which step is "In Progress"
  let currentId = null;
  if (!isCancelled) {
    if (status === BOOKING_STATUS.STARTED) currentId = 'started';
    else if (status === BOOKING_STATUS.ARRIVED) currentId = 'arrived';
    else if (status === BOOKING_STATUS.EN_ROUTE) currentId = 'enRoute';
    else if (
      status === BOOKING_STATUS.DRIVER_ASSIGNED ||
      status === BOOKING_STATUS.AWAITING_PAYMENT
    ) {
      currentId = 'assigned';
    } else if (!reached.assigned) currentId = 'assigned';
    else if (!reached.enRoute) currentId = 'enRoute';
    else if (!reached.arrived) currentId = 'arrived';
    else if (!reached.started) currentId = 'started';
    else if (!reached.completed) currentId = 'completed';
    else if (!reached.payment) currentId = 'payment';
  }

  const stateFor = (id, done) => {
    if (id === currentId) return 'current';
    if (done) return 'completed';
    return 'pending';
  };

  const steps = [
    {
      id: 'created',
      title: 'Booking Created',
      at: createdAt,
      accent: 'green',
      Icon: CalendarCheck2,
      state: 'completed',
    },
    {
      id: 'assigned',
      title: 'Driver Assigned',
      at: driverAssignedAt,
      accent: 'green',
      Icon: UserRound,
      state: stateFor('assigned', reached.assigned),
    },
    {
      id: 'enRoute',
      title: 'Driver En Route',
      at: enRouteAt,
      accent: 'amber',
      Icon: CarIcon,
      state: stateFor('enRoute', reached.enRoute),
    },
    {
      id: 'arrived',
      title: 'Driver Arrived',
      at: arrivedAt,
      accent: 'green',
      Icon: MapPin,
      state: stateFor('arrived', reached.arrived),
    },
    {
      id: 'started',
      title: 'Trip Started',
      at: startedAt,
      accent: 'blue',
      Icon: Play,
      state: stateFor('started', reached.started),
    },
  ];

  if (isCancelled) {
    steps.push({
      id: 'cancelled',
      title: 'Trip Cancelled',
      at: cancelledAt,
      accent: 'rose',
      Icon: XCircle,
      state: 'completed',
    });
    return steps;
  }

  steps.push(
    {
      id: 'completed',
      title: 'Trip Completed',
      at: completedAt,
      accent: 'green',
      Icon: Flag,
      state: stateFor('completed', reached.completed),
    },
    {
      id: 'payment',
      title: 'Payment Completed',
      at: paymentReceivedAt,
      accent: 'green',
      Icon: WalletIcon,
      state: stateFor('payment', reached.payment),
    },
  );

  return steps;
}

const TIMELINE_ACCENT = {
  green: {
    iconBg: 'bg-emerald-500',
    iconText: 'text-white',
    line: 'bg-emerald-500',
  },
  amber: {
    iconBg: 'bg-amber-400',
    iconText: 'text-white',
    line: 'bg-amber-400',
  },
  blue: {
    iconBg: 'bg-sky-500',
    iconText: 'text-white',
    line: 'bg-sky-400',
  },
  rose: {
    iconBg: 'bg-rose-500',
    iconText: 'text-white',
    line: 'bg-rose-400',
  },
  gray: {
    iconBg: 'bg-slate-200',
    iconText: 'text-slate-500',
    line: 'bg-slate-200',
  },
};

function TimelineStepRow({ step, isLast, nextState }) {
  const accent =
    step.state === 'pending'
      ? TIMELINE_ACCENT.gray
      : TIMELINE_ACCENT[step.accent] || TIMELINE_ACCENT.green;
  const Icon = step.Icon;

  const badge =
    step.state === 'completed'
      ? { label: 'Completed', className: 'bg-emerald-50 text-emerald-700' }
      : step.state === 'current'
        ? { label: 'In Progress', className: 'bg-sky-50 text-sky-700' }
        : { label: 'Pending', className: 'bg-slate-100 text-slate-500' };

  // Solid green/amber when both this and next are done; dashed after current / pending.
  let connectorClass = 'border-l-2 border-dashed border-slate-200';
  if (step.state === 'completed' && nextState === 'completed') {
    connectorClass = `${accent.line} w-0.5 border-0`;
  } else if (
    step.state === 'current' ||
    (step.state === 'completed' && nextState === 'current')
  ) {
    connectorClass = 'border-l-2 border-dashed border-sky-300';
  }

  const subtext = step.at
    ? formatDateTime(step.at)
    : step.state === 'pending'
      ? 'Pending'
      : step.state === 'current'
        ? 'In progress'
        : '';

  return (
    <li className="relative flex gap-3 py-3 border-b border-slate-100 last:border-b-0">
      <div className="relative flex flex-col items-center shrink-0 w-9">
        <span
          className={`relative z-[1] w-9 h-9 rounded-full flex items-center justify-center ${accent.iconBg} ${accent.iconText} shadow-sm`}
        >
          <Icon
            className="w-4 h-4"
            fill={step.id === 'started' && step.state !== 'pending' ? 'currentColor' : 'none'}
          />
        </span>
        {!isLast && (
          <span
            className={`absolute top-9 bottom-[-12px] left-1/2 -translate-x-1/2 w-0 ${connectorClass}`}
            aria-hidden
          />
        )}
      </div>

      <div className="flex-1 min-w-0 flex items-start justify-between gap-2 pt-1">
        <div className="min-w-0">
          <p
            className={`text-sm font-bold truncate ${
              step.state === 'pending' ? 'text-slate-400' : 'text-text'
            }`}
          >
            {step.title}
          </p>
          <p className="text-[11px] text-text-muted mt-0.5 truncate">{subtext}</p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
    </li>
  );
}

function VehicleCard({ car }) {
  const title = `${getCarBrandName(car)} \u00b7 ${getCarModelName(car)}`;
  const transmission = car?.transmission || null;
  const fuel = car?.fuelTypeId?.name || null;
  const carType = car?.carTypeId?.name || null;
  const plate = car?.vehicleNumber || null;
  const meta = [carType, transmission, fuel].filter(Boolean).join(' \u00b7 ');
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold mb-3">
        Your vehicle
      </p>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 overflow-hidden">
          {car?.image ? (
            <img src={car.image} alt={title} className="w-full h-full object-cover" />
          ) : (
            <CarIcon className="w-5 h-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text truncate">{title}</p>
          {meta && (
            <p className="text-[12px] text-text-muted truncate">{meta}</p>
          )}
        </div>
        {plate && (
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wide bg-slate-100 text-slate-700 px-2 py-1 rounded-md">
            {plate}
          </span>
        )}
      </div>
    </Card>
  );
}

function FoodStayCard({ needsFood, needsStay, days, nights }) {
  // `needsFood === true` means the customer IS arranging food (matches
  // the backend's `foodProvided` semantic — see booking.service.js's
  // `foodProvided: outstation?.needsFood ?? true`), so the allowance
  // is waived and no charge lands in the fare.
  const customerArrangingFood = needsFood === true;
  const customerArrangingStay = needsStay === true;
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold mb-3">
        Driver food & stay
      </p>
      <div className="space-y-2.5">
        <FactRow
          icon={Sun}
          label="Driver's food"
          value={
            customerArrangingFood
              ? 'You\u2019re arranging \u2014 no charge'
              : `Included in fare \u00b7 ${days} day${days === 1 ? '' : 's'}`
          }
          tone={customerArrangingFood ? 'emerald' : 'indigo'}
          hint={
            customerArrangingFood
              ? `You\u2019ll feed the driver directly for all ${days} day${days === 1 ? '' : 's'}.`
              : `Your fare covers the driver\u2019s meals across the trip (${days} day${days === 1 ? '' : 's'}).`
          }
        />
        <FactRow
          icon={Moon}
          label="Driver's stay"
          value={
            nights <= 0
              ? 'Same-day trip \u2014 no overnight stay'
              : customerArrangingStay
                ? 'You\u2019re arranging \u2014 no charge'
                : `Included in fare \u00b7 ${nights} night${nights === 1 ? '' : 's'}`
          }
          tone={
            nights <= 0
              ? 'slate'
              : customerArrangingStay
                ? 'emerald'
                : 'indigo'
          }
          hint={
            nights <= 0
              ? null
              : customerArrangingStay
                ? `You\u2019ll host the driver overnight for all ${nights} night${nights === 1 ? '' : 's'}.`
                : `Your fare covers the driver\u2019s lodging across the trip (${nights} night${nights === 1 ? '' : 's'}).`
          }
        />
      </div>
    </Card>
  );
}

function FactRow({ icon: Icon, label, value, tone = 'slate', hint = null }) {
  const palette = {
    emerald: { bg: 'bg-emerald-50 text-emerald-700', text: 'text-emerald-800' },
    amber: { bg: 'bg-amber-50 text-amber-700', text: 'text-amber-800' },
    indigo: { bg: 'bg-indigo-50 text-indigo-700', text: 'text-indigo-800' },
    slate: { bg: 'bg-slate-100 text-slate-600', text: 'text-text-muted' },
  }[tone];
  return (
    <div className="flex items-start gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${palette.bg}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">
          {label}
        </p>
        <p className={`text-sm font-semibold ${palette.text}`}>{value}</p>
        {hint && (
          <p className="text-[11px] text-text-muted leading-snug mt-0.5">{hint}</p>
        )}
      </div>
    </div>
  );
}

function OtpCard({ otp, status }) {
  const label =
    status === BOOKING_STATUS.ARRIVED
      ? 'Read this code to your driver'
      : 'Share at pickup';
  const digits = String(otp).split('');
  return (
    <Card className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white text-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
          <KeyRound className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-indigo-700 font-semibold">
            Pickup OTP
          </p>
          <p className="text-sm text-indigo-900 mb-2">{label}</p>
          <div className="flex gap-1.5">
            {digits.map((d, idx) => (
              <span
                key={`otp-${idx}`}
                className="w-9 h-10 rounded-lg bg-white text-indigo-900 font-bold text-lg flex items-center justify-center shadow-sm tabular-nums"
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ScheduledTimelineCard({ booking }) {
  const inPool = booking.status === BOOKING_STATUS.IN_EMERGENCY_POOL;
  const assignAt = booking?.scheduled?.assignAt;
  const escalateAt = booking?.scheduled?.escalateAt;
  const enteredAt = booking?.scheduled?.emergencyPool?.enteredAt;
  const tier = booking?.scheduled?.tier;
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">
          Scheduled dispatch
        </p>
        {tier && (
          <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
            {tier.replace(/_/g, ' ')}
          </span>
        )}
      </div>
      <div className="space-y-2.5">
        {inPool ? (
          <FactRow
            icon={AlertCircle}
            label="Manual assignment"
            value={
              enteredAt
                ? `In queue since ${formatDateTime(enteredAt)}`
                : 'Our team is assigning a driver'
            }
            tone="amber"
            hint="Drivers in your area were busy, so an operator is hand-picking one for you."
          />
        ) : (
          <>
            {assignAt && (
              <FactRow
                icon={Sparkles}
                label="Driver search starts"
                value={formatDateTime(assignAt)}
                tone="emerald"
                hint="We start looking a few hours before pickup so the closest, best-rated driver gets your ride."
              />
            )}
            {escalateAt && (
              <FactRow
                icon={ShieldCheck}
                label="Backup window"
                value={formatDateTime(escalateAt)}
                tone="slate"
                hint="If we still don't have a driver by then, our team takes over and assigns one manually."
              />
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export default TripDetailsPage;
