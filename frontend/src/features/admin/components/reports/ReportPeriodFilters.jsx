import { Loader2, RefreshCw } from 'lucide-react';
import { PERIOD_OPTIONS } from './reportUtils';

const ReportPeriodFilters = ({
  period,
  onPeriodChange,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  children,
}) => (
  <div className="flex flex-col lg:flex-row lg:items-end gap-2.5 sm:gap-3">
    <div className="flex flex-row items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 max-w-full min-w-0 no-scrollbar">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onPeriodChange(opt.value)}
          className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors shrink-0 ${
            period === opt.value
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
    {period === 'custom' && (
      <div className="flex flex-row items-center gap-1.5 sm:gap-2">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => onFromDateChange(e.target.value)}
          className="px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 text-xs"
        />
        <span className="text-xs text-slate-400">to</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => onToDateChange(e.target.value)}
          className="px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 text-xs"
        />
      </div>
    )}
    {children}
  </div>
);

export const ReportLoadingState = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

export const ReportErrorBanner = ({ message, onRetry }) => (
  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-center justify-between gap-3">
    <p className="text-sm text-rose-700">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Retry
      </button>
    )}
  </div>
);

export const ReportPageHeader = ({
  title,
  subtitle,
  period,
  onPeriodChange,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onRefresh,
  loading,
  actions,
}) => (
  <div className="space-y-3 sm:space-y-4">
    <div className="flex flex-row items-start justify-between gap-2">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {actions}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </div>
    <ReportPeriodFilters
      period={period}
      onPeriodChange={onPeriodChange}
      fromDate={fromDate}
      toDate={toDate}
      onFromDateChange={onFromDateChange}
      onToDateChange={onToDateChange}
    />
  </div>
);

export default ReportPeriodFilters;
