import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  Package,
  RefreshCw,
  Search,
  Loader2,
  TrendingUp,
  RotateCcw,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import Badge from '../../../components/Badge';
import useAdminKitRevenueStore from '../../../store/admin/useAdminKitRevenueStore';
import {
  PAYMENT_STATUS_LABELS,
  ADMIN_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
} from '../../../constants/kitStatus';

/**
 * Admin → Account → Kit Revenue.
 *
 * Paid driver-kit purchases (and refunds). Stats reflect the active
 * filter set, not just the current page.
 */

const ADMIN_BADGE = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const PAYMENT_BADGE = {
  paid: 'success',
  refunded: 'danger',
  pending: 'warning',
  failed: 'danger',
};

function formatCurrency(n) {
  const v = Number(n) || 0;
  return `\u20B9${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDateTime(d) {
  if (!d) return '\u2014';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ManageKitRevenue = () => {
  const navigate = useNavigate();
  const rows = useAdminKitRevenueStore((s) => s.rows);
  const totals = useAdminKitRevenueStore((s) => s.totals);
  const loading = useAdminKitRevenueStore((s) => s.loading);
  const error = useAdminKitRevenueStore((s) => s.error);
  const page = useAdminKitRevenueStore((s) => s.page);
  const limit = useAdminKitRevenueStore((s) => s.limit);
  const total = useAdminKitRevenueStore((s) => s.total);
  const filters = useAdminKitRevenueStore((s) => s.filters);
  const fetchRevenue = useAdminKitRevenueStore((s) => s.fetchRevenue);
  const setFilter = useAdminKitRevenueStore((s) => s.setFilter);
  const setPage = useAdminKitRevenueStore((s) => s.setPage);

  const [searchInput, setSearchInput] = useState(filters.search || '');

  useEffect(() => {
    fetchRevenue().catch(() => {});
  }, [fetchRevenue]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== filters.search) {
        setFilter('search', searchInput);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, filters.search, setFilter]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const summaryCards = useMemo(
    () => [
      {
        label: 'Net kit revenue',
        value: formatCurrency(totals?.netAmount || 0),
        icon: Banknote,
        accent: 'text-primary',
        hint: 'Paid − refunded',
      },
      {
        label: 'Paid amount',
        value: formatCurrency(totals?.totalAmount || 0),
        icon: TrendingUp,
        accent: 'text-emerald-700',
        hint: `${totals?.paidCount || 0} purchase${(totals?.paidCount || 0) === 1 ? '' : 's'}`,
      },
      {
        label: 'Refunded',
        value: formatCurrency(totals?.refundedAmount || 0),
        icon: RotateCcw,
        accent: 'text-rose-700',
        hint: `${totals?.refundedCount || 0} refund${(totals?.refundedCount || 0) === 1 ? '' : 's'}`,
      },
      {
        label: 'Approved',
        value: formatCurrency(totals?.byAdminStatus?.approved?.amount || 0),
        icon: CheckCircle2,
        accent: 'text-emerald-700',
        hint: `${totals?.byAdminStatus?.approved?.count || 0} orders`,
      },
      {
        label: 'Pending review',
        value: formatCurrency(totals?.byAdminStatus?.pending?.amount || 0),
        icon: Clock,
        accent: 'text-amber-700',
        hint: `${totals?.byAdminStatus?.pending?.count || 0} orders`,
      },
    ],
    [totals],
  );

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-text">Kit Revenue</h2>
          <p className="text-xs text-text-muted mt-1 max-w-xl">
            Revenue from driver kit purchases. Filter by payment status,
            approval state, fulfillment, or date range to slice the totals.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchRevenue()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-light text-sm font-medium hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white border border-border-light rounded-2xl p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-muted">{card.label}</p>
                <Icon className={`w-4 h-4 ${card.accent}`} />
              </div>
              <p className={`mt-2 text-lg font-bold ${card.accent}`}>
                {card.value}
              </p>
              {card.hint ? (
                <p className="text-[10px] text-text-muted mt-0.5">{card.hint}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.4fr_auto_auto_auto_auto_auto] gap-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search order, kit, or driver"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={filters.paymentStatus}
          onChange={(e) => setFilter('paymentStatus', e.target.value)}
          className="px-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All payments</option>
          <option value="paid">Paid</option>
          <option value="refunded">Refunded</option>
        </select>
        <select
          value={filters.adminStatus}
          onChange={(e) => setFilter('adminStatus', e.target.value)}
          className="px-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All approvals</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={filters.fulfillmentStatus}
          onChange={(e) => setFilter('fulfillmentStatus', e.target.value)}
          className="px-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All fulfillment</option>
          <option value="not_started">Not started</option>
          <option value="dispatched">Dispatched</option>
          <option value="in_transit">In transit</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilter('from', e.target.value)}
          className="px-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="From date"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilter('to', e.target.value)}
          className="px-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="To date"
        />
      </div>

      <div className="bg-white border border-border-light rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-text-muted border-b border-border-light">
                <Th>Order</Th>
                <Th className="hidden sm:table-cell">Driver</Th>
                <Th className="hidden md:table-cell">Kit</Th>
                <Th className="hidden sm:table-cell">Amount</Th>
                <Th className="hidden sm:table-cell">Payment</Th>
                <Th className="hidden md:table-cell">Approval</Th>
                <Th className="hidden md:table-cell">Fulfillment</Th>
                <Th className="hidden sm:table-cell">Paid at</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12">
                    <div className="flex items-center justify-center text-text-muted">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Loading kit revenue…
                    </div>
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-text-muted">
                    No kit purchases for this filter.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => (
                  <KitRevenueRow
                    key={row._id}
                    row={row}
                    onClick={() => navigate(`/admin/kit-orders/${row._id}`)}
                  />
                ))}
            </tbody>
          </table>
        </div>

        {!loading && rows.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-light">
            <p className="text-xs text-text-muted">
              Showing {(page - 1) * limit + 1}&ndash;
              {Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-border-light text-xs font-medium disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-xs text-text-muted">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-border-light text-xs font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-danger">Could not load kit revenue: {error}</p>
      )}
    </div>
  );
};

function Th({ children, className = '' }) {
  return (
    <th className={`text-left text-[11px] font-semibold uppercase tracking-wide px-4 py-3 ${className}`}>
      {children}
    </th>
  );
}

function KitRevenueRow({ row, onClick }) {
  const driver = row.driverId?.name || row.driverId?.phone || '\u2014';
  const driverPhone = row.driverId?.phone || '';
  const isRefunded = row.paymentStatus === 'refunded';

  return (
    <tr
      className="border-t border-border-light hover:bg-gray-50/60 align-top cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <td className="px-4 py-3">
        <div className="flex items-center justify-between gap-1.5 flex-wrap min-w-0">
          <p className="font-mono text-xs font-bold text-slate-800">
            {row.orderNumber || '\u2014'}
          </p>
          <div className="sm:hidden">
            <Badge variant={PAYMENT_BADGE[row.paymentStatus] || 'muted'} className="text-[9px] px-1.5 py-0.5">
              {PAYMENT_STATUS_LABELS[row.paymentStatus] || row.paymentStatus}
            </Badge>
          </div>
        </div>
        <div className="sm:hidden text-xs text-slate-800 mt-1 font-medium flex items-center justify-between gap-2">
          <span className="truncate">Driver: {driver}</span>
          <span className={`font-bold shrink-0 ${isRefunded ? 'text-rose-700' : 'text-emerald-700'}`}>
            {isRefunded ? '\u2212' : ''}
            {formatCurrency(row.amount)}
          </span>
        </div>
        <div className="sm:hidden text-[10px] text-slate-500 mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate">Kit: {row.kitName || '—'}</span>
          <span className="text-slate-400 shrink-0">{formatDateTime(row.paidAt)}</span>
        </div>
      </td>
      <td className="hidden sm:table-cell px-4 py-3">
        <p className="text-xs text-text font-medium">{driver}</p>
        {driverPhone && driver !== driverPhone ? (
          <p className="text-[10px] text-text-muted mt-0.5">{driverPhone}</p>
        ) : null}
      </td>
      <td className="hidden md:table-cell px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-text">
          <Package className="w-3.5 h-3.5 text-text-muted shrink-0" />
          {row.kitName || '\u2014'}
        </span>
      </td>
      <td className="hidden sm:table-cell px-4 py-3">
        <p className={`font-bold ${isRefunded ? 'text-rose-700' : 'text-emerald-700'}`}>
          {isRefunded ? '\u2212' : ''}
          {formatCurrency(row.amount)}
        </p>
      </td>
      <td className="hidden sm:table-cell px-4 py-3">
        <Badge variant={PAYMENT_BADGE[row.paymentStatus] || 'muted'}>
          {PAYMENT_STATUS_LABELS[row.paymentStatus] || row.paymentStatus}
        </Badge>
      </td>
      <td className="hidden md:table-cell px-4 py-3">
        <Badge variant={ADMIN_BADGE[row.adminStatus] || 'muted'}>
          {ADMIN_STATUS_LABELS[row.adminStatus] || row.adminStatus}
        </Badge>
      </td>
      <td className="hidden md:table-cell px-4 py-3 text-xs text-text-secondary">
        {FULFILLMENT_STATUS_LABELS[row.fulfillmentStatus] || row.fulfillmentStatus || '\u2014'}
      </td>
      <td className="hidden sm:table-cell px-4 py-3 text-xs text-text-muted">
        {formatDateTime(row.paidAt)}
      </td>
    </tr>
  );
}

export default ManageKitRevenue;
