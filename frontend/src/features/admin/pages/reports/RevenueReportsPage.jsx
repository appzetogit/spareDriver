import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { DollarSign, Download, Loader2, ExternalLink } from 'lucide-react';
import StatsCard from '../../components/StatsCard';
import AnalyticsTrendChart from '../../components/UserAnalytics/AnalyticsTrendChart';
import { SectionCard } from '../../components/DetailBlocks';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useAdminRevenueReportsStore } from '../../../../store/admin/useAdminRevenueReportsStore';
import { formatCurrency } from '../../../../utils/formatters';
import {
  ReportPageHeader,
  ReportLoadingState,
  ReportErrorBanner,
} from '../../components/reports/ReportPeriodFilters';
import { useReportPeriod } from '../../components/reports/useReportPeriod';
import { downloadCsvExport } from '../../components/reports/reportUtils';

function formatCount(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

const SOURCE_COLORS = {
  commission: '#10B981',
  cancellation_fee: '#F59E0B',
  driver_penalty: '#EF4444',
  subscription: '#8B5CF6',
  admin_refund: '#64748B',
};

const RevenueReportsPage = () => {
  const { period, setPeriod, fromDate, setFromDate, toDate, setToDate, queryParams } =
    useReportPeriod('30d');
  const [exporting, setExporting] = useState(false);

  const cacheKey = useMemo(
    () => buildCacheKey('admin-revenue-reports', queryParams),
    [queryParams],
  );

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminRevenueReportsStore,
    cacheKey,
    queryParams,
  );

  const summary = data?.summary;
  const breakdown = data?.breakdown;
  const trends = data?.trends;

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadCsvExport('/admin/reports/revenue/export', queryParams, 'revenue-report');
      toast.success('Revenue report exported');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (loading && !data) return <ReportLoadingState />;

  return (
    <div className="space-y-6">
      <ReportPageHeader
        title="Revenue Reports"
        subtitle="Platform revenue analytics — for row-level ledger see Account → Revenue"
        period={period}
        onPeriodChange={setPeriod}
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onRefresh={refetch}
        loading={loading}
        actions={
          <>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-dark text-xs font-semibold hover:bg-primary-dark disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export CSV
            </button>
            <Link
              to="/admin/account/revenue"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View ledger
            </Link>
          </>
        }
      />

      {error && <ReportErrorBanner message={error} onRetry={refetch} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatsCard
          icon={DollarSign}
          label="Total platform revenue"
          value={formatCurrency(summary?.totalRevenue)}
          trend={summary?.trend}
          trendLabel="vs previous period"
          color="#10B981"
        />
        <StatsCard
          icon={DollarSign}
          label="Previous period"
          value={formatCurrency(summary?.previousPeriodTotal)}
          color="#64748B"
        />
      </div>

      <AnalyticsTrendChart
        title="Daily revenue"
        subtitle="Platform revenue by day"
        points={trends?.revenue || []}
        valueKey="amount"
        formatValue={(v) => formatCurrency(v)}
        color="#10B981"
      />

      <SectionCard title="Breakdown by source">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(breakdown?.bySource || []).map((row) => (
            <div
              key={row.source}
              className="rounded-xl border border-slate-100 p-4"
              style={{ borderLeftWidth: 4, borderLeftColor: SOURCE_COLORS[row.source] || '#94A3B8' }}
            >
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{row.label}</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(row.amount)}</p>
              <p className="text-xs text-slate-400 mt-1">{formatCount(row.count)} entries</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
};

export default RevenueReportsPage;
