import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Car, CalendarCheck, DollarSign, Settings,
  LogOut, X, ChevronRight, ChevronDown, ShieldCheck, Monitor, Package,
  CheckSquare, MapPin, Receipt, Sparkles, Navigation, Wallet, Banknote,
  LifeBuoy, ClipboardList, Timer, Megaphone, Compass, ShieldAlert, Tag, Headphones,
  BarChart3, BellRing, Layers, CreditCard, FlaskConical, Gift,
} from 'lucide-react';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import useAdminSidebarCountsStore from '../../../store/admin/useAdminSidebarCountsStore';
import { roleCanAccess, isDeveloper } from '../../../constants/staffRoles';
import { useSocketEvent } from '../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../constants/socketEvents';
import { BOOKING_STATUS } from '../../../constants/bookingStatus';

/** Paths that show a numeric badge from sidebar counts. */
const BADGE_BY_PATH = {
  '/admin/drivers': 'pendingDrivers',
  '/admin/sos': 'activeSos',
  '/admin/support': 'openSupportTickets',
  '/admin/kit-orders': 'pendingKitOrders',
  '/admin/bookings/emergency-pool': 'emergencyPool',
};

const SIDEBAR_ALERT_KINDS = new Set([
  'emergency_pool_entered',
  'no_drivers_found',
  'sos_triggered',
  'support_ticket_received',
  'new_driver_registration',
]);

function NavBadge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-danger rounded-full">
      {count > 99 ? '99+' : count}
    </span>
  );
}

const developerNavItems = [
  {
    path: '/admin/dev/booking-test',
    label: 'Dev Booking Test',
    icon: FlaskConical,
    end: true,
  },
];

