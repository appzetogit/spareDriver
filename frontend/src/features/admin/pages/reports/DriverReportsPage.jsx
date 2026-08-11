import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Car, UserPlus, Radio, Banknote } from 'lucide-react';
import StatsCard from '../../components/StatsCard';
import AnalyticsTrendChart from '../../components/UserAnalytics/AnalyticsTrendChart';
import { SectionCard, InfoGrid } from '../../components/DetailBlocks';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useAdminDriverReportsStore } from '../../../../store/admin/useAdminDriverReportsStore';
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

const DriverReportsPage = () => {
  const { period, setPeriod, fromDate, setFromDate, toDate, setToDate, queryParams } =
    useReportPeriod('30d');

  const cacheKey = useMemo(
    () => buildCacheKey('admin-driver-reports', queryParams),
    [queryParams],
  );

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminDriverReportsStore,
    cacheKey,
    queryParams,
  );

  const summary = data?.summary;
  const trends = data?.trends;
  const breakdown = data?.breakdown;
  const topDrivers = data?.topDrivers || [];
  const funnel = summary?.approvalFunnel;

  if (loading && !data) return <ReportLoadingState />;

  return (
    <div className="space-y-6">
      <ReportPageHeader
        title="Driver Reports"
        subtitle="Signups, approval funnel, earnings, and withdrawals"
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
            exportPath="/admin/reports/drivers/export"
            queryParams={queryParams}
            filenamePrefix="driver-reports"
          />
        }
      />

      {error && <ReportErrorBanner message={error} onRetry={refetch} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          icon={UserPlus}
          label="New signups"
          value={formatCount(summary?.newSignups)}
          color="#8B5CF6"
        />
        <StatsCard
          icon={Radio}
          label="Online now"
          value={formatCount(summary?.onlineDrivers)}
          color="#10B981"
        />
        <StatsCard
          icon={Banknote}
          label="Earnings paid"
          value={formatCurrency(summary?.totalEarningsPaid)}
          color="#F59E0B"
        />
        <StatsCard
          icon={Car}
          label="Approved drivers"
          value={formatCount(funnel?.approved)}
          color="#3B82F6"
        />
      </div>

      <AnalyticsTrendChart
        title="New driver signups"
        subtitle="Daily registrations"
        points={trends?.signups || []}
        valueKey="count"
        formatValue={(v) => formatCount(v)}
        color="#8B5CF6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Approval funnel (current)">
          <InfoGrid
            columns={3}
            items={[
              { label: 'Pending', value: formatCount(funnel?.pending) },
              { label: 'Under review', value: formatCount(funnel?.under_review) },
              { label: 'Approved', value: formatCount(funnel?.approved) },
              { label: 'Rejected', value: formatCount(funnel?.rejected) },
              { label: 'Suspended', value: formatCount(funnel?.suspended) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Withdrawals (period)">
          <InfoGrid
            items={[
              {
                label: 'Pending',
                value: `${formatCount(summary?.withdrawals?.pending?.count)} · ${formatCurrency(summary?.withdrawals?.pending?.total)}`,
              },
              {
                label: 'Processed',
                value: `${formatCount(summary?.withdrawals?.processed?.count)} · ${formatCurrency(summary?.withdrawals?.processed?.total)}`,
              },
              {
                label: 'Rejected',
                value: `${formatCount(summary?.withdrawals?.rejected?.count)} · ${formatCurrency(summary?.withdrawals?.rejected?.total)}`,
              },
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard title="By service type">
        {!breakdown?.byServiceType?.length ? (
          <p className="text-sm text-slate-400">No completed trips in this period</p>
        ) : (
          <div className="space-y-2">
            {breakdown.byServiceType.map((row) => (
              <div
                key={row.serviceType}
                className="flex items-center justify-between text-sm py-2 border-b border-slate-50 last:border-0 capitalize"
              >
                <span className="font-medium text-slate-700">{row.serviceType}</span>
                <span className="text-slate-500">
                  {formatCount(row.trips)} trips · {formatCurrency(row.earnings)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Top drivers by earnings</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                <th className="px-5 py-3 font-semibold">Driver</th>
                <th className="px-5 py-3 font-semibold">Trips</th>
                <th className="px-5 py-3 font-semibold">Earnings</th>
                <th className="px-5 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {topDrivers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                    No drivers in this period
                  </td>
                </tr>
              ) : (
                topDrivers.map((driver) => (
                  <tr key={driver.driverId} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{driver.name}</p>
                      <p className="text-xs text-slate-400">{driver.phone}</p>
                    </td>
                    <td className="px-5 py-3">{formatCount(driver.trips)}</td>
                    <td className="px-5 py-3 font-semibold">{formatCurrency(driver.earnings)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/admin/drivers/${driver.driverId}/analytics`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        View analytics
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DriverReportsPage;
