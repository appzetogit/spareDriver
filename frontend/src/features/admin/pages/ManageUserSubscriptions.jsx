import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Sparkles,
  MapPin,
  User as UserIcon,
  Phone,
  Search,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ChevronDown,
  UserCheck,
  UserMinus,
  Star,
  CalendarRange,
  Filter,
  Car,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Badge from '../../../components/Badge';
import Drawer from '../../../components/Drawer';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import api from '../../../utils/api';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { useAdminZonesStore } from '../../../store/admin/useAdminZonesStore';
import { SUBSCRIPTION_ASSIGNMENT_STATUS } from '../../../constants/serviceTypes';
import { formatDateTime12 } from '../../../utils/datetime';
import {
  DriverCarExperienceChips,
  formatCarLabel,
} from '../components/DriverCarExperienceChips';
import AdminDriverDetailModal from '../components/AdminDriverDetailModal';

const OPERATIONS_ROLES = new Set(['admin', 'sub_admin']);

const ASSIGNMENT_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING, label: 'Pending driver' },
  { value: SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED, label: 'Driver assigned' },
  { value: SUBSCRIPTION_ASSIGNMENT_STATUS.RELEASED, label: 'Released' },
];

const ManageUserSubscriptions = () => {
  const admin = useAdminAuthStore((s) => s.admin);
  const canAssign = OPERATIONS_ROLES.has(admin?.role);

  const fetchZones = useAdminZonesStore((s) => s.fetch);
  const zonesEntry = useAdminZonesStore((s) => s.getEntry('admin-zones'));
  const zones = useMemo(
    () => (Array.isArray(zonesEntry?.data) ? zonesEntry.data : []),
    [zonesEntry],
  );

  useEffect(() => {
    fetchZones?.('admin-zones', {}).catch(() => {});
  }, [fetchZones]);

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [filters, setFilters] = useState({ zoneId: '', assignmentStatus: '' });
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignRow, setAssignRow] = useState(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit });
      if (filters.zoneId) params.append('zoneId', filters.zoneId);
      if (filters.assignmentStatus) params.append('assignmentStatus', filters.assignmentStatus);
      const res = await api.get(`/admin/subscriptions/users?${params.toString()}`);
      const data = res?.data?.data || {};
      setRows(data.items || []);
      setPagination({
        total: data.total || 0,
        pages: Math.max(1, Math.ceil((data.total || 0) / limit)),
      });
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load subscription requests');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING).length,
    [rows],
  );

  const columns = useMemo(() => [
    {
      key: 'customer',
      header: 'Customer',
      render: (_, row) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 truncate">{row.userId?.name || '—'}</p>
          <p className="text-xs text-slate-500">{row.userId?.phone_no || row.userId?.email || '—'}</p>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (_, row) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-800">{row.planNameSnapshot || row.planId?.name || '—'}</p>
          <p className="text-xs text-slate-500">
            ₹{row.amount} · {row.durationMonths} mo
            {row.includedHoursPerDay === 0
              ? ' · full-time'
              : ` · ${row.includedHoursPerDay}h/day`}
          </p>
        </div>
      ),
    },
    {
      key: 'car',
      header: 'Car',
      render: (_, row) => (
        <span className="inline-flex items-center gap-1 text-sm text-slate-600">
          <Car className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate max-w-[140px]">{formatCarLabel(row.carId)}</span>
        </span>
      ),
    },
    {
      key: 'zone',
      header: 'Zone',
      render: (_, row) => (
        <span className="inline-flex items-center gap-1 text-sm text-slate-600">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          {row.zoneId?.name || '—'}
          {row.zoneId?.city ? ` · ${row.zoneId.city}` : ''}
        </span>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      render: (_, row) => (
        <div className="text-xs text-slate-600">
          <p>{row.startDate ? formatDateTime12(row.startDate) : '—'}</p>
          <p className="text-slate-400">to {row.expiryDate ? formatDateTime12(row.expiryDate) : '—'}</p>
        </div>
      ),
    },
    {
      key: 'driver',
      header: 'Driver',
      render: (_, row) => {
        if (row.assignedDriverId) {
          return (
            <div className="min-w-0">
              <p className="font-medium text-slate-800">{row.assignedDriverId.name}</p>
              <p className="text-xs text-slate-500">{row.assignedDriverId.phone || '—'}</p>
            </div>
          );
        }
        return <Badge variant="warning">Pending</Badge>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (_, row) => {
        const variant =
          row.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED
            ? 'success'
            : row.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.RELEASED
              ? 'default'
              : 'warning';
        return <Badge variant={variant}>{row.assignmentStatus || 'pending'}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      render: (_, row) => (
        canAssign ? (
          <Button
            size="sm"
            variant={row.assignedDriverId ? 'outline' : 'primary'}
            onClick={(e) => {
              e.stopPropagation();
              setAssignRow(row);
            }}
          >
            {row.assignedDriverId ? 'Reassign' : 'Assign'}
          </Button>
        ) : null
      ),
    },
  ], [canAssign]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Subscription Requests
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Paid subscriptions waiting for a dedicated driver, zone-wise.
          </p>
        </div>
        <Button variant="outline" onClick={fetchQueue} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          label="Total (this page)"
          value={rows.length}
          desc="Active paid subscriptions"
          icon={Sparkles}
        />
        <StatTile
          label="Pending driver"
          value={pendingCount}
          desc="Need assignment on this page"
          icon={UserCheck}
          accent="amber"
        />
        <StatTile
          label="All zones"
          value={pagination.total}
          desc="Matching current filters"
          icon={CalendarRange}
        />
      </div>

      <Card padding="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={filters.assignmentStatus}
              onChange={(e) => {
                setFilters((f) => ({ ...f, assignmentStatus: e.target.value }));
                setPage(1);
              }}
              className="w-full h-10 pl-9 pr-8 text-sm rounded-xl border border-slate-200 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {ASSIGNMENT_FILTERS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={filters.zoneId}
              onChange={(e) => {
                setFilters((f) => ({ ...f, zoneId: e.target.value }));
                setPage(1);
              }}
              className="w-full h-10 pl-9 pr-8 text-sm rounded-xl border border-slate-200 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
        </div>
      </Card>

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
        onRowClick={canAssign ? (row) => setAssignRow(row) : undefined}
        entityLabel="subscriptions"
        emptyMessage="No subscription requests match these filters."
      />

      {assignRow && (
        <AssignSubscriptionDrawer
          subscription={assignRow}
          onClose={() => setAssignRow(null)}
          onUpdated={() => {
            setAssignRow(null);
            fetchQueue();
          }}
        />
      )}
    </div>
  );
};

function StatTile({ label, value, desc, icon: Icon, accent }) {
  const accentClass = accent === 'amber' ? 'text-amber-600 bg-amber-100' : 'text-primary bg-primary/15';
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${accentClass}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-3xl font-extrabold text-slate-900 leading-none">{value}</p>
        <p className="text-[11px] font-bold text-slate-600 mt-1">{label}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function toDateInputValue(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayInputValue() {
  return toDateInputValue(new Date());
}

function AssignSubscriptionDrawer({ subscription, onClose, onUpdated }) {
  const [drivers, setDrivers] = useState([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [driversError, setDriversError] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [driverFilters, setDriverFilters] = useState({
    carTypeMatch: 'true',
    zoneMatch: 'true',
    minRating: '',
    onlineOnly: false,
    allIndiaOnly: false,
    minDrivingHoursPerDay: '',
  });
  const [detailDriver, setDetailDriver] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [workingStartDate, setWorkingStartDate] = useState(() => todayInputValue());
  const [workingEndDate, setWorkingEndDate] = useState('');
  const [previousDriverLastWorkingDate, setPreviousDriverLastWorkingDate] = useState(() => todayInputValue());
  const [releaseLastWorkingDate, setReleaseLastWorkingDate] = useState(() => todayInputValue());
  const [submitting, setSubmitting] = useState(false);
  const searchRef = useRef(null);

  const subscriptionPeriodLabel = useMemo(() => {
    const start = toDateInputValue(subscription.startDate);
    const end = toDateInputValue(subscription.expiryDate);
    if (!start || !end) return '—';
    return `${start} → ${end}`;
  }, [subscription.startDate, subscription.expiryDate]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setDriversLoading(true);
    setDrivers([]);
    const params = new URLSearchParams({ limit: 50, page: 1 });
    if (debouncedSearch) params.append('search', debouncedSearch);
    if (driverFilters.carTypeMatch) params.append('carTypeMatch', driverFilters.carTypeMatch);
    if (driverFilters.zoneMatch) params.append('zoneMatch', driverFilters.zoneMatch);
    if (driverFilters.minRating) params.append('minRating', driverFilters.minRating);
    if (driverFilters.onlineOnly) params.append('onlineOnly', 'true');
    if (driverFilters.allIndiaOnly) params.append('allIndiaOnly', 'true');
    if (driverFilters.minDrivingHoursPerDay) {
      params.append('minDrivingHoursPerDay', driverFilters.minDrivingHoursPerDay);
    }
    api
      .get(`/admin/subscriptions/users/${subscription._id}/available-drivers?${params}`)
      .then((res) => {
        if (!cancelled) {
          const data = res?.data?.data || {};
          setDrivers(data.drivers || []);
          setDriversError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDriversError(err?.response?.data?.message || 'Failed to load drivers');
        }
      })
      .finally(() => {
        if (!cancelled) setDriversLoading(false);
      });
    return () => { cancelled = true; };
  }, [subscription._id, debouncedSearch, driverFilters]);

  const selectedDriver = useMemo(
    () => drivers.find((d) => String(d._id) === String(selectedDriverId)) || null,
    [drivers, selectedDriverId],
  );

  const handleAssign = async () => {
    if (!selectedDriverId) {
      toast.error('Pick a driver first');
      return;
    }
    if (!workingStartDate) {
      toast.error('Working start date is required');
      return;
    }
    if (subscription.assignedDriverId && !previousDriverLastWorkingDate) {
      toast.error('Previous driver last working date is required for reassignment');
      return;
    }
    if (selectedDriver?.hasConflict) {
      toast.error('This driver has a scheduling conflict. Pick another.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/admin/subscriptions/users/${subscription._id}/assign`, {
        driverId: selectedDriverId,
        workingStartDate,
        workingEndDate: workingEndDate || undefined,
        previousDriverLastWorkingDate: subscription.assignedDriverId
          ? previousDriverLastWorkingDate
          : undefined,
      });
      toast.success('Driver assigned successfully — customer will receive an email with terms and driver details');
      onUpdated();
    } catch (err) {
      const data = err?.response?.data;
      toast.error(data?.message || 'Could not assign driver');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRelease = async () => {
    if (!subscription.assignedDriverId) return;
    if (!releaseLastWorkingDate) {
      toast.error('Last working date is required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/admin/subscriptions/users/${subscription._id}/release`, {
        reason: releaseReason.trim() || 'Released by admin',
        lastWorkingDate: releaseLastWorkingDate,
      });
      toast.success('Driver released');
      onUpdated();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not release driver');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      isOpen
      onClose={() => !submitting && onClose()}
      header={(
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Assign dedicated driver</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {subscription.planNameSnapshot || subscription.planId?.name || 'Subscription'}
          </p>
        </div>
      )}
    >
      <div className="p-5 space-y-4">
        <div className="rounded-2xl bg-slate-50 p-4 text-sm space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Subscription details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
            <DetailLine label="Customer" value={subscription.userId?.name || '—'} />
            <DetailLine label="Plan" value={subscription.planNameSnapshot || subscription.planId?.name || '—'} />
            <DetailLine label="Zone" value={`${subscription.zoneId?.name || '—'}${subscription.zoneId?.city ? ` · ${subscription.zoneId.city}` : ''}`} />
            <DetailLine label="Car" value={formatCarLabel(subscription.carId)} />
            <DetailLine
              label="Driver hours"
              value={subscription.includedHoursPerDay === 0 ? 'Full-time' : `${subscription.includedHoursPerDay}h/day`}
            />
            <DetailLine label="Duration" value={`${subscription.durationMonths} month(s)`} />
            <DetailLine label="Subscription period" value={subscriptionPeriodLabel} />
          </div>
          {(subscription.dailyPickup || subscription.dailyDropoff) && (
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <DetailLine
                label="Daily pickup"
                value={subscription.dailyPickup?.address || '—'}
              />
              <DetailLine
                label="Daily drop-off"
                value={subscription.dailyDropoff?.address || '—'}
              />
            </div>
          )}
          {subscription.assignedDriverId && (
            <div className="flex items-center gap-2 text-emerald-700 pt-1">
              <UserCheck className="w-4 h-4" />
              Current: {subscription.assignedDriverId.name}
            </div>
          )}
        </div>

        {subscription.assignedDriverId && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
              Release current driver
            </p>
            <div>
              <label className="text-xs font-semibold text-slate-600">
                Last working day <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={releaseLastWorkingDate}
                min={toDateInputValue(subscription.assignedAt || subscription.startDate)}
                max={toDateInputValue(subscription.expiryDate)}
                onChange={(e) => setReleaseLastWorkingDate(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Release reason (optional)
              </label>
              <textarea
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
                rows={2}
                placeholder="e.g. Driver on leave for 3 days"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={handleRelease}
            >
              <UserMinus className="w-4 h-4 mr-1" />
              Release current driver
            </Button>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {subscription.assignedDriverId ? 'New driver working period' : 'Driver working period'}
          </p>
          {subscription.assignedDriverId && (
            <div>
              <label className="text-xs font-semibold text-slate-600">
                Previous driver last working day <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={previousDriverLastWorkingDate}
                min={toDateInputValue(subscription.assignedAt || subscription.startDate)}
                max={toDateInputValue(subscription.expiryDate)}
                onChange={(e) => setPreviousDriverLastWorkingDate(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Required when reassigning — closes the current driver&apos;s stint.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">
                Start date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={workingStartDate}
                min={toDateInputValue(subscription.startDate)}
                max={toDateInputValue(subscription.expiryDate)}
                onChange={(e) => setWorkingStartDate(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">
                End date <span className="text-slate-400">(optional)</span>
              </label>
              <input
                type="date"
                value={workingEndDate}
                min={workingStartDate || toDateInputValue(subscription.startDate)}
                max={toDateInputValue(subscription.expiryDate)}
                onChange={(e) => setWorkingEndDate(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Defaults to subscription end ({toDateInputValue(subscription.expiryDate)}).
              </p>
            </div>
          </div>
        </div>

        <DriverFilterBar filters={driverFilters} onChange={setDriverFilters} />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drivers by name or phone"
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {driversError && (
          <p className="text-sm text-rose-600">{driversError}</p>
        )}

        <div className="max-h-72 overflow-y-auto space-y-2">
          {driversLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : drivers.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No drivers found.</p>
          ) : (
            drivers.map((driver) => {
              const active = String(selectedDriverId) === String(driver._id);
              return (
                <button
                  key={driver._id}
                  type="button"
                  disabled={driver.hasConflict}
                  onClick={() => setSelectedDriverId(driver._id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    driver.hasConflict
                      ? 'border-rose-100 bg-rose-50/50 opacity-70 cursor-not-allowed'
                      : active
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-slate-200 bg-white hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800 truncate">{driver.name}</p>
                        {driver.inSubscriptionZone ? (
                          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                            In zone ✓
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                            Outside zone
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        {driver.phone || '—'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1 text-xs text-amber-600">
                        <Star className="w-3 h-3 fill-current" />
                        {Number(driver.rating || 0).toFixed(1)}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailDriver(driver);
                        }}
                        className="text-[10px] font-bold text-primary hover:underline"
                      >
                        View detail
                      </button>
                    </div>
                  </div>
                  <DriverCarExperienceChips
                    experience={driver.carTypeExperience}
                    className="mt-2"
                  />
                  {(driver.outstationAllIndiaOk || driver.outstationMaxDrivingHoursPerDay) && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      {driver.outstationAllIndiaOk ? 'All-India OK' : 'Zone-limited'}
                      {driver.outstationMaxDrivingHoursPerDay
                        ? ` · ${driver.outstationMaxDrivingHoursPerDay}h/day capacity`
                        : ''}
                    </p>
                  )}
                  {driver.hasConflict && (
                    <p className="text-[10px] text-rose-600 mt-2 font-medium">
                      {driver.hasSubscriptionConflict
                        ? 'Already on another subscription in this period'
                        : `Overlapping booking${driver.conflicts?.length === 1 ? '' : 's'}`}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>

        {selectedDriver && (
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-sm">
            <p className="font-semibold text-slate-800">Selected: {selectedDriver.name}</p>
            <p className="text-xs text-slate-500 mt-1">{selectedDriver.phone || '—'}</p>
            <DriverCarExperienceChips experience={selectedDriver.carTypeExperience} className="mt-2" />
          </div>
        )}

        <Button
          fullWidth
          disabled={!selectedDriverId || submitting || selectedDriver?.hasConflict}
          onClick={handleAssign}
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Assigning…
            </span>
          ) : (
            subscription.assignedDriverId ? 'Reassign driver' : 'Assign driver'
          )}
        </Button>
      </div>

      <AdminDriverDetailModal
        driver={detailDriver}
        subscriptionZone={subscription.zoneId}
        open={Boolean(detailDriver)}
        onClose={() => setDetailDriver(null)}
      />
    </Drawer>
  );
}

function DetailLine({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-slate-400 font-semibold">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function DriverFilterBar({ filters, onChange }) {
  const set = (key, value) => onChange((prev) => ({ ...prev, [key]: value }));
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="flex items-center gap-2 text-xs text-slate-600 col-span-2">
        <input
          type="checkbox"
          checked={filters.zoneMatch === 'true'}
          onChange={(e) => set('zoneMatch', e.target.checked ? 'true' : 'false')}
        />
        Only drivers in subscription zone
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600 col-span-2">
        <input
          type="checkbox"
          checked={filters.carTypeMatch === 'true'}
          onChange={(e) => set('carTypeMatch', e.target.checked ? 'true' : 'false')}
        />
        Match subscription car type experience
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={filters.onlineOnly}
          onChange={(e) => set('onlineOnly', e.target.checked)}
        />
        Online only
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={filters.allIndiaOnly}
          onChange={(e) => set('allIndiaOnly', e.target.checked)}
        />
        All-India OK
      </label>
      <input
        type="number"
        min="0"
        max="5"
        step="0.1"
        placeholder="Min rating"
        value={filters.minRating}
        onChange={(e) => set('minRating', e.target.value)}
        className="h-9 px-3 rounded-xl border border-slate-200 text-xs"
      />
      <input
        type="number"
        min="4"
        max="16"
        placeholder="Min hrs/day"
        value={filters.minDrivingHoursPerDay}
        onChange={(e) => set('minDrivingHoursPerDay', e.target.value)}
        className="h-9 px-3 rounded-xl border border-slate-200 text-xs"
      />
    </div>
  );
}

export default ManageUserSubscriptions;
