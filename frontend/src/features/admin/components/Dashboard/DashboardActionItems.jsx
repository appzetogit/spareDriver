import { Link } from 'react-router-dom';
import {
  CheckSquare,
  ShieldAlert,
  Banknote,
  Wallet,
  Package,
  Headphones,
  LifeBuoy,
  ChevronRight,
} from 'lucide-react';

const ACTION_ITEMS = [
  {
    key: 'activeSos',
    label: 'Active SOS',
    description: 'Alerts needing immediate attention',
    icon: ShieldAlert,
    href: '/admin/sos',
    tone: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-100',
    highlight: true,
  },
  {
    key: 'emergencyPool',
    label: 'Emergency Pool',
    description: 'Scheduled rides without a driver',
    icon: LifeBuoy,
    href: '/admin/bookings/emergency-pool',
    tone: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
  {
    key: 'openTasks',
    label: 'Open Tasks',
    description: 'Unassigned + in-progress team work',
    icon: CheckSquare,
    href: '/admin/tasks',
    tone: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-100',
    subKey: 'unassignedTasks',
    subLabel: 'unassigned',
  },
  {
    key: 'pendingRefunds',
    label: 'Pending Refunds',
    description: 'Awaiting manual Razorpay payout',
    icon: Banknote,
    href: '/admin/account/refunds',
    tone: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
  },
  {
    key: 'pendingWithdrawals',
    label: 'Withdrawals',
    description: 'Driver payout requests pending',
    icon: Wallet,
    href: '/admin/account/withdrawals',
    tone: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
  },
  {
    key: 'pendingKitOrders',
    label: 'Kit Orders',
    description: 'Paid orders awaiting approval',
    icon: Package,
    href: '/admin/kit-orders',
    tone: 'text-sky-700',
    bg: 'bg-sky-50',
    border: 'border-sky-100',
  },
  {
    key: 'openSupportTickets',
    label: 'Support Tickets',
    description: 'Open or in-progress tickets',
    icon: Headphones,
    href: '/admin/support',
    tone: 'text-slate-700',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
  },
];

const DashboardActionItems = ({ items = {} }) => (
  <div className="space-y-3">
    <div>
      <h2 className="text-lg font-bold text-text">Needs Attention</h2>
      <p className="text-xs text-text-muted mt-0.5">
        Operational queues that may need action today
      </p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
      {ACTION_ITEMS.map((item) => {
        const count = items[item.key] ?? 0;
        const subCount = item.subKey ? items[item.subKey] ?? 0 : null;
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            to={item.href}
            className={`group flex items-center gap-3 rounded-2xl border p-4 transition-shadow hover:shadow-md ${item.bg} ${item.border} ${
              item.highlight && count > 0 ? 'ring-2 ring-rose-200' : ''
            }`}
          >
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-white/80`}
            >
              <Icon className={`w-5 h-5 ${item.tone}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${item.tone}`}>{count}</span>
                {subCount != null && subCount > 0 && (
                  <span className="text-[10px] font-medium text-slate-500">
                    ({subCount} {item.subLabel})
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-800 truncate">{item.label}</p>
              <p className="text-[11px] text-slate-500 truncate">{item.description}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 shrink-0" />
          </Link>
        );
      })}
    </div>
  </div>
);

export default DashboardActionItems;
