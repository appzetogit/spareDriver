import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Car,
  CalendarCheck,
  DollarSign,
  Receipt,
  ArrowRight,
  BarChart3,
  CircleSlash,
} from 'lucide-react';
import StatsCard from '../../components/StatsCard';
import DashboardTrendBars from '../../components/Dashboard/DashboardTrendBars';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useAdminReportsOverviewStore } from '../../../../store/admin/useAdminReportsOverviewStore';
import { formatCurrency } from '../../../../utils/formatters';
import {
  ReportPageHeader,
  ReportLoadingState,
  ReportErrorBanner,
} from '../../components/reports/ReportPeriodFilters';
import { useReportPeriod } from '../../components/reports/useReportPeriod';

const QUICK_LINKS = [
  { to: '/admin/reports/users', label: 'User Reports', icon: Users, color: '#3B82F6' },
  { to: '/admin/reports/drivers', label: 'Driver Reports', icon: Car, color: '#8B5CF6' },
  { to: '/admin/reports/bookings', label: 'Booking Reports', icon: CalendarCheck, color: '#F59E0B' },
  { to: '/admin/reports/revenue', label: 'Revenue Reports', icon: DollarSign, color: '#10B981' },
  { to: '/admin/reports/gst', label: 'GST Reports', icon: Receipt, color: '#EF4444' },
];

function formatCount(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

const ReportsOverviewPage = () => {
  const { period, setPeriod, fromDate, setFromDate, toDate, setToDate, queryParams } =
    useReportPeriod('30d');

  const cacheKey = useMemo(
    () => buildCacheKey('admin-reports-overview', queryParams),
    [queryParams],
  );

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminReportsOverviewStore,
    cacheKey,
    queryParams,
  );

  const summary = data?.summary;
  const trends = data?.trends;

  if (loading && !data) return <ReportLoadingState />;

  return (
    <div className="space-y-6">
      <ReportPageHeader
        title="Reports Overview"
        subtitle="Platform-wide KPIs and quick links to detailed reports"
        period={period}
        onPeriodChange={setPeriod}
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onRefresh={refetch}
        loading={loading}
      />

      {error && <ReportErrorBanner message={error} onRetry={refetch} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatsCard
          icon={Users}
          label="New users"
          value={formatCount(summary?.users?.count)}
          trend={summary?.users?.trend}
          trendLabel="vs previous period"
          color="#3B82F6"
        />
        <StatsCard
          icon={Car}
          label="New drivers"
          value={formatCount(summary?.drivers?.count)}
          trend={summary?.drivers?.trend}
          trendLabel="vs previous period"
          color="#8B5CF6"
        />
        <StatsCard
          icon={CalendarCheck}
          label="Bookings"
          value={formatCount(summary?.bookings?.count)}
          trend={summary?.bookings?.trend}
          trendLabel="vs previous period"
          color="#F59E0B"
        />
        <StatsCard
          icon={DollarSign}
          label="Trip revenue"
          value={formatCurrency(summary?.tripRevenue?.amount)}
          trend={summary?.tripRevenue?.trend}
          trendLabel="vs previous period"
          color="#10B981"
        />
        <StatsCard
          icon={BarChart3}
          label="Net platform revenue"
          value={formatCurrency(summary?.platformRevenue?.amount)}
          trend={summary?.platformRevenue?.trend}
          trendLabel="vs previous period"
          color="#0D9488"
        />
        <StatsCard
          icon={BarChart3}
          label="Platform commission"
          value={formatCurrency(summary?.platformCommission?.amount)}
          trend={summary?.platformCommission?.trend}
          trendLabel="vs previous period"
          color="#059669"
        />
        <StatsCard
          icon={CircleSlash}
          label="Coupons absorbed"
          value={formatCurrency(summary?.couponsAbsorbed?.amount)}
          trend={summary?.couponsAbsorbed?.trend}
          trendLabel="vs previous period"
          color="#F59E0B"
        />
        <StatsCard
          icon={Receipt}
          label="GST collected"
          value={formatCurrency(summary?.gstCollected?.amount)}
          trend={summary?.gstCollected?.trend}
          trendLabel="vs previous period"
          color="#EF4444"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DashboardTrendBars
          title="Bookings"
          subtitle="Daily trend"
          points={trends?.bookings || []}
          valueKey="count"
          formatValue={(v) => formatCount(v)}
        />
        <DashboardTrendBars
          title="Revenue"
          subtitle="Net platform revenue (after coupons)"
          points={trends?.revenue || []}
          valueKey="amount"
          formatValue={(v) => formatCurrency(v)}
        />
        <DashboardTrendBars
          title="GST"
          subtitle="GST collected"
          points={trends?.gst || []}
          valueKey="amount"
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-4">Quick links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-colors group"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${link.color}15` }}
              >
                <link.icon className="w-5 h-5" style={{ color: link.color }} />
              </div>
              <span className="flex-1 text-sm font-semibold text-slate-700">{link.label}</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReportsOverviewPage;
