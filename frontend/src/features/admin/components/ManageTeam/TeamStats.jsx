import { Users, UserCheck, UserMinus, ShieldCheck } from 'lucide-react';

const TeamStats = ({ total, active, inactive, admins }) => {
  const stats = [
    { label: 'Total Members', value: total, icon: Users, color: 'bg-primary/10', iconColor: 'text-primary' },
    { label: 'Active', value: active, icon: UserCheck, color: 'bg-emerald-100', iconColor: 'text-emerald-600' },
    { label: 'Inactive', value: inactive, icon: UserMinus, color: 'bg-rose-100', iconColor: 'text-rose-600' },
    { label: 'Super Admins', value: admins, icon: ShieldCheck, color: 'bg-amber-100', iconColor: 'text-amber-600' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
      {stats.map((stat, i) => (
        <div key={i} className="bg-white rounded-xl sm:rounded-3xl border border-slate-200 p-3 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-[9px] sm:text-xs uppercase tracking-wider text-slate-500 font-semibold leading-tight">{stat.label}</p>
              <h2 className={`text-xl sm:text-3xl font-bold mt-1 sm:mt-2 ${stat.iconColor}`}>{stat.value}</h2>
            </div>
            <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl ${stat.color} flex items-center justify-center shrink-0`}>
              <stat.icon className={`w-4 h-4 sm:w-6 sm:h-6 ${stat.iconColor}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TeamStats;
