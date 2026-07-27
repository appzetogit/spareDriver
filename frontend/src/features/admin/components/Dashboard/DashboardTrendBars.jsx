/**
 * Lightweight bar chart for daily trends.
 * Supports both short (7-day) and long (30-day) data points dynamically.
 */
const DashboardTrendBars = ({ title, subtitle, points = [], valueKey, formatValue }) => {
  const max = Math.max(...points.map((p) => Number(p[valueKey]) || 0), 1);
  const totalPoints = points.length;
  const isDense = totalPoints > 10;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-end justify-between gap-1 sm:gap-1.5 h-44 pt-2 w-full overflow-hidden">
        {points.map((point, index) => {
          const value = Number(point[valueKey]) || 0;
          const heightPct = Math.max(6, Math.round((value / max) * 100));
          const dateObj = new Date(point.date);
          const label = dateObj.toLocaleDateString('en-IN', {
            weekday: 'short',
          });
          const formattedDate = dateObj.toLocaleDateString('en-GB');

          // Show label selectively when dense to prevent text collision
          const labelStep = Math.max(1, Math.ceil(totalPoints / 7));
          const showLabel = !isDense || index % labelStep === 0 || index === totalPoints - 1;

          return (
            <div
              key={point.date || index}
              className="flex-1 flex flex-col items-center h-full gap-1 min-w-0 group relative"
            >
              {!isDense && (
                <span className="text-[10px] font-bold text-slate-700 truncate w-full text-center shrink-0">
                  {formatValue(value)}
                </span>
              )}
              <div
                className={`w-full max-w-[28px] min-w-[2px] flex-1 flex items-end rounded-full p-0.5 overflow-hidden relative mx-auto transition-colors ${
                  value > 0
                    ? 'bg-slate-100/70 border border-slate-200/40'
                    : 'bg-transparent'
                }`}
              >
                <div
                  className={`w-full rounded-full transition-all duration-300 ${
                    value > 0
                      ? 'bg-gradient-to-t from-amber-500 to-amber-400 shadow-sm group-hover:brightness-110 group-hover:scale-y-[1.02] transform origin-bottom'
                      : 'bg-slate-200/60'
                  }`}
                  style={{ height: value > 0 ? `${heightPct}%` : '4px' }}
                  title={`${formattedDate}: ${formatValue(value)}`}
                />
              </div>
              <span
                className={`text-[10px] font-medium text-slate-500 shrink-0 mt-0.5 group-hover:text-slate-900 transition-colors ${
                  showLabel ? 'opacity-100' : 'opacity-0'
                }`}
              >
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
