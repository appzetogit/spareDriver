import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../../../components/Card';
import Toggle from '../../../../components/Toggle';
import {
  MapPin,
  Bell,
  AlertCircle,
  ShieldAlert,
  ChevronRight,
  Inbox,
  Sparkles,
  Loader2,
  ShieldCheck,
  Flag,
  Car,
  GraduationCap,
  RefreshCw,
} from 'lucide-react';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { haversineMeters } from '../../../../utils/geo';
import { getLocationOnce } from '../../../../utils/geolocation';
import { reportDriverLocation } from '../../../../hooks/useDriverLocation';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import {
  useDriverOnlineStore,
  DRIVER_ONLINE_CACHE_KEY,
} from '../../../../store/driver/useDriverOnlineStore';
import { useDriverKitActiveStore } from '../../../../store/driver/useDriverKitStore';
import { useDriverHomeSummaryStore } from '../../../../store/driver/useDriverTripsStore';
import useDriverActiveTripStore from '../../../../store/driver/useDriverActiveTripStore';
import useDriverIncomingScheduledStore from '../../../../store/driver/useDriverIncomingScheduledStore';
import useDriverSubscriptionsStore from '../../../../store/driver/useDriverSubscriptionsStore';
import { useDriverOnlineToggle } from '../../../../hooks/useDriverOnlineToggle';
import { useDriverLocationStatus } from '../../../../hooks/useDriverLocation';
import { useGeolocation } from '../../../../hooks/useGeolocation';
import { useGoogleMaps } from '../../../../hooks/useGoogleMaps';
import { reverseGeocode } from '../../../../utils/geocoding';
import { formatLocationLabel } from '../../../../utils/locationLabel';
import { classifyAccuracy } from '../../../../utils/geolocation';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { formatCurrency } from '../../../../utils/formatters';
import { mergeLiveBookingIntoList } from '../../../../utils/mergeLiveBooking';
import {
  BOOKING_STATUS,
  DRIVER_LIVE_TRIP_STATUSES,
} from '../../../../constants/bookingStatus';
import OnlineBlockedDialog from '../../kit/components/OnlineBlockedDialog';
import DriverKitHomeCard from '../../kit/components/DriverKitHomeCard';
import OutstationOptInCard from '../components/OutstationOptInCard';
import DriverTripCard from '../../trips/components/DriverTripCard';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { useNotificationPanel } from '../../../../components/notifications/NotificationCenter';
import { useDriverNotificationStore } from '../../../../store/useNotificationStore';
import { useAfterPaint } from '../../../../hooks/useAfterPaint';
import { Skeleton } from '../../../../components/skeleton/Skeleton';
import { TripCardSkeleton } from '../../../../components/skeleton/SectionSkeletons';

/** One-shot options for an explicit "Retry" tap: freshest fix available. */
const RETRY_FIX_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15_000,
});

/**
 * How far the driver must move before the address line is looked up again.
 *
 * Comfortably past normal GPS jitter, and short enough that turning onto a
 * different road updates the label while the driver is still on it.
 */
const LOCATION_LABEL_REFRESH_METERS = 75;


const ACTIVE_STATUS_COPY = {
  [BOOKING_STATUS.DRIVER_ASSIGNED]: 'Heading to customer',
  [BOOKING_STATUS.AWAITING_PAYMENT]: 'Customer is getting ready',
  [BOOKING_STATUS.EN_ROUTE]: 'On the way to pickup',
  [BOOKING_STATUS.ARRIVED]: 'At pickup — start the ride',
  [BOOKING_STATUS.STARTED]: 'Trip in progress',
};

