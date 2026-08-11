import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Banknote,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  RefreshCw,
  Search,
  ExternalLink,
  Wallet,
  Plus,
} from 'lucide-react';
import Badge from '../../../components/Badge';
import ConfirmDialog from '../../../components/ConfirmDialog';
import RowActionsMenu from '../components/RowActionsMenu';
import CreateAdminRefundModal from '../components/CreateAdminRefundModal';
import AdminDetailModal from '../components/AdminDetailModal';
import AdminTransactionFields, { EMPTY_TXN_FORM } from '../components/AdminTransactionFields';
import useAdminRefundsStore from '../../../store/admin/useAdminRefundsStore';
import { ReportExportIconButtons } from '../components/reports/ReportExportButtons';
import {
  REFUND_KIND_LABELS,
  REFUND_PAYOUT_METHOD_LABELS,
  REFUND_SUBJECT_TYPE_LABELS,
  refundChannelLabel,
} from '../../../constants/refund';

const STATUS_META = {
  pending: { label: 'Pending', variant: 'warning', icon: Clock },
  approved: { label: 'Approved', variant: 'info', icon: CheckCircle2 },
  processed: { label: 'Processed', variant: 'success', icon: CheckCircle2 },
  rejected: { label: 'Rejected', variant: 'danger', icon: XCircle },
  failed: { label: 'Failed', variant: 'danger', icon: XCircle },
};

const KIND_LABELS = REFUND_KIND_LABELS;

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

function txnDisplay(refund) {
  const td = refund.transactionDetails || {};
  return td.transactionId || td.utr || refund.razorpayRefundId || '—';
}

