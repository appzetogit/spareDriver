import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Sparkles,
  RefreshCw,
  Search,
  Loader2,
  Banknote,
  Users,
  Wallet,
  IndianRupee,
  CalendarRange,
  TrendingUp,
  MapPin,
  ChevronDown,
  Filter,
} from 'lucide-react';
import Badge from '../../../components/Badge';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import Drawer from '../../../components/Drawer';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import api from '../../../utils/api';
import { formatCurrency } from '../../../utils/fareCalculator';
import { formatDateTime12 } from '../../../utils/datetime';
import { useAdminZonesStore } from '../../../store/admin/useAdminZonesStore';
import { SUBSCRIPTION_STATUS } from '../../../constants/serviceTypes';

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

const PAYOUT_FILTERS = [
  { value: '', label: 'All payouts' },
  { value: 'remaining', label: 'Remaining to pay' },
  { value: 'paid', label: 'Fully paid' },
];

const STATUS_FILTERS = [
  { value: SUBSCRIPTION_STATUS.ACTIVE, label: 'Active' },
  { value: SUBSCRIPTION_STATUS.EXPIRED, label: 'Expired' },
  { value: SUBSCRIPTION_STATUS.CANCELLED, label: 'Cancelled' },
  { value: 'all', label: 'All statuses' },
];

const EMPTY_FILTERS = {
  search: '',
  zoneId: '',
  payoutStatus: '',
  status: SUBSCRIPTION_STATUS.ACTIVE,
  from: '',
  to: '',
};

