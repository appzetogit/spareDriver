/**
 * Lightweight 7-day bar chart — no chart library dependency.
 */
const DashboardTrendBars = ({ title, subtitle, points, valueKey, formatValue }) => {
  const max = Math.max(...points.map((p) => Number(p[valueKey]) || 0), 1);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-end justify-between gap-2 h-36">
        {points.map((point) => {
          const value = Number(point[valueKey]) || 0;
          const heightPct = Math.max(4, (value / max) * 100);
          const label = new Date(point.date).toLocaleDateString('en-IN', {
            weekday: 'short',
          });
          return (
            <div key={point.date} className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <span className="text-[10px] font-semibold text-slate-600 truncate w-full text-center">
                {formatValue(value)}
              </span>
              <div
                className="w-full rounded-t-lg bg-primary/80 transition-all"
                style={{ height: `${heightPct}%` }}
                title={`${point.date}: ${formatValue(value)}`}
              />
              <span className="text-[10px] text-slate-400">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DashboardTrendBars;
