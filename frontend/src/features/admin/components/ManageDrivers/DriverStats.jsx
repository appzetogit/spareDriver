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
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
      {stats.map((stat) => (
        <div
          key={stat.fullLabel}
          className="bg-white rounded-2xl lg:rounded-3xl border border-slate-200 px-3 py-3 sm:p-4 lg:p-5 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 font-semibold truncate">
                <span className="sm:hidden">{stat.label}</span>
                <span className="hidden sm:inline">{stat.fullLabel}</span>
              </p>
              <h2 className={`text-xl sm:text-2xl lg:text-3xl font-bold mt-1 sm:mt-2 tabular-nums ${stat.iconColor}`}>
                {stat.value}
              </h2>
            </div>
            <div
              className={`w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl ${stat.color} flex items-center justify-center shrink-0`}
            >
              <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 ${stat.iconColor}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DriverStats;
