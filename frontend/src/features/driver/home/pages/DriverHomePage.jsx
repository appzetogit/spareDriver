import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../../../components/Card';
import Toggle from '../../../../components/Toggle';
import {
  Star,
  TrendingUp,
  Bell,
  AlertCircle,
  ShieldAlert,
  ChevronRight,
  Car,
  ShieldCheck,
  Flag,
  Inbox,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverOnlineStore } from '../../../../store/driver/useDriverOnlineStore';
import { useDriverKitActiveStore } from '../../../../store/driver/useDriverKitStore';
import { useDriverHomeSummaryStore } from '../../../../store/driver/useDriverTripsStore';
import useDriverIncomingScheduledStore from '../../../../store/driver/useDriverIncomingScheduledStore';
import useDriverSubscriptionsStore from '../../../../store/driver/useDriverSubscriptionsStore';
import { useDriverOnlineToggle } from '../../../../hooks/useDriverOnlineToggle';
import { useDriverLocation } from '../../../../hooks/useDriverLocation';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { formatCurrency } from '../../../../utils/formatters';
import {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
} from '../../../../constants/bookingStatus';
import OnlineBlockedDialog from '../../kit/components/OnlineBlockedDialog';
import DriverKitHomeCard from '../../kit/components/DriverKitHomeCard';
import OutstationOptInCard from '../components/OutstationOptInCard';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { useNotificationPanel } from '../../../../components/notifications/NotificationCenter';
import { useDriverNotificationStore } from '../../../../store/useNotificationStore';

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
  const onlineKey = buildCacheKey('driver-online-status', {});
  const activeKey = buildCacheKey('driver-kit-active', {});
  const summaryKey = buildCacheKey('driver-home-summary', {});

  const { data: onlineStatus, refetch: refetchOnline } = useCachedQuery(
    useDriverOnlineStore,
    onlineKey,
    {},
  );
  const { refetch: refetchKit } = useCachedQuery(useDriverKitActiveStore, activeKey, {});
  const { data: summary, loading: summaryLoading } = useCachedQuery(
    useDriverHomeSummaryStore,
    summaryKey,
    {},
  );

  // Driver profile drives the outstation opt-in card below —
  // both the toggle state and the persisted zone selections live on
  // the profile document. We piggyback on the existing profile fetch
  // so the home screen only pays one extra request the first time.
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: driverProfile } = useCachedQuery(
    useDriverProfileStore,
    profileKey,
    {},
  );

  const todayEarnings = summary?.today?.earnings ?? 0;
  const todayTrips = summary?.today?.trips ?? 0;
  const driverRating = summary?.rating?.value ?? 0;
  const ratingCount = summary?.rating?.count ?? 0;
  const activeBooking = summary?.activeBooking || null;
  const hasActiveBooking =
    activeBooking && ACTIVE_BOOKING_STATUSES.includes(activeBooking.status);
  const cancellationChances = summary?.cancellationChances || null;

  const { setOnline, toggling, blocked, clearBlocked } = useDriverOnlineToggle();

  const isOnline = onlineStatus?.isOnline ?? false;
  const canGoOnline = onlineStatus?.canGoOnline ?? false;
  const blocker = onlineStatus && !canGoOnline ? onlineStatus : null;
  const needsKitAction = blocker?.code === 'KIT_REQUIRED';
  const hasOtherBlocker = Boolean(blocker) && !needsKitAction;
  const primaryReason = blocker?.reasons?.[0] || null;

  const location = useDriverLocation({ enabled: isOnline });

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
    fetchAssignedSubscriptions().catch(() => {});
  }, [fetchAssignedSubscriptions]);

  const handleToggle = async (next) => {
    if (next) {
      const result = await setOnline(true);
      if (result.success) {
        // Satisfy browser autoplay policy so the next booking offer can ring.
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

  return (
    <div className="flex-1 flex flex-col bg-bg">
      <div className="bg-dark px-4 pt-4 pb-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-white">Home</h1>
          <button
            type="button"
            className="relative p-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition-colors"
            aria-label="Notifications"
            onClick={() => openNotifications(true)}
          >
            <Bell className="w-5 h-5 text-white" />
            {unreadCount > 0 ? (
              <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-danger rounded-full">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </button>
        </div>
        <Card className="!bg-white/10 backdrop-blur-sm !shadow-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${isOnline ? 'bg-success animate-pulse' : 'bg-gray-400'}`}
              />
              <div>
                <span className="text-white text-sm font-medium block">
                  {isOnline ? 'You are Online' : 'You are Offline'}
                </span>
                {!isOnline && primaryReason && (
                  <span className="text-white/60 text-[10px]">{primaryReason}</span>
                )}
              </div>
            </div>
            <Toggle checked={isOnline} onChange={handleToggle} disabled={toggling} />
          </div>
        </Card>
      </div>

      <div className="flex-1 p-4 -mt-3 space-y-4 pb-8">
        {needsKitAction && <DriverKitHomeCard onUpdate={handleKitUpdate} />}

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

        {hasActiveBooking && (
          <ActiveTripsBanner
            booking={activeBooking}
            onOpen={() => navigate('/driver/trips?tab=ongoing')}
          />
        )}

        {(assignedSubsLoading || assignedSubscriptions.length > 0) && (
          <AssignedSubscriptionsSection
            loading={assignedSubsLoading}
            subscriptions={assignedSubscriptions}
            onOpen={(sub) => navigate(`/driver/subscriptions/${sub._id}`)}
          />
        )}

        {!hasActiveBooking && cancellationChances && (
          <CancellationChancesCard chance={cancellationChances} />
        )}

        <Card className="animate-fade-in-up">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">Today's Earnings</p>
            <button
              type="button"
              onClick={() => navigate('/driver/earnings')}
              className="text-[11px] font-semibold text-primary inline-flex items-center gap-0.5"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <p className="text-3xl font-bold text-text mt-1">
            {summaryLoading && !summary ? '—' : formatCurrency(todayEarnings)}
          </p>
          <div className="flex items-center gap-6 mt-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-success" />
              <span className="text-sm">
                <strong>{todayTrips}</strong>{' '}
                <span className="text-text-muted">
                  Trip{todayTrips === 1 ? '' : 's'}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Star className="w-4 h-4 text-primary fill-primary" />
              <span className="text-sm">
                <strong>{driverRating ? driverRating.toFixed(1) : '—'}</strong>{' '}
                <span className="text-text-muted">
                  {ratingCount ? `(${ratingCount})` : 'No ratings yet'}
                </span>
              </span>
            </div>
          </div>
        </Card>

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

        <OutstationOptInCard
          initial={!!driverProfile?.availableForOutstation}
          initialZones={driverProfile?.preferredOutstationZones || []}
          preferencesCompleted={!!driverProfile?.outstationPreferencesCompletedAt}
          initialAllIndiaOk={!!driverProfile?.outstationAllIndiaOk}
          initialMaxHours={driverProfile?.outstationMaxDrivingHoursPerDay || 10}
        />

        {isOnline && location.error && location.permission === 'denied' && (
          <Card className="animate-fade-in-up border-l-4 border-l-danger">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-text">Location permission blocked</p>
                <p className="text-xs text-text-muted mt-1">{location.error}</p>
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

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function AssignedSubscriptionsSection({ loading, subscriptions, onOpen }) {
  if (loading && !subscriptions.length) {
    return (
      <Card className="animate-fade-in-up flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
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

/**
 * Compact "You have an active trip" banner shown on the driver home.
 *
 * We deliberately don't render the full ride card here anymore. The
 * driver gets a one-line summary + tap-target that bounces them to
 * `/driver/trips?tab=ongoing` where every active/assigned trip is
 * listed with the full hero card. This avoids two sources of truth
 * (home tile vs trips list) drifting and keeps the home screen
 * focused on "go online / take new offers".
 */
function ActiveTripsBanner({ booking, onOpen }) {
  const status = booking?.status;
  const subtitle = ACTIVE_STATUS_COPY[status] || 'Trip in progress';
  const bookingNumber = booking?.bookingNumber || null;

  return (
    <Card
      hoverable
      onClick={onOpen}
      className="animate-fade-in-up border-l-4 border-l-primary"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Car className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text truncate">
            You have an active trip
          </p>
          <p className="text-[11px] text-text-muted truncate mt-0.5">
            {subtitle}
            {bookingNumber && (
              <>
                {' '}
                {'\u00B7'}{' '}
                <span className="font-mono">{bookingNumber}</span>
              </>
            )}
          </p>
        </div>
        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary shrink-0">
          Open <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Card>
  );
}

/**
 * Standalone cancellation-chances tile rendered when the driver has
 * NO active trip — gives them a daily-budget summary at a glance so
 * they don't have to enter a ride to discover how many cancels they
 * have left.
 */
function CancellationChancesCard({ chance }) {
  const dailyLimit = Number(chance?.dailyLimit) || 0;
  const chancesLeft = Math.max(0, Number(chance?.chancesLeft) || 0);
  const used = Number(chance?.usedToday) || 0;
  const grace = Number(chance?.graceMinutes) || 0;
  if (dailyLimit <= 0) return null;

  const exhausted = chancesLeft <= 0;
  const lowAlert = !exhausted && chancesLeft === 1;
  const tone = exhausted
    ? 'border-l-rose-500 bg-rose-50/40'
    : lowAlert
      ? 'border-l-amber-500 bg-amber-50/40'
      : 'border-l-success bg-success/5';
  const icon = exhausted ? Flag : ShieldCheck;
  const Icon = icon;
  const iconTone = exhausted
    ? 'text-rose-700 bg-rose-100'
    : lowAlert
      ? 'text-amber-700 bg-amber-100'
      : 'text-emerald-700 bg-emerald-100';

  return (
    <Card className={`animate-fade-in-up border-l-4 ${tone}`}>
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconTone}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text">
            {exhausted
              ? 'No free cancellations left today'
              : `${chancesLeft} of ${dailyLimit} free cancellation${
                  dailyLimit === 1 ? '' : 's'
                } left today`}
          </p>
          <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
            {exhausted
              ? 'Cancelling now will deduct the configured penalty from your wallet. Counter resets at midnight.'
              : grace > 0
                ? `Cancel within ${grace} min of accepting to skip the penalty. ${
                    used > 0 ? `Used ${used} today.` : ''
                  }`
                : 'Cancellations may attract a penalty.'}
          </p>
        </div>
      </div>
    </Card>
  );
}

export default DriverHomePage;