const DriverHomePage = () => {
  const navigate = useNavigate();
  const { setOpen: openNotifications, unreadCount, panel: notificationPanel } = useNotificationPanel(
    useDriverNotificationStore,
    { audience: 'driver', title: 'Notifications' },
  );
  const updateDriver = useDriverAuthStore((s) => s.updateDriver);
  const incomingCount = useDriverIncomingScheduledStore((s) => s.count);
  const fetchIncomingCount = useDriverIncomingScheduledStore((s) => s.fetchCount);
  const assignedSubscriptions = useDriverSubscriptionsStore((s) => s.subscriptions);
  const assignedSubsLoading = useDriverSubscriptionsStore((s) => s.loading);
  const fetchAssignedSubscriptions = useDriverSubscriptionsStore((s) => s.fetchAssigned);
  const onlineKey = DRIVER_ONLINE_CACHE_KEY;
  const activeKey = buildCacheKey('driver-kit-active', {});
  const summaryKey = buildCacheKey('driver-home-summary', {});

  // Critical for go-online toggle + active trips. Secondary APIs wait for paint.
  const secondaryReady = useAfterPaint({ delayMs: 150 });
  const optionalReady = useAfterPaint({ delayMs: 400 });

  const { data: onlineStatus, refetch: refetchOnline } = useCachedQuery(
    useDriverOnlineStore,
    onlineKey,
    {},
  );
  const { refetch: refetchKit } = useCachedQuery(
    useDriverKitActiveStore,
    activeKey,
    {},
    { enabled: secondaryReady },
  );
  const { data: summary, loading: summaryLoading } = useCachedQuery(
    useDriverHomeSummaryStore,
    summaryKey,
    {},
  );
  const liveBooking = useDriverActiveTripStore((s) => s.booking);
  const fetchActive = useDriverActiveTripStore((s) => s.fetchActive);

  useEffect(() => {
    fetchActive().catch(() => {});
  }, [fetchActive]);

  const profileKey = buildCacheKey('driver-profile', {});
  const { data: driverProfile } = useCachedQuery(
    useDriverProfileStore,
    profileKey,
    {},
  );

  const todayEarnings = summary?.today?.earnings ?? 0;
  const summaryBookings = (
    summary?.activeBookings?.length
      ? summary.activeBookings
      : summary?.activeBooking
        ? [summary.activeBooking]
        : []
  );
  const activeBookings = mergeLiveBookingIntoList(liveBooking, summaryBookings)
    .filter((b) => b && DRIVER_LIVE_TRIP_STATUSES.includes(b.status));
  const cancellationChances = summary?.cancellationChances || null;

  const { setOnline, toggling, blocked, showBlocked, clearBlocked, refreshStatus } =
    useDriverOnlineToggle();

  const isOnline = onlineStatus?.isOnline ?? false;
  const canGoOnline = onlineStatus?.canGoOnline ?? false;
  const blocker = onlineStatus && !canGoOnline ? onlineStatus : null;
  const needsKitAction =
    blocker?.code === 'KIT_REQUIRED' || blocker?.code === 'KIT_AND_TRAINING_REQUIRED';
  const needsTrainingAction =
    blocker?.code === 'TRAINING_REQUIRED' || blocker?.code === 'KIT_AND_TRAINING_REQUIRED';
  const hasOtherBlocker = Boolean(blocker) && !needsKitAction && !needsTrainingAction;
  const primaryReason = blocker?.reasons?.[0] || null;

  const openGoOnlineBlocker = async () => {
    const status = await refreshStatus().catch(() => null);
    showBlocked({
      message: 'Cannot go online',
      code: status?.code || blocker?.code,
      reasons: status?.reasons || blocker?.reasons || [],
    });
  };

  const location = useDriverLocationStatus();

  // Prefer live GPS stream when the driver is online/on-trip; otherwise one-shot cascade.
  const needDisplayGeo = !(location.isSharing && location.coords);
  const { maps, ready: mapsReady } = useGoogleMaps();
  const {
    coords: geoCoords,
    loading: locating,
    refreshing,
    error: geoError,
    errorKind,
    softError,
    accuracyQuality: geoAccuracyQuality,
    refresh: refreshGeo,
  } = useGeolocation({ enabled: needDisplayGeo });

  const coords = location.coords
    ? {
        lat: location.coords.lat,
        lng: location.coords.lng,
        accuracy: location.coords.accuracy,
      }
    : geoCoords;

  const accuracyQuality = coords
    ? (location.coords
        ? classifyAccuracy(coords.accuracy)
        : geoAccuracyQuality)
    : null;

  const [currentLocation, setCurrentLocation] = useState(null);
  /** Where we last spent a Geocoding call, so we can tell real movement from jitter. */
  const geocodedAtRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!mapsReady || !maps || !coords) return undefined;

    // While the driver is online this runs off the live GPS stream, which
    // ticks every couple of seconds. Reverse-geocoding each tick meant a
    // billed Geocoding request per tick, and an address line that rewrote
    // itself constantly as consecutive fixes resolved to neighbouring
    // buildings. A driver parked at a pickup does not change address.
    const previous = geocodedAtRef.current;
    const movedEnough =
      !previous
      || haversineMeters(previous, { lat: coords.lat, lng: coords.lng })
        >= LOCATION_LABEL_REFRESH_METERS;
    if (!movedEnough) return undefined;

    geocodedAtRef.current = { lat: coords.lat, lng: coords.lng };

    (async () => {
      const point = await reverseGeocode(maps, { lat: coords.lat, lng: coords.lng });
      if (!cancelled && point) setCurrentLocation(point);
    })();
    return () => {
      cancelled = true;
    };
  }, [maps, mapsReady, coords?.lat, coords?.lng]);

  const locationLine = (() => {
    if (currentLocation?.city) return currentLocation.city;
    const readableAddress = formatLocationLabel(currentLocation?.address, null);
    if (readableAddress) return readableAddress;
    if (coords && (locating || refreshing)) {
      return accuracyQuality === 'poor' || accuracyQuality === 'acceptable'
        ? 'Improving GPS…'
        : 'Updating location…';
    }
    if (coords && (accuracyQuality === 'poor' || accuracyQuality === 'acceptable')) {
      return 'Weak GPS signal';
    }
    if (coords) return 'Location detected';
    if (locating || refreshing) return 'Getting your location…';
    if (geoError || location.error) return geoError || location.error;
    return 'Tap retry for location';
  })();
  const locationLoading = Boolean((locating || refreshing) && !(geoError || location.error));
  const showLocationRetry = Boolean(
    geoError || softError || location.error || accuracyQuality === 'poor' || !coords,
  );

  const [retryingLocation, setRetryingLocation] = useState(false);

  /**
   * "Retry" has two jobs depending on who owns the coordinates.
   *
   * When the driver is online the live GPS stream is the source, so
   * `useGeolocation` is disabled — and its `refresh()` returns immediately
   * without asking the OS for anything. The button was therefore dead in
   * exactly the state that shows it (online with a weak fix), and worse, it
   * still wiped the shared coords cache on the way out.
   *
   * So in that mode we ask the OS ourselves and publish the result into the
   * same shared stream every driver screen reads.
   */
  const handleLocationRetry = useCallback(async () => {
    if (needDisplayGeo) {
      refreshGeo();
      return;
    }
    setRetryingLocation(true);
    try {
      const fresh = await getLocationOnce(RETRY_FIX_OPTIONS);
      reportDriverLocation(fresh, { source: 'browser' });
    } catch {
      // The stream surfaces its own error state; a failed retry adds nothing.
    } finally {
      setRetryingLocation(false);
    }
  }, [needDisplayGeo, refreshGeo]);

  useEffect(() => {
    if (onlineStatus) {
      updateDriver({
        isOnline: onlineStatus.isOnline,
        canGoOnline: onlineStatus.canGoOnline,
      });
    }
  }, [onlineStatus, updateDriver]);

  useEffect(() => {
    if (isOnline) {
      fetchIncomingCount().catch(() => {});
    }
  }, [isOnline, fetchIncomingCount]);

  useEffect(() => {
    if (!optionalReady) return;
    fetchAssignedSubscriptions().catch(() => {});
  }, [optionalReady, fetchAssignedSubscriptions]);

  const handleToggle = async (next) => {
    if (next) {
      if (!canGoOnline) {
        await openGoOnlineBlocker();
        return;
      }
      const result = await setOnline(true);
      if (result.success) {
        window.dispatchEvent(new CustomEvent('sd:prime-offer-audio'));
        refetchOnline();
      }
      return;
    }
    const result = await setOnline(false);
    if (result.success) refetchOnline();
  };

  const handleKitUpdate = () => {
    refetchKit();
    refetchOnline();
  };

  const goToKitPage = () => {
    clearBlocked();
    navigate('/driver/kit');
  };

  const cancelChip = buildCancelChip(cancellationChances);
  const CancelIcon = cancelChip?.Icon;

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-0">
      {/* Sticky white header — mirrors user home density */}
      <div className="sticky top-0 z-30 bg-surface/95 backdrop-blur-sm px-4 pt-3.5 pb-3.5 rounded-b-3xl shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-text-muted text-[11px] font-medium leading-none">Your location</p>
            <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <span
                className="text-text text-sm font-semibold truncate"
                title={formatLocationLabel(currentLocation?.address, null) || locationLine}
              >
                {locationLine}
              </span>
              {(locationLoading || retryingLocation) && (
                <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin shrink-0" />
              )}
              {showLocationRetry && !locationLoading && !retryingLocation && (
                <button
                  type="button"
                  onClick={handleLocationRetry}
                  className="p-1 rounded-full hover:bg-bg text-primary shrink-0"
                  aria-label="Retry location"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/driver/earnings')}
              className="flex items-center gap-2 pl-2.5 pr-3 py-2 rounded-2xl bg-white border border-border-light shadow-sm hover:border-primary/30 hover:bg-primary-50/50 active:scale-[0.97] transition-all"
              aria-label="Today's earnings"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold">₹</span>
              </div>
              <div className="text-left leading-none">
                <p className="text-[9px] uppercase tracking-wide text-text-muted font-semibold">
                  Today
                </p>
                <p className="text-sm font-bold text-text mt-1">
                  {summaryLoading && !summary ? '—' : formatCurrency(todayEarnings)}
                </p>
              </div>
            </button>
            <button
              type="button"
              className="relative p-2.5 rounded-xl bg-bg hover:bg-border-light transition-colors"
              aria-label="Notifications"
              onClick={() => openNotifications(true)}
            >
              <Bell className="w-5 h-5 text-text-secondary" />
              {unreadCount > 0 ? (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-danger rounded-full">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-bg/80 border border-border-light px-3 py-2.5">
          {cancelChip && CancelIcon ? (
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 ${cancelChip.className}`}
              title={cancelChip.title}
            >
              <CancelIcon className="w-3.5 h-3.5" />
              <span>{cancelChip.label}</span>
            </div>
          ) : (
            <div className="min-w-0">
              <p className="text-[11px] text-text-muted">Ready for trips</p>
            </div>
          )}

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="text-right min-w-0">
              <p className="text-sm font-semibold text-text leading-none inline-flex items-center gap-1.5 justify-end">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isOnline ? 'bg-success animate-pulse' : 'bg-gray-300'
                  }`}
                />
                {isOnline ? 'Online' : 'Offline'}
              </p>
              {!isOnline && primaryReason ? (
                <p className="text-[10px] text-text-muted truncate mt-0.5 max-w-[9rem]">
                  {primaryReason}
                </p>
              ) : null}
            </div>
            <Toggle
              checked={isOnline}
              onChange={handleToggle}
              disabled={toggling}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
        {needsKitAction && <DriverKitHomeCard onUpdate={handleKitUpdate} />}

        {needsTrainingAction && (
          <Card className="border-l-4 border-l-primary bg-primary/5 animate-fade-in-up">
            <button
              type="button"
              onClick={() => navigate('/driver/register/training')}
              className="w-full flex items-start gap-3 text-left"
            >
              <GraduationCap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-text">Complete training videos</p>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">
                  Watch all required training videos before you can go online.
                </p>
              </div>
            </button>
          </Card>
        )}

        {hasOtherBlocker && (
          <Card className="border-l-4 border-l-amber-500 bg-amber-50/40 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-text">Cannot go online yet</p>
                <ul className="mt-1.5 space-y-1">
                  {blocker.reasons.map((r) => (
                    <li key={r} className="text-xs text-text-muted leading-relaxed">
                      • {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        )}

        <OutstationOptInCard
          initial={!!driverProfile?.availableForOutstation}
          initialZones={driverProfile?.preferredOutstationZones || []}
          preferencesCompleted={!!driverProfile?.outstationPreferencesCompletedAt}
          initialAllIndiaOk={!!driverProfile?.outstationAllIndiaOk}
          initialMaxHours={driverProfile?.outstationMaxDrivingHoursPerDay || 10}
          canEnable={canGoOnline}
          onBlocked={openGoOnlineBlocker}
        />

        {isOnline && (
          <Card className="animate-fade-in-up border-l-4 border-l-success">
            <button
              type="button"
              onClick={() => navigate('/driver/trips?tab=incoming')}
              className="w-full flex items-center gap-3 text-left"
            >
              <div className="relative w-10 h-10 bg-success-light rounded-full flex items-center justify-center shrink-0">
                <Inbox className="w-5 h-5 text-success" />
                {incomingCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-danger rounded-full">
                    {incomingCount > 99 ? '99+' : incomingCount}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text">Incoming Requests</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {incomingCount > 0
                    ? `${incomingCount} scheduled request${incomingCount === 1 ? '' : 's'} waiting`
                    : 'Scheduled rides for you show up here'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
            </button>
          </Card>
        )}

        {(assignedSubsLoading || assignedSubscriptions.length > 0) && (
          <AssignedSubscriptionsSection
            loading={assignedSubsLoading}
            subscriptions={assignedSubscriptions}
            onOpen={(sub) => navigate(`/driver/subscriptions/${sub._id}`)}
          />
        )}

        <ActiveTripsSection
          bookings={activeBookings}
          loading={summaryLoading && !summary}
          onOpen={(trip) => navigate(`/driver/trip/${trip._id}`)}
          onViewAll={() => navigate('/driver/trips?tab=ongoing')}
        />

        {isOnline && location.error && location.permission === 'denied' && (
          <Card className="animate-fade-in-up border-l-4 border-l-danger">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-text">Location permission blocked</p>
                <p className="text-xs text-text-muted mt-1">{location.error}</p>
                <p className="text-[11px] text-text-muted mt-1">
                  Enable location for this app in system settings to stay visible to customers.
                </p>
              </div>
            </div>
          </Card>
        )}

        {(geoError || (softError && accuracyQuality === 'poor')) && (
          <Card className="animate-fade-in-up border-l-4 border-l-amber-500 bg-amber-50/40">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text">
                  {geoError || 'Weak GPS signal'}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {errorKind === 'permission_denied'
                    ? 'Location permission is required to go online and share your position.'
                    : accuracyQuality === 'poor'
                      ? 'Trying to improve location. Move to an open area if this continues.'
                      : 'Move to an open area, then retry.'}
                </p>
                <button
                  type="button"
                  onClick={handleLocationRetry}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
              </div>
            </div>
          </Card>
        )}

        {!isOnline && canGoOnline && (
          <Card className="border-l-4 border-l-gray-300">
            <p className="text-sm text-text-secondary text-center py-3">
              Turn on the switch above to start receiving booking requests
            </p>
          </Card>
        )}
      </div>

      <OnlineBlockedDialog
        open={Boolean(blocked)}
        onClose={clearBlocked}
        blocked={blocked}
        onGoToKit={goToKitPage}
      />
      {notificationPanel}
    </div>
  );
};

function buildCancelChip(chance) {
  const dailyLimit = Number(chance?.dailyLimit) || 0;
  if (dailyLimit <= 0) return null;
  const chancesLeft = Math.max(0, Number(chance?.chancesLeft) || 0);
  const exhausted = chancesLeft <= 0;
  const lowAlert = !exhausted && chancesLeft === 1;

  if (exhausted) {
    return {
      Icon: Flag,
      label: '0 cancels left',
      title: 'No free cancellations left today',
      className: 'bg-rose-50 text-rose-700 border border-rose-200',
    };
  }
  if (lowAlert) {
    return {
      Icon: ShieldCheck,
      label: '1 cancel left',
      title: `${chancesLeft} of ${dailyLimit} free cancellations left today`,
      className: 'bg-amber-50 text-amber-800 border border-amber-200',
    };
  }
  return {
    Icon: ShieldCheck,
    label: `${chancesLeft} cancels left`,
    title: `${chancesLeft} of ${dailyLimit} free cancellations left today`,
    className: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  };
}

function ActiveTripsSection({ bookings, loading, onOpen, onViewAll }) {
  if (loading) {
    return (
      <section className="animate-fade-in-up">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-base font-bold text-text">Active trips</h2>
        </div>
        <TripCardSkeleton />
      </section>
    );
  }

  if (!bookings.length) {
    return (
      <section className="animate-fade-in-up">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-base font-bold text-text">Active trips</h2>
        </div>
        <Card className="border border-dashed border-border">
          <div className="flex items-center gap-3 py-1">
            <div className="w-10 h-10 rounded-full bg-bg flex items-center justify-center shrink-0">
              <Car className="w-5 h-5 text-text-muted" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">No active trips</p>
              <p className="text-xs text-text-muted mt-0.5">
                Accepted rides will show up here
              </p>
            </div>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className="animate-fade-in-up space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-text">Active trips</h2>
          <p className="text-[11px] text-text-muted">
            {bookings.length} ongoing · tap to resume
          </p>
        </div>
        {bookings.length > 1 ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[11px] font-semibold text-primary inline-flex items-center gap-0.5"
          >
            View all <ChevronRight className="w-3 h-3" />
          </button>
        ) : null}
      </div>

      {bookings.map((trip) => (
        <div key={trip._id} className="space-y-1">
          <p className="text-[11px] font-medium text-primary px-0.5">
            {ACTIVE_STATUS_COPY[trip.status] || 'Trip in progress'}
          </p>
          <DriverTripCard trip={trip} onClick={() => onOpen(trip)} />
        </div>
      ))}
    </section>
  );
}

function AssignedSubscriptionsSection({ loading, subscriptions, onOpen }) {
  if (loading && !subscriptions.length) {
    return (
      <Card className="animate-fade-in-up space-y-3 py-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </Card>
    );
  }

  if (!subscriptions.length) return null;

  return (
    <Card className="animate-fade-in-up border-l-4 border-l-emerald-500 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">Your subscriptions</p>
          <p className="text-[11px] text-text-muted">
            Dedicated driver assignments active for you
          </p>
        </div>
      </div>

      {subscriptions.map((sub) => {
        const carLabel = [sub.car?.brandName, sub.car?.modelName, sub.car?.vehicleNumber]
          .filter(Boolean)
          .join(' · ');
        return (
          <button
            key={sub._id}
            type="button"
            onClick={() => onOpen?.(sub)}
            className="w-full flex items-center gap-3 rounded-xl border border-border-light bg-bg/60 px-3 py-2.5 text-left hover:bg-bg transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text truncate">
                {sub.planName || 'Subscription'}
              </p>
              <p className="text-xs text-text-muted mt-0.5 truncate">
                {sub.customer?.name ? `${sub.customer.name}` : 'Customer'}
                {carLabel ? ` · ${carLabel}` : ''}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
          </button>
        );
      })}
    </Card>
  );
}

export default DriverHomePage;
