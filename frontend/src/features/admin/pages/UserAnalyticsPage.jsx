import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  BarChart3,
  Download,
  History,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Wallet,
} from 'lucide-react';
import Avatar from '../../../components/Avatar';
import Badge from '../../../components/Badge';
import Card from '../../../components/Card';
import api from '../../../utils/api';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminUserAnalyticsStore } from '../../../store/admin/useAdminUserAnalyticsStore';
import { useAdminUserTripsStore } from '../../../store/admin/useAdminUserTripsStore';
import { useAdminUserSubscriptionsStore } from '../../../store/admin/useAdminUserSubscriptionsStore';
import { useAdminUserWalletTransactionsStore } from '../../../store/admin/useAdminUserWalletTransactionsStore';
import AnalyticsTrendChart from '../components/UserAnalytics/AnalyticsTrendChart';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import { SectionCard, InfoGrid } from '../components/DetailBlocks';
import { formatCurrency } from '../../../utils/fareCalculator';
import { formatDateTime12 } from '../../../utils/datetime';

const PERIOD_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '365d', label: 'Last year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

const WALLET_SOURCES = [
  { value: '', label: 'All sources' },
  { value: 'topup', label: 'Top-up' },
  { value: 'booking_payment', label: 'Booking payment' },
  { value: 'booking_refund', label: 'Booking refund' },
  { value: 'admin_credit', label: 'Admin credit' },
  { value: 'admin_debit', label: 'Admin debit' },
  { value: 'waiting_charge', label: 'Waiting charge' },
];

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

const TABLE_LIMIT = 8;

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
  return base || '—';
}

function tripFare(booking) {
  return booking?.payment?.amountPaidRupees || booking?.fareSnapshot?.total || 0;
}