const ManageRefunds = () => {
  const refunds = useAdminRefundsStore((s) => s.refunds);
  const totals = useAdminRefundsStore((s) => s.totals);
  const loading = useAdminRefundsStore((s) => s.loading);
  const error = useAdminRefundsStore((s) => s.error);
  const page = useAdminRefundsStore((s) => s.page);
  const limit = useAdminRefundsStore((s) => s.limit);
  const total = useAdminRefundsStore((s) => s.total);
  const filters = useAdminRefundsStore((s) => s.filters);
  const updatingId = useAdminRefundsStore((s) => s.updatingId);
  const fetchRefunds = useAdminRefundsStore((s) => s.fetchRefunds);
  const setFilter = useAdminRefundsStore((s) => s.setFilter);
  const setPage = useAdminRefundsStore((s) => s.setPage);
  const updateRefundStatus = useAdminRefundsStore((s) => s.updateRefundStatus);

  const [processTarget, setProcessTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [txnForm, setTxnForm] = useState(EMPTY_TXN_FORM);
  const [payoutMethod, setPayoutMethod] = useState('bank_account');
  const [rejectReason, setRejectReason] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    fetchRefunds().catch(() => {});
  }, [fetchRefunds]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const summaryCards = useMemo(
    () => [
      {
        label: 'Total ledger',
        value: formatCurrency(totals?.totalAmount || 0),
        icon: Banknote,
        accent: 'text-primary',
      },
      {
        label: 'Processed',
        value: totals?.byStatus?.processed?.count || 0,
        icon: CheckCircle2,
        accent: 'text-green-700',
      },
      {
        label: 'Pending',
        value: totals?.byStatus?.pending?.count || 0,
        icon: Clock,
        accent: 'text-amber-700',
      },
      {
        label: 'Rejected / failed',
        value:
          (totals?.byStatus?.rejected?.count || 0)
          + (totals?.byStatus?.failed?.count || 0),
        icon: XCircle,
        accent: 'text-danger',
      },
    ],
    [totals],
  );

  const openProcess = (refund) => {
    setProcessTarget(refund);
    const isSubscription = refund.kind === 'subscription_cancellation';
    setPayoutMethod(
      isSubscription ? 'bank_account' : (refund.payoutMethod || 'bank_account'),
    );
    setTxnForm(EMPTY_TXN_FORM);
  };

  const closeProcess = () => {
    if (updatingId) return;
    setProcessTarget(null);
    setTxnForm(EMPTY_TXN_FORM);
  };

  const openReject = (refund) => {
    setRejectTarget(refund);
    setRejectReason('');
  };

  const closeReject = () => {
    if (updatingId) return;
    setRejectTarget(null);
    setRejectReason('');
  };

  const confirmProcess = async () => {
    if (!processTarget) return;
    const isSubscription = processTarget.kind === 'subscription_cancellation';
    const method = isSubscription ? 'bank_account' : payoutMethod;
    if (method === 'bank_account') {
      if (!txnForm.transactionId?.trim() && !txnForm.utr?.trim()) {
        toast.error('Transaction ID or UTR is required');
        return;
      }
    }
    try {
      await updateRefundStatus(processTarget._id, {
        status: 'processed',
        payoutMethod: method,
        transactionDetails: {
          mode: txnForm.mode.trim(),
          transactionId: txnForm.transactionId.trim(),
          utr: txnForm.utr.trim(),
          referenceNumber: txnForm.referenceNumber.trim(),
          notes: txnForm.notes.trim(),
        },
      });
      toast.success('Refund marked as processed');
      closeProcess();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not update refund');
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      toast.error('Rejection reason is required');
      return;
    }
    try {
      await updateRefundStatus(rejectTarget._id, {
        status: 'rejected',
        reason,
      });
      toast.success('Refund rejected — customer notified');
      closeReject();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not reject refund');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-text">Refunds & settlements</h2>
          <p className="text-xs text-text-muted mt-1 max-w-xl">
            Automatic wallet refunds (cancellations) and manual admin refunds
            share this ledger. For bank payouts, transfer funds then mark
            processed with transaction details — same fields as{' '}
            <span className="font-medium text-text">Create refund</span>. Or reject
            with a reason emailed to the customer. Legacy Razorpay refunds:{' '}
            <a
              href="https://dashboard.razorpay.com/app/refunds"
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-0.5 hover:underline"
            >
              Razorpay
              <ExternalLink className="w-3 h-3" />
            </a>
            .
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ReportExportIconButtons
            exportPath="/admin/refunds/export"
            queryParams={filters}
            filenamePrefix="refunds"
          />
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-dark text-sm font-semibold hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            Create refund
          </button>
          <button
            type="button"
            onClick={() => fetchRefunds()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-light text-sm font-medium hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
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

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Search booking, txn id, UTR…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          className="px-3 py-2 rounded-xl border border-border-light text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processed">Processed</option>
          <option value="rejected">Rejected</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="bg-white border border-border-light rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-text-muted border-b border-border-light">
                <Th>Refund</Th>
                <Th className="hidden sm:table-cell">Reference</Th>
                <Th className="hidden sm:table-cell">Customer</Th>
                <Th className="hidden sm:table-cell">Amount</Th>
                <Th className="hidden sm:table-cell">Status</Th>
                <Th className="hidden md:table-cell">Transaction</Th>
                <Th className="hidden md:table-cell">Requested</Th>
                <Th className="text-right w-10">Actions</Th>
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
              {!loading && refunds.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-text-muted">
                    No refunds to display.
                  </td>
                </tr>
              )}
              {!loading &&
                refunds.map((refund) => (
                  <RefundRow
                    key={refund._id}
                    refund={refund}
                    updating={updatingId === refund._id}
                    onMarkProcessed={() => openProcess(refund)}
                    onReject={() => openReject(refund)}
                  />
                ))}
            </tbody>
          </table>
        </div>

        {!loading && refunds.length > 0 && (
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

      {error && <p className="text-xs text-danger">Could not load refunds: {error}</p>}

      <AdminDetailModal
        isOpen={!!processTarget}
        onClose={closeProcess}
        title="Mark refund as processed"
        subtitle={
          processTarget
            ? `Record payout details for ${formatCurrency(processTarget.amountRupees)} — same fields as Create refund.`
            : ''
        }
        size="lg"
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeProcess}
              disabled={!!updatingId}
              className="px-4 py-2 rounded-xl border border-border-light text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmProcess}
              disabled={!!updatingId}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {updatingId && <Loader2 className="w-4 h-4 animate-spin" />}
              Mark processed
            </button>
          </div>
        )}
      >
        <div className="space-y-4">
          {processTarget?.kind === 'subscription_cancellation' ? (
            <p className="text-xs text-text-muted rounded-xl border border-border-light bg-white px-3 py-2">
              Subscription refunds are bank transfer only — wallet credit is not available.
            </p>
          ) : (
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-2">
                Payout method <span className="text-danger">*</span>
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                {Object.entries(REFUND_PAYOUT_METHOD_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPayoutMethod(key)}
                    className={`flex-1 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                      payoutMethod === key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border-light bg-white text-text-secondary hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {payoutMethod === 'bank_account' || processTarget?.kind === 'subscription_cancellation' ? (
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-2">
                Bank transfer details <span className="text-danger">*</span>
              </p>
              <div className="rounded-xl border border-border-light bg-white p-3">
                <AdminTransactionFields value={txnForm} onChange={setTxnForm} requireTxn />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Notes (optional)
              </label>
              <textarea
                value={txnForm.notes}
                onChange={(e) => setTxnForm({ ...txnForm, notes: e.target.value })}
                rows={2}
                placeholder="Internal notes about this wallet refund"
                className="w-full rounded-xl border border-border-light px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}
        </div>
      </AdminDetailModal>

      <ConfirmDialog
        open={!!rejectTarget}
        onClose={closeReject}
        onConfirm={confirmReject}
        title="Reject refund?"
        description={
          rejectTarget
            ? `Reject ${formatCurrency(rejectTarget.amountRupees)}. The reason is emailed to the customer.`
            : ''
        }
        confirmLabel="Reject"
        variant="danger"
        loading={!!updatingId}
      >
        <label className="flex flex-col gap-1.5 mt-1">
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">
            Reason of rejection <span className="text-danger">*</span>
          </span>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Explain why this refund is being rejected…"
            rows={3}
            className="px-3 py-2 rounded-xl border border-border-light text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
      </ConfirmDialog>

      <CreateAdminRefundModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => fetchRefunds().catch(() => {})}
      />
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

function RefundRow({ refund, updating, onMarkProcessed, onReject }) {
  const status = refund.status || 'pending';
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.icon;
  const isWalletSettlement = refund.kind === 'wallet_settlement';
  const isAdminManual = refund.kind === 'admin_manual';
  const isAutoWallet =
    !isWalletSettlement &&
    !isAdminManual &&
    refund.payoutMethod === 'wallet' &&
    status === 'processed';
  const channel = refundChannelLabel(refund);
  const customer =
    refund.userId?.name ||
    refund.userId?.phone ||
    refund.userId?.phone_no ||
    refund.driverId?.name ||
    refund.driverId?.phone_no ||
    'Customer';

  const menuItems =
    (status === 'pending' || status === 'approved')
    && !isWalletSettlement
    && !isAdminManual
    && !isAutoWallet
      ? [
          { label: 'Mark processed', icon: CheckCircle2, onClick: onMarkProcessed },
          { label: 'Reject', icon: XCircle, variant: 'danger', onClick: onReject },
        ]
      : [];

  return (
    <tr className="border-t border-border-light hover:bg-gray-50/60 align-top">
      <td className="px-4 py-3">
        <div className="flex items-center justify-between gap-1.5 flex-wrap min-w-0">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary">
            {isWalletSettlement || isAdminManual || isAutoWallet ? (
              <Wallet className="w-3.5 h-3.5" />
            ) : null}
            {KIND_LABELS[refund.kind] || 'Refund'}
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
          <span className="truncate">Cust: {customer}</span>
          <span className="font-bold text-emerald-600 shrink-0">
            {formatCurrency(refund.amountRupees)}
          </span>
        </div>
        <div className="sm:hidden text-[10px] text-slate-500 mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate">Ref: {refund.subscriptionNumber || refund.bookingNumber || '—'}</span>
          <span className="text-slate-400 shrink-0">{formatDateTime(refund.createdAt)}</span>
        </div>
      </td>
      <td className="hidden sm:table-cell px-4 py-3">
        <p className="font-mono text-xs font-medium text-text">
          {isWalletSettlement
            ? 'Wallet settlement'
            : isAdminManual
              ? 'Admin refund'
              : refund.subscriptionNumber || refund.bookingNumber || '—'}
        </p>
        {!isWalletSettlement && !isAdminManual && (refund.bookingId || refund.subscriptionId) && (
          <p className="text-[10px] text-text-muted mt-0.5 font-mono">
            {String(refund.subscriptionId || refund.bookingId).slice(-8)}
          </p>
        )}
        {(isAdminManual || isAutoWallet) && refund.reason ? (
          <p className="text-[10px] text-text-muted mt-0.5 line-clamp-2">{refund.reason}</p>
        ) : null}
        {status === 'rejected' && refund.error ? (
          <p className="text-[10px] text-danger mt-0.5 line-clamp-2">
            Rejected: {refund.error}
          </p>
        ) : null}
      </td>
      <td className="hidden sm:table-cell px-4 py-3 text-text">{customer}</td>
      <td className="hidden sm:table-cell px-4 py-3">
        <p className="font-semibold text-success">{formatCurrency(refund.amountRupees)}</p>
        {!isWalletSettlement && !isAdminManual && Number(refund.grossPaidRupees) > 0 && (
          <p className="text-[10px] text-text-muted mt-0.5">
            Paid: {formatCurrency(refund.grossPaidRupees)}
          </p>
        )}
      </td>
      <td className="hidden sm:table-cell px-4 py-3">
        <Badge variant={meta.variant}>
          <span className="inline-flex items-center gap-1">
            <Icon className="w-3 h-3" />
            {meta.label}
          </span>
        </Badge>
      </td>
      <td className="hidden md:table-cell px-4 py-3 text-xs text-text-muted font-mono">{txnDisplay(refund)}</td>
      <td className="hidden md:table-cell px-4 py-3 text-xs text-text-muted">{formatDateTime(refund.createdAt)}</td>
      <td className="px-4 py-3">
        {menuItems.length > 0 ? (
          <RowActionsMenu items={menuItems} />
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
        {updating && <Loader2 className="w-4 h-4 animate-spin text-text-muted ml-auto" />}
      </td>
    </tr>
  );
}

export default ManageRefunds;
