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
} from 'lucide-react';
import Badge from '../../../components/Badge';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import Drawer from '../../../components/Drawer';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import api from '../../../utils/api';
import { formatCurrency } from '../../../utils/fareCalculator';
import { formatDateTime12 } from '../../../utils/datetime';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function DriverPayoutDrawer({ subscription, onClose, onPaid }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

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

  const handlePay = async () => {
    setPaying(true);
    try {
      const res = await api.post(`/admin/subscriptions/${subscription._id}/pay-drivers`);
      setDetail(res?.data?.data || null);
      toast.success('Driver wallet credited successfully');
      onPaid?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to pay drivers');
    } finally {
      setPaying(false);
    }
  };

  const sub = detail?.subscription || subscription;
  const unpaidAmount = detail?.unpaidAmount ?? 0;
  const canPay = unpaidAmount > 0 && !loading;

  const drawerHeader = (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pay drivers</p>
      <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
        {sub.planNameSnapshot || 'Subscription'}
      </h2>
      <p className="text-sm text-slate-500 mt-1">
        {sub.userId?.name || 'Customer'} · {formatDate(sub.startDate)} – {formatDate(sub.expiryDate)}
      </p>
    </div>
  );

  const drawerFooter = (
    <div className="flex items-center justify-between gap-3 w-full">
      <div className="text-sm text-slate-600">
        <span className="font-semibold text-slate-900">{formatCurrency(unpaidAmount)}</span>
        {' '}
        unpaid
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onClose} disabled={paying}>
          Close
        </Button>
        <Button onClick={handlePay} disabled={!canPay || paying}>
          {paying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Paying…
            </>
          ) : (
            <>
              <IndianRupee className="w-4 h-4" />
              Pay drivers
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <Drawer isOpen onClose={onClose} header={drawerHeader} footer={drawerFooter} width="max-w-xl">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Card padding="p-3">
              <p className="text-xs text-slate-500">Driver pool</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                {formatCurrency(detail?.driverSharePool)}
              </p>
            </Card>
            <Card padding="p-3">
              <p className="text-xs text-slate-500">Daily rate</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                {formatCurrency(detail?.dailyRate)}
              </p>
            </Card>
            <Card padding="p-3">
              <p className="text-xs text-slate-500">Paid to drivers</p>
              <p className="text-lg font-bold text-emerald-700 mt-0.5">
                {formatCurrency(detail?.paidToDriver)}
              </p>
            </Card>
            <Card padding="p-3">
              <p className="text-xs text-slate-500">Remaining</p>
              <p className="text-lg font-bold text-amber-700 mt-0.5">
                {formatCurrency(detail?.remainingDriverShare)}
              </p>
            </Card>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <CalendarRange className="w-4 h-4" />
              Driver working periods
              <span className="text-slate-400 font-normal">
                ({detail?.totalSubscriptionDays ?? 0} subscription days)
              </span>
            </p>

            {!detail?.stints?.length ? (
              <p className="text-sm text-slate-500 py-6 text-center border rounded-xl">
                No drivers assigned yet for this subscription.
              </p>
            ) : (
              <div className="space-y-3">
                {detail.stints.map((stint) => (
                  <div
                    key={stint.key}
                    className="border border-slate-200 rounded-xl p-4 bg-slate-50/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {stint.driver?.name || 'Driver'}
                        </p>
                        <p className="text-xs text-slate-500">{stint.driver?.phone || '—'}</p>
                      </div>
                      {stint.isPaid ? (
                        <Badge variant="success">Paid</Badge>
                      ) : (
                        <Badge variant="warning">Unpaid</Badge>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">From</p>
                        <p className="font-medium">{formatDate(stint.stintStart || stint.assignedAt)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">To</p>
                        <p className="font-medium">
                          {stint.isCurrent
                            ? `${formatDate(stint.stintStart || stint.assignedAt)} – ${formatDate(stint.plannedStintEnd || stint.stintEnd)} (ongoing)`
                            : formatDate(stint.stintEnd || stint.releasedAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Working days</p>
                        <p className="font-medium">{stint.workingDays}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Amount</p>
                        <p className="font-semibold text-slate-900">
                          {formatCurrency(stint.amountRupees)}
                        </p>
                      </div>
                    </div>
                    {stint.paidAt && (
                      <p className="text-xs text-slate-500 mt-2">
                        Paid on {formatDateTime12(stint.paidAt)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

const ManageSubscriptionRevenue = () => {
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit });
      if (search) params.append('search', search);
      if (from) params.append('from', from);
      if (to) params.append('to', to);
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
  }, [page, limit, search, from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns = useMemo(
    () => [
      {
        key: 'customer',
        label: 'Customer',
        render: (_, row) => (
          <div>
            <p className="font-semibold text-slate-800">{row.userId?.name || '—'}</p>
            <p className="text-xs text-slate-500">{row.userId?.phone_no || '—'}</p>
          </div>
        ),
      },
      {
        key: 'plan',
        label: 'Plan',
        render: (_, row) => (
          <div>
            <p className="font-medium">{row.planNameSnapshot || '—'}</p>
            <p className="text-xs text-slate-500">{row.zoneId?.name || '—'}</p>
          </div>
        ),
      },
      {
        key: 'period',
        label: 'Period',
        render: (_, row) => (
          <span className="text-xs text-slate-600">
            {formatDate(row.startDate)} – {formatDate(row.expiryDate)}
          </span>
        ),
      },
      {
        key: 'driverPool',
        label: 'Driver pool',
        render: (_, row) => (
          <span className="font-semibold">{formatCurrency(row.driverSharePool ?? row.driverShareRupees)}</span>
        ),
      },
      {
        key: 'paidToDriver',
        label: 'Paid to driver',
        render: (_, row) => (
          <span className="font-semibold text-emerald-700">
            {formatCurrency(row.paidToDriver)}
          </span>
        ),
      },
      {
        key: 'remaining',
        label: 'Remaining',
        render: (_, row) => (
          <span className="font-semibold text-amber-700">
            {formatCurrency(row.remainingDriverShare)}
          </span>
        ),
      },
      {
        key: 'drivers',
        label: 'Drivers',
        render: (_, row) => (
          <span className="text-sm text-slate-600">{row.driverStintCount ?? 0}</span>
        ),
      },
      {
        key: 'actions',
        label: 'Pay',
        sortable: false,
        unclamp: true,
        render: (_, row) => (
          <button
            type="button"
            data-row-action
            onClick={() => setPayTarget(row)}
            disabled={(row.unpaidAmount ?? row.remainingDriverShare ?? 0) <= 0}
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
    { label: 'Driver pool', value: formatCurrency(totals?.totalDriverPool), icon: Banknote },
    { label: 'Paid to drivers', value: formatCurrency(totals?.totalPaidToDriver), icon: Users },
    { label: 'Remaining', value: formatCurrency(totals?.totalRemaining), icon: Wallet },
    { label: 'Subscriptions', value: totals?.count ?? 0, icon: Sparkles },
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
            Manual driver payouts by working days. Subscription amounts are not shown in platform revenue.
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summary.map((s) => (
          <Card key={s.label} padding="p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-xl font-extrabold text-slate-900 mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card padding="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search plan name"
              className="w-full h-10 pl-9 pr-3 rounded-xl border text-sm"
            />
          </div>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-10 px-3 rounded-xl border text-sm" />
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-10 px-3 rounded-xl border text-sm" />
        </div>
      </Card>

      <ServerPaginatedTable
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
