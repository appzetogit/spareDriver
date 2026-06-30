import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Wallet,
  CircleSlash,
  TrendingUp,
  RefreshCw,
  Search,
  Loader2,
  AlertOctagon,
} from 'lucide-react';
import Badge from '../../../components/Badge';
import useAdminRevenueStore from '../../../store/admin/useAdminRevenueStore';
import RevenueDetailsModal from '../components/ManageRevenue/RevenueDetailsModal';

/**
 * Admin → Account → Revenue.
 *
 * Read-only paginated view over the `PlatformRevenue` ledger. Each row
 * is a rupee event the platform kept:
 *
 *   commission        on completed trip      (booked at trip completion)
 *   cancellation_fee  company share of a     (booked at user cancel)
 *                      cancellation fee
 *   driver_penalty    flat ₹ debited from a  (booked at driver cancel)
 *                      driver's wallet for
 *                      out-of-grace cancels
 *
 * Summary cards across the top show totals for the active filter set,
 * not just the current page — so the admin can slice by source / date
 * range and immediately see the matching aggregates.
 */

const SOURCE_META = {
  commission: {
    label: 'Commission',
    variant: 'success',
    icon: TrendingUp,
    tone: 'text-emerald-700',
  },
  cancellation_fee: {
    label: 'Cancellation',
    variant: 'warning',
    icon: CircleSlash,
    tone: 'text-amber-700',
  },
  driver_penalty: {
    label: 'Driver penalty',
    variant: 'danger',
    icon: AlertOctagon,
    tone: 'text-rose-700',
  },
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

const ManageRevenue = () => {
  const rows = useAdminRevenueStore((s) => s.rows);
  const totals = useAdminRevenueStore((s) => s.totals);
  const loading = useAdminRevenueStore((s) => s.loading);
  const error = useAdminRevenueStore((s) => s.error);
  const page = useAdminRevenueStore((s) => s.page);
  const limit = useAdminRevenueStore((s) => s.limit);
  const total = useAdminRevenueStore((s) => s.total);
  const filters = useAdminRevenueStore((s) => s.filters);
  const fetchRevenue = useAdminRevenueStore((s) => s.fetchRevenue);
  const setFilter = useAdminRevenueStore((s) => s.setFilter);
  const setPage = useAdminRevenueStore((s) => s.setPage);

  const [selectedRow, setSelectedRow] = useState(null);

  useEffect(() => {
    fetchRevenue().catch(() => {});
  }, [fetchRevenue]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const summaryCards = useMemo(
    () => [
      {
        label: 'Total revenue',
        value: formatCurrency(totals?.totalAmount || 0),
        icon: Banknote,
        accent: 'text-primary',
      },
      {
        label: 'Commission',
        value: formatCurrency(totals?.bySource?.commission?.amount || 0),
        icon: TrendingUp,
        accent: 'text-emerald-700',
      },
      {
        label: 'Cancellation',
        value: formatCurrency(
          totals?.bySource?.cancellation_fee?.amount || 0,
        ),
        icon: CircleSlash,
        accent: 'text-amber-700',
      },
      {
        label: 'Driver penalty',
        value: formatCurrency(
          totals?.bySource?.driver_penalty?.amount || 0,
        ),
        icon: AlertOctagon,
        accent: 'text-rose-700',
      },
    ],
    [totals],
  );

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-text">Revenue</h2>
          <p className="text-xs text-text-muted mt-1 max-w-xl">
            Every rupee the platform kept — commission on completed
            trips and the company&apos;s share of cancellation fees.
            Filter by source or date range to slice the totals.
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Search by booking number"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={filters.source}
          onChange={(e) => setFilter('source', e.target.value)}
          className="px-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All sources</option>
          <option value="commission">Commission</option>
          <option value="cancellation_fee">Cancellation fee</option>
          <option value="driver_penalty">Driver penalty</option>
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
            <thead className="bg-gray-50 text-text-muted">
              <tr>
                <Th>Booking</Th>
                <Th>Source</Th>
                <Th>Service</Th>
                <Th>Customer</Th>
                <Th>Driver</Th>
                <Th>Amount</Th>
                <Th>Occurred</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="py-12">
                    <div className="flex items-center justify-center text-text-muted">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Loading revenue…
                    </div>
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-text-muted">
                    No revenue entries for this filter.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => (
                  <RevenueRow
                    key={row._id}
                    row={row}
                    onClick={() => setSelectedRow(row)}
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
        <p className="text-xs text-danger">Could not load revenue: {error}</p>
      )}

      <RevenueDetailsModal
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        row={selectedRow}
      />
    </div>
  );
};

function Th({ children }) {
  return (
    <th className="text-left text-[11px] font-semibold uppercase tracking-wide px-4 py-3">
      {children}
    </th>
  );
}

function RevenueRow({ row, onClick }) {
  const meta = SOURCE_META[row.source] || {
    label: row.source,
    variant: 'muted',
    icon: Wallet,
    tone: 'text-slate-700',
  };
  const Icon = meta.icon;
  const customer = row.userId?.name || row.userId?.phone_no || '\u2014';
  const driver = row.driverId?.name || row.driverId?.phone_no || '\u2014';
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
        <p className="font-mono text-xs font-medium text-text">
          {row.bookingNumber || '\u2014'}
        </p>
        <p className="text-[10px] text-text-muted mt-0.5 font-mono">
          {String(row.bookingId || '').slice(-8)}
        </p>
      </td>
      <td className="px-4 py-3">
        <Badge variant={meta.variant}>
          <span className="inline-flex items-center gap-1">
            <Icon className="w-3 h-3" />
            {meta.label}
          </span>
        </Badge>
      </td>
      <td className="px-4 py-3 text-xs text-text-secondary capitalize">
        {row.serviceType || '\u2014'}
      </td>
      <td className="px-4 py-3 text-xs text-text">{customer}</td>
      <td className="px-4 py-3 text-xs text-text">{driver}</td>
      <td className="px-4 py-3">
        <p className={`font-bold ${meta.tone}`}>
          {formatCurrency(row.amountRupees)}
        </p>
      </td>
      <td className="px-4 py-3 text-xs text-text-muted">
        {formatDateTime(row.occurredAt || row.createdAt)}
      </td>
    </tr>
  );
}

export default ManageRevenue;
