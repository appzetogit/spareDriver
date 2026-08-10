import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  BarChart3,
  Download,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Star,
  Wallet,
} from 'lucide-react';
import Avatar from '../../../components/Avatar';
import Badge from '../../../components/Badge';
import Card from '../../../components/Card';
import api from '../../../utils/api';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminDriverAnalyticsStore } from '../../../store/admin/useAdminDriverAnalyticsStore';
import { useAdminDriverTripsStore } from '../../../store/admin/useAdminDriverTripsStore';
import { useAdminDriverWithdrawalsStore } from '../../../store/admin/useAdminDriverWithdrawalsStore';
import { useAdminDriverEarningsStore } from '../../../store/admin/useAdminDriverEarningsStore';
import AnalyticsTrendChart from '../components/UserAnalytics/AnalyticsTrendChart';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import StatusBadge from '../components/StatusBadge';
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

const WITHDRAWAL_STATUS_VARIANT = {
  pending: 'warning',
  processed: 'success',
  rejected: 'danger',
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

function formatLedgerKind(kind) {
  const labels = {
    trip: 'Trip earning',
    cancellation_share: 'Cancellation share',
    subscription_payout: 'Subscription payout',
    penalty: 'Penalty',
  };
  return labels[kind] || kind?.replace(/_/g, ' ') || '—';
}

const DriverAnalyticsPage = () => {
  const { driverId } = useParams();
  const [period, setPeriod] = useState('30d');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [status, setStatus] = useState('');
  const [downloading, setDownloading] = useState(false);

  const [tripsPage, setTripsPage] = useState(1);
  const [tripSearch, setTripSearch] = useState('');
  const [debouncedTripSearch, setDebouncedTripSearch] = useState('');
  const [tripStatusFilter, setTripStatusFilter] = useState('');
  const [tripServiceFilter, setTripServiceFilter] = useState('');

  const [withdrawalsPage, setWithdrawalsPage] = useState(1);
  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState('');

  const [earningsPage, setEarningsPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTripSearch(tripSearch), 300);
    return () => clearTimeout(t);
  }, [tripSearch]);

  useEffect(() => {
    setTripsPage(1);
  }, [period, fromDate, toDate, debouncedTripSearch, tripStatusFilter, tripServiceFilter, status, serviceType]);

  useEffect(() => {
    setWithdrawalsPage(1);
  }, [period, fromDate, toDate, withdrawalStatusFilter]);

  const dateParams = useMemo(
    () => resolveDateParams(period, fromDate, toDate),
    [period, fromDate, toDate],
  );

  const analyticsParams = useMemo(
    () => ({
      driverId,
      period: period === 'custom' ? undefined : period,
      from: period === 'custom' ? fromDate : undefined,
      to: period === 'custom' ? toDate : undefined,
      serviceType,
      status,
    }),
    [driverId, period, fromDate, toDate, serviceType, status],
  );

  const tripsParams = useMemo(
    () => ({
      driverId,
      page: tripsPage,
      limit: TABLE_LIMIT,
      search: debouncedTripSearch,
      status: tripStatusFilter || status,
      serviceType: tripServiceFilter || serviceType,
      from: dateParams.from,
      to: dateParams.to,
    }),
    [driverId, tripsPage, debouncedTripSearch, tripStatusFilter, status, tripServiceFilter, serviceType, dateParams],
  );

  const withdrawalsParams = useMemo(
    () => ({
      driverId,
      page: withdrawalsPage,
      limit: TABLE_LIMIT,
      status: withdrawalStatusFilter,
      from: dateParams.from,
      to: dateParams.to,
    }),
    [driverId, withdrawalsPage, withdrawalStatusFilter, dateParams],
  );

  const earningsParams = useMemo(
    () => ({
      driverId,
      page: earningsPage,
      limit: TABLE_LIMIT,
    }),
    [driverId, earningsPage],
  );

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminDriverAnalyticsStore,
    buildCacheKey(`driver-analytics:${driverId}`, analyticsParams),
    analyticsParams,
    { enabled: Boolean(driverId) },
  );

  const { data: tripsData, loading: tripsLoading, error: tripsError, refetch: refetchTrips } =
    useCachedQuery(
      useAdminDriverTripsStore,
      buildCacheKey(`driver-analytics-trips:${driverId}`, tripsParams),
      tripsParams,
      { enabled: Boolean(driverId) },
    );

  const { data: withdrawalsData, loading: withdrawalsLoading, error: withdrawalsError, refetch: refetchWithdrawals } =
    useCachedQuery(
      useAdminDriverWithdrawalsStore,
      buildCacheKey(`driver-analytics-withdrawals:${driverId}`, withdrawalsParams),
      withdrawalsParams,
      { enabled: Boolean(driverId) },
    );

  const { data: earningsData, loading: earningsLoading, error: earningsError, refetch: refetchEarnings } =
    useCachedQuery(
      useAdminDriverEarningsStore,
      buildCacheKey(`driver-analytics-earnings:${driverId}`, earningsParams),
      earningsParams,
      { enabled: Boolean(driverId) },
    );

  const handleRefreshAll = () => {
    refetch();
    refetchTrips();
    refetchWithdrawals();
    refetchEarnings();
  };

  const handleDownloadReport = async () => {
    if (!driverId) return;
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

      const qs = params.toString();
      const res = await api.get(
        `/admin/drivers/${driverId}/analytics/pdf${qs ? `?${qs}` : ''}`,
        { responseType: 'blob' },
      );
      const safeName =
        (data?.driver?.name || 'driver')
          .toString()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '') || 'driver';
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `driver-analytics-${safeName}.pdf`;
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
        key: 'customer',
        label: 'Customer',
        render: (_, row) => row.userId?.name || '—',
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

  const withdrawalColumns = useMemo(
    () => [
      {
        key: 'amount',
        label: 'Amount',
        render: (_, row) => (
          <span className="font-semibold text-slate-900">{formatCurrency(row.amountRupees)}</span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        render: (_, row) => (
          <Badge variant={WITHDRAWAL_STATUS_VARIANT[row.status] || 'secondary'}>
            {row.status}
          </Badge>
        ),
      },
      {
        key: 'balance',
        label: 'Balance at request',
        render: (_, row) => formatCurrency(row.walletBalanceAtRequest),
      },
      {
        key: 'date',
        label: 'Requested',
        render: (_, row) => (
          <span className="text-xs text-slate-600">{formatDateTime12(row.createdAt)}</span>
        ),
      },
    ],
    [],
  );

  const earningsColumns = useMemo(
    () => [
      {
        key: 'kind',
        label: 'Type',
        render: (_, row) => (
          <span className="text-sm text-slate-700 capitalize">{formatLedgerKind(row.kind)}</span>
        ),
      },
      {
        key: 'booking',
        label: 'Reference',
        render: (_, row) => (
          <div>
            <p className="font-mono text-xs">{row.bookingNumber || row.meta?.planName || '—'}</p>
            {row.serviceType && (
              <p className="text-[10px] text-slate-500 capitalize">{row.serviceType}</p>
            )}
          </div>
        ),
      },
      {
        key: 'amount',
        label: 'Amount',
        render: (_, row) => {
          const isCredit = row.direction === 'credit';
          return (
            <span className={`font-semibold ${isCredit ? 'text-emerald-600' : 'text-rose-600'}`}>
              {isCredit ? '+' : '-'}
              {formatCurrency(row.amountRupees)}
            </span>
          );
        },
      },
      {
        key: 'date',
        label: 'Date',
        render: (_, row) => (
          <span className="text-xs text-slate-600">{formatDateTime12(row.occurredAt)}</span>
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

  if (error || !data?.driver) {
    return (
      <div className="space-y-4">
        <BackLink driverId={driverId} />
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || 'Driver not found'}
        </div>
      </div>
    );
  }

  const { driver, profile, summary, breakdown, trends } = data;
  const earningsTotals = earningsData?.totals;

  return (
    <div className="space-y-6 pb-8 animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink driverId={driverId} />
        <div className="flex items-center gap-2">
          <Link
            to={`/admin/drivers/${driverId}/profile`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            View profile
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

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar name={driver.name} size="lg" className="ring-2 ring-white shadow-md" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-primary" />
                {driver.name}
              </h1>
              <StatusBadge status={driver.approvalStatus} />
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="w-4 h-4" />
                {driver.phone || '—'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-4 h-4" />
                {driver.email || '—'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-500" />
                {profile.rating.value.toFixed(1)} ({profile.rating.count} ratings)
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  profile.online.isOnline
                    ? profile.online.isOnTrip
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {profile.online.isOnline
                  ? profile.online.isOnTrip
                    ? 'On trip'
                    : 'Online'
                  : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <Card padding="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2">
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
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total trips', value: summary.trips.total },
          { label: 'Completed', value: summary.trips.completed },
          { label: 'Net earnings (period)', value: formatCurrency(summary.earnings.net) },
          { label: 'Wallet balance', value: formatCurrency(profile.wallet.balance) },
        ].map((s) => (
          <Card key={s.label} padding="p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-xl font-extrabold text-slate-900 mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

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
          title="Trip earnings per day"
          subtitle="Credits from completed trips"
          points={trends.earnings}
          valueKey="amount"
          formatValue={(v) => formatCurrency(v)}
          color="#0D9488"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 min-w-0">
        <SectionCard title="Driver details">
          <InfoGrid
            items={[
              { label: 'Driver ID', value: driver._id, mono: true },
              { label: 'Joined', value: formatDate(profile.joinedAt) },
              { label: 'Approved', value: profile.approvedAt ? formatDate(profile.approvedAt) : '—' },
              { label: 'Experience', value: `${profile.experienceYears} years` },
              { label: 'Active subscriptions', value: String(profile.activeSubscriptions) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Wallet & lifetime earnings">
          <InfoGrid
            items={[
              { label: 'Balance', value: formatCurrency(profile.wallet.balance) },
              { label: 'Total earned', value: formatCurrency(profile.wallet.totalEarnings) },
              { label: 'Total withdrawn', value: formatCurrency(profile.wallet.totalWithdrawn) },
              {
                label: 'Available (approx.)',
                value: formatCurrency(
                  Math.max(0, profile.wallet.balance),
                ),
              },
            ]}
          />
        </SectionCard>

        <SectionCard title="Earnings breakdown (period)">
          <InfoGrid
            items={[
              { label: 'Trip earnings', value: formatCurrency(summary.earnings.tripEarnings) },
              { label: 'Cancellation shares', value: formatCurrency(summary.earnings.cancellationEarnings) },
              { label: 'Subscription payouts', value: formatCurrency(summary.earnings.subscriptionEarnings) },
              { label: 'Penalties', value: formatCurrency(summary.earnings.penaltyDeductions) },
              { label: 'Net earnings', value: formatCurrency(summary.earnings.net) },
              {
                label: 'Withdrawals (period)',
                value: `${summary.withdrawals.total} requests`,
              },
            ]}
          />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 min-w-0">
        <SectionCard title="Cancellation track record">
          <InfoGrid
            items={[
              {
                label: 'Priority penalty points',
                value: String(profile.cancellationStats?.priorityPenaltyPoints ?? 0),
              },
              {
                label: 'Round trip cancellations',
                value: String(profile.cancellationStats?.outstationTotal ?? 0),
              },
              {
                label: 'Penalised cancellations',
                value: String(profile.cancellationStats?.outstationPenalised ?? 0),
              },
              {
                label: 'Last cancelled',
                value: profile.cancellationStats?.lastCancelledAt
                  ? formatDate(profile.cancellationStats.lastCancelledAt)
                  : '—',
              },
            ]}
          />
        </SectionCard>

        <SectionCard title="Withdrawals (period)">
          <InfoGrid
            items={[
              {
                label: 'Pending',
                value: `${summary.withdrawals.pending.count} · ${formatCurrency(summary.withdrawals.pending.total)}`,
              },
              {
                label: 'Processed',
                value: `${summary.withdrawals.processed.count} · ${formatCurrency(summary.withdrawals.processed.total)}`,
              },
              {
                label: 'Rejected',
                value: `${summary.withdrawals.rejected.count} · ${formatCurrency(summary.withdrawals.rejected.total)}`,
              },
            ]}
          />
        </SectionCard>

        {earningsTotals && (
          <SectionCard title="Lifetime earnings ledger">
            <InfoGrid
              items={[
                { label: 'Trip earnings', value: formatCurrency(earningsTotals.tripEarnings) },
                { label: 'Cancellation shares', value: formatCurrency(earningsTotals.cancellationEarnings) },
                { label: 'Subscription payouts', value: formatCurrency(earningsTotals.subscriptionEarnings || 0) },
                { label: 'Penalties', value: formatCurrency(earningsTotals.penaltyDeductions) },
                { label: 'Net total', value: formatCurrency(earningsTotals.netEarnings || earningsTotals.total) },
              ]}
            />
          </SectionCard>
        )}
      </div>

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
                  <span className="font-semibold text-slate-900">{row.count} trips</span>
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
          emptyMessage="No trips found for this driver."
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-slate-500" />
          Earnings ledger
        </h2>
        {earningsError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {earningsError}
          </div>
        )}
        <ServerPaginatedTable
          columns={earningsColumns}
          data={earningsData?.items ?? []}
          loading={earningsLoading}
          page={earningsPage}
          limit={TABLE_LIMIT}
          pagination={{
            total: earningsData?.pagination?.total ?? 0,
            pages: earningsData?.pagination?.pages ?? 1,
          }}
          onPageChange={setEarningsPage}
          entityLabel="entries"
          emptyMessage="No earnings recorded yet."
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Withdrawal requests</h2>
        <Card padding="p-4">
          <select
            value={withdrawalStatusFilter}
            onChange={(e) => setWithdrawalStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white w-full md:w-64"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processed">Processed</option>
            <option value="rejected">Rejected</option>
          </select>
        </Card>
        {withdrawalsError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {withdrawalsError}
          </div>
        )}
        <ServerPaginatedTable
          columns={withdrawalColumns}
          data={withdrawalsData?.items ?? []}
          loading={withdrawalsLoading}
          page={withdrawalsPage}
          limit={TABLE_LIMIT}
          pagination={{
            total: withdrawalsData?.pagination?.total ?? 0,
            pages: withdrawalsData?.pagination?.pages ?? 1,
          }}
          onPageChange={setWithdrawalsPage}
          entityLabel="withdrawals"
          emptyMessage="No withdrawal requests found."
        />
      </div>
    </div>
  );
};

function BackLink({ driverId }) {
  return (
    <Link
      to={`/admin/drivers/${driverId}/profile`}
      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to driver profile
    </Link>
  );
}

export default DriverAnalyticsPage;
