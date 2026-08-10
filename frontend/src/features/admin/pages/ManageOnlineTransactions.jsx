import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  RefreshCw,
  Search,
  ExternalLink,
  CreditCard,
  Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Badge from '../../../components/Badge';
import AdminDetailModal from '../components/AdminDetailModal';
import useAdminOnlineTransactionsStore from '../../../store/admin/useAdminOnlineTransactionsStore';

const STATUS_META = {
  created: { label: 'Created', variant: 'default', icon: Clock },
  authorized: { label: 'Authorized', variant: 'info', icon: Clock },
  captured: { label: 'Captured', variant: 'success', icon: CheckCircle2 },
  failed: { label: 'Failed', variant: 'danger', icon: XCircle },
  refunded: { label: 'Refunded', variant: 'warning', icon: Banknote },
};

const PURPOSE_OPTIONS = [
  { value: '', label: 'All purposes' },
  { value: 'booking', label: 'Booking' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'wallet_topup', label: 'Wallet top-up' },
  { value: 'driver_kit', label: 'Driver kit' },
];

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function copyText(label, value) {
  if (!value || value === '—') return;
  navigator.clipboard?.writeText(String(value)).then(
    () => toast.success(`${label} copied`),
    () => toast.error('Could not copy'),
  );
}

const ManageOnlineTransactions = () => {
  const transactions = useAdminOnlineTransactionsStore((s) => s.transactions);
  const totals = useAdminOnlineTransactionsStore((s) => s.totals);
  const loading = useAdminOnlineTransactionsStore((s) => s.loading);
  const error = useAdminOnlineTransactionsStore((s) => s.error);
  const page = useAdminOnlineTransactionsStore((s) => s.page);
  const limit = useAdminOnlineTransactionsStore((s) => s.limit);
  const total = useAdminOnlineTransactionsStore((s) => s.total);
  const filters = useAdminOnlineTransactionsStore((s) => s.filters);
  const fetchTransactions = useAdminOnlineTransactionsStore((s) => s.fetchTransactions);
  const setFilter = useAdminOnlineTransactionsStore((s) => s.setFilter);
  const setPage = useAdminOnlineTransactionsStore((s) => s.setPage);

  const [detail, setDetail] = useState(null);

  useEffect(() => {
    fetchTransactions().catch(() => {});
  }, [fetchTransactions]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const summaryCards = useMemo(
    () => [
      {
        label: 'Ledger total',
        value: formatCurrency(totals?.totalAmount || 0),
        icon: Banknote,
        accent: 'text-primary',
      },
      {
        label: 'Captured',
        value: totals?.byStatus?.captured?.count || 0,
        icon: CheckCircle2,
        accent: 'text-green-700',
      },
      {
        label: 'Created / pending',
        value:
          (totals?.byStatus?.created?.count || 0)
          + (totals?.byStatus?.authorized?.count || 0),
        icon: Clock,
        accent: 'text-amber-700',
      },
      {
        label: 'Failed / refunded',
        value:
          (totals?.byStatus?.failed?.count || 0)
          + (totals?.byStatus?.refunded?.count || 0),
        icon: XCircle,
        accent: 'text-danger',
      },
    ],
    [totals],
  );

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-text">Online transactions</h2>
          <p className="text-xs text-text-muted mt-1 max-w-2xl">
            Razorpay ledger for user and driver gateway payments (bookings,
            subscriptions, wallet top-ups, kit orders). Match order / payment
            ids against{' '}
            <a
              href="https://dashboard.razorpay.com/app/payments"
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-0.5 hover:underline"
            >
              Razorpay Payments
              <ExternalLink className="w-3 h-3" />
            </a>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchTransactions()}
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
            <div key={card.label} className="bg-white border border-border-light rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-muted">{card.label}</p>
                <Icon className={`w-4 h-4 ${card.accent}`} />
              </div>
              <p className={`mt-2 text-lg font-bold ${card.accent}`}>{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Search payment id, order id, name, phone, booking…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={filters.purpose}
          onChange={(e) => setFilter('purpose', e.target.value)}
          className="px-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {PURPOSE_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={filters.subjectType}
          onChange={(e) => setFilter('subjectType', e.target.value)}
          className="px-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Users & drivers</option>
          <option value="user">Users</option>
          <option value="driver">Drivers</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          className="px-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All statuses</option>
          <option value="created">Created</option>
          <option value="captured">Captured</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      <div className="bg-white border border-border-light rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-text-muted border-b border-border-light">
                <Th>Purpose / Txn</Th>
                <Th className="hidden sm:table-cell">When</Th>
                <Th className="hidden md:table-cell">Subject</Th>
                <Th className="hidden sm:table-cell">Reference</Th>
                <Th className="hidden sm:table-cell">Amount</Th>
                <Th className="hidden sm:table-cell">Status</Th>
                <Th className="hidden md:table-cell">Razorpay payment</Th>
                <Th className="text-right w-10">Details</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12">
                    <div className="flex items-center justify-center text-text-muted">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Loading…
                    </div>
                  </td>
                </tr>
              )}
              {!loading && transactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-text-muted">
                    No online transactions yet.
                  </td>
                </tr>
              )}
              {!loading
                && transactions.map((txn) => {
                  const meta = STATUS_META[txn.status] || STATUS_META.created;
                  const Icon = meta.icon;
                  return (
                    <tr
                      key={txn.id}
                      className="border-t border-border-light hover:bg-gray-50/60 align-top"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-between gap-1.5 flex-wrap min-w-0">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary">
                            <CreditCard className="w-3.5 h-3.5" />
                            {txn.purposeLabel}
                          </span>
                          <div className="sm:hidden">
                            <Badge variant={meta.variant} className="text-[9px] px-1.5 py-0.5">
                              <span className="inline-flex items-center gap-1">
                                <Icon className="w-2.5 h-2.5" />
                                {meta.label}
                              </span>
                            </Badge>
                          </div>
                        </div>
                        <div className="sm:hidden text-xs text-slate-800 mt-1 font-medium flex items-center justify-between gap-2">
                          <span className="truncate">Cust: {txn.subjectName || '—'}</span>
                          <span className="font-bold text-emerald-600 shrink-0">
                            {formatCurrency(txn.amountRupees)}
                          </span>
                        </div>
                        <div className="sm:hidden text-[10px] text-slate-500 mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate">Ref: {txn.referenceLabel || '—'}</span>
                          <span className="text-slate-400 shrink-0">{formatDateTime(txn.createdAt)}</span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                        {formatDateTime(txn.createdAt)}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <p className="text-text font-medium">{txn.subjectName || '—'}</p>
                        <p className="text-[10px] text-text-muted mt-0.5">
                          {txn.subjectPhone || '—'}
                        </p>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3">
                        <p className="font-mono text-xs font-medium text-text">
                          {txn.referenceLabel || '—'}
                        </p>
                        <p className="text-[10px] text-text-muted mt-0.5 font-mono">
                          {txn.razorpayOrderId || '—'}
                        </p>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 font-semibold text-text">
                        {formatCurrency(txn.amountRupees)}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3">
                        <Badge variant={meta.variant}>
                          <span className="inline-flex items-center gap-1">
                            <Icon className="w-3 h-3" />
                            {meta.label}
                          </span>
                        </Badge>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-xs font-mono text-text-muted">
                        {txn.razorpayPaymentId || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDetail(txn)}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {!loading && transactions.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-light">
            <p className="text-xs text-text-muted">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
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

      {error && <p className="text-xs text-danger">Could not load transactions: {error}</p>}

      <AdminDetailModal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title="Razorpay transaction"
        subtitle={detail ? `${detail.purposeLabel} · ${formatCurrency(detail.amountRupees)}` : ''}
        size="lg"
        footer={(
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="px-4 py-2 rounded-xl border border-border-light text-sm font-medium"
            >
              Close
            </button>
          </div>
        )}
      >
        {detail && (
          <div className="space-y-3">
            <DetailRow label="Status" value={detail.status} />
            <DetailRow label="Subject" value={`${detail.subjectName || '—'} (${detail.subjectType})`} />
            <DetailRow label="Phone" value={detail.subjectPhone || '—'} />
            <DetailRow label="Reference" value={detail.referenceLabel || '—'} />
            <DetailRow
              label="Razorpay order id"
              value={detail.razorpayOrderId || '—'}
              copyable
            />
            <DetailRow
              label="Razorpay payment id"
              value={detail.razorpayPaymentId || '—'}
              copyable
            />
            <DetailRow
              label="Razorpay signature"
              value={detail.razorpaySignature || '—'}
              copyable
              mono
            />
            <DetailRow label="Amount" value={formatCurrency(detail.amountRupees)} />
            {(detail.feePaise > 0 || detail.taxPaise > 0) && (
              <>
                <DetailRow
                  label="Gateway fee (paise)"
                  value={String(detail.feePaise || 0)}
                />
                <DetailRow
                  label="Tax in fee (paise)"
                  value={String(detail.taxPaise || 0)}
                />
              </>
            )}
            <DetailRow label="Currency" value={detail.currency || 'INR'} />
            <DetailRow label="Method" value={detail.method || '—'} />
            <DetailRow label="Created" value={formatDateTime(detail.createdAt)} />
            <DetailRow label="Updated" value={formatDateTime(detail.updatedAt)} />
            {detail.failureReason ? (
              <DetailRow label="Failure reason" value={detail.failureReason} />
            ) : null}
            <a
              href="https://dashboard.razorpay.com/app/payments"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline pt-1"
            >
              Open Razorpay dashboard
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </AdminDetailModal>
    </div>
  );
};

function Th({ children, className = '' }) {
  return (
    <th
      className={`text-left text-[11px] font-semibold uppercase tracking-wide px-4 py-3 ${className}`}
    >
      {children}
    </th>
  );
}

function DetailRow({ label, value, copyable = false, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border-light bg-white px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
        <p className={`text-sm text-text mt-0.5 break-all ${mono ? 'font-mono text-xs' : ''}`}>
          {value}
        </p>
      </div>
      {copyable && value && value !== '—' ? (
        <button
          type="button"
          onClick={() => copyText(label, value)}
          className="shrink-0 p-1.5 rounded-lg text-text-muted hover:bg-gray-50 hover:text-text"
          title="Copy"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export default ManageOnlineTransactions;