const navItems = [
  {
    path: '/admin',
    label: 'Dashboard',
    icon: LayoutDashboard,
    end: true,
    roles: ['admin'],
  },
  { path: '/admin/users', label: 'Users', icon: Users, roles: ['admin', 'sub_admin'] },
  { path: '/admin/drivers', label: 'Drivers', icon: Car, end: true },
  { path: '/admin/kit-orders', label: 'Kit Orders', icon: Package },
  { path: '/admin/drivers/live', label: 'Live Map', icon: Navigation },
  { path: '/admin/drivers/locations', label: 'Driver Locations', icon: MapPin },
  { path: '/admin/tasks', label: 'Team Tasks', icon: CheckSquare },
  { path: '/admin/sos', label: 'SOS Alerts', icon: ShieldAlert, roles: ['admin', 'sub_admin', 'team_member'] },
  { path: '/admin/support', label: 'Support', icon: Headphones, roles: ['admin', 'sub_admin', 'team_member'] },
  {
    path: '/admin/push-notifications',
    label: 'Push Notifications',
    icon: BellRing,
    roles: ['admin'],
  },
  // Ads management — admin + sub_admin can publish promotional images
  // and short videos that surface on the user home screen.
  { path: '/admin/ads', label: 'Ads', icon: Megaphone, roles: ['admin', 'sub_admin'] },
  {
    label: 'Bookings',
    icon: CalendarCheck,
    roles: ['admin', 'sub_admin', 'team_member'],
    children: [
      {
        path: '/admin/bookings',
        label: 'All Bookings',
        icon: ClipboardList,
        // `end` so this child doesn't stay highlighted while you're on
        // a deeper /admin/bookings/* page (scheduled-jobs / emergency-pool).
        end: true,
        roles: ['admin', 'sub_admin'],
      },
      {
        path: '/admin/bookings/scheduled-jobs',
        label: 'Scheduled Bookings',
        icon: Timer,
        // Zone-scoped for sub_admin / team_member via assignedZones.
        roles: ['admin', 'sub_admin', 'team_member'],
      },
      {
        path: '/admin/bookings/outstation-assignments',
        label: 'Round Trip Bookings',
        icon: Compass,
        // Auto-search first; unmatched rows escalate into Emergency Pool.
        // This page lists every outstation booking (all statuses).
        roles: ['admin', 'sub_admin', 'team_member'],
      },
      {
        path: '/admin/bookings/subscription-requests',
        label: 'Subscription Requests',
        icon: Sparkles,
        roles: ['admin', 'sub_admin', 'team_member'],
      },
      {
        path: '/admin/bookings/emergency-pool',
        label: 'Emergency Pool',
        icon: LifeBuoy,
        // All staff can view; the page itself scopes team_members to
        // their assigned zones and hides the "assign driver" CTA.
        roles: ['admin', 'sub_admin', 'team_member'],
      },
      {
        path: '/admin/queues/scheduled-booking',
        label: 'Scheduled Queue',
        icon: Layers,
        roles: ['admin', 'sub_admin'],
      },
    ],
  },
  {
    label: 'Reports & Analytics',
    icon: BarChart3,
    roles: ['admin'],
    children: [
      {
        path: '/admin/reports',
        label: 'Overview',
        icon: BarChart3,
        end: true,
        roles: ['admin'],
      },
      {
        path: '/admin/reports/users',
        label: 'Users',
        icon: Users,
        roles: ['admin'],
      },
      {
        path: '/admin/reports/drivers',
        label: 'Drivers',
        icon: Car,
        roles: ['admin'],
      },
      {
        path: '/admin/reports/bookings',
        label: 'Bookings',
        icon: CalendarCheck,
        roles: ['admin'],
      },
      {
        path: '/admin/reports/revenue',
        label: 'Revenue',
        icon: DollarSign,
        roles: ['admin'],
      },
      {
        path: '/admin/reports/gst',
        label: 'GST',
        icon: Receipt,
        roles: ['admin'],
      },
    ],
  },
  {
    label: 'Account',
    icon: Wallet,
    roles: ['admin'],
    children: [
      {
        path: '/admin/account/revenue',
        label: 'Revenue',
        icon: DollarSign,
        roles: ['admin'],
      },
      {
        path: '/admin/account/subscription-revenue',
        label: 'Subscription Revenue',
        icon: Sparkles,
        roles: ['admin'],
      },
      {
        path: '/admin/account/kit-revenue',
        label: 'Kit Revenue',
        icon: Package,
        roles: ['admin'],
      },
      {
        path: '/admin/account/refunds',
        label: 'Refunds',
        icon: Banknote,
        roles: ['admin'],
      },
      {
        path: '/admin/account/online-transactions',
        label: 'Online Transactions',
        icon: CreditCard,
        roles: ['admin'],
      },
      {
        path: '/admin/account/withdrawals',
        label: 'Withdrawals',
        icon: Banknote,
        roles: ['admin'],
      },
      {
        path: '/admin/referrals',
        label: 'Referrals',
        icon: Gift,
        roles: ['admin', 'sub_admin'],
      },
      // Account deletions — disabled for now; uncomment to re-enable admin review flow
      // {
      //   path: '/admin/account/deletions',
      //   label: 'Account Deletions',
      //   icon: Users,
      //   roles: ['admin'],
      // },
    ],
  },
  {
    label: 'Settings',
    icon: Settings,
    roles: ['admin', 'sub_admin'],
    children: [
      {
        path: '/admin/settings/platform',
        label: 'Platform Settings',
        icon: Monitor,
        roles: ['admin', 'sub_admin'],
      },
      {
        path: '/admin/settings/kits',
        label: 'Driver Kits',
        icon: Package,
        roles: ['admin', 'sub_admin'],
      },
      {
        path: '/admin/settings/zones',
        label: 'Service Zones',
        icon: MapPin,
        roles: ['admin', 'sub_admin'],
      },
      {
        path: '/admin/settings/pricing',
        label: 'Service Pricing',
        icon: Receipt,
        roles: ['admin', 'sub_admin'],
      },
      {
        path: '/admin/settings/subscriptions',
        label: 'Subscription Plans',
        icon: Sparkles,
        roles: ['admin', 'sub_admin'],
      },
      {
        path: '/admin/settings/coupons',
        label: 'Coupon Codes',
        icon: Tag,
        roles: ['admin', 'sub_admin'],
      },
      {
        path: '/admin/settings/team',
        label: 'Team Management',
        icon: ShieldCheck,
        roles: ['admin'],
      },
    ],
  },
];

function filterNavByRole(items, userRole) {
  return items
    .filter((item) => roleCanAccess(item.roles, userRole))
    .map((item) => {
      if (!item.children) return item;
      const children = item.children.filter((child) => roleCanAccess(child.roles, userRole));
      if (!children.length) return null;
      return { ...item, children };
    })
    .filter(Boolean);
}

