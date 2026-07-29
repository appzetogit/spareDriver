import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Star,
} from 'lucide-react';
import Avatar from '../../../../components/Avatar';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { mergeLiveBookingIntoList } from '../../../../utils/mergeLiveBooking';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useUserBookingsStore } from '../../../../store/user/useUserBookingsStore';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUS,
} from '../../../../constants/bookingStatus';
import { SERVICE_CATALOG } from '../../home/constants/serviceCatalog';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import { useSocketEvent } from '../../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../../constants/socketEvents';

/**
 * /user/activity — the user's "My Trips" rail.
 *
 * Tabbed list of bookings — Active / Completed / Cancelled. Every row
 * (including any currently-live trip) uses the same `TripHistoryCard`
 * component so the layout never shifts between phases, and every
 * click opens the dedicated `/user/trips/:id` details page — that
 * page fetches the specific booking, so the user never lands on
 * "some other ride" when they tap a card.
 */

const TABS = ['Active', 'Completed', 'Cancelled'];

const ActivityPage = () => {
  const navigate = useNavigate();
  const activeBooking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);
  const applyActiveUpdate = useUserActiveBookingStore((s) => s.applyUpdate);
  const clearActiveBooking = useUserActiveBookingStore((s) => s.clear);
  const [activeTab, setActiveTab] = useState('Active');

  const {
    data: bookings = [],
    loading,
    error,
    refetch,
  } = useCachedQuery(
    useUserBookingsStore,
    buildCacheKey('user-bookings-history'),
  );

  // Force a fresh fetch on mount so we don't render a stale cached
  // status (e.g. SearchingDriverPage may have left the cache at
  // SEARCHING). Both stores get refreshed in parallel.
  useEffect(() => {
    fetchActive().catch(() => {});
    refetch?.().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live socket → keep both stores in lockstep so the list cards
  // reflect dispatcher events that fire while the user is looking at
  // this page.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useSocketEvent(
    S2C_EVENTS.BOOKING_UPDATED,
    useCallback(
      (payload) => {
        if (!payload) return;
        applyActiveUpdate(payload);
        if (
          payload.status === BOOKING_STATUS.COMPLETED ||
          payload.status === BOOKING_STATUS.CANCELLED
        ) {
          clearActiveBooking();
        }
        refetchRef.current?.().catch(() => {});
      },
      [applyActiveUpdate, clearActiveBooking],
    ),
  );

  // Merge the live (socket-updated) booking into the list so the
  // active row always reflects the freshest lifecycle phase. Both
  // sources can disagree by a tick — the active-booking store updates
  // over socket; the history list updates on refetch — and we want
  // the rendered card to show the more advanced status when they
  // diverge.
  const mergedBookings = useMemo(
    () => mergeLiveBookingIntoList(activeBooking, bookings),
    [activeBooking, bookings],
  );

  const filtered = useMemo(() => {
    return (mergedBookings || []).filter((b) => {
      if (activeTab === 'Completed') return b.status === BOOKING_STATUS.COMPLETED;
      if (activeTab === 'Cancelled') {
        return b.status === BOOKING_STATUS.CANCELLED;
      }
      return ACTIVE_BOOKING_STATUSES.includes(b.status);
    });
  }, [mergedBookings, activeTab]);

  // Every card navigates to the dedicated detail page so the user
  // always sees the booking they tapped on — not the currently-active
  // booking that the tracking pages auto-load.
  const openTrip = useCallback(
    (bookingId) => {
      if (!bookingId) return;
      navigate(`/user/trips/${bookingId}`);
    },
    [navigate],
  );

  return (
    <div className="flex-1 flex flex-col bg-bg">
      <div className="sticky top-0 bg-white px-4 pt-5 pb-0 shadow-sm z-30">
        <h1 className="text-xl font-bold text-text mb-4">My Trips</h1>
        <div className="flex gap-1 overflow-x-auto pb-0 -mx-4 px-4 scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-semibold rounded-t-xl whitespace-nowrap transition-all duration-200
                ${
                  activeTab === tab
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-text-muted hover:text-text hover:bg-gray-50'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 space-y-3 overflow-y-auto pb-20">
        {loading && (!bookings || bookings.length === 0) ? (
          <div className="flex-1 flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <AlertCircle className="w-12 h-12 text-danger mb-3 opacity-50" />
            <p className="text-sm text-text-muted">Failed to load bookings</p>
            <button
              type="button"
              onClick={refetch}
              className="mt-3 text-sm text-primary font-medium"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          filtered.map((booking, idx) => (
            <TripHistoryCard
              key={booking._id}
              booking={booking}
              onOpen={() => openTrip(booking._id)}
              indexInList={idx}
            />
          ))
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* TripHistoryCard — single source of truth for every row             */
/* ------------------------------------------------------------------ */

const STATUS_BADGES = {
  [BOOKING_STATUS.COMPLETED]: {
    label: 'Completed',
    icon: CheckCircle2,
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    accent: 'bg-emerald-500',
    iconColor: 'text-emerald-600',
  },
  [BOOKING_STATUS.CANCELLED]: {
    label: 'Cancelled',
    icon: AlertCircle,
    chip: 'bg-rose-50 text-rose-700 border-rose-100',
    accent: 'bg-rose-500',
    iconColor: 'text-rose-600',
  },
  [BOOKING_STATUS.NO_DRIVERS_FOUND]: {
    label: 'No drivers',
    icon: AlertCircle,
    chip: 'bg-rose-50 text-rose-700 border-rose-100',
    accent: 'bg-rose-500',
    iconColor: 'text-rose-600',
  },
  [BOOKING_STATUS.SEARCHING]: {
    label: 'Searching',
    icon: Loader2,
    chip: 'bg-amber-50 text-amber-700 border-amber-100',
    accent: 'bg-amber-500',
    iconColor: 'text-amber-600 animate-spin',
  },
  [BOOKING_STATUS.PENDING_ASSIGNMENT]: {
    label: 'Scheduled',
    icon: Calendar,
    chip: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    accent: 'bg-indigo-500',
    iconColor: 'text-indigo-600',
  },
  [BOOKING_STATUS.IN_EMERGENCY_POOL]: {
    label: 'Manual',
    icon: AlertCircle,
    chip: 'bg-amber-50 text-amber-700 border-amber-100',
    accent: 'bg-amber-500',
    iconColor: 'text-amber-600',
  },
  [BOOKING_STATUS.AWAITING_PAYMENT]: {
    label: 'Pay now',
    icon: Clock,
    chip: 'bg-amber-50 text-amber-700 border-amber-100',
    accent: 'bg-amber-500',
    iconColor: 'text-amber-600',
  },
  [BOOKING_STATUS.DRIVER_ASSIGNED]: {
    label: 'Driver assigned',
    icon: Navigation,
    chip: 'bg-sky-50 text-sky-700 border-sky-100',
    accent: 'bg-sky-500',
    iconColor: 'text-sky-600',
  },
  [BOOKING_STATUS.EN_ROUTE]: {
    label: 'On the way',
    icon: Navigation,
    chip: 'bg-sky-50 text-sky-700 border-sky-100',
    accent: 'bg-sky-500',
    iconColor: 'text-sky-600',
  },
  [BOOKING_STATUS.ARRIVED]: {
    label: 'Driver arrived',
    icon: MapPin,
    chip: 'bg-sky-50 text-sky-700 border-sky-100',
    accent: 'bg-sky-500',
    iconColor: 'text-sky-600',
  },
  [BOOKING_STATUS.STARTED]: {
    label: 'In progress',
    icon: Navigation,
    chip: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    accent: 'bg-indigo-500',
    iconColor: 'text-indigo-600',
  },
};

const FALLBACK_BADGE = {
  label: 'Booking',
  icon: Car,
  chip: 'bg-gray-100 text-gray-700 border-gray-200',
  accent: 'bg-gray-400',
  iconColor: 'text-gray-500',
};

function TripHistoryCard({ booking, onOpen, indexInList = 0 }) {
  const badge = STATUS_BADGES[booking.status] || FALLBACK_BADGE;
  const StatusIcon = badge.icon;
  const serviceLabel =
    SERVICE_TYPE_LABELS[booking.serviceType] ||
    SERVICE_CATALOG[booking.serviceType]?.title ||
    booking.serviceType ||
    'Trip';
  const isHourly = booking.serviceType === SERVICE_TYPES.HOURLY;

  // Single source of truth for the headline fare. We prefer the
  // canonical fare snapshot, then the running ledger so completed
  // trips show the final figure (including waiting / extensions when
  // those have been settled).
  const fare = useMemo(() => {
    const base = Number(booking.fareSnapshot?.total) || 0;
    const waiting = Number(booking.waiting?.chargeRupees) || 0;
    const extensions = (booking.extensions || []).reduce(
      (sum, ext) =>
        sum + (ext?.status === 'accepted' ? Number(ext.fareDelta) || 0 : 0),
      0,
    );
    const computed = base + waiting + extensions;
    return computed || Number(booking.payment?.amountPaidRupees) || 0;
  }, [booking]);

  const dateValue =
    booking.timeline?.completedAt ||
    booking.timeline?.cancelledAt ||
    booking.hourly?.scheduledStartAt ||
    booking.outstation?.startDate ||
    booking.timeline?.createdAt ||
    booking.createdAt;
  const dateLabel = dateValue
    ? new Date(dateValue).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const durationLabel = (() => {
    if (booking.hourly?.durationHours) {
      const h = booking.hourly.durationHours;
      return `${h}h`;
    }
    if (booking.outstation?.days) {
      const d = booking.outstation.days;
      return `${d}d`;
    }
    return null;
  })();

  const driver = booking.driverId && typeof booking.driverId === 'object'
    ? booking.driverId
    : null;
  const driverPhoto = (() => {
    if (!driver) return null;
    const docs = Array.isArray(driver.documents) ? driver.documents : [];
    const selfie = docs.find((d) => d?.type === 'selfie' && d?.fileUrl);
    return selfie?.fileUrl || driver.profilePicture || null;
  })();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.();
        }
      }}
      style={{ animationDelay: `${Math.min(indexInList, 8) * 0.04}s` }}
      className="group relative overflow-hidden rounded-2xl bg-white border border-border-light shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 animate-fade-in-up"
    >
      <div className={`h-1 w-full ${badge.accent}`} />

      <div className="p-4">
        {/* Row 1 — Service + status + fare */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${badge.chip}`}
            >
              <StatusIcon className={`w-4 h-4 ${badge.iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text capitalize truncate">
                {serviceLabel}
              </p>
              <p className="text-[11px] font-mono text-text-muted mt-0.5 truncate">
                #{booking.bookingNumber || String(booking._id).slice(-6).toUpperCase()}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-text tabular-nums">
              &#8377;{Number(fare || 0).toLocaleString('en-IN')}
            </p>
            <span
              className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${badge.chip}`}
            >
              {badge.label}
            </span>
          </div>
        </div>

        {/* Row 2 — Route */}
        <div className="mt-3 pl-1 relative">
          <div className="flex items-start gap-3">
            <span className="mt-1 w-2 h-2 rounded-full bg-primary shrink-0" />
            <p className="flex-1 text-sm text-text truncate">
              {booking.pickup?.address || 'Pickup'}
            </p>
          </div>
          <div className="ml-[3px] my-0.5 h-3 w-px bg-border" />
          <div className="flex items-start gap-3">
            <span
              className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                booking.dropoff ? 'bg-rose-500' : 'border-2 border-primary bg-white'
              }`}
            />
            <p className="flex-1 text-sm text-text truncate">
              {booking.dropoff?.address ||
                (isHourly ? 'Around the city' : 'Multi-day trip')}
            </p>
          </div>
        </div>

        {/* Row 3 — Meta strip (date + duration + driver) */}
        <div className="mt-3 pt-3 border-t border-border-light flex items-center gap-3 text-[11px] text-text-muted">
          {dateLabel && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {dateLabel}
            </span>
          )}
          {durationLabel && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {durationLabel}
            </span>
          )}
          <span className="flex-1" />
          {driver ? (
            <div className="flex items-center gap-1.5 max-w-[55%] min-w-0">
              <Avatar src={driverPhoto} name={driver.name} size="sm" />
              <div className="min-w-0 leading-tight">
                <p className="text-xs font-medium text-text truncate">
                  {driver.name || 'Your driver'}
                </p>
                {driver.rating ? (
                  <p className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                    <Star className="w-2.5 h-2.5 fill-amber-500 stroke-amber-500" />
                    {Number(driver.rating).toFixed(1)}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <ChevronRight className="w-4 h-4 text-text-muted/70 shrink-0 group-hover:text-primary" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EmptyState({ tab }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-32 text-center animate-fade-in-up">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Car className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-base font-bold text-text mb-1">
        No {tab.toLowerCase()} trips
      </h3>
      <p className="text-sm text-text-muted max-w-[240px]">
        {tab === 'Active'
          ? "You don't have any ongoing trips at the moment."
          : `You haven't ${tab.toLowerCase()} any trips yet.`}
      </p>
    </div>
  );
}

export default ActivityPage;
