import { ListTree, MapPin, CheckCircle2, XCircle, Clock, SearchX } from 'lucide-react';

const BookingStats = ({
  total,
  searching,
  active,
  completed,
  cancelled,
  noDriversFound,
}) => {
  const stats = [
    { label: 'Total Bookings', value: total, icon: ListTree, color: 'bg-primary/10', iconColor: 'text-primary' },
    { label: 'Searching', value: searching, icon: Clock, color: 'bg-amber-100', iconColor: 'text-amber-600' },
    { label: 'No Drivers', value: noDriversFound, icon: SearchX, color: 'bg-rose-100', iconColor: 'text-rose-600' },
    { label: 'Active Trip', value: active, icon: MapPin, color: 'bg-indigo-100', iconColor: 'text-indigo-600' },
    { label: 'Completed', value: completed, icon: CheckCircle2, color: 'bg-emerald-100', iconColor: 'text-emerald-600' },
    { label: 'Cancelled', value: cancelled, icon: XCircle, color: 'bg-rose-100', iconColor: 'text-rose-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {stats.map((stat, i) => (
        <div key={i} className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{stat.label}</p>
              <h2 className={`text-3xl font-bold mt-2 ${stat.iconColor}`}>{stat.value ?? 0}</h2>
            </div>
            <div className={`w-12 h-12 rounded-2xl ${stat.color} flex items-center justify-center`}>
              <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default BookingStats;