const Sidebar = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { admin, logout } = useAdminAuthStore();
  const counts = useAdminSidebarCountsStore();
  const fetchCounts = useAdminSidebarCountsStore((s) => s.fetchCounts);
  const resetCounts = useAdminSidebarCountsStore((s) => s.reset);
  const [expandedItems, setExpandedItems] = useState([
    'Settings',
    'Account',
    'Bookings',
    'Reports & Analytics',
  ]);

  const filteredNavItems = isDeveloper(admin?.role)
    ? developerNavItems
    : filterNavByRole(navItems, admin?.role);

  useEffect(() => {
    if (isDeveloper(admin?.role)) return;
    fetchCounts().catch(() => {});
  }, [fetchCounts, admin?.role]);

  useEffect(() => {
    if (isDeveloper(admin?.role)) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchCounts().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchCounts, admin?.role]);

  useSocketEvent(S2C_EVENTS.ADMIN_ALERT, (payload) => {
    if (isDeveloper(admin?.role)) return;
    if (SIDEBAR_ALERT_KINDS.has(payload?.kind)) {
      fetchCounts().catch(() => {});
    }
  });

  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, (payload) => {
    if (isDeveloper(admin?.role)) return;
    if (!payload?.status) return;
    if (
      payload.status === BOOKING_STATUS.IN_EMERGENCY_POOL
      || payload.status === BOOKING_STATUS.NO_DRIVERS_FOUND
      || payload.status === BOOKING_STATUS.DRIVER_ASSIGNED
      || payload.status === BOOKING_STATUS.CANCELLED
      || payload.status === BOOKING_STATUS.COMPLETED
    ) {
      fetchCounts().catch(() => {});
    }
  });

  const handleLogout = () => {
    logout();
    resetCounts();
    navigate('/admin/login');
  };

  const toggleExpand = (label) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label],
    );
  };

  const badgeFor = (path) => {
    const key = BADGE_BY_PATH[path];
    return key ? counts[key] : 0;
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-screen w-[260px] bg-dark flex flex-col transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between px-5 h-16 shrink-0 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <img
              src="/images/yellow-logo.jpeg"
              alt="SpareDriver Logo"
              className="h-8 w-auto object-contain rounded-md"
            />
            <span className="text-white/50 text-xs font-semibold px-2 py-0.5 rounded bg-white/10">
              Admin
            </span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar">
          <p className="px-3 mb-2 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
            Main Menu
          </p>

          {filteredNavItems.map((item) => {
            const hasChildren = item.children?.length > 0;
            const isExpanded = expandedItems.includes(item.label);
            const isActive = item.path
              ? pathname === item.path
              : item.children.some((c) =>
                  c.end ? pathname === c.path : pathname === c.path || pathname.startsWith(`${c.path}/`),
                );

            return (
              <div key={item.label} className="space-y-1">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.label)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group
                      ${isActive ? 'text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/90'}
                    `}
                  >
                    <item.icon
                      className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-primary' : ''}`}
                    />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                ) : (
                  <NavLink
                    to={item.path}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive: active }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group
                      ${active ? 'bg-primary/15 text-primary' : 'text-white/60 hover:bg-white/5 hover:text-white/90'}`
                    }
                  >
                    {({ isActive: active }) => (
                      <>
                        <item.icon
                          className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-primary' : ''}`}
                        />
                        <span className="flex-1">{item.label}</span>
                        <NavBadge count={badgeFor(item.path)} />
                        {active && <ChevronRight className="w-4 h-4 opacity-60" />}
                      </>
                    )}
                  </NavLink>
                )}

                {hasChildren && isExpanded && (
                  <div className="ml-9 space-y-1">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        end={child.end}
                        onClick={onClose}
                        className={({ isActive: active }) =>
                          `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200
                          ${active ? 'text-primary bg-primary/5' : 'text-white/40 hover:text-white/80 hover:bg-white/5'}`
                        }
                      >
                        {child.icon && <child.icon className="w-3.5 h-3.5" />}
                        <span className="flex-1">{child.label}</span>
                        <NavBadge count={badgeFor(child.path)} />
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:bg-danger/15 hover:text-danger transition-all duration-200"
          >
            <LogOut className="w-[18px] h-[18px]" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
