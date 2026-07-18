import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, Inbox } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { mergeLiveBookingIntoList } from '../../../../utils/mergeLiveBooking';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverTripsListStore } from '../../../../store/driver/useDriverTripsStore';
import useDriverActiveTripStore from '../../../../store/driver/useDriverActiveTripStore';
import useDriverIncomingScheduledStore from '../../../../store/driver/useDriverIncomingScheduledStore';
import { useSocketEvent } from '../../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../../constants/socketEvents';
import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUS,
} from '../../../../constants/bookingStatus';
import DriverScreenShell from '../../components/DriverScreenShell';
import DriverTripCard from '../components/DriverTripCard';
import IncomingScheduledCard from '../components/IncomingScheduledCard';

const TABS = [
  { id: 'incoming', label: 'Incoming' },
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const PAGE_LIMIT = 15;
const VALID_TABS = new Set(TABS.map((t) => t.id));

/**
 * Driver trip history + Incoming scheduled requests tab.
 */
const MyTripsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = tabParam && VALID_TABS.has(tabParam) ? tabParam : 'incoming';
  const [page, setPage] = useState(1);

  const incomingCount = useDriverIncomingScheduledStore((s) => s.count);
  const incomingRequests = useDriverIncomingScheduledStore((s) => s.requests);
  const incomingLoading = useDriverIncomingScheduledStore((s) => s.loading);
  const incomingError = useDriverIncomingScheduledStore((s) => s.error);
  const fetchIncoming = useDriverIncomingScheduledStore((s) => s.fetchList);
  const acceptIncoming = useDriverIncomingScheduledStore((s) => s.accept);
  const rejectIncoming = useDriverIncomingScheduledStore((s) => s.reject);
  const busyId = useDriverIncomingScheduledStore((s) => s.busyId);

  const handleTabChange = useCallback(
    (next) => {
      setPage(1);
      const params = new URLSearchParams(searchParams);
      params.set('tab', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const isIncoming = tab === 'incoming';

  const params = useMemo(
    () => ({ tab, page, limit: PAGE_LIMIT }),
    [tab, page],
  );
  const cacheKey = buildCacheKey('driver-trips-list', params);

  const { data, loading, error, refetch } = useCachedQuery(
    useDriverTripsListStore,
    cacheKey,
    params,
    { enabled: !isIncoming },
  );

  const activeBooking = useDriverActiveTripStore((s) => s.booking);
  const fetchActive = useDriverActiveTripStore((s) => s.fetchActive);
  const applyActiveUpdate = useDriverActiveTripStore((s) => s.applyUpdate);
  const setActiveBooking = useDriverActiveTripStore((s) => s.setBooking);
  const clearActiveBooking = useDriverActiveTripStore((s) => s.clear);

  useEffect(() => {
    fetchActive().catch(() => {});
    if (isIncoming) {
      fetchIncoming().catch(() => {});
    } else {
      refetch?.().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIncoming, tab]);

  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useSocketEvent(
    S2C_EVENTS.BOOKING_UPDATED,
    useCallback(
      (payload) => {
        if (!payload) return;
        applyActiveUpdate(payload);
        if (
          payload.status === BOOKING_STATUS.COMPLETED ||
          payload.status === BOOKING_STATUS.CANCELLED ||
          payload.status === BOOKING_STATUS.NO_DRIVERS_FOUND
        ) {
          clearActiveBooking();
        }
        if (!isIncoming) {
          refetchRef.current?.().catch(() => {});
        }
      },
      [applyActiveUpdate, clearActiveBooking, isIncoming],
    ),
  );

  useSocketEvent(
    S2C_EVENTS.BOOKING_OFFERED,
    useCallback(() => {
      if (isIncoming) fetchIncoming().catch(() => {});
    }, [isIncoming, fetchIncoming]),
  );

  useSocketEvent(
    S2C_EVENTS.BOOKING_OFFER_WITHDRAWN,
    useCallback(() => {
      if (isIncoming) fetchIncoming().catch(() => {});
    }, [isIncoming, fetchIncoming]),
  );

  const trips = data?.data || [];
  const pagination = data?.pagination || { total: 0, page: 1, pages: 1 };

  const visibleTrips = useMemo(
    () => mergeLiveBookingIntoList(activeBooking, trips),
    [activeBooking, trips],
  );

  const handleSelect = (trip) => {
    if (!trip) return;
    if (ACTIVE_BOOKING_STATUSES.includes(trip.status)) {
      setActiveBooking(trip);
      navigate(`/driver/trip/${trip._id}`);
    }
  };

  const handleAcceptIncoming = async (request) => {
    try {
      const result = await acceptIncoming(request.bookingId, {
        subscriptionId: request.subscriptionId,
      });
      if (result?.kind === 'subscription') return;
      if (result?._id) {
        setActiveBooking(result);
        navigate(`/driver/trip/${result._id}`);
      }
    } catch {
      /* store surfaces error */
    }
  };

  const handleIgnoreIncoming = async (request) => {
    try {
      await rejectIncoming(request.bookingId, {
        subscriptionId: request.subscriptionId,
      });
    } catch {
      /* store surfaces error */
    }
  };

  const totalTrips = isIncoming ? incomingCount : pagination.total || 0;

  const tabsWithBadge = useMemo(
    () =>
      TABS.map((t) =>
        t.id === 'incoming' && incomingCount > 0
          ? { ...t, badge: incomingCount }
          : t,
      ),
    [incomingCount],
  );

  return (
    <DriverScreenShell
      header={
        <header className="bg-dark px-4 pt-4 pb-4 rounded-b-3xl">
          <div className="flex items-baseline justify-between mb-3">
            <h1 className="text-lg font-bold text-white">My Trips</h1>
            {totalTrips > 0 && (
              <span className="text-[11px] text-white/60">
                {isIncoming
                  ? `${totalTrips} open request${totalTrips === 1 ? '' : 's'}`
                  : `${totalTrips} trip${totalTrips === 1 ? '' : 's'}`}
              </span>
            )}
          </div>
          <TabBar tabs={tabsWithBadge} active={tab} onChange={handleTabChange} />
        </header>
      }
      bodyClassName="p-4 -mt-2 pb-8 space-y-3"
    >
      {isIncoming ? (
        <>
          {incomingLoading && incomingRequests.length === 0 && (
            <Card className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
            </Card>
          )}

          {incomingError && (
            <Card className="border-l-4 border-l-danger">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text">Couldn't load requests</p>
                  <p className="text-xs text-text-muted mt-0.5">{incomingError}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => fetchIncoming()}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {!incomingLoading && !incomingError && incomingRequests.length === 0 && (
            <Card className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Inbox className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-semibold text-text">No incoming requests</p>
              <p className="text-xs text-text-muted mt-1 max-w-[240px]">
                Scheduled, outstation, and subscription requests broadcast to you
                show up here until someone accepts.
              </p>
            </Card>
          )}

          {incomingRequests.map((request, idx) => {
            const rowKey = request.subscriptionId
              ? `sub:${request.subscriptionId}`
              : String(request.bookingId);
            return (
            <IncomingScheduledCard
              key={rowKey}
              request={request}
              busy={busyId === rowKey || busyId === String(request.bookingId) || busyId === String(request.subscriptionId || '')}
              onAccept={handleAcceptIncoming}
              onIgnore={handleIgnoreIncoming}
              className="animate-fade-in-up"
              style={{ animationDelay: `${idx * 0.04}s` }}
            />
            );
          })}
        </>
      ) : (
        <>
          {loading && !data && (
            <Card className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
            </Card>
          )}

          {error && (
            <Card className="border-l-4 border-l-danger">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text">Couldn't load trips</p>
                  <p className="text-xs text-text-muted mt-0.5">{error}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => refetch()}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {!loading && !error && trips.length === 0 && (
            <Card className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Inbox className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-semibold text-text">No trips here yet</p>
              <p className="text-xs text-text-muted mt-1 max-w-[240px]">
                Once you accept a booking, it'll show up in this list with its full history.
              </p>
            </Card>
          )}

          {visibleTrips.map((trip, idx) => (
            <DriverTripCard
              key={trip._id}
              trip={trip}
              onClick={
                ACTIVE_BOOKING_STATUSES.includes(trip.status)
                  ? () => handleSelect(trip)
                  : undefined
              }
              className="animate-fade-in-up"
              style={{ animationDelay: `${idx * 0.04}s` }}
            />
          ))}

          {pagination.pages > 1 && (
            <Pagination
              page={pagination.page}
              pages={pagination.pages}
              total={pagination.total}
              onChange={setPage}
              disabled={loading}
            />
          )}
        </>
      )}
    </DriverScreenShell>
  );
};

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`relative px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              isActive
                ? 'bg-white text-text shadow-card'
                : 'bg-white/10 text-white/80 hover:bg-white/15'
            }`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold">
                {t.badge > 99 ? '99+' : t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Pagination({ page, pages, total, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between pt-1 pb-2 text-xs text-text-muted">
      <span>
        Page {page} of {pages} · {total} trip{total === 1 ? '' : 's'}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Prev
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default MyTripsPage;
