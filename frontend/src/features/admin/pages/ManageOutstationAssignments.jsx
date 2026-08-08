import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Compass,
  MapPin,
  Clock,
  Phone,
  User as UserIcon,
  Search,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CalendarRange,
  Route as RouteIcon,
  Filter,
  CalendarClock,
  CircleAlert,
  ListTree,
  ChevronDown,
  IndianRupee,
  Navigation,
  Eye,
  UserPlus,
} from 'lucide-react';
import Modal from '../../../components/Modal';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Badge from '../../../components/Badge';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import BookingDetailsModal from '../components/ManageBookings/BookingDetailsModal';
import AssignBookingDriverDrawer from '../components/ManageBookings/AssignBookingDriverDrawer';
import api from '../../../utils/api';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { useAdminZonesStore } from '../../../store/admin/useAdminZonesStore';
import { useSocketEvent } from '../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../constants/socketEvents';
import { STAFF_ROLE_LABELS } from '../../../constants/staffRoles';
import {
  formatPickupDateTime,
  formatDateTime12,
} from '../../../utils/datetime';
import { BOOKING_STATUS } from '../../../constants/bookingStatus';
import RowActionsMenu from '../components/RowActionsMenu';

const OPERATIONS_ROLES = new Set(['admin', 'sub_admin']);

const ASSIGNABLE_STATUSES = new Set([
  BOOKING_STATUS.PENDING_ASSIGNMENT,
  BOOKING_STATUS.SEARCHING,
  BOOKING_STATUS.IN_EMERGENCY_POOL,
  BOOKING_STATUS.NO_DRIVERS_FOUND,
]);

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: BOOKING_STATUS.SEARCHING, label: 'Searching' },
  { value: BOOKING_STATUS.PENDING_ASSIGNMENT, label: 'Pending assignment' },
  { value: BOOKING_STATUS.IN_EMERGENCY_POOL, label: 'Emergency pool' },
  { value: BOOKING_STATUS.DRIVER_ASSIGNED, label: 'Driver assigned' },
  { value: BOOKING_STATUS.EN_ROUTE, label: 'En route' },
  { value: BOOKING_STATUS.ARRIVED, label: 'Arrived' },
  { value: BOOKING_STATUS.STARTED, label: 'In progress' },
  { value: BOOKING_STATUS.COMPLETED, label: 'Completed' },
  { value: BOOKING_STATUS.CANCELLED, label: 'Cancelled' },
  { value: BOOKING_STATUS.NO_DRIVERS_FOUND, label: 'No drivers found' },
];

const STATUS_BADGE = {
  [BOOKING_STATUS.SEARCHING]: { variant: 'info', label: 'Searching' },
  [BOOKING_STATUS.PENDING_ASSIGNMENT]: { variant: 'warning', label: 'Pending assign' },
  [BOOKING_STATUS.IN_EMERGENCY_POOL]: { variant: 'danger', label: 'Emergency pool' },
  [BOOKING_STATUS.DRIVER_ASSIGNED]: { variant: 'primary', label: 'Assigned' },
  [BOOKING_STATUS.EN_ROUTE]: { variant: 'info', label: 'En route' },
  [BOOKING_STATUS.ARRIVED]: { variant: 'info', label: 'Arrived' },
  [BOOKING_STATUS.STARTED]: { variant: 'success', label: 'In progress' },
  [BOOKING_STATUS.COMPLETED]: { variant: 'success', label: 'Completed' },
  [BOOKING_STATUS.CANCELLED]: { variant: 'default', label: 'Cancelled' },
  [BOOKING_STATUS.NO_DRIVERS_FOUND]: { variant: 'danger', label: 'No drivers' },
  [BOOKING_STATUS.AWAITING_PAYMENT]: { variant: 'warning', label: 'Awaiting payment' },
};

/* ================================================================== */
/* Main page                                                           */
/* ================================================================== */

