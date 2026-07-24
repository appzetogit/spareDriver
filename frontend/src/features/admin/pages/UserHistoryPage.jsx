import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Search,
  Car,
  Sparkles,
  History,
} from 'lucide-react';
import Badge from '../../../components/Badge';
import Card from '../../../components/Card';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminUserTripsStore } from '../../../store/admin/useAdminUserTripsStore';
import { useAdminUserSubscriptionsStore } from '../../../store/admin/useAdminUserSubscriptionsStore';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import BookingDetailsModal from '../components/ManageBookings/BookingDetailsModal';
import { formatCurrency } from '../../../utils/fareCalculator';
import { formatDateTime12 } from '../../../utils/datetime';

const LIMIT = 15;

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatCarLabel(car) {
  if (!car) return '—';
  const brand = car.brandId?.name || '';
  const model = car.modelId?.name || '';
  const num = car.vehicleNumber || '';
  const label = [brand, model].filter(Boolean).join(' ');
  const base = label ? `${label} · ${num}` : num;
  if (!base) return '—';
  return car.isActive === false ? `${base} (removed)` : base;
}

const TRIP_STATUS_VARIANT = {
  completed: 'success',
  cancelled: 'danger',
  started: 'primary',
  driver_assigned: 'primary',
  en_route: 'primary',
  arrived: 'primary',
  searching: 'warning',
  pending_assignment: 'info',
};

const SUB_STATUS_VARIANT = {
  active: 'success',
  pending_payment: 'warning',
  expired: 'secondary',
  cancelled: 'danger',
};

