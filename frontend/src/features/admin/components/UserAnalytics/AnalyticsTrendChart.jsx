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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
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

      {!points.length ? (
        <div className="h-48 flex items-center justify-center text-sm text-slate-400">{emptyLabel}</div>
      ) : (
        <div className={`px-4 py-5 ${scrollable ? 'overflow-x-auto' : ''}`}>
          <div
            className="flex items-end gap-1.5"
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
                  key={point.date}
                  className="flex flex-col items-center justify-end gap-1.5 relative h-full min-w-0"
                  style={{ width: barWidth, flex: scrollable ? '0 0 auto' : '1 1 0' }}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {isHovered && (
                    <div className="absolute bottom-full mb-2 z-10 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-semibold whitespace-nowrap shadow-lg pointer-events-none">
                      {new Date(point.date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      <span className="block text-white/80">{formatValue(value)}</span>
                    </div>
                  )}
                  <div
                    className="w-full rounded-t-md transition-all duration-200 shrink-0"
                    style={{
                      height: barHeightPx,
                      background: isHovered
                        ? `linear-gradient(180deg, ${color} 0%, ${color}cc 100%)`
                        : `linear-gradient(180deg, ${color}cc 0%, ${color}88 100%)`,
                      opacity: value === 0 ? 0.3 : 1,
                    }}
                    title={`${point.date}: ${formatValue(value)}`}
                  />
                  {label && (
                    <span className="text-[9px] text-slate-400 font-medium truncate w-full text-center leading-tight shrink-0">
                      {label}
                    </span>
                  )}
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
