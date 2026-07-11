import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserCheck, Wallet, CreditCard } from 'lucide-react';
import StatsCard from '../../components/StatsCard';
import AnalyticsTrendChart from '../../components/UserAnalytics/AnalyticsTrendChart';
import { SectionCard, InfoGrid } from '../../components/DetailBlocks';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useAdminUserReportsStore } from '../../../../store/admin/useAdminUserReportsStore';
import { formatCurrency } from '../../../../utils/formatters';
import {
  ReportPageHeader,
  ReportLoadingState,
  ReportErrorBanner,
} from '../../components/reports/ReportPeriodFilters';
import { useReportPeriod } from '../../components/reports/useReportPeriod';

function formatCount(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

const UserReportsPage = () => {
  const { period, setPeriod, fromDate, setFromDate, toDate, setToDate, queryParams } =
    useReportPeriod('30d');

  const cacheKey = useMemo(
    () => buildCacheKey('admin-user-reports', queryParams),
    [queryParams],
  );

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminUserReportsStore,
    cacheKey,
    queryParams,
  );

  const summary = data?.summary;
  const trends = data?.trends;
  const breakdown = data?.breakdown;
  const topUsers = data?.topUsers || [];

  if (loading && !data) return <ReportLoadingState />;

  return (
    <div className="space-y-6">
      <ReportPageHeader
        title="User Reports"
        subtitle="Platform-wide user signups, activity, and spending"
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          icon={Users}
          label="New signups"
          value={formatCount(summary?.newSignups)}
          color="#3B82F6"
        />
        <StatsCard
          icon={UserCheck}
          label="Active users"
          value={formatCount(summary?.activeUsers)}
          color="#10B981"
        />
        <StatsCard
          icon={CreditCard}
          label="Total spending"
          value={formatCurrency(summary?.totalSpending)}
          color="#8B5CF6"
        />
        <StatsCard
          icon={Wallet}
          label="Wallet top-ups"
          value={formatCurrency(summary?.walletTopups)}
          color="#F59E0B"
        />
      </div>

      <AnalyticsTrendChart
        title="New signups"
        subtitle="Daily user registrations"
        points={trends?.signups || []}
        valueKey="count"
        formatValue={(v) => formatCount(v)}
        color="#3B82F6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Spending breakdown">
          <InfoGrid
            items={[
              { label: 'Trip spending', value: formatCurrency(summary?.tripSpending) },
              { label: 'Subscription spending', value: formatCurrency(summary?.subscriptionSpending) },
              { label: 'Wallet booking payments', value: formatCurrency(summary?.walletBookingPayments) },
              { label: 'Wallet top-up count', value: formatCount(summary?.walletTopupCount) },
            ]}
          />
        </SectionCard>

        <SectionCard title="By zone">
          {!breakdown?.byZone?.length ? (
            <p className="text-sm text-slate-400">No zone data for this period</p>
          ) : (
            <div className="space-y-2">
              {breakdown.byZone.map((row) => (
                <div
                  key={row.zoneId}
                  className="flex items-center justify-between text-sm py-2 border-b border-slate-50 last:border-0"
                >
                  <span className="font-medium text-slate-700">{row.zoneName}</span>
                  <span className="text-slate-500">
                    {formatCount(row.bookings)} bookings · {formatCurrency(row.spending)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Top users by spending</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-5 py-3 font-semibold">Trips</th>
                <th className="px-5 py-3 font-semibold">Trip spend</th>
                <th className="px-5 py-3 font-semibold">Total</th>
                <th className="px-5 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {topUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    No users in this period
                  </td>
                </tr>
              ) : (
                topUsers.map((user) => (
                  <tr key={user.userId} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{user.name}</p>
                      <p className="text-xs text-slate-400">{user.phone || user.email}</p>
                    </td>
                    <td className="px-5 py-3">{formatCount(user.trips)}</td>
                    <td className="px-5 py-3">{formatCurrency(user.tripSpending)}</td>
                    <td className="px-5 py-3 font-semibold">{formatCurrency(user.totalSpending)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/admin/users/${user.userId}/analytics`}
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

export default UserReportsPage;