const UserHistoryPage = () => {
  const { userId } = useParams();
  const [activeTab, setActiveTab] = useState('trips');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('');
  const [bookingTypeFilter, setBookingTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedSubscription, setSelectedSubscription] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch, statusFilter, serviceTypeFilter, bookingTypeFilter, fromDate, toDate]);

  const tripsParams = useMemo(
    () => ({
      userId,
      page,
      limit: LIMIT,
      search: debouncedSearch,
      status: statusFilter,
      serviceType: serviceTypeFilter,
      bookingType: bookingTypeFilter,
      from: fromDate,
      to: toDate,
    }),
    [userId, page, debouncedSearch, statusFilter, serviceTypeFilter, bookingTypeFilter, fromDate, toDate],
  );

  const subsParams = useMemo(
    () => ({
      userId,
      page,
      limit: LIMIT,
      search: debouncedSearch,
      status: statusFilter,
      from: fromDate,
      to: toDate,
    }),
    [userId, page, debouncedSearch, statusFilter, fromDate, toDate],
  );

  const tripsCacheKey = buildCacheKey(`user-trips:${userId}`, tripsParams);
  const subsCacheKey = buildCacheKey(`user-subs:${userId}`, subsParams);

  const {
    data: tripsData,
    loading: tripsLoading,
    error: tripsError,
    refetch: refetchTrips,
  } = useCachedQuery(useAdminUserTripsStore, tripsCacheKey, tripsParams, {
    enabled: Boolean(userId) && activeTab === 'trips',
  });

  const {
    data: subsData,
    loading: subsLoading,
    error: subsError,
    refetch: refetchSubs,
  } = useCachedQuery(useAdminUserSubscriptionsStore, subsCacheKey, subsParams, {
    enabled: Boolean(userId) && activeTab === 'subscriptions',
  });

  const handleRefreshAll = useCallback(() => {
    useAdminUserTripsStore.getState().invalidate((key) => key.startsWith(`user-trips:${userId}`));
    useAdminUserSubscriptionsStore.getState().invalidate((key) => key.startsWith(`user-subs:${userId}`));
    if (activeTab === 'trips') refetchTrips();
    else refetchSubs();
  }, [userId, activeTab, refetchTrips, refetchSubs]);

  const user = tripsData?.user || subsData?.user;
  const loading = activeTab === 'trips' ? tripsLoading : subsLoading;
  const error = activeTab === 'trips' ? tripsError : subsError;

  const tripColumns = useMemo(
    () => [
      {
        key: 'booking',
        label: 'Booking',
        render: (_, row) => (
          <div>
            <p className="font-mono text-xs font-semibold">{row.bookingNumber || row._id?.slice(-8)}</p>
            <p className="text-[10px] text-slate-500 capitalize">{row.serviceType} · {row.bookingType || 'instant'}</p>
          </div>
        ),
      },
      {
        key: 'car',
        label: 'Vehicle',
        render: (_, row) => (
          <span className="text-sm text-slate-700">{formatCarLabel(row.carId)}</span>
        ),
      },
      {
        key: 'driver',
        label: 'Driver',
        render: (_, row) => row.driverId?.name || '—',
      },
      {
        key: 'status',
        label: 'Status',
        render: (_, row) => (
          <Badge variant={TRIP_STATUS_VARIANT[row.status] || 'secondary'}>
            {row.status?.replace(/_/g, ' ')}
          </Badge>
        ),
      },
      {
        key: 'fare',
        label: 'Fare',
        render: (_, row) => {
          const fareAmount = row?.fareSnapshot?.total ?? row?.payment?.amountPaidRupees ?? row?.pricing?.totalFare ?? row?.fare?.total ?? row?.totalFare ?? (typeof row?.fare === 'number' ? row.fare : 0);
          return formatCurrency(fareAmount);
        },
      },
      {
        key: 'created',
        label: 'Created',
        render: (_, row) => (
          <span className="text-xs text-slate-600">{formatDateTime12(row.createdAt)}</span>
        ),
      },
    ],
    [],
  );

  const subscriptionColumns = useMemo(
    () => [
      {
        key: 'plan',
        label: 'Plan',
        render: (_, row) => (
          <div>
            <p className="font-medium">{row.planNameSnapshot || '—'}</p>
            <p className="text-xs text-slate-500">{row.zoneId?.name || '—'}</p>
          </div>
        ),
      },
      {
        key: 'car',
        label: 'Vehicle',
        render: (_, row) => (
          <span className="text-sm text-slate-700">{formatCarLabel(row.carId)}</span>
        ),
      },
      {
        key: 'driver',
        label: 'Driver',
        render: (_, row) => row.assignedDriverId?.name || '—',
      },
      {
        key: 'status',
        label: 'Status',
        render: (_, row) => (
          <Badge variant={SUB_STATUS_VARIANT[row.status] || 'secondary'}>
            {row.status?.replace(/_/g, ' ')}
          </Badge>
        ),
      },
      {
        key: 'amount',
        label: 'Paid',
        render: (_, row) => formatCurrency(row.amount),
      },
      {
        key: 'period',
        label: 'Period',
        render: (_, row) => (
          <span className="text-xs text-slate-600">
            {formatDate(row.startDate)} – {formatDate(row.expiryDate)}
          </span>
        ),
      },
    ],
    [],
  );

  const tripStats = tripsData?.stats;
  const subStats = subsData?.stats;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/admin/users/${userId}/profile`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to profile
        </Link>
        <button
          type="button"
          onClick={handleRefreshAll}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <History className="w-6 h-6 text-primary" />
          Trip & Subscription History
        </h1>
        {user && (
          <p className="text-sm text-slate-500 mt-1">
            {user.name} · {user.phone_no || user.email}
          </p>
        )}
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('trips')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            activeTab === 'trips'
              ? 'border-primary text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Car className="w-4 h-4" />
            Trips
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('subscriptions')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            activeTab === 'subscriptions'
              ? 'border-primary text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            Subscriptions
          </span>
        </button>
      </div>

      {activeTab === 'trips' && tripStats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total trips', value: tripStats.total },
            { label: 'Active', value: tripStats.active },
            { label: 'Completed', value: tripStats.completed },
            { label: 'Cancelled', value: tripStats.cancelled },
            { label: 'Searching', value: tripStats.searching },
          ].map((s) => (
            <Card key={s.label} padding="p-4">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="text-xl font-extrabold text-slate-900 mt-1">{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'subscriptions' && subStats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: subStats.total },
            { label: 'Active', value: subStats.active },
            { label: 'Pending payment', value: subStats.pendingPayment },
            { label: 'Expired', value: subStats.expired },
            { label: 'Cancelled', value: subStats.cancelled },
          ].map((s) => (
            <Card key={s.label} padding="p-4">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="text-xl font-extrabold text-slate-900 mt-1">{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card padding="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'trips' ? 'Search booking number' : 'Search plan name'}
              className="w-full h-10 pl-9 pr-3 rounded-xl border text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border text-sm"
          >
            <option value="">All statuses</option>
            {activeTab === 'trips' ? (
              <>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="started">Started</option>
                <option value="driver_assigned">Driver assigned</option>
                <option value="searching">Searching</option>
              </>
            ) : (
              <>
                <option value="active">Active</option>
                <option value="pending_payment">Pending payment</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </>
            )}
          </select>
          {activeTab === 'trips' && (
            <select
              value={serviceTypeFilter}
              onChange={(e) => setServiceTypeFilter(e.target.value)}
              className="h-10 px-3 rounded-xl border text-sm"
            >
              <option value="">All services</option>
              <option value="hourly">Hourly</option>
              <option value="outstation">Outstation</option>
            </select>
          )}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-10 px-3 rounded-xl border text-sm"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-10 px-3 rounded-xl border text-sm"
          />
          {activeTab === 'trips' && (
            <select
              value={bookingTypeFilter}
              onChange={(e) => setBookingTypeFilter(e.target.value)}
              className="h-10 px-3 rounded-xl border text-sm"
            >
              <option value="">All types</option>
              <option value="instant">Instant</option>
              <option value="scheduled">Scheduled</option>
            </select>
          )}
        </div>
      </Card>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {activeTab === 'trips' ? (
        <ServerPaginatedTable
          columns={tripColumns}
          data={tripsData?.items ?? []}
          loading={tripsLoading}
          page={page}
          limit={LIMIT}
          pagination={{
            total: tripsData?.pagination?.total ?? 0,
            pages: tripsData?.pagination?.pages ?? 1,
          }}
          onPageChange={setPage}
          onRowClick={setSelectedBooking}
          entityLabel="trips"
          emptyMessage="No trips found for this user."
        />
      ) : (
        <ServerPaginatedTable
          columns={subscriptionColumns}
          data={subsData?.items ?? []}
          loading={subsLoading}
          page={page}
          limit={LIMIT}
          pagination={{
            total: subsData?.pagination?.total ?? 0,
            pages: subsData?.pagination?.pages ?? 1,
          }}
          onPageChange={setPage}
          onRowClick={setSelectedSubscription}
          entityLabel="subscriptions"
          emptyMessage="No subscriptions found for this user."
        />
      )}

      {selectedBooking && (
        <BookingDetailsModal
          isOpen={!!selectedBooking}
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
        />
      )}

      {selectedSubscription && (
        <SubscriptionDetailDrawer
          subscription={selectedSubscription}
          onClose={() => setSelectedSubscription(null)}
        />
      )}
    </div>
  );
};

function SubscriptionDetailDrawer({ subscription, onClose }) {
  return (
    <div className="fixed inset-0 z-[9999] flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white h-full shadow-xl overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-900 mb-4">Subscription detail</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Plan</dt>
            <dd className="font-medium">{subscription.planNameSnapshot || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Vehicle</dt>
            <dd className="font-medium">{formatCarLabel(subscription.carId)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Zone</dt>
            <dd className="font-medium">{subscription.zoneId?.name || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Driver</dt>
            <dd className="font-medium">{subscription.assignedDriverId?.name || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium capitalize">{subscription.status?.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Amount</dt>
            <dd className="font-medium">{formatCurrency(subscription.amount)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Period</dt>
            <dd className="font-medium">
              {formatDate(subscription.startDate)} – {formatDate(subscription.expiryDate)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Paid at</dt>
            <dd className="font-medium">{formatDateTime12(subscription.paidAt)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full h-10 rounded-xl border text-sm font-semibold hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default UserHistoryPage;