const ManageOutstationAssignments = () => {
  const admin = useAdminAuthStore((s) => s.admin);
  const canAssign = OPERATIONS_ROLES.has(admin?.role);

  const fetchZones = useAdminZonesStore((s) => s.fetch);
  const zonesEntry = useAdminZonesStore((s) => s.getEntry('admin-zones'));
  const zones = useMemo(
    () => (Array.isArray(zonesEntry?.data) ? zonesEntry.data : []),
    [zonesEntry],
  );

  useEffect(() => {
    if (canAssign) fetchZones?.('admin-zones', {}).catch(() => {});
  }, [fetchZones, canAssign]);

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [filters, setFilters] = useState({
    search: '',
    zoneId: '',
    city: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignBooking, setAssignBooking] = useState(null);
  const [settleBooking, setSettleBooking] = useState(null);
  const [detailBooking, setDetailBooking] = useState(null);
  const [detailExtra, setDetailExtra] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Detail fetch for the read-only modal
  useEffect(() => {
    if (!detailBooking?._id) { setDetailExtra(null); return undefined; }
    let cancelled = false;
    setDetailLoading(true);
    setDetailExtra(null);
    api
      .get(`/admin/outstation-assignments/${detailBooking._id}`)
      .then((res) => { if (!cancelled) setDetailExtra(res?.data?.data || null); })
      .catch(() => { if (!cancelled) setDetailExtra(null); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [detailBooking?._id]);

  // Debounce all filters together (300 ms)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedFilters(filters), 300);
    return () => clearTimeout(id);
  }, [filters]);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit });
      Object.entries(debouncedFilters).forEach(([k, v]) => {
        if (v) params.append(k, v);
      });
      const res = await api.get(`/admin/outstation-assignments?${params.toString()}`);
      const data = res?.data?.data || {};
      setRows(data.bookings || []);
      setPagination({ total: data.total || 0, pages: data.pages || 1 });
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load outstation bookings');
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedFilters]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);
  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, () => fetchQueue());

  // hasActiveFilters now includes search
  const hasActiveFilters = useMemo(
    () => Boolean(
      debouncedFilters.search ||
      debouncedFilters.zoneId ||
      debouncedFilters.city ||
      debouncedFilters.status ||
      debouncedFilters.dateFrom ||
      debouncedFilters.dateTo,
    ),
    [debouncedFilters],
  );

  const clearAllFilters = () => {
    setFilters({ search: '', zoneId: '', city: '', status: '', dateFrom: '', dateTo: '' });
    setPage(1);
  };

  const columns = useMemo(
    () => [
      {
        key: 'bookingNumber',
        label: 'Booking',
        width: '15%',
        render: (_, row) => (
          <div>
            <span className="font-mono text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-1 rounded-lg">
              {row.bookingNumber || row._id?.slice(-6)}
            </span>
            <p className="text-[10px] text-slate-400 mt-1.5 uppercase tracking-widest font-medium">
              {row.bookingType || 'instant'}
            </p>
          </div>
        ),
      },
      {
        key: 'customer',
        label: 'Customer',
        width: '16%',
        render: (_, row) => (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {row.userId?.name || 'Unknown'}
            </p>
            <p className="text-[11px] text-slate-400 truncate mt-0.5 flex items-center gap-1">
              <Phone className="w-2.5 h-2.5 shrink-0" />
              {row.userId?.phone_no || '—'}
            </p>
          </div>
        ),
      },
      {
        key: 'pickup',
        label: 'Route',
        width: '28%',
        render: (_, row) => (
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-slate-700 truncate flex items-start gap-1" title={row.pickup?.address}>
              <MapPin className="w-3 h-3 shrink-0 mt-0.5 text-emerald-500" />
              <span className="truncate">{row.pickup?.address || '—'}</span>
            </p>
            <p className="text-xs text-slate-500 truncate flex items-start gap-1" title={row.outstation?.destinationAddress}>
              <RouteIcon className="w-3 h-3 shrink-0 mt-0.5 text-rose-400" />
              <span className="truncate">{row.outstation?.destinationAddress || '—'}</span>
            </p>
            {(row.zoneIds || []).length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {row.zoneIds.slice(0, 2).map((z) => (
                  <span
                    key={z._id || z}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-semibold"
                  >
                    <MapPin className="w-2 h-2" />
                    {z?.name || 'Zone'}
                  </span>
                ))}
                {row.zoneIds.length > 2 && (
                  <span className="text-[10px] text-slate-400">+{row.zoneIds.length - 2}</span>
                )}
              </div>
            )}
          </div>
        ),
      },
      {
        key: 'schedule',
        label: 'Schedule',
        width: '22%',
        render: (_, row) => {
          const startSrc = row.outstation?.pickupAt || row.outstation?.startDate;
          const endSrc = row.outstation?.expectedReturnAt || row.outstation?.endDate;
          const start = startSrc ? new Date(startSrc) : null;
          const end = endSrc ? new Date(endSrc) : null;
          const days = row.outstation?.days || 0;
          const nights = row.outstation?.nights || 0;
          return (
            <div className="text-xs text-slate-700 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <CalendarRange className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="font-semibold text-slate-800">
                  {start ? formatDateTime12(start) : '—'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 pl-5">
                Return: {end ? formatDateTime12(end) : '—'}
              </p>
              <p className="text-[11px] text-slate-500 pl-5 font-medium">
                {days}d · {nights}n
              </p>
              <p className="text-[10px] pl-5">
                <Countdown to={start} />
              </p>
            </div>
          );
        },
      },
      {
        key: 'fare',
        label: 'Fare',
        width: '8%',
        render: (_, row) => (
          <span className="text-sm font-bold text-emerald-600 flex items-center gap-0.5">
            <IndianRupee className="w-3.5 h-3.5" />
            {row.fareSnapshot?.total || 0}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        width: '10%',
        render: (_, row) => {
          const meta = STATUS_BADGE[row.status] || {
            variant: 'default',
            label: String(row.status || '—').replace(/_/g, ' '),
          };
          return (
            <div className="space-y-1">
              <Badge variant={meta.variant} className="capitalize">
                {meta.label}
              </Badge>
              {row.driverId?.name && (
                <p className="text-[10px] text-slate-500 truncate">
                  {row.driverId.name}
                </p>
              )}
            </div>
          );
        },
      },
      {
        key: 'inbox',
        label: 'Inbox',
        width: '6%',
        render: (_, row) => (
          <span className="text-xs text-slate-600">
            {(row.dispatch?.pendingOfferIds || []).length}
          </span>
        ),
      },
      {
        key: 'actions',
        label: '',
        sortable: false,
        unclamp: true,
        width: '6%',
        render: (_, row) => {
          const items = [
            {
              label: 'View',
              icon: Eye,
              onClick: () => setDetailBooking(row),
            },
          ];
          const canAssignRow =
            canAssign && ASSIGNABLE_STATUSES.has(row.status) && !row.driverId;
          if (canAssignRow) {
            items.push({
              label: 'Assign',
              icon: UserPlus,
              onClick: () => setAssignBooking(row),
            });
          }
          if (canAssign && row.status === BOOKING_STATUS.ARRIVED) {
            items.push({
              label: 'Settle',
              icon: IndianRupee,
              onClick: () => setSettleBooking(row),
            });
          }
          return <RowActionsMenu items={items} />;
        },
      },
    ],
    [canAssign],
  );

  // Stats — only 3 tiles now (removed Scheduled + Instant)
  const stats = useMemo(() => {
    const now = Date.now();
    let overdue = 0;
    let today = 0;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday); endOfToday.setHours(23, 59, 59, 999);
    rows.forEach((row) => {
      const pickupSrc = row.outstation?.pickupAt || row.outstation?.startDate;
      const pickupMs = pickupSrc ? new Date(pickupSrc).getTime() : null;
      if (pickupMs && pickupMs < now) overdue += 1;
      if (pickupMs && pickupMs >= startOfToday.getTime() && pickupMs <= endOfToday.getTime()) today += 1;
    });
    return { total: pagination.total, overdue, today };
  }, [rows, pagination.total]);

  // NOTE: Drawer component handles body scroll-lock via createPortal.

  return (
    <div className="min-h-full bg-slate-50/80 space-y-5 animate-fade-in-up pb-10">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-md pb-3 border-b border-slate-200/60">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pt-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 text-primary flex items-center justify-center shrink-0 shadow-sm">
              <Compass className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                Outstation Bookings
              </h1>
              <p className="text-[12px] text-slate-400 mt-0.5">
                All outstation trips — auto-search first, then emergency pool if unmatched
                {admin?.role === 'team_member' ? ' in your zones' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto">
            {/* Search */}
            <div className="relative flex-1 lg:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search booking # or ID…"
                value={filters.search}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, search: e.target.value }));
                  setPage(1);
                }}
                className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
              />
              {filters.search && (
                <button
                  onClick={() => { setFilters((f) => ({ ...f, search: '' })); setPage(1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* Refresh */}
            <button
              type="button"
              onClick={fetchQueue}
              disabled={loading}
              className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2 text-sm font-medium shadow-sm transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats — 3 tiles only ─────────────────────────────────── */}
      <OutstationQueueStats {...stats} />

      {/* ── Team-member notice ───────────────────────────────────── */}
      {!canAssign && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-900">
              {STAFF_ROLE_LABELS[admin?.role] || 'Team member'} access
            </p>
            <p className="text-[12px] text-amber-700 leading-snug mt-0.5">
              You can monitor outstation bookings in your assigned zones.
              Only admins and sub-admins can assign a driver.
            </p>
          </div>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Filters</p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-rose-500 font-semibold hover:text-rose-700 transition-colors"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          {canAssign && (
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
              <select
                value={filters.zoneId}
                onChange={(e) => { setFilters((f) => ({ ...f, zoneId: e.target.value })); setPage(1); }}
                className="w-full h-10 pl-9.5 pr-8 text-sm leading-normal rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none transition-all flex items-center"
              >
                <option value="">All zones</option>
                {zones.map((z) => (
                  <option key={z._id} value={z._id}>
                    {z.name}{z.city ? ` · ${z.city}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
            </div>
          )}
          <div className="relative">
            <ListTree className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
            <select
              value={filters.status}
              onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
              className="w-full h-10 pl-9.5 pr-8 text-sm leading-normal rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none transition-all flex items-center"
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
          </div>
          <div className="relative">
            <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
            <input
              type="text"
              placeholder="Pickup city"
              value={filters.city}
              onChange={(e) => { setFilters((f) => ({ ...f, city: e.target.value })); setPage(1); }}
              className="w-full h-10 pl-9.5 pr-4 text-sm leading-normal rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all flex items-center"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide block mb-1 ml-1">From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => { setFilters((f) => ({ ...f, dateFrom: e.target.value })); setPage(1); }}
                className="w-full h-10 px-3 text-sm leading-normal rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all flex items-center"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide block mb-1 ml-1">To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => { setFilters((f) => ({ ...f, dateTo: e.target.value })); setPage(1); }}
                className="w-full h-10 px-3 text-sm leading-normal rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all flex items-center"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <ServerPaginatedTable
        columns={columns}
        data={rows}
        loading={loading}
        page={page}
        limit={limit}
        pagination={pagination}
        onPageChange={setPage}
        onRowClick={(row) => setDetailBooking(row)}
        entityLabel="bookings"
        emptyMessage="No outstation bookings found."
      />

      {assignBooking && (
        <AssignBookingDriverDrawer
          booking={assignBooking}
          onClose={() => setAssignBooking(null)}
          onAssigned={() => { setAssignBooking(null); fetchQueue(); }}
        />
      )}

      {settleBooking && (
        <SettleOutstationModal
          booking={settleBooking}
          onClose={() => setSettleBooking(null)}
          onSettled={() => { setSettleBooking(null); fetchQueue(); }}
        />
      )}

      <BookingDetailsModal
        isOpen={!!detailBooking}
        onClose={() => setDetailBooking(null)}
        booking={
          detailExtra?.booking
            ? { ...detailBooking, ...detailExtra.booking }
            : detailBooking
        }
        vehicle={detailExtra?.car || null}
        bufferMinutes={detailExtra?.bufferMinutes}
        loadingExtra={detailLoading}
      />
    </div>
  );
};

/* ================================================================== */
/* Stats — 3 tiles                                                     */
/* ================================================================== */

function OutstationQueueStats({ total, overdue, today }) {
  const tiles = [
    {
      label: 'Total bookings',
      value: total,
      icon: ListTree,
      gradient: 'from-primary/20 to-primary/5',
      fg: 'text-primary',
      iconBg: 'bg-primary/15',
      desc: 'Pending assignment',
    },
    {
      label: 'Overdue',
      value: overdue,
      icon: CircleAlert,
      gradient: 'from-rose-100 to-rose-50',
      fg: 'text-rose-600',
      iconBg: 'bg-rose-100',
      desc: overdue > 0 ? 'Pickup passed — urgent' : 'None this page',
    },
    {
      label: 'Departing today',
      value: today,
      icon: CalendarClock,
      gradient: 'from-amber-100 to-amber-50',
      fg: 'text-amber-600',
      iconBg: 'bg-amber-100',
      desc: today > 0 ? 'Assign ASAP' : 'None today',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={`bg-gradient-to-br ${t.gradient} rounded-2xl border border-white/80 shadow-sm p-5 flex items-center gap-4`}
        >
          <div className={`w-12 h-12 rounded-2xl ${t.iconBg} flex items-center justify-center shrink-0`}>
            <t.icon className={`w-6 h-6 ${t.fg}`} />
          </div>
          <div className="min-w-0">
            <p className={`text-3xl font-extrabold leading-none ${t.fg}`}>{t.value}</p>
            <p className="text-[11px] font-bold text-slate-600 mt-1">{t.label}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{t.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/* Countdown helper                                                    */
/* ================================================================== */

function Countdown({ to }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!to) return null;
  const diffMs = to.getTime() - now;
  const past = diffMs < 0;
  const sec = Math.max(0, Math.floor(Math.abs(diffMs) / 1000));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const stamp = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${past ? 'text-rose-500' : 'text-slate-400'}`}>
      <Clock className="w-3 h-3" />
      {past ? `${stamp} overdue` : `in ${stamp}`}
    </span>
  );
}

/* ================================================================== */
/* Settle modal — arrived, no OTP                                      */
/* ================================================================== */

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function SettleOutstationModal({ booking, onClose, onSettled }) {
  const bd = booking?.fareSnapshot?.breakdown || {};
  const amountPaid = round2(
    Number(booking?.payment?.amountPaidRupees)
      || Number(booking?.fareSnapshot?.total)
      || Number(bd.totalPayable)
      || 0,
  );
  const commission = round2(Number(bd.platformCommission ?? booking?.fareSnapshot?.platformCommission) || 0);
  const platformFee = round2(
    Number(bd.platformFee ?? bd.serviceCharge ?? booking?.fareSnapshot?.platformFee ?? booking?.fareSnapshot?.serviceCharge) || 0,
  );
  const platformKeep = round2(commission + platformFee);
  const maxPayout = round2(Math.max(0, amountPaid - platformKeep));

  const [payout, setPayout] = useState(String(maxPayout));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const payoutNum = round2(Number(payout));
  const payoutValid = Number.isFinite(payoutNum) && payoutNum >= 0 && payoutNum <= maxPayout + 0.001;
  const userRefund = payoutValid ? round2(Math.max(0, amountPaid - platformKeep - payoutNum)) : 0;

  const submit = async () => {
    if (!payoutValid) {
      toast.error(`Driver payout must be between ₹0 and ₹${maxPayout}`);
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/admin/outstation-assignments/${booking._id}/settle-arrived`, {
        driverPayoutRupees: payoutNum,
        notes: notes.trim() || undefined,
      });
      toast.success('Outstation booking settled — driver and user freed');
      onSettled?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Settle failed',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n) => `₹${round2(n).toLocaleString('en-IN')}`;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Settle arrived outstation"
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600 leading-snug">
          Customer never started the trip (no OTP). Split the prepaid fare,
          pay the driver a manual amount, keep platform commission/fee, and
          refund the remainder to the user wallet.
        </p>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm space-y-1.5">
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Booking</span>
            <span className="font-mono font-semibold text-slate-900">
              {booking.bookingNumber || booking._id}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Prepaid fare</span>
            <span className="font-semibold">{fmt(amountPaid)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Platform commission</span>
            <span>{fmt(commission)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Platform fee</span>
            <span>{fmt(platformFee)}</span>
          </div>
          <div className="flex justify-between gap-2 border-t border-slate-200 pt-1.5 mt-1">
            <span className="text-slate-500">Max driver payout</span>
            <span className="font-semibold text-slate-900">{fmt(maxPayout)}</span>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            Driver payout (₹)
          </label>
          <input
            type="number"
            min={0}
            max={maxPayout}
            step="0.01"
            value={payout}
            onChange={(e) => setPayout(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {!payoutValid && (
            <p className="text-[11px] text-rose-600 mt-1">
              Enter a value from 0 to {fmt(maxPayout)}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 flex justify-between text-sm">
          <span className="text-emerald-800 font-medium">User wallet refund</span>
          <span className="font-bold text-emerald-900">{fmt(userRefund)}</span>
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. Customer unreachable after arrival"
            className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={submitting || !payoutValid}
            className="inline-flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <IndianRupee className="w-4 h-4" />}
            Confirm settle
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default ManageOutstationAssignments;
