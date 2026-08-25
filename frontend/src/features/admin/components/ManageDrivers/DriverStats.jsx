import { Users, Clock3, CheckCircle2, XCircle, Ban } from 'lucide-react';

const DriverStats = ({ total, pending, approved, rejected, suspended = 0 }) => {
  const stats = [
    { label: 'Total', fullLabel: 'Total Drivers', value: total, icon: Users, color: 'bg-primary/10', iconColor: 'text-primary' },
    { label: 'Pending', fullLabel: 'Pending', value: pending, icon: Clock3, color: 'bg-amber-100', iconColor: 'text-amber-600' },
    { label: 'Approved', fullLabel: 'Approved', value: approved, icon: CheckCircle2, color: 'bg-emerald-100', iconColor: 'text-emerald-600' },
    { label: 'Rejected', fullLabel: 'Rejected', value: rejected, icon: XCircle, color: 'bg-rose-100', iconColor: 'text-rose-600' },
    { label: 'Suspended', fullLabel: 'Suspended', value: suspended, icon: Ban, color: 'bg-slate-100', iconColor: 'text-slate-600' },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scrollbar-hide sm:grid sm:grid-cols-3 xl:grid-cols-5 sm:gap-3 lg:gap-4 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
      {stats.map((stat) => (
        <div
          key={stat.fullLabel}
          className="min-w-[132px] snap-start shrink-0 sm:min-w-0 sm:shrink bg-white rounded-xl sm:rounded-2xl lg:rounded-3xl border border-slate-200 px-3 py-2.5 sm:p-4 lg:p-5 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 font-semibold truncate">
                <span className="sm:hidden">{stat.label}</span>
                <span className="hidden sm:inline">{stat.fullLabel}</span>
              </p>
              <h2 className={`text-lg sm:text-2xl lg:text-3xl font-bold mt-0.5 sm:mt-2 tabular-nums ${stat.iconColor}`}>
                {stat.value}
              </h2>
            </div>
            <div
              className={`w-7 h-7 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-lg sm:rounded-xl lg:rounded-2xl ${stat.color} flex items-center justify-center shrink-0`}
            >
              <stat.icon className={`w-3.5 h-3.5 sm:w-5 sm:h-5 lg:w-6 lg:h-6 ${stat.iconColor}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DriverStats;
