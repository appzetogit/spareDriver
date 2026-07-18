import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Star,
  X,
  AlertTriangle,
  Loader2,
  CalendarRange,
  Car as CarIcon,
  Route as RouteIcon,
  Filter,
  CalendarClock,
  CircleAlert,
  ListTree,
  CheckCircle2,
  ChevronDown,
  IndianRupee,
  Navigation,
  FileText,
  Users,
  Eye,
  UserPlus,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Badge from '../../../components/Badge';
import Drawer from '../../../components/Drawer';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import BookingDetailsModal from '../components/ManageBookings/BookingDetailsModal';
import api from '../../../utils/api';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { useAdminZonesStore } from '../../../store/admin/useAdminZonesStore';
import { useSocketEvent } from '../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../constants/socketEvents';
import { STAFF_ROLE_LABELS } from '../../../constants/staffRoles';
import OutstationDriverFilterBar, {
  DEFAULT_DRIVER_FILTERS,
  appendDriverFilterParams,
} from '../components/OutstationDriverFilterBar';
import AssignDriverPickerRow from '../components/AssignDriverPickerRow';
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {canAssign && (
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <select
                value={filters.zoneId}
                onChange={(e) => { setFilters((f) => ({ ...f, zoneId: e.target.value })); setPage(1); }}
                className="w-full h-10 pl-9 pr-8 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none transition-all"
              >
                <option value="">All zones</option>
                {zones.map((z) => (
                  <option key={z._id} value={z._id}>
                    {z.name}{z.city ? ` · ${z.city}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          )}
          <div className="relative">
            <ListTree className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={filters.status}
              onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
              className="w-full h-10 pl-9 pr-8 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none transition-all"
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Pickup city"
              value={filters.city}
              onChange={(e) => { setFilters((f) => ({ ...f, city: e.target.value })); setPage(1); }}
              className="w-full h-10 pl-9 pr-4 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide block mb-1 ml-1">From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => { setFilters((f) => ({ ...f, dateFrom: e.target.value })); setPage(1); }}
                className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide block mb-1 ml-1">To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => { setFilters((f) => ({ ...f, dateTo: e.target.value })); setPage(1); }}
                className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
        <AssignOutstationDrawer
          booking={assignBooking}
          onClose={() => setAssignBooking(null)}
          onAssigned={() => { setAssignBooking(null); fetchQueue(); }}
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
/* Assign drawer                                                       */
/* ================================================================== */

function AssignOutstationDrawer({ booking, onClose, onAssigned }) {
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState(null);

  const [drivers, setDrivers] = useState([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [driversError, setDriversError] = useState(null);
  const [bookingZones, setBookingZones] = useState([]);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [driverFilters, setDriverFilters] = useState(DEFAULT_DRIVER_FILTERS);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const searchRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  // Booking detail (vehicle + conflicts)
  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    api
      .get(`/admin/outstation-assignments/${booking._id}`)
      .then((res) => { if (!cancelled) { setDetail(res?.data?.data || null); setDetailError(null); } })
      .catch((err) => { if (!cancelled) setDetailError(err?.response?.data?.message || 'Failed to load booking'); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [booking._id]);

  const LIMIT = 50;
  const [driversPage, setDriversPage] = useState(1);
  const [driversTotal, setDriversTotal] = useState(0);
  const [loadingMoreDrivers, setLoadingMoreDrivers] = useState(false);

  const buildDriverParams = useCallback((pageNum) => {
    const params = new URLSearchParams({ limit: LIMIT, page: pageNum });
    if (debouncedSearch) params.append('search', debouncedSearch);
    appendDriverFilterParams(params, driverFilters, { outstation: true });
    return params;
  }, [debouncedSearch, driverFilters]);

  // Available drivers (initial load and search refetch)
  useEffect(() => {
    let cancelled = false;
    setDriversLoading(true);
    setDrivers([]);
    setDriversPage(1);
    setDriversTotal(0);
    api
      .get(`/admin/outstation-assignments/${booking._id}/available-drivers?${buildDriverParams(1).toString()}`)
      .then((res) => {
        if (!cancelled) {
          const data = res?.data?.data || {};
          setDrivers(data.drivers || []);
          setBookingZones(data.bookingZoneIds || []);
          setDriversTotal(data.total || 0);
          setDriversError(null);
        }
      })
      .catch((err) => { if (!cancelled) setDriversError(err?.response?.data?.message || 'Failed to load drivers'); })
      .finally(() => { if (!cancelled) setDriversLoading(false); });
    return () => { cancelled = true; };
  }, [booking._id, buildDriverParams]);

  const loadMoreDrivers = async () => {
    const nextPage = driversPage + 1;
    setLoadingMoreDrivers(true);
    try {
      const res = await api.get(`/admin/outstation-assignments/${booking._id}/available-drivers?${buildDriverParams(nextPage)}`);
      const data = res?.data?.data || {};
      setDrivers((prev) => [...prev, ...(data.drivers || [])]);
      setDriversTotal(data.total || 0);
      setDriversPage(nextPage);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load more drivers');
    } finally {
      setLoadingMoreDrivers(false);
    }
  };

  const selectedDriver = useMemo(
    () => drivers.find((d) => String(d._id) === String(selectedDriverId)) || null,
    [drivers, selectedDriverId],
  );

  const vehicleConflicts = detail?.vehicleConflicts || [];
  const hasVehicleConflict = vehicleConflicts.length > 0;

  const handleAssign = async () => {
    if (!selectedDriverId) { toast.error('Pick a driver first'); return; }
    if (selectedDriver?.hasConflict) { toast.error('This driver has an overlapping booking. Pick another.'); return; }
    if (hasVehicleConflict) { toast.error('This vehicle is in an overlapping booking. Resolve first.'); return; }
    setSubmitting(true);
    try {
      await api.post(
        `/admin/outstation-assignments/${booking._id}/assign-driver`,
        { driverId: selectedDriverId, notes: notes || '' },
      );
      toast.success('Driver assigned successfully!');
      onAssigned();
    } catch (err) {
      const data = err?.response?.data;
      const conflicts = data?.data?.conflicts || data?.conflicts;
      const message = data?.message || 'Could not assign driver';
      toast.error(conflicts?.length
        ? `${message} (${conflicts.length} overlapping ride${conflicts.length === 1 ? '' : 's'})`
        : message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const startSrc = booking.outstation?.pickupAt || booking.outstation?.startDate;
  const endSrc = booking.outstation?.expectedReturnAt || booking.outstation?.endDate;
  const start = startSrc ? new Date(startSrc) : null;
  const end = endSrc ? new Date(endSrc) : null;
  const bufferMinutes = detail?.bufferMinutes ?? 30;
  const days = booking.outstation?.days || 0;
  const nights = booking.outstation?.nights || 0;
  const customerName = booking.userId?.name || 'Unknown';
  const customerPhone = booking.userId?.phone_no || '';
  const fareTotal = Number(booking.fareSnapshot?.total || 0);

  const vehicleLabel = detail?.car
    ? `${detail.car.brandId?.name || ''} ${detail.car.modelId?.name || ''}`.trim() || detail.car.vehicleNumber || 'Vehicle'
    : detailLoading ? 'Loading…' : '—';
  const vehiclePlate = detail?.car?.vehicleNumber || null;
  const vehicleType = detail?.car?.carTypeId?.name || null;
  const zoneOptions = useMemo(() => {
    const fromBooking = (booking.zoneIds || []).filter((z) => z && typeof z === 'object');
    if (fromBooking.length) return fromBooking;
    return (bookingZones || []).map((id) => ({ _id: id, name: 'Zone' }));
  }, [booking.zoneIds, bookingZones]);

  const availableCount = drivers.filter((d) => !d.hasConflict).length;
  const conflictCount = drivers.filter((d) => d.hasConflict).length;

  const canSubmit = selectedDriverId && !selectedDriver?.hasConflict && !hasVehicleConflict;

  const ctaLabel = hasVehicleConflict
    ? 'Vehicle conflict — resolve first'
    : selectedDriver?.hasConflict
      ? 'Driver has conflict'
      : selectedDriver
        ? `Assign to ${selectedDriver.name?.split(' ')[0] || 'driver'}`
        : 'Select a driver';

  /* ── Drawer header slot ─────────────────────────────────── */
  const drawerHeader = (
    <header className="px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 text-primary flex items-center justify-center shrink-0">
            <Compass className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900">
                {booking.bookingNumber || `#${booking._id?.slice(-6)}`}
              </h2>
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                booking.bookingType === 'scheduled'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}>
                {booking.bookingType || 'instant'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Outstation assignment</p>
            {(booking.zoneIds || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {booking.zoneIds.map((z) => (
                  <span
                    key={z._id || z}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-semibold border border-indigo-100"
                  >
                    <MapPin className="w-2.5 h-2.5" />
                    {z?.name || 'Zone'}{z?.city ? ` · ${z.city}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );

  /* ── Drawer footer slot ─────────────────────────────────── */
  const drawerFooter = (
    <div className="px-6 py-4">
      {selectedDriver && !selectedDriver.hasConflict && !hasVehicleConflict && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-[12px] text-emerald-700 truncate">
            Ready to assign <strong>{selectedDriver.name}</strong>
            {selectedDriver.phone ? ` · ${selectedDriver.phone}` : ''}
          </p>
        </div>
      )}
      {(hasVehicleConflict || selectedDriver?.hasConflict) && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-rose-50 border border-rose-100">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <p className="text-[12px] text-rose-700">
            {hasVehicleConflict ? 'Vehicle conflict — resolve before assigning' : 'Driver has overlapping booking'}
          </p>
        </div>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-all"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleAssign}
          disabled={!canSubmit || submitting}
          className={`flex-1 h-11 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            canSubmit && !submitting
              ? 'bg-primary text-dark hover:bg-primary-dark shadow-sm hover:shadow'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Assigning…</>
          ) : (
            <>{canSubmit && <CheckCircle2 className="w-4 h-4" />} {ctaLabel}</>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <Drawer
      isOpen
      onClose={onClose}
      header={drawerHeader}
      footer={drawerFooter}
      width="max-w-[560px]"
    >
      {/* ── Hero banner ───────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-6 py-5">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-widest font-semibold mb-1">Fare</p>
            <p className="text-xl font-extrabold text-primary">₹{fareTotal.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-widest font-semibold mb-1">Duration</p>
            <p className="text-xl font-extrabold">{days}d · {nights}n</p>
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-widest font-semibold mb-1">Departure</p>
            <p className="text-[11px] font-semibold leading-tight">{start ? formatDateTime12(start) : '—'}</p>
            <p className="mt-0.5"><Countdown to={start} /></p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* Route */}
        <section>
          <SectionLabel icon={RouteIcon}>Trip Route</SectionLabel>
          <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50/60 overflow-hidden">
            <div className="flex items-start gap-3 p-4 border-b border-slate-100">
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Pickup</p>
                <p className="text-sm text-slate-800 font-medium mt-0.5 leading-snug">
                  {booking.pickup?.address || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4">
              <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Destination</p>
                <p className="text-sm text-slate-800 font-medium mt-0.5 leading-snug">
                  {booking.outstation?.destinationAddress || '—'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Trip details grid */}
        <section>
          <SectionLabel icon={CalendarRange}>Trip Details</SectionLabel>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <DetailTile icon={CalendarRange} label="Departure">
              {start ? formatDateTime12(start) : '—'}
            </DetailTile>
            <DetailTile icon={Clock} label="Expected Return">
              {end ? formatDateTime12(end) : '—'}
            </DetailTile>
            <DetailTile icon={UserIcon} label="Customer">
              <span className="block truncate">{customerName}</span>
              {customerPhone && <span className="block text-[11px] text-slate-400">{customerPhone}</span>}
            </DetailTile>
            <DetailTile icon={CarIcon} label="Vehicle">
              <span className="block truncate">{vehicleLabel}</span>
              {vehiclePlate && <span className="block font-mono text-[11px] text-slate-400">{vehiclePlate}</span>}
              {vehicleType && <span className="block text-[10px] uppercase text-slate-300">{vehicleType}</span>}
            </DetailTile>
          </div>
          <div className="mt-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 flex items-center gap-2 text-[11px] text-slate-500">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            Conflict buffer: <strong className="text-slate-700">±{bufferMinutes} min</strong>
            <span className="text-slate-400">— bookings within this window count as conflicts</span>
          </div>
        </section>

        {/* Vehicle conflict banner */}
        {hasVehicleConflict && (
          <ConflictBanner
            tone="rose"
            title="Vehicle has overlapping bookings"
            subtitle="This car is already booked in the window below. Resolve before assigning."
            conflicts={vehicleConflicts}
          />
        )}
        {detailError && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {detailError}
          </div>
        )}

        {/* Driver picker */}
        <section>
          <div className="flex items-center justify-between">
            <SectionLabel icon={Users}>Choose Driver</SectionLabel>
            {drivers.length > 0 && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3 h-3" />
                  {availableCount} free
                </span>
                {conflictCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-rose-500 font-semibold">
                    <AlertTriangle className="w-3 h-3" />
                    {conflictCount} conflict
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Zone indicator */}
          {bookingZones.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-100">
              <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <p className="text-[11px] text-indigo-700">
                Showing drivers opted-in to this booking&apos;s{' '}
                <strong>{bookingZones.length} zone{bookingZones.length > 1 ? 's' : ''}</strong>
              </p>
            </div>
          )}

          <OutstationDriverFilterBar
            filters={driverFilters}
            onChange={setDriverFilters}
            zones={zoneOptions}
          />

          {/* Search */}
          <div className="mt-2 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="mt-2 space-y-2">
            {driversLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-xs">Loading drivers…</p>
              </div>
            ) : driversError ? (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {driversError}
              </div>
            ) : drivers.length === 0 ? (
              <div className="py-10 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <p className="text-sm font-semibold text-slate-700">No drivers found</p>
                <p className="text-[12px] text-slate-400 mt-1 max-w-[260px] mx-auto leading-snug">
                  {bookingZones.length > 0
                    ? `No drivers have opted in to outstation for this booking's zone(s). Drivers can select preferred zones from their account screen.`
                    : 'No drivers have opted in for outstation trips matching this car type.'}
                </p>
              </div>
            ) : (
              drivers.map((d) => (
                <AssignDriverPickerRow
                  key={d._id}
                  driver={d}
                  selected={String(selectedDriverId) === String(d._id)}
                  onSelect={() => setSelectedDriverId(d._id)}
                />
              ))
            )}

            {/* Load More */}
            {!driversLoading && drivers.length < driversTotal && !debouncedSearch && (
              <button
                type="button"
                onClick={loadMoreDrivers}
                disabled={loadingMoreDrivers}
                className="w-full py-3 text-sm font-medium text-slate-500 hover:text-slate-700 border border-dashed border-slate-200 rounded-2xl hover:border-slate-300 transition flex items-center justify-center gap-2"
              >
                {loadingMoreDrivers ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                {loadingMoreDrivers ? 'Loading...' : `Load more (${driversTotal - drivers.length} remaining)`}
              </button>
            )}
          </div>
        </section>

        {/* Notes */}
        <section>
          <SectionLabel icon={FileText}>Notes</SectionLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional — anything to keep on the audit trail…"
            className="mt-2 w-full text-sm rounded-xl border border-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all placeholder:text-slate-400"
          />
        </section>

        {/* Bottom spacer */}
        <div className="h-2" />
      </div>
    </Drawer>
  );
}

/* ================================================================== */
/* Sub-components                                                      */
/* ================================================================== */

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{children}</p>
    </div>
  );
}

function DetailTile({ icon: Icon, label, children }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex items-start gap-2.5 min-w-0">
      <div className="w-7 h-7 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
        <div className="text-xs font-semibold text-slate-800 mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function ConflictBanner({ tone, title, subtitle, conflicts }) {
  const palette = tone === 'rose'
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <div className={`rounded-2xl border ${palette} p-4 space-y-2`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold">{title}</p>
          {subtitle && <p className="text-[11px] leading-snug mt-0.5 opacity-80">{subtitle}</p>}
        </div>
      </div>
      <ul className="text-[11px] space-y-1.5 pl-6 list-disc">
        {conflicts.slice(0, 5).map((c) => (
          <li key={c._id}>
            <span className="font-mono text-[10px] mr-1.5 bg-white/60 px-1 py-0.5 rounded">
              {c.bookingNumber || c._id.slice(-6)}
            </span>
            {formatPickupDateTime(c.startMs)} → {formatPickupDateTime(c.endMs)} · {c.serviceType}/{c.bookingType}
          </li>
        ))}
        {conflicts.length > 5 && <li className="list-none opacity-60">+{conflicts.length - 5} more</li>}
      </ul>
    </div>
  );
}

export default ManageOutstationAssignments;
