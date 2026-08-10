import { Users, Car } from 'lucide-react';

const UserStats = ({ total, withCars }) => {
  const stats = [
    { label: 'Total Users', value: total, icon: Users, color: 'bg-primary/10', iconColor: 'text-primary' },
    { label: 'With Vehicles', value: withCars, icon: Car, color: 'bg-sky-100', iconColor: 'text-sky-600' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-white rounded-xl sm:rounded-3xl border border-slate-200 p-3 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 font-semibold">{stat.label}</p>
              <h2 className={`text-xl sm:text-3xl font-bold mt-1 sm:mt-2 ${stat.iconColor}`}>{stat.value}</h2>
            </div>
            <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl ${stat.color} flex items-center justify-center shrink-0`}>
              <stat.icon className={`w-4 h-4 sm:w-6 sm:h-6 ${stat.iconColor}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default UserStats;
