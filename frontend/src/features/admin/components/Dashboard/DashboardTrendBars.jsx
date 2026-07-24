/**
 * Lightweight 7-day bar chart — no chart library dependency.
 */
const DashboardTrendBars = ({ title, subtitle, points = [], valueKey, formatValue }) => {
  const max = Math.max(...points.map((p) => Number(p[valueKey]) || 0), 1);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-end justify-between gap-3 h-44 pt-2">
        {points.map((point) => {
          const value = Number(point[valueKey]) || 0;
          const heightPct = Math.max(8, Math.round((value / max) * 100));
          const label = new Date(point.date).toLocaleDateString('en-IN', {
            weekday: 'short',
          });
          const formattedDate = new Date(point.date).toLocaleDateString('en-GB');

          return (
            <div key={point.date} className="flex-1 flex flex-col items-center h-full gap-1.5 min-w-0 group">
              <span className="text-[11px] font-bold text-slate-700 truncate w-full text-center shrink-0">
                {formatValue(value)}
              </span>
              <div className="w-8 sm:w-10 flex-1 flex items-end bg-slate-100/70 rounded-xl p-1 overflow-hidden relative border border-slate-200/50 mx-auto">
                <div
                  className={`w-full rounded-lg transition-all duration-500 ${
                    value > 0
                      ? 'bg-gradient-to-t from-amber-500 to-amber-400 shadow-sm group-hover:brightness-110 group-hover:scale-y-[1.02] transform origin-bottom'
                      : 'bg-slate-200/50'
                  }`}
                  style={{ height: `${heightPct}%` }}
                  title={`${formattedDate}: ${formatValue(value)}`}
                />
              </div>
              <span className="text-[11px] font-medium text-slate-500 shrink-0 mt-0.5 group-hover:text-slate-900 transition-colors">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DashboardTrendBars;
