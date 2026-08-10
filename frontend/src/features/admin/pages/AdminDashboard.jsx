import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Car,
  CalendarCheck,
  DollarSign,
  RefreshCw,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import StatsCard from '../components/StatsCard';
import BookingStats from '../components/ManageBookings/BookingStats';
import DriverStats from '../components/ManageDrivers/DriverStats';
import DashboardActionItems from '../components/Dashboard/DashboardActionItems';
import DashboardTrendBars from '../components/Dashboard/DashboardTrendBars';
import DataTable from '../components/DataTable';
import Badge from '../../../components/Badge';
import Avatar from '../../../components/Avatar';
import StatusBadge from '../components/StatusBadge';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { useAdminDashboardStore } from '../../../store/admin/useAdminDashboardStore';
import { formatCurrency, formatDate } from '../../../utils/formatters';

const CACHE_KEY = 'admin-dashboard';

const BOOKING_STATUS_VARIANTS = {
  pending_assignment: 'info',
  searching: 'warning',
  driver_assigned: 'info',
  awaiting_payment: 'warning',
  en_route: 'info',
  arrived: 'info',
  started: 'success',
  in_emergency_pool: 'danger',
  completed: 'success',
  cancelled: 'danger',
  no_drivers_found: 'danger',
};

const FORMATTED_STATUS_NAMES = {
  in_emergency_pool: 'Emergency Pool',
  pending_assignment: 'Pending Assignment',
  driver_assigned: 'Driver Assigned',
  awaiting_payment: 'Awaiting Payment',
  no_drivers_found: 'No Drivers Found',
  en_route: 'En Route',
};

function formatCompactCurrency(amount) {
  const n = Number(amount) || 0;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return formatCurrency(n);
}

