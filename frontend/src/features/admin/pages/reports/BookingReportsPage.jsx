import { useMemo } from 'react';
import { CalendarCheck, CheckCircle, XCircle, Percent } from 'lucide-react';
import StatsCard from '../../components/StatsCard';
import AnalyticsTrendChart from '../../components/UserAnalytics/AnalyticsTrendChart';
import { SectionCard } from '../../components/DetailBlocks';
import Badge from '../../../../components/Badge';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useAdminBookingReportsStore } from '../../../../store/admin/useAdminBookingReportsStore';
import { formatCurrency } from '../../../../utils/formatters';
import {
  ReportPageHeader,
  ReportLoadingState,
  ReportErrorBanner,
} from '../../components/reports/ReportPeriodFilters';
import { useReportPeriod } from '../../components/reports/useReportPeriod';
import ReportExportButtons from '../../components/reports/ReportExportButtons';

function formatCount(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

const STATUS_VARIANT = {
  completed: 'success',
  cancelled: 'danger',
  searching: 'warning',
  started: 'primary',
};

const BookingReportsPage = () => {
  const { period, setPeriod, fromDate, setFromDate, toDate, setToDate, queryParams } =
    useReportPeriod('30d');

  const cacheKey = useMemo(
    () => buildCacheKey('admin-booking-reports', queryParams),
    [queryParams],
  );

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminBookingReportsStore,
    cacheKey,
    queryParams,
  );

  const summary = data?.summary;
  const trends = data?.trends;
  const breakdown = data?.breakdown;

  if (loading && !data) return <ReportLoadingState />;

  return (
    <div className="space-y-6">
      <ReportPageHeader
        title="Booking Reports"
        subtitle="Booking volume, status mix, cancellation rate, and revenue"
        period={period}
        onPeriodChange={setPeriod}
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onRefresh={refetch}
        loading={loading}
        actions={
          <ReportExportButtons
            exportPath="/admin/reports/bookings/export"
            queryParams={queryParams}
            filenamePrefix="booking-reports"
          />
        }
      />

      {error && <ReportErrorBanner message={error} onRetry={refetch} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          icon={CalendarCheck}
          label="Total bookings"
          value={formatCount(summary?.totalBookings)}
          color="#F59E0B"
        />
        <StatsCard
          icon={CheckCircle}
          label="Completed"
          value={formatCount(summary?.completed)}
          color="#10B981"
        />
        <StatsCard
          icon={XCircle}
          label="Cancellation rate"
          value={`${summary?.cancellationRate ?? 0}%`}
          color="#EF4444"
        />
        <StatsCard
          icon={Percent}
          label="Avg fare (completed)"
          value={formatCurrency(summary?.avgFare)}
          color="#3B82F6"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnalyticsTrendChart
          title="Bookings"
          subtitle="Daily booking count"
          points={trends?.bookings || []}
          valueKey="count"
          formatValue={(v) => formatCount(v)}
          color="#F59E0B"
        />
        <AnalyticsTrendChart
          title="Gross revenue"
          subtitle="From completed trips"
          points={trends?.revenue || []}
          valueKey="amount"
          formatValue={(v) => formatCurrency(v)}
          color="#10B981"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="By status">
          <div className="space-y-2">
            {(breakdown?.byStatus || []).map((row) => (
              <div key={row.status} className="flex items-center justify-between gap-2">
                <Badge variant={STATUS_VARIANT[row.status] || 'default'} className="capitalize">
                  {row.status?.replace(/_/g, ' ')}
                </Badge>
                <span className="text-sm font-semibold text-slate-700">{formatCount(row.count)}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="By service type">
          <div className="space-y-2">
            {(breakdown?.byServiceType || []).map((row) => (
              <div
                key={row.serviceType}
                className="flex items-center justify-between text-sm py-2 border-b border-slate-50 last:border-0 capitalize"
              >
                <span className="font-medium text-slate-700">{row.serviceType}</span>
                <span className="text-slate-500">
                  {formatCount(row.count)} · {formatCurrency(row.revenue)}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="By zone">
          <div className="space-y-2">
            {(breakdown?.byZone || []).length === 0 ? (
              <p className="text-sm text-slate-400">No zone data</p>
            ) : (
              breakdown.byZone.map((row) => (
                <div
                  key={row.zoneId}
                  className="flex items-center justify-between text-sm py-2 border-b border-slate-50 last:border-0"
                >
                  <span className="font-medium text-slate-700">{row.zoneName}</span>
                  <span className="text-slate-500">
                    {formatCount(row.count)} · {formatCurrency(row.revenue)}
                  </span>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Gross revenue</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrency(summary?.grossRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Revenue per booking</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrency(summary?.revenuePerBooking)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Active bookings</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{formatCount(summary?.active)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingReportsPage;
