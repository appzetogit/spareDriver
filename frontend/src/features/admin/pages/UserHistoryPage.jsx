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
        unclamp: true,
        render: (_, row) => (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <p className="font-mono text-xs font-semibold text-slate-900 truncate">
                {row.bookingNumber || row._id?.slice(-8)}
              </p>
              <span className="sm:hidden shrink-0">
                <Badge variant={TRIP_STATUS_VARIANT[row.status] || 'secondary'}>
                  {row.status?.replace(/_/g, ' ')}
                </Badge>
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-500 capitalize mt-0.5 truncate">
              {row.serviceType} · {row.bookingType || 'instant'}
              <span className="sm:hidden">
                {row.carId ? ` · ${formatCarLabel(row.carId)}` : ''}
                {row.driverId?.name ? ` · ${row.driverId.name}` : ''}
              </span>
            </p>
          </div>
        ),
      },
      {
        key: 'car',
        label: 'Vehicle',
        className: 'hidden sm:table-cell',
        render: (_, row) => (
          <span className="text-xs sm:text-sm text-slate-700">{formatCarLabel(row.carId)}</span>
        ),
      },
      {
        key: 'driver',
        label: 'Driver',
        className: 'hidden sm:table-cell',
        render: (_, row) => <span className="text-xs sm:text-sm">{row.driverId?.name || '—'}</span>,
      },
      {
        key: 'status',
        label: 'Status',
        className: 'hidden sm:table-cell',
        render: (_, row) => (
          <Badge variant={TRIP_STATUS_VARIANT[row.status] || 'secondary'}>
            {row.status?.replace(/_/g, ' ')}
          </Badge>
        ),
      },
      {
        key: 'fare',
        label: 'Fare',
        unclamp: true,
        align: 'right',
        render: (_, row) => {
          const fareAmount = row?.fareSnapshot?.total ?? row?.payment?.amountPaidRupees ?? row?.pricing?.totalFare ?? row?.fare?.total ?? row?.totalFare ?? (typeof row?.fare === 'number' ? row.fare : 0);
          return (
            <div className="text-right shrink-0">
              <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                {formatCurrency(fareAmount)}
              </span>
              <span className="sm:hidden text-[9px] text-slate-400 block mt-0.5">
                {formatDate(row.createdAt)}
              </span>
            </div>
          );
        },
      },
      {
        key: 'created',
        label: 'Created',
        className: 'hidden sm:table-cell',
        render: (_, row) => (
          <span className="text-[11px] sm:text-xs text-slate-600">{formatDateTime12(row.createdAt)}</span>
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
        unclamp: true,
        render: (_, row) => (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-medium text-xs sm:text-sm text-slate-900 truncate">
                {row.planNameSnapshot || '—'}
              </p>
              <span className="sm:hidden text-[9px] capitalize px-1.5 py-0.2 rounded-full bg-slate-100 font-semibold text-slate-600">
                {row.status?.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">
              {row.subscriptionNumber ? `${row.subscriptionNumber} · ` : ''}
              {row.zoneId?.name || '—'}
              <span className="sm:hidden">
                {row.carId ? ` · ${formatCarLabel(row.carId)}` : ''}
              </span>
            </p>
          </div>
        ),
      },
      {
        key: 'car',
        label: 'Vehicle',
        className: 'hidden sm:table-cell',
        render: (_, row) => (
          <span className="text-xs sm:text-sm text-slate-700">{formatCarLabel(row.carId)}</span>
        ),
      },
      {
        key: 'driver',
        label: 'Driver',
        className: 'hidden sm:table-cell',
        render: (_, row) => <span className="text-xs sm:text-sm">{row.assignedDriverId?.name || '—'}</span>,
      },
      {
        key: 'status',
        label: 'Status',
        className: 'hidden sm:table-cell',
        render: (_, row) => (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={SUB_STATUS_VARIANT[row.status] || 'secondary'}>
              {row.status?.replace(/_/g, ' ')}
            </Badge>
            {row.cancellationRequest?.status === 'pending' && (
              <Badge variant="danger">Cancel requested</Badge>
            )}
            {row.assignmentStatus && (
              <span className="text-[10px] text-slate-500 capitalize">
                {row.assignmentStatus.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'amount',
        label: 'Paid',
        unclamp: true,
        align: 'right',
        render: (_, row) => (
          <div className="text-right">
            <span className="text-xs sm:text-sm font-bold text-slate-900 block">{formatCurrency(row.amount)}</span>
            <span className="sm:hidden text-[9px] text-slate-400 block mt-0.5">{formatDate(row.startDate)}</span>
          </div>
        ),
      },
      {
        key: 'period',
        label: 'Period',
        className: 'hidden sm:table-cell',
        render: (_, row) => (
          <span className="text-[11px] sm:text-xs text-slate-600">
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
    <div className="space-y-4 sm:space-y-6 pb-8 animate-fade-in-up">
      <div className="flex items-center justify-between gap-3">
        <Link
          to={`/admin/users/${userId}/profile`}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          Back to profile
        </Link>
        <button
          type="button"
          onClick={handleRefreshAll}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div>
        <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <History className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
          Trip & Subscription History
        </h1>
        {user && (
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {user.name} · {user.phone_no || user.email}
          </p>
        )}
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('trips')}
          className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold border-b-2 -mb-px transition-colors ${
            activeTab === 'trips'
              ? 'border-primary text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Car className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Trips
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('subscriptions')}
          className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold border-b-2 -mb-px transition-colors ${
            activeTab === 'subscriptions'
              ? 'border-primary text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Subscriptions
          </span>
        </button>
      </div>

      {activeTab === 'trips' && tripStats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
          {[
            { label: 'Total trips', value: tripStats.total },
            { label: 'Active', value: tripStats.active },
            { label: 'Completed', value: tripStats.completed },
            { label: 'Cancelled', value: tripStats.cancelled },
            { label: 'Searching', value: tripStats.searching },
          ].map((s) => (
            <Card key={s.label} padding="p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-slate-500">{s.label}</p>
              <p className="text-lg sm:text-xl font-extrabold text-slate-900 mt-0.5 sm:mt-1">{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'subscriptions' && subStats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
          {[
            { label: 'Total', value: subStats.total },
            { label: 'Active', value: subStats.active },
            { label: 'Pending payment', value: subStats.pendingPayment },
            { label: 'Expired', value: subStats.expired },
            { label: 'Cancelled', value: subStats.cancelled },
          ].map((s) => (
            <Card key={s.label} padding="p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-slate-500">{s.label}</p>
              <p className="text-lg sm:text-xl font-extrabold text-slate-900 mt-0.5 sm:mt-1">{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card padding="p-3 sm:p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="relative col-span-2">
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'trips' ? 'Search booking number' : 'Search plan name'}
              className="w-full h-8 sm:h-10 pl-8 sm:pl-9 pr-3 rounded-lg sm:rounded-xl border border-slate-200 text-xs sm:text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 sm:h-10 px-2 sm:px-3 rounded-lg sm:rounded-xl border border-slate-200 text-xs sm:text-sm bg-white"
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
              className="h-8 sm:h-10 px-2 sm:px-3 rounded-lg sm:rounded-xl border border-slate-200 text-xs sm:text-sm bg-white"
            >
              <option value="">All services</option>
              <option value="hourly">Hourly</option>
              <option value="outstation">Round trip</option>
            </select>
          )}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 sm:h-10 px-2 sm:px-3 rounded-lg sm:rounded-xl border border-slate-200 text-xs sm:text-sm"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 sm:h-10 px-2 sm:px-3 rounded-lg sm:rounded-xl border border-slate-200 text-xs sm:text-sm"
          />
          {activeTab === 'trips' && (
            <select
              value={bookingTypeFilter}
              onChange={(e) => setBookingTypeFilter(e.target.value)}
              className="h-8 sm:h-10 px-2 sm:px-3 rounded-lg sm:rounded-xl border border-slate-200 text-xs sm:text-sm bg-white"
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
          minWidth="w-full min-w-0"
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
          minWidth="w-full min-w-0"
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
  if (!subscription) return null;

  const periodLabel = (() => {
    const start = subscription.startDate ? formatDate(subscription.startDate) : '—';
    const end = subscription.expiryDate ? formatDate(subscription.expiryDate) : '—';
    return `${start} → ${end}`;
  })();

  const hoursLabel =
    subscription.includedHoursPerDay === 0
      ? 'Full-time'
      : `${subscription.includedHoursPerDay}h/day`;

  const cancelReq = subscription.cancellationRequest;

  return (
    <div className="fixed inset-0 z-[9999] flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white h-full shadow-xl overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-900 mb-1">Subscription detail</h2>
        <p className="text-xs text-slate-500 mb-4 font-mono">
          {subscription.subscriptionNumber || '—'}
        </p>

        <div className="rounded-2xl bg-slate-50 p-4 text-sm space-y-3 mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Subscription details
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-700">
            <DetailLine label="Subscription ID" value={subscription.subscriptionNumber || '—'} />
            <DetailLine
              label="Plan"
              value={subscription.planNameSnapshot || subscription.planId?.name || '—'}
            />
            <DetailLine
              label="Zone"
              value={`${subscription.zoneId?.name || '—'}${subscription.zoneId?.city ? ` · ${subscription.zoneId.city}` : ''}`}
            />
            <DetailLine label="Car" value={formatCarLabel(subscription.carId)} />
            <DetailLine label="Driver hours" value={hoursLabel} />
            <DetailLine
              label="Duration"
              value={`${subscription.durationMonths || '—'} month(s)`}
            />
            <DetailLine label="Subscription period" value={periodLabel} />
            <DetailLine
              label="Status"
              value={subscription.status?.replace(/_/g, ' ') || '—'}
            />
            <DetailLine
              label="Assignment"
              value={subscription.assignmentStatus?.replace(/_/g, ' ') || '—'}
            />
            <DetailLine
              label="Driver"
              value={subscription.assignedDriverId?.name || '—'}
            />
          </div>
          {(subscription.dailyPickup || subscription.dailyDropoff) && (
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <DetailLine
                label="Daily pickup"
                value={subscription.dailyPickup?.address || '—'}
              />
              <DetailLine
                label="Daily drop-off"
                value={subscription.dailyDropoff?.address || '—'}
              />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 p-4 text-sm space-y-3 mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment</p>
          <div className="grid grid-cols-2 gap-3">
            <DetailLine label="Amount paid" value={formatCurrency(subscription.amount)} />
            <DetailLine label="Base price" value={formatCurrency(subscription.basePrice)} />
            <DetailLine label="Service charge" value={formatCurrency(subscription.serviceCharge)} />
            <DetailLine label="GST" value={formatCurrency(subscription.gstAmount)} />
            <DetailLine
              label="Coupon"
              value={
                subscription.couponCode
                  ? `${subscription.couponCode} (−${formatCurrency(subscription.couponDiscount)})`
                  : '—'
              }
            />
            <DetailLine label="Paid at" value={formatDateTime12(subscription.paidAt)} />
            <DetailLine
              label="Payment method"
              value={subscription.paymentMethod || '—'}
            />
            <DetailLine
              label="Razorpay payment"
              value={subscription.razorpayPaymentId || '—'}
            />
          </div>
        </div>

        {(Number(subscription.platformShareRupees) > 0
          || Number(subscription.driverShareRupees) > 0) && (
          <div className="rounded-2xl border border-slate-200 p-4 text-sm space-y-3 mb-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Revenue split</p>
            <div className="grid grid-cols-2 gap-3">
              <DetailLine
                label="Platform share"
                value={formatCurrency(subscription.platformShareRupees)}
              />
              <DetailLine
                label="Driver share pool"
                value={formatCurrency(subscription.driverShareRupees)}
              />
            </div>
          </div>
        )}

        {cancelReq?.status && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm space-y-2 mb-4">
            <p className="text-xs font-bold uppercase tracking-wide text-rose-800">
              Cancellation request
            </p>
            <DetailLine label="Status" value={cancelReq.status.replace(/_/g, ' ')} />
            <DetailLine label="Reason" value={cancelReq.reason || '—'} />
            <DetailLine label="Requested" value={formatDateTime12(cancelReq.requestedAt)} />
            {cancelReq.reviewedAt && (
              <DetailLine label="Reviewed" value={formatDateTime12(cancelReq.reviewedAt)} />
            )}
            {cancelReq.reviewNote && (
              <DetailLine label="Review note" value={cancelReq.reviewNote} />
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full h-10 rounded-xl border text-sm font-semibold hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function DetailLine({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-slate-400 font-semibold">{label}</p>
      <p className="text-sm font-medium text-slate-800 break-words">{value}</p>
    </div>
  );
}

export default UserHistoryPage;