function formatCount(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

const SectionHeader = ({ title, subtitle, href, linkLabel = 'View all' }) => (
  <div className="flex items-center justify-between gap-3">
    <div>
      <h2 className="text-lg font-bold text-text">{title}</h2>
      {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
    </div>
    {href && (
      <Link
        to={href}
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-dark transition-colors shrink-0"
      >
        {linkLabel}
        <ArrowRight className="w-4 h-4" />
      </Link>
    )}
  </div>
);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useCachedQuery(
    useAdminDashboardStore,
    CACHE_KEY,
    {},
  );

  const overview = data?.overview;
  const bookings = data?.bookings;
  const drivers = data?.drivers;
  const actionItems = data?.actionItems;
  const trends = data?.trends;
  const recent = data?.recent;

  const driverColumns = useMemo(
    () => [
      {
        key: 'name',
        label: 'Driver',
        render: (val, row) => (
          <div className="flex items-center gap-3">
            <Avatar name={val} size="sm" />
            <div>
              <p className="font-semibold">{val}</p>
              <p className="text-[10px] text-text-muted">{row.phone}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'approvalStatus',
        label: 'Status',
        render: (val) => <StatusBadge status={val} />,
      },
      {
        key: 'createdAt',
        label: 'Joined',
        render: (val) => formatDate(val),
      },
    ],
    [],
  );

  const bookingColumns = useMemo(
    () => [
      {
        key: 'bookingNumber',
        label: 'Booking',
        render: (val) => (
          <span className="font-mono text-[10px] sm:text-xs font-semibold block truncate">
            {val || '—'}
          </span>
        ),
      },
      {
        key: 'serviceType',
        label: 'Service',
        render: (val) => (
          <span className="capitalize text-xs sm:text-sm block truncate">
            {val?.replace(/_/g, ' ') || '—'}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        render: (val, row) => {
          const statusVal = val || row?.status;
          const label = FORMATTED_STATUS_NAMES[statusVal] || (statusVal ? statusVal.replace(/_/g, ' ') : '—');
          return (
            <Badge
              variant={BOOKING_STATUS_VARIANTS[statusVal] || 'default'}
              className="capitalize text-[9px] sm:text-xs px-1.5 py-0.5 sm:px-2.5 sm:py-1 whitespace-nowrap"
            >
              {label}
            </Badge>
          );
        },
      },
      {
        key: 'fare',
        label: 'Fare',
        align: 'right',
        render: (val) => (
          <span className="text-xs sm:text-sm font-semibold whitespace-nowrap">
            {formatCurrency(val)}
          </span>
        ),
      },
    ],
    [],
  );

  const userColumns = useMemo(
    () => [
      {
        key: 'name',
        label: 'User',
        render: (val, row) => (
          <div className="flex items-center gap-3">
            <Avatar name={val} size="sm" />
            <div>
              <p className="font-semibold">{val}</p>
              <p className="text-[10px] text-text-muted">{row.phone_no || row.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'createdAt',
        label: 'Joined',
        render: (val) => formatDate(val),
      },
    ],
    [],
  );

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-medium">Loading dashboard…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs sm:text-sm text-text-muted">
            Platform snapshot — one API call, live counts from MongoDB
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={loading}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatsCard
          icon={Users}
          label="Total Users"
          value={formatCount(overview?.users?.total)}
          trend={overview?.users?.trend}
          trendLabel="new signups vs last month"
          color="#3498DB"
        />
        <StatsCard
          icon={Car}
          label="Total Drivers"
          value={formatCount(overview?.drivers?.total)}
          trend={overview?.drivers?.trend}
          trendLabel={`${overview?.drivers?.online ?? 0} online now`}
          color="#2ECC71"
        />
        <StatsCard
          icon={CalendarCheck}
          label="Bookings Today"
          value={formatCount(overview?.bookingsToday?.count)}
          trend={overview?.bookingsToday?.trend}
          trendLabel="vs yesterday"
          color="#F39C12"
        />
        <StatsCard
          icon={DollarSign}
          label="Trip Revenue (Month)"
          value={formatCompactCurrency(overview?.revenue?.monthTotal)}
          trend={overview?.revenue?.trend}
          trendLabel="vs last month"
          color="#9B59B6"
        />
      </div>

      <DashboardActionItems items={actionItems} />

      <div className="space-y-3">
        <SectionHeader title="Booking Pipeline" href="/admin/bookings" />
        <BookingStats
          total={bookings?.total}
          searching={bookings?.searching}
          active={bookings?.active}
          completed={bookings?.completed}
          cancelled={bookings?.cancelled}
          noDriversFound={bookings?.noDriversFound}
        />
      </div>

      <div className="space-y-3">
        <SectionHeader title="Driver Onboarding" href="/admin/drivers" />
        <DriverStats
          total={drivers?.total}
          pending={(drivers?.pending ?? 0) + (drivers?.underReview ?? 0)}
          approved={drivers?.approved}
          rejected={drivers?.rejected}
          suspended={drivers?.suspended}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardTrendBars
          title="Bookings — last 7 days"
          subtitle="New bookings created per day"
          points={trends?.bookingsLast7Days ?? []}
          valueKey="count"
          formatValue={(v) => String(v)}
        />
        <DashboardTrendBars
          title="Trip revenue — last 7 days"
          subtitle="Commission, cancellation fees & penalties"
          points={trends?.revenueLast7Days ?? []}
          valueKey="amount"
          formatValue={formatCompactCurrency}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <SectionHeader
            title="Live Bookings"
            subtitle="Active rides across the platform"
            href="/admin/bookings"
          />
          <DataTable
            columns={bookingColumns}
            data={recent?.bookings ?? []}
            pageSize={5}
            showSearch={false}
            embedded
            onRowClick={(row) => navigate('/admin/bookings')}
          />
        </div>

        <div className="space-y-4">
          <SectionHeader title="Recent Drivers" href="/admin/drivers" />
          <DataTable
            columns={driverColumns}
            data={recent?.drivers ?? []}
            pageSize={5}
            showSearch={false}
            embedded
            onRowClick={(row) => navigate(`/admin/drivers/${row._id}/profile`)}
          />
        </div>
      </div>

      <div className="space-y-4">
        <SectionHeader title="Recent Users" href="/admin/users" />
        <DataTable
          columns={userColumns}
          data={recent?.users ?? []}
          pageSize={5}
          showSearch={false}
          embedded
          onRowClick={(row) => navigate(`/admin/users/${row._id}/profile`)}
        />
      </div>
    </div>
  );
};

export default AdminDashboard;
