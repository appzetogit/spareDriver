import { TrendingUp, TrendingDown } from 'lucide-react';

/**
 * StatsCard — Admin dashboard stat card with icon, value, label, and trend.
 */
const StatsCard = ({ icon: Icon, label, value, trend, trendLabel, color = '#FFC107', className = '' }) => {
  const isPositive = trend >= 0;

  return (
    <div className={`bg-white rounded-2xl p-3.5 sm:p-5 border border-gray-100 hover:shadow-md transition-shadow ${className}`}>
      <div className="flex items-start justify-between mb-2.5 sm:mb-3">
        <div
          className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color }} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-0.5 sm:gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-[10px] sm:text-xs font-semibold ${isPositive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
            {isPositive ? <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <TrendingDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-xl sm:text-2xl font-bold text-text truncate">{value}</p>
      <p className="text-[11px] sm:text-xs text-text-muted mt-0.5 sm:mt-1 truncate">{label}</p>
      {trendLabel && (
        <p className="text-[9px] sm:text-[10px] text-text-muted mt-0.5 truncate">{trendLabel}</p>
      )}
    </div>
  );
};

export default StatsCard;
