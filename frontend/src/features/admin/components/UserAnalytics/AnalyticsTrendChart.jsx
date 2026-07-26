import { useMemo, useState } from 'react';

const CHART_HEIGHT = 176;

/**
 * Bar chart for analytics trends. Uses explicit pixel bar heights so bars
 * render correctly inside flex layouts (percentage heights do not).
 */
const AnalyticsTrendChart = ({
  title,
  subtitle,
  points = [],
  valueKey,
  formatValue = (v) => String(v),
  color = '#0D9488',
  emptyLabel = 'No data for this period',
}) => {
  const [hovered, setHovered] = useState(null);

  const { max, total, average } = useMemo(() => {
    const values = points.map((p) => Number(p[valueKey]) || 0);
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      max: Math.max(...values, 1),
      total: sum,
      average: values.length ? sum / values.length : 0,
    };
  }, [points, valueKey]);

  const scrollable = points.length > 14;
  const barWidth = scrollable ? 36 : undefined;
  const maxBarHeight = CHART_HEIGHT - 28;

  const formatAxisDate = (dateStr, index, totalPoints) => {
    const d = new Date(dateStr);
    if (totalPoints <= 14) {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }
    if (index === 0 || index === totalPoints - 1 || index % Math.ceil(totalPoints / 6) === 0) {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }
    return '';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm min-w-0 relative">
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {hovered !== null && points[hovered] && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-sm animate-fade-in shrink-0">
                <span className="text-slate-300">
                  {new Date(points[hovered].date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}:
                </span>
                <span className="text-amber-300 font-bold">
                  {formatValue(Number(points[hovered][valueKey]) || 0)}
                </span>
              </div>
            )}

            <div className="flex gap-4 text-right shrink-0">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Total</p>
                <p className="text-sm font-bold text-slate-900">{formatValue(total)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Avg / day</p>
                <p className="text-sm font-bold text-slate-700">{formatValue(average)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!points.length ? (
        <div className="h-48 flex items-center justify-center text-sm text-slate-400">{emptyLabel}</div>
      ) : (
        <div className={`px-4 py-5 ${scrollable ? 'overflow-x-auto' : ''}`}>
          <div
            className="flex items-end gap-1.5 relative"
            style={{
              height: CHART_HEIGHT,
              minWidth: scrollable ? `${points.length * (barWidth + 6)}px` : '100%',
            }}
          >
            {points.map((point, index) => {
              const value = Number(point[valueKey]) || 0;
              const barHeightPx = Math.max(value > 0 ? 6 : 3, (value / max) * maxBarHeight);
              const isHovered = hovered === index;
              const label = formatAxisDate(point.date, index, points.length);

              return (
                <div
                  key={point.date || index}
                  className="flex-1 flex flex-col items-center h-full min-w-0 relative group"
                  style={{ width: barWidth, flex: scrollable ? '0 0 auto' : '1 1 0' }}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {isHovered && (
                    <div
                      className={`absolute top-1 z-30 px-2.5 py-1.5 rounded-xl bg-slate-900/95 text-white text-[10px] font-semibold whitespace-nowrap shadow-2xl pointer-events-none border border-slate-700/50 backdrop-blur-sm ${
                        index < 3
                          ? 'left-0 translate-x-0'
                          : index > points.length - 4
                          ? 'right-0 left-auto translate-x-0'
                          : 'left-1/2 -translate-x-1/2'
                      }`}
                    >
                      <span className="text-slate-300">
                        {new Date(point.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                      <span className="block text-amber-300 font-bold text-[11px]">
                        {formatValue(value)}
                      </span>
                    </div>
                  )}

                  <div className="flex-1 w-full flex items-end justify-center pb-0.5">
                    <div
                      className="w-full max-w-[28px] rounded-t-md transition-all duration-200"
                      style={{
                        height: `${barHeightPx}px`,
                        background: isHovered
                          ? `linear-gradient(180deg, ${color} 0%, ${color}cc 100%)`
                          : `linear-gradient(180deg, ${color}cc 0%, ${color}88 100%)`,
                        opacity: value === 0 ? 0.25 : 1,
                      }}
                    />
                  </div>

                  <div className="w-full h-[1px] bg-slate-200 shrink-0" />

                  <div className="h-5 flex items-center justify-center w-full shrink-0">
                    <span className="text-[9px] text-slate-400 font-medium truncate w-full text-center leading-tight">
                      {label || ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsTrendChart;