function DriverPayoutDrawer({ subscription, onClose, onPaid }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amounts, setAmounts] = useState({});
  const [payingKey, setPayingKey] = useState(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/subscriptions/${subscription._id}/driver-payouts`);
      setDetail(res?.data?.data || null);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load driver payout detail');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [subscription._id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const remaining = detail?.remainingDriverShare ?? 0;
  const canPayMore = (detail?.canPayMore ?? remaining > 0) && remaining > 0;

  const handlePayDriver = async (group) => {
    if (!canPayMore) {
      toast.error('No remaining driver share in this subscription');
      return;
    }

    const raw = amounts[group.driverId];
    const amountRupees = Number(raw);
    if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
      toast.error('Enter a valid payout amount');
      return;
    }
    if (amountRupees > remaining) {
      toast.error(`Amount cannot exceed remaining pool (${formatCurrency(remaining)})`);
      return;
    }

    setPayingKey(group.driverId);
    try {
      const res = await api.post(`/admin/subscriptions/${subscription._id}/pay-drivers`, {
        payouts: [{
          driverId: group.driverId,
          amountRupees,
        }],
      });
      setDetail(res?.data?.data || null);
      setAmounts((prev) => {
        const next = { ...prev };
        delete next[group.driverId];
        return next;
      });
      toast.success('Amount credited to driver wallet');
      onPaid?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to pay driver');
    } finally {
      setPayingKey(null);
    }
  };

  const driverGroups = detail?.driverGroups?.length
    ? detail.driverGroups
    : [];

  const sub = detail?.subscription || subscription;

  const drawerHeader = (
    <div className="px-5 py-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pay drivers</p>
      <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
        {sub.planNameSnapshot || 'Subscription'}
      </h2>
      {sub.subscriptionNumber && (
        <p className="text-xs font-mono text-slate-400 mt-0.5">{sub.subscriptionNumber}</p>
      )}
      <p className="text-sm text-slate-500 mt-1">
        {sub.userId?.name || 'Customer'} · {formatDate(sub.startDate)} – {formatDate(sub.expiryDate)}
      </p>
    </div>
  );

  const drawerFooter = (
    <div className="px-5 py-4 flex items-center justify-between gap-3 w-full">
      <div className="text-sm text-slate-600">
        <span className="font-semibold text-amber-700">{formatCurrency(remaining)}</span>
        {' '}
        remaining to pay drivers
      </div>
      <Button variant="outline" onClick={onClose} disabled={!!payingKey}>
        Close
      </Button>
    </div>
  );

  return (
    <Drawer isOpen onClose={onClose} header={drawerHeader} footer={drawerFooter} width="max-w-xl">
      {loading ? (
        <div className="flex items-center justify-center py-16 px-5">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="px-5 pb-6 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <Card padding="p-4">
              <p className="text-xs text-slate-500">Platform earned</p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {formatCurrency(detail?.platformEarned ?? sub.platformShareRupees)}
              </p>
            </Card>
            <Card padding="p-4">
              <p className="text-xs text-slate-500">Driver share pool</p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {formatCurrency(detail?.driverSharePool)}
              </p>
            </Card>
            <Card padding="p-4">
              <p className="text-xs text-slate-500">Paid to drivers</p>
              <p className="text-lg font-bold text-emerald-700 mt-1">
                {formatCurrency(detail?.paidToDriver)}
              </p>
            </Card>
            <Card padding="p-4">
              <p className="text-xs text-slate-500">Remaining</p>
              <p className="text-lg font-bold text-amber-700 mt-1">
                {formatCurrency(detail?.remainingDriverShare)}
              </p>
            </Card>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <CalendarRange className="w-4 h-4" />
              Driver working periods
              <span className="text-slate-400 font-normal">
                ({detail?.totalSubscriptionDays ?? 0} subscription days max)
              </span>
            </p>

            {!driverGroups.length ? (
              <p className="text-sm text-slate-500 py-8 text-center border rounded-xl bg-slate-50/50">
                No drivers assigned yet. Assign a driver from Subscription Requests first.
              </p>
            ) : (
              <div className="space-y-4">
                {driverGroups.map((group) => {
                  const isPaying = payingKey === group.driverId;
                  const paidSoFar = group.paidSoFar ?? 0;
                  const hasPayments = paidSoFar > 0;

                  return (
                    <div
                      key={group.driverId}
                      className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {group.driver?.name || 'Driver'}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{group.driver?.phone || '—'}</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {group.periods?.length || 0} working period
                            {(group.periods?.length || 0) === 1 ? '' : 's'}
                            {' · '}
                            {group.totalWorkingDays ?? 0} total days
                          </p>
                        </div>
                        {hasPayments ? (
                          <Badge variant="success">Paid {formatCurrency(paidSoFar)}</Badge>
                        ) : (
                          <Badge variant="warning">Unpaid</Badge>
                        )}
                      </div>

                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                          Working periods
                        </p>
                        {(group.periods || []).map((period) => {
                          const periodStart = period.stintStart || period.assignedAt;
                          const lastDay =
                            period.lastWorkingDay || period.stintEnd || period.plannedStintEnd;
                          return (
                            <div
                              key={period.key}
                              className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                            >
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <p className="text-[10px] text-slate-500 mb-0.5">Start</p>
                                  <p className="font-medium text-slate-800">{formatDate(periodStart)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-slate-500 mb-0.5">Last day</p>
                                  <p className="font-medium text-slate-800">
                                    {formatDate(lastDay)}
                                    {period.isCurrent && (
                                      <span className="text-amber-600 font-normal"> (ongoing)</span>
                                    )}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-slate-500 mb-0.5">Working days</p>
                                  <p className="font-semibold text-slate-900">
                                    {period.workingDays}
                                    <span className="text-slate-400 font-normal text-xs">
                                      {' '}/ {detail?.totalSubscriptionDays ?? '—'} max
                                    </span>
                                  </p>
                                </div>
                                {(period.paidSoFar ?? 0) > 0 && (
                                  <div>
                                    <p className="text-[10px] text-slate-500 mb-0.5">Paid for period</p>
                                    <p className="font-semibold text-emerald-700">
                                      {formatCurrency(period.paidSoFar)}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {group.payments?.length > 0 && (
                        <div className="pt-3 border-t border-slate-200/80">
                          <p className="text-xs font-medium text-slate-500 mb-2">Payment history</p>
                          <ul className="space-y-1.5">
                            {group.payments.map((p) => (
                              <li
                                key={p._id || `${p.paidAt}-${p.amountRupees}`}
                                className="flex items-center justify-between text-xs text-slate-600"
                              >
                                <span className="font-semibold text-emerald-700">
                                  {formatCurrency(p.amountRupees)}
                                </span>
                                <span>{p.paidAt ? formatDateTime12(p.paidAt) : '—'}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {canPayMore && (
                        <div className="pt-3 border-t border-slate-200/80">
                          <label className="block text-xs font-medium text-slate-600 mb-2">
                            Payout amount (₹)
                          </label>
                          <div className="flex items-center gap-3">
                            <div className="relative flex-1">
                              <IndianRupee className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="number"
                                min="0"
                                max={remaining}
                                step="0.01"
                                placeholder="Enter amount"
                                value={amounts[group.driverId] ?? ''}
                                onChange={(e) => setAmounts((prev) => ({
                                  ...prev,
                                  [group.driverId]: e.target.value,
                                }))}
                                disabled={isPaying}
                                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                            </div>
                            <Button
                              onClick={() => handlePayDriver(group)}
                              disabled={isPaying || !amounts[group.driverId]}
                              className="shrink-0"
                            >
                              {isPaying ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Paying…
                                </>
                              ) : (
                                <>
                                  <Wallet className="w-4 h-4" />
                                  Pay
                                </>
                              )}
                            </Button>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-2">
                            Credits this driver&apos;s wallet from the subscription pool.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

const ManageSubscriptionRevenue = () => {
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
  const [limit] = useState(15);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => {
        if (f.search === searchInput) return f;
        setPage(1);
        return { ...f, search: searchInput };
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit });
      if (filters.search) params.append('search', filters.search);
      if (filters.zoneId) params.append('zoneId', filters.zoneId);
      if (filters.payoutStatus) params.append('payoutStatus', filters.payoutStatus);
      if (filters.status) params.append('status', filters.status);
      if (filters.from) params.append('from', filters.from);
      if (filters.to) params.append('to', filters.to);
      const res = await api.get(`/admin/subscriptions/revenue?${params}`);
      const data = res?.data?.data || {};
      setRows(data.items || []);
      setTotals(data.totals || null);
      setPagination({
        total: data.total || 0,
        pages: Math.max(1, Math.ceil((data.total || 0) / limit)),
      });
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchInput('');
    setPage(1);
  };

  const hasActiveFilters =
    !!filters.search ||
    !!filters.zoneId ||
    !!filters.payoutStatus ||
    filters.status !== SUBSCRIPTION_STATUS.ACTIVE ||
    !!filters.from ||
    !!filters.to;

  const columns = useMemo(
    () => [
      {
        key: 'customer',
        label: 'Customer',
        unclamp: true,
        render: (_, row) => (
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1.5 flex-wrap min-w-0">
              <p className="font-semibold text-slate-800 text-xs sm:text-sm">
                {row.userId?.name || '—'}
              </p>
              <div className="sm:hidden">
                <button
                  type="button"
                  data-row-action
                  onClick={() => setPayTarget(row)}
                  disabled={!row.canPayMore}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary text-dark text-[10px] font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Wallet className="w-3 h-3" />
                  Pay
                </button>
              </div>
            </div>
            <p className="sm:hidden text-xs text-indigo-600 font-medium mt-0.5 truncate">
              {row.planNameSnapshot || 'Subscription'} {row.subscriptionNumber ? `(${row.subscriptionNumber})` : ''}
            </p>
            <div className="sm:hidden text-[10px] text-slate-500 mt-0.5 flex items-center justify-between gap-2">
              <span>Earned: {formatCurrency(row.platformEarned ?? row.platformShareRupees)}</span>
              <span className="font-bold text-amber-700 shrink-0">Rem: {formatCurrency(row.remainingDriverShare)}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'plan',
        label: 'Plan',
        className: 'hidden sm:table-cell',
        render: (_, row) => (
          <div>
            <p className="font-medium">{row.planNameSnapshot || '—'}</p>
            {row.subscriptionNumber && (
              <p className="text-[11px] font-mono text-slate-400">{row.subscriptionNumber}</p>
            )}
            <p className="text-xs text-slate-500">{row.zoneId?.name || '—'}</p>
          </div>
        ),
      },
      {
        key: 'period',
        label: 'Period',
        className: 'hidden md:table-cell',
        render: (_, row) => (
          <span className="text-xs text-slate-600">
            {formatDate(row.startDate)} – {formatDate(row.expiryDate)}
          </span>
        ),
      },
      {
        key: 'platformEarned',
        label: 'Platform earned',
        className: 'hidden sm:table-cell',
        render: (_, row) => (
          <span className="font-semibold text-slate-800">
            {formatCurrency(row.platformEarned ?? row.platformShareRupees)}
          </span>
        ),
      },
      {
        key: 'driverPool',
        label: 'Driver pool',
        className: 'hidden md:table-cell',
        render: (_, row) => (
          <span className="font-semibold">{formatCurrency(row.driverSharePool ?? row.driverShareRupees)}</span>
        ),
      },
      {
        key: 'paidToDriver',
        label: 'Paid to driver',
        className: 'hidden md:table-cell',
        render: (_, row) => (
          <span className="font-semibold text-emerald-700">
            {formatCurrency(row.paidToDriver)}
          </span>
        ),
      },
      {
        key: 'remaining',
        label: 'Remaining',
        className: 'hidden sm:table-cell',
        render: (_, row) => (
          <span className="font-semibold text-amber-700">
            {formatCurrency(row.remainingDriverShare)}
          </span>
        ),
      },
      {
        key: 'drivers',
        label: 'Drivers',
        className: 'hidden md:table-cell',
        render: (_, row) => (
          <span className="text-sm text-slate-600">{row.driverStintCount ?? 0}</span>
        ),
      },
      {
        key: 'actions',
        label: 'Pay',
        sortable: false,
        unclamp: true,
        className: 'hidden sm:table-cell',
        render: (_, row) => (
          <button
            type="button"
            data-row-action
            onClick={() => setPayTarget(row)}
            disabled={!row.canPayMore}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-dark text-xs font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Wallet className="w-3.5 h-3.5" />
            Pay
          </button>
        ),
      },
    ],
    [],
  );

  const summary = [
    { label: 'Total revenue', value: formatCurrency(totals?.totalRevenue), icon: Banknote },
    { label: 'Platform earned', value: formatCurrency(totals?.totalPlatformEarned), icon: TrendingUp },
    { label: 'Driver pool', value: formatCurrency(totals?.totalDriverPool), icon: Users },
    { label: 'Paid to drivers', value: formatCurrency(totals?.totalPaidToDriver), icon: Wallet },
    { label: 'Remaining', value: formatCurrency(totals?.totalRemaining), icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Subscription Revenue
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track platform earnings and manual driver payouts. Paid amounts credit the driver wallet.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {summary.map((s) => (
          <Card key={s.label} padding="p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-xl font-extrabold text-slate-900 mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card padding="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search customer, phone, plan, or subscription ID"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={filters.zoneId}
              onChange={(e) => updateFilter('zoneId', e.target.value)}
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
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={filters.payoutStatus}
              onChange={(e) => updateFilter('payoutStatus', e.target.value)}
              className="w-full h-10 pl-9 pr-8 text-sm rounded-xl border border-slate-200 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {PAYOUT_FILTERS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="w-full h-10 px-3 pr-8 text-sm rounded-xl border border-slate-200 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {STATUS_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => updateFilter('from', e.target.value)}
            aria-label="Paid from date"
            title="Paid from"
            className="h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => updateFilter('to', e.target.value)}
            aria-label="Paid to date"
            title="Paid to"
            className="h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        {hasActiveFilters && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Clear filters
            </button>
          </div>
        )}
      </Card>

      <ServerPaginatedTable
        minWidth="w-full min-w-0"
        columns={columns}
        data={rows}
        loading={loading}
        page={page}
        limit={limit}
        pagination={pagination}
        onPageChange={setPage}
        entityLabel="subscriptions"
        emptyMessage="No paid subscriptions in this range."
      />

      {payTarget && (
        <DriverPayoutDrawer
          subscription={payTarget}
          onClose={() => setPayTarget(null)}
          onPaid={() => {
            fetchData();
          }}
        />
      )}
    </div>
  );
};

export default ManageSubscriptionRevenue;