function resolveDateParams(period, fromDate, toDate) {
  if (period === 'custom') {
    return { from: fromDate || undefined, to: toDate || undefined };
  }
  if (period === 'all') return {};
  const end = new Date();
  const start = new Date(end);
  const days =
    period === '7d' ? 6 : period === '90d' ? 89 : period === '365d' ? 364 : 29;
  start.setDate(start.getDate() - days);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

const UserAnalyticsPage = () => {
  const { userId } = useParams();
  const [period, setPeriod] = useState('30d');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [status, setStatus] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState('');
  const [downloading, setDownloading] = useState(false);

  const [tripsPage, setTripsPage] = useState(1);
  const [tripSearch, setTripSearch] = useState('');
  const [debouncedTripSearch, setDebouncedTripSearch] = useState('');
  const [tripStatusFilter, setTripStatusFilter] = useState('');
  const [tripServiceFilter, setTripServiceFilter] = useState('');

  const [subsPage, setSubsPage] = useState(1);
  const [subsSearch, setSubsSearch] = useState('');
  const [debouncedSubsSearch, setDebouncedSubsSearch] = useState('');
  const [subsStatusFilter, setSubsStatusFilter] = useState('');

  const [walletPage, setWalletPage] = useState(1);
  const [walletSearch, setWalletSearch] = useState('');
  const [debouncedWalletSearch, setDebouncedWalletSearch] = useState('');
  const [walletDirection, setWalletDirection] = useState('');
  const [walletSource, setWalletSource] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTripSearch(tripSearch), 300);
    return () => clearTimeout(t);
  }, [tripSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSubsSearch(subsSearch), 300);
    return () => clearTimeout(t);
  }, [subsSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedWalletSearch(walletSearch), 300);
    return () => clearTimeout(t);
  }, [walletSearch]);

  useEffect(() => {
    setTripsPage(1);
  }, [period, fromDate, toDate, debouncedTripSearch, tripStatusFilter, tripServiceFilter, status, serviceType]);

  useEffect(() => {
    setSubsPage(1);
  }, [period, fromDate, toDate, debouncedSubsSearch, subsStatusFilter, subscriptionStatus]);

  useEffect(() => {
    setWalletPage(1);
  }, [period, fromDate, toDate, debouncedWalletSearch, walletDirection, walletSource]);

  const dateParams = useMemo(
    () => resolveDateParams(period, fromDate, toDate),
    [period, fromDate, toDate],
  );

  const analyticsParams = useMemo(
    () => ({
      userId,
      period: period === 'custom' ? undefined : period,
      from: period === 'custom' ? fromDate : undefined,
      to: period === 'custom' ? toDate : undefined,
      serviceType,
      status,
      subscriptionStatus,
    }),
    [userId, period, fromDate, toDate, serviceType, status, subscriptionStatus],
  );

  const tripsParams = useMemo(
    () => ({
      userId,
      page: tripsPage,
      limit: TABLE_LIMIT,
      search: debouncedTripSearch,
      status: tripStatusFilter || status,
      serviceType: tripServiceFilter || serviceType,
      from: dateParams.from,
      to: dateParams.to,
    }),
    [userId, tripsPage, debouncedTripSearch, tripStatusFilter, status, tripServiceFilter, serviceType, dateParams],
  );

  const subsParams = useMemo(
    () => ({
      userId,
      page: subsPage,
      limit: TABLE_LIMIT,
      search: debouncedSubsSearch,
      status: subsStatusFilter || subscriptionStatus,
      from: dateParams.from,
      to: dateParams.to,
    }),
    [userId, subsPage, debouncedSubsSearch, subsStatusFilter, subscriptionStatus, dateParams],
  );

  const walletParams = useMemo(
    () => ({
      userId,
      page: walletPage,
      limit: TABLE_LIMIT,
      search: debouncedWalletSearch,
      direction: walletDirection,
      source: walletSource,
      from: dateParams.from,
      to: dateParams.to,
    }),
    [userId, walletPage, debouncedWalletSearch, walletDirection, walletSource, dateParams],
  );

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminUserAnalyticsStore,
    buildCacheKey(`user-analytics:${userId}`, analyticsParams),
    analyticsParams,
    { enabled: Boolean(userId) },
  );

  const { data: tripsData, loading: tripsLoading, error: tripsError, refetch: refetchTrips } =
    useCachedQuery(
      useAdminUserTripsStore,
      buildCacheKey(`user-analytics-trips:${userId}`, tripsParams),
      tripsParams,
      { enabled: Boolean(userId) },
    );

  const { data: subsData, loading: subsLoading, error: subsError, refetch: refetchSubs } =
    useCachedQuery(
      useAdminUserSubscriptionsStore,
      buildCacheKey(`user-analytics-subs:${userId}`, subsParams),
      subsParams,
      { enabled: Boolean(userId) },
    );

  const { data: walletData, loading: walletLoading, error: walletError, refetch: refetchWallet } =
    useCachedQuery(
      useAdminUserWalletTransactionsStore,
      buildCacheKey(`user-analytics-wallet:${userId}`, walletParams),
      walletParams,
      { enabled: Boolean(userId) },
    );

  const handleRefreshAll = () => {
    refetch();
    refetchTrips();
    refetchSubs();
    refetchWallet();
  };

  const handleDownloadReport = async () => {
    if (!userId) return;
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (period !== 'custom') {
        if (period) params.append('period', period);
      } else {
        if (fromDate) params.append('from', fromDate);
        if (toDate) params.append('to', toDate);
      }
      if (serviceType) params.append('serviceType', serviceType);
      if (status) params.append('status', status);
      if (subscriptionStatus) params.append('subscriptionStatus', subscriptionStatus);

      const qs = params.toString();
      const res = await api.get(
        `/admin/users/${userId}/analytics/pdf${qs ? `?${qs}` : ''}`,
        { responseType: 'blob' },
      );
      const safeName =
        (data?.user?.name || 'user')
          .toString()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '') || 'user';
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-analytics-${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success('Analytics report downloaded');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not download report');
    } finally {
      setDownloading(false);
    }
  };

  const tripColumns = useMemo(
    () => [
      {
        key: 'booking',
        label: 'Booking',
        render: (_, row) => (
          <div>
            <p className="font-mono text-xs font-semibold">{row.bookingNumber || row._id?.slice(-8)}</p>
            <p className="text-[10px] text-slate-500 capitalize">
              {row.serviceType} · {row.bookingType || 'instant'}
            </p>
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
        render: (_, row) => formatCurrency(tripFare(row)),
      },
      {
        key: 'created',
        label: 'Date',
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
            <p className="font-medium text-sm">{row.planNameSnapshot || '—'}</p>
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
          <span className="capitalize text-sm">{row.status?.replace(/_/g, ' ')}</span>
        ),
      },
      {
        key: 'amount',
        label: 'Amount',
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

  const walletColumns = useMemo(
    () => [
      {
        key: 'direction',
        label: 'Type',
        render: (_, row) => (
          <span
            className={`text-xs font-semibold capitalize ${
              row.direction === 'credit' ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {row.direction}
          </span>
        ),
      },
      {
        key: 'source',
        label: 'Source',
        render: (_, row) => (
          <span className="text-sm text-slate-700 capitalize">
            {row.source?.replace(/_/g, ' ') || '—'}
          </span>
        ),
      },
      {
        key: 'amount',
        label: 'Amount',
        render: (_, row) => {
          const amt = row.amountRupees || 0;
          return (
            <span
              className={`font-semibold ${
                row.direction === 'credit' ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {row.direction === 'credit' ? '+' : '-'}
              {formatCurrency(amt)}
            </span>
          );
        },
      },
      {
        key: 'balance',
        label: 'Balance after',
        render: (_, row) => formatCurrency(row.balanceAfter),
      },
      {
        key: 'date',
        label: 'Date',
        render: (_, row) => (
          <span className="text-xs text-slate-600">{formatDateTime12(row.createdAt)}</span>
        ),
      },
    ],
    [],
  );

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-sm text-slate-500">Loading analytics...</p>
      </div>
    );
  }

  if (error || !data?.user) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || 'User not found'}
        </div>
      </div>
    );
  }

  const { user, profile, summary, breakdown, trends } = data;

  return (
    <div className="space-y-6 pb-8 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink />
        <div className="flex items-center gap-2">
          <Link
            to={`/admin/users/${userId}/history`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <History className="w-4 h-4" />
            History
          </Link>
          <button
            type="button"
            onClick={handleDownloadReport}
            disabled={downloading || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download report
          </button>
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
      </div>

      {/* Profile */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar name={user.name} size="lg" src={user.profilePicture} className="ring-2 ring-white shadow-md" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-primary" />
                {user.name}
              </h1>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="w-4 h-4" />
                {user.phone_no || '—'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-4 h-4" />
                {user.email || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Global filters */}
      <Card padding="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {period === 'custom' && (
            <>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 text-sm"
              />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 text-sm"
              />
            </>
          )}
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
          >
            <option value="">All services</option>
            <option value="hourly">Hourly</option>
            <option value="outstation">Round trip</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
          >
            <option value="">All trip statuses</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="started">Started</option>
            <option value="driver_assigned">Driver assigned</option>
            <option value="searching">Searching</option>
          </select>
          <select
            value={subscriptionStatus}
            onChange={(e) => setSubscriptionStatus(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
          >
            <option value="">All subscription statuses</option>
            <option value="active">Active</option>
            <option value="pending_payment">Pending payment</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total trips', value: summary.trips.total },
          { label: 'Completed', value: summary.trips.completed },
          { label: 'Total spending', value: formatCurrency(summary.spending.total) },
          { label: 'Subscriptions', value: summary.subscriptions.total },
        ].map((s) => (
          <Card key={s.label} padding="p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-xl font-extrabold text-slate-900 mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
        <AnalyticsTrendChart
          title="Trips per day"
          subtitle="Daily trip volume"
          points={trends.trips}
          valueKey="count"
          formatValue={(v) => String(Math.round(v))}
          color="#0D9488"
        />
        <AnalyticsTrendChart
          title="Spending per day"
          subtitle="Completed trip revenue"
          points={trends.spending}
          valueKey="amount"
          formatValue={(v) => formatCurrency(v)}
          color="#0D9488"
        />
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 min-w-0">
        <SectionCard title="Account details">
          <InfoGrid
            items={[
              { label: 'User ID', value: user._id, mono: true },
              { label: 'Joined', value: formatDate(profile.joinedAt) },
              { label: 'Phone verified', value: user.isPhoneVerified ? 'Yes' : 'No' },
              { label: 'Email verified', value: user.isEmailVerified ? 'Yes' : 'No' },
              { label: 'Vehicles', value: `${profile.activeCarsCount} active / ${profile.carsCount} total` },
              { label: 'Saved locations', value: String(profile.savedLocationsCount) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Wallet">
          <InfoGrid
            items={[
              { label: 'Balance', value: formatCurrency(profile.wallet.balance) },
              { label: 'Total credited', value: formatCurrency(profile.wallet.totalCredited) },
              { label: 'Total spent', value: formatCurrency(profile.wallet.totalSpent) },
              { label: 'Held (buffers)', value: formatCurrency(profile.wallet.heldRupees) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Spending & support">
          <InfoGrid
            items={[
              { label: 'Trip spending', value: formatCurrency(summary.spending.trips) },
              { label: 'Subscription spending', value: formatCurrency(summary.spending.subscriptions) },
              { label: 'Wallet credits (period)', value: formatCurrency(summary.walletActivity.credits) },
              { label: 'Wallet debits (period)', value: formatCurrency(summary.walletActivity.debits) },
              { label: 'Support tickets', value: String(summary.support.tickets) },
              { label: 'SOS alerts', value: String(summary.support.sosAlerts) },
            ]}
          />
        </SectionCard>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Trips by service">
          {!breakdown.byServiceType.length ? (
            <p className="text-sm text-slate-500">No trips in this period.</p>
          ) : (
            <ul className="space-y-2">
              {breakdown.byServiceType.map((row) => (
                <li
                  key={row.serviceType}
                  className="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-0"
                >
                  <span className="capitalize font-medium text-slate-800">{row.serviceType}</span>
                  <span className="text-slate-600">
                    {row.count} trips · {formatCurrency(row.spending)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Trip status">
          {!breakdown.byTripStatus.length ? (
            <p className="text-sm text-slate-500">No trips in this period.</p>
          ) : (
            <ul className="space-y-2">
              {breakdown.byTripStatus.map((row) => (
                <li
                  key={row.status}
                  className="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-0"
                >
                  <span className="capitalize text-slate-700">{row.status?.replace(/_/g, ' ')}</span>
                  <span className="font-semibold text-slate-900">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Trips — paginated */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Trips</h2>
        <Card padding="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="relative md:col-span-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={tripSearch}
                onChange={(e) => setTripSearch(e.target.value)}
                placeholder="Search booking number"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <select
              value={tripStatusFilter}
              onChange={(e) => setTripStatusFilter(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="started">Started</option>
              <option value="driver_assigned">Driver assigned</option>
              <option value="searching">Searching</option>
            </select>
            <select
              value={tripServiceFilter}
              onChange={(e) => setTripServiceFilter(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
            >
              <option value="">All services</option>
              <option value="hourly">Hourly</option>
              <option value="outstation">Round trip</option>
            </select>
          </div>
        </Card>
        {tripsError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {tripsError}
          </div>
        )}
        <ServerPaginatedTable
          columns={tripColumns}
          data={tripsData?.items ?? []}
          loading={tripsLoading}
          page={tripsPage}
          limit={TABLE_LIMIT}
          pagination={{
            total: tripsData?.pagination?.total ?? 0,
            pages: tripsData?.pagination?.pages ?? 1,
          }}
          onPageChange={setTripsPage}
          entityLabel="trips"
          emptyMessage="No trips found for this user."
        />
      </div>

      {/* Subscriptions — paginated */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Subscriptions</h2>
        <Card padding="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={subsSearch}
                onChange={(e) => setSubsSearch(e.target.value)}
                placeholder="Search plan name"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <select
              value={subsStatusFilter}
              onChange={(e) => setSubsStatusFilter(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="pending_payment">Pending payment</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </Card>
        {subsError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {subsError}
          </div>
        )}
        <ServerPaginatedTable
          columns={subscriptionColumns}
          data={subsData?.items ?? []}
          loading={subsLoading}
          page={subsPage}
          limit={TABLE_LIMIT}
          pagination={{
            total: subsData?.pagination?.total ?? 0,
            pages: subsData?.pagination?.pages ?? 1,
          }}
          onPageChange={setSubsPage}
          entityLabel="subscriptions"
          emptyMessage="No subscriptions found for this user."
        />
      </div>

      {/* Wallet — paginated */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-slate-500" />
          Wallet transactions
        </h2>
        <Card padding="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={walletSearch}
                onChange={(e) => setWalletSearch(e.target.value)}
                placeholder="Search description or reference"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <select
              value={walletDirection}
              onChange={(e) => setWalletDirection(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
            >
              <option value="">All types</option>
              <option value="credit">Credits</option>
              <option value="debit">Debits</option>
            </select>
            <select
              value={walletSource}
              onChange={(e) => setWalletSource(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
            >
              {WALLET_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </Card>
        {walletError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {walletError}
          </div>
        )}
        <ServerPaginatedTable
          columns={walletColumns}
          data={walletData?.items ?? []}
          loading={walletLoading}
          page={walletPage}
          limit={TABLE_LIMIT}
          pagination={{
            total: walletData?.pagination?.total ?? 0,
            pages: walletData?.pagination?.pages ?? 1,
          }}
          onPageChange={setWalletPage}
          entityLabel="transactions"
          emptyMessage="No wallet transactions found."
        />
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          to={`/admin/users/${userId}/profile`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          View full profile
        </Link>
        <Link
          to={`/admin/users/${userId}/history`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Trip & subscription history
        </Link>
      </div>
    </div>
  );
};

function BackLink() {
  return (
    <Link
      to="/admin/users"
      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to users
    </Link>
  );
}

export default UserAnalyticsPage;
