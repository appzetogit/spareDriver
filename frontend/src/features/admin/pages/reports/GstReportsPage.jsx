import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Receipt, Download, Loader2 } from 'lucide-react';
import StatsCard from '../../components/StatsCard';
import AnalyticsTrendChart from '../../components/UserAnalytics/AnalyticsTrendChart';
import { SectionCard } from '../../components/DetailBlocks';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useAdminGstReportsStore } from '../../../../store/admin/useAdminGstReportsStore';
import { formatCurrency } from '../../../../utils/formatters';
import { formatDateTime12 } from '../../../../utils/datetime';
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

const GstReportsPage = () => {
  const { period, setPeriod, fromDate, setFromDate, toDate, setToDate, queryParams } =
    useReportPeriod('30d');
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);

  const params = useMemo(() => ({ ...queryParams, page, limit: 20 }), [queryParams, page]);

  const cacheKey = useMemo(() => buildCacheKey('admin-gst-reports', params), [params]);

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminGstReportsStore,
    cacheKey,
    params,
  );

  const summary = data?.summary;
  const breakdown = data?.breakdown;
  const trends = data?.trends;
  const lineItems = data?.lineItems;
  const pagination = lineItems?.pagination;

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadCsvExport('/admin/reports/gst/export', queryParams, 'gst-report');
      toast.success('GST report exported');
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
        title="GST Reports"
        subtitle="GST collected from completed bookings and subscription purchases"
        period={period}
        onPeriodChange={(p) => {
          setPeriod(p);
          setPage(1);
        }}
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={(v) => {
          setFromDate(v);
          setPage(1);
        }}
        onToDateChange={(v) => {
          setToDate(v);
          setPage(1);
        }}
        onRefresh={refetch}
        loading={loading}
        actions={
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-dark text-xs font-semibold hover:bg-primary-dark disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export CSV
          </button>
        }
      />

      {error && <ReportErrorBanner message={error} onRetry={refetch} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          icon={Receipt}
          label="Total GST"
          value={formatCurrency(summary?.totalGst)}
          color="#EF4444"
        />
        <StatsCard
          icon={Receipt}
          label="Booking GST"
          value={formatCurrency(summary?.bookingGst)}
          color="#F59E0B"
        />
        <StatsCard
          icon={Receipt}
          label="Subscription GST"
          value={formatCurrency(summary?.subscriptionGst)}
          color="#8B5CF6"
        />
        <StatsCard
          icon={Receipt}
          label="Default GST %"
          value={`${summary?.defaultGstPercent ?? 18}%`}
          color="#64748B"
        />
      </div>

      <AnalyticsTrendChart
        title="Daily GST collected"
        subtitle="Bookings + subscriptions"
        points={trends?.gst || []}
        valueKey="amount"
        formatValue={(v) => formatCurrency(v)}
        color="#EF4444"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="By service type">
          <div className="space-y-2">
            {(breakdown?.byServiceType || []).map((row) => (
              <div
                key={row.serviceType}
                className="flex items-center justify-between text-sm py-2 border-b border-slate-50 last:border-0 capitalize"
              >
                <span className="font-medium text-slate-700">{row.serviceType}</span>
                <span className="text-slate-500">
                  {formatCount(row.count)} · {formatCurrency(row.gst)}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="By month (compliance)">
          <div className="space-y-2">
            {(breakdown?.byMonth || []).length === 0 ? (
              <p className="text-sm text-slate-400">No data for this period</p>
            ) : (
              breakdown.byMonth.map((row) => (
                <div
                  key={row.month}
                  className="flex items-center justify-between text-sm py-2 border-b border-slate-50 last:border-0"
                >
                  <span className="font-medium text-slate-700">{row.month}</span>
                  <span className="text-slate-500">
                    {formatCurrency(row.totalGst)} ({formatCount(row.bookingCount + row.subscriptionCount)} txns)
                  </span>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-800">Line items (bookings + subscriptions)</h3>
          <p className="text-xs text-slate-400">
            {formatCount(summary?.lineItemCounts?.bookings)} bookings ·{' '}
            {formatCount(summary?.lineItemCounts?.subscriptions)} subscriptions · page{' '}
            {pagination?.page} of {pagination?.pages}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Ref</th>
                <th className="px-5 py-3 font-semibold">Source</th>
                <th className="px-5 py-3 font-semibold">Base</th>
                <th className="px-5 py-3 font-semibold">Svc charge</th>
                <th className="px-5 py-3 font-semibold">GST</th>
                <th className="px-5 py-3 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {(lineItems?.items || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    No line items in this period
                  </td>
                </tr>
              ) : (
                lineItems.items.map((row) => (
                  <tr key={`${row.type}-${row.ref}-${row.date}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-5 py-3 whitespace-nowrap">{formatDateTime12(row.date)}</td>
                    <td className="px-5 py-3 capitalize text-xs font-semibold text-slate-500">
                      {row.type}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{row.ref}</td>
                    <td className="px-5 py-3 capitalize">
                      {row.type === 'subscription'
                        ? row.planName || 'Subscription'
                        : row.serviceType}
                    </td>
                    <td className="px-5 py-3">{formatCurrency(row.base)}</td>
                    <td className="px-5 py-3">{formatCurrency(row.serviceCharge)}</td>
                    <td className="px-5 py-3">
                      {formatCurrency(row.gstAmount)}
                      <span className="text-xs text-slate-400 ml-1">({row.gstPercent}%)</span>
                    </td>
                    <td className="px-5 py-3 font-semibold">{formatCurrency(row.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pagination && pagination.pages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GstReportsPage;
