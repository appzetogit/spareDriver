import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Banknote,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  RefreshCw,
  Search,
  Eye,
  Image as ImageIcon,
} from 'lucide-react';
import Badge from '../../../components/Badge';
import ConfirmDialog from '../../../components/ConfirmDialog';
import ImageLightbox from '../../../components/ImageLightbox';
import RowActionsMenu from '../components/RowActionsMenu';
import AdminTransactionFields, { EMPTY_TXN_FORM } from '../components/AdminTransactionFields';
import WithdrawalDetailModal from '../components/WithdrawalDetailModal';
import AdminDetailModal from '../components/AdminDetailModal';
import useAdminWithdrawalsStore from '../../../store/admin/useAdminWithdrawalsStore';
import { ReportExportIconButtons } from '../components/reports/ReportExportButtons';
import { WITHDRAWAL_STATUS_LABELS } from '../../../constants/withdrawal';

const STATUS_META = {
  pending: { label: 'Pending', variant: 'warning', icon: Clock },
  processed: { label: 'Paid', variant: 'success', icon: CheckCircle2 },
  rejected: { label: 'Rejected', variant: 'danger', icon: XCircle },
};

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

const ManageWithdrawals = () => {
  const withdrawals = useAdminWithdrawalsStore((s) => s.withdrawals);
  const totals = useAdminWithdrawalsStore((s) => s.totals);
  const loading = useAdminWithdrawalsStore((s) => s.loading);
  const error = useAdminWithdrawalsStore((s) => s.error);
  const page = useAdminWithdrawalsStore((s) => s.page);
  const limit = useAdminWithdrawalsStore((s) => s.limit);
  const total = useAdminWithdrawalsStore((s) => s.total);
  const filters = useAdminWithdrawalsStore((s) => s.filters);
  const updatingId = useAdminWithdrawalsStore((s) => s.updatingId);
  const fetchWithdrawals = useAdminWithdrawalsStore((s) => s.fetchWithdrawals);
  const setFilter = useAdminWithdrawalsStore((s) => s.setFilter);
  const setPage = useAdminWithdrawalsStore((s) => s.setPage);
  const rejectWithdrawal = useAdminWithdrawalsStore((s) => s.rejectWithdrawal);
  const processWithdrawal = useAdminWithdrawalsStore((s) => s.processWithdrawal);

  const proofRef = useRef(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processTarget, setProcessTarget] = useState(null);
  const [txnForm, setTxnForm] = useState(EMPTY_TXN_FORM);
  const [proofFile, setProofFile] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  useEffect(() => {
    fetchWithdrawals().catch(() => {});
  }, [fetchWithdrawals]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const summaryCards = useMemo(() => {
    const by = totals?.byStatus || {};
    return [
      {
        label: 'Pending',
        value: by.pending?.count || 0,
        icon: Clock,
        accent: 'text-amber-700',
      },
      {
        label: 'Paid',
        value: by.processed?.count || 0,
        icon: CheckCircle2,
        accent: 'text-green-700',
      },
      {
        label: 'Rejected',
        value: by.rejected?.count || 0,
        icon: XCircle,
        accent: 'text-danger',
      },
      {
        label: 'Pending amount',
        value: formatCurrency(by.pending?.amount || 0),
        icon: Banknote,
        accent: 'text-primary',
      },
    ];
  }, [totals]);

  const openProcess = (withdrawal) => {
    setProcessTarget(withdrawal);
    setTxnForm(EMPTY_TXN_FORM);
    setProofFile(null);
    if (proofRef.current) proofRef.current.value = '';
  };

  const confirmProcess = async () => {
    if (!processTarget) return;
    if (!proofFile) {
      toast.error('Upload payment proof');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('paymentProof', proofFile);
      Object.entries(txnForm).forEach(([k, v]) => {
        if (v) formData.append(k, v);
      });
      await processWithdrawal(processTarget._id, formData);
      toast.success('Withdrawal processed and wallet debited');
      setProcessTarget(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not process withdrawal');
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    try {
      await rejectWithdrawal(rejectTarget._id, rejectReason.trim());
      toast.success('Withdrawal rejected');
      setRejectTarget(null);
      setRejectReason('');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not reject');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-text">Driver withdrawals</h2>
          <p className="text-xs text-text-muted mt-1 max-w-xl">
            Review driver payout requests. Transfer money manually using the driver&apos;s QR or bank
            details, upload proof, and mark as paid to debit their wallet.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ReportExportIconButtons
            exportPath="/admin/withdrawals/export"
            queryParams={filters}
            filenamePrefix="withdrawals"
          />
          <button
            type="button"
            onClick={() => fetchWithdrawals()}
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
            placeholder="Search driver name or phone"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border-light text-sm"
          />
        </div>
        <select
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-border-light text-sm bg-white"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processed">Paid</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-white border border-border-light rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg text-left text-xs text-text-muted uppercase">
              <tr>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Balance at request</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-text-muted">
                    <Loader2 className="w-5 h-5 animate-spin inline" /> Loading…
                  </td>
                </tr>
              )}
              {!loading && withdrawals.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-text-muted">
                    No withdrawal requests
                  </td>
                </tr>
              )}
              {!loading &&
                withdrawals.map((w) => {
                  const meta = STATUS_META[w.status] || STATUS_META.pending;
                  return (
                    <tr key={w._id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-text">{w.driverName || '—'}</p>
                        <p className="text-xs text-text-muted">{w.driverPhone || ''}</p>
                        {w.isFullSettlement && (
                          <span className="text-[10px] text-amber-700 font-semibold">Account deletion</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold">{formatCurrency(w.amountRupees)}</td>
                      <td className="px-4 py-3 text-text-muted">
                        {formatCurrency(w.walletBalanceAtRequest)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={meta.variant}>{WITHDRAWAL_STATUS_LABELS[w.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs">{formatDateTime(w.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <RowActionsMenu
                          items={[
                            { label: 'View', icon: Eye, onClick: () => setViewTarget(w) },
                            ...(w.qrImage?.url
                              ? [
                                  {
                                    label: 'QR Code',
                                    icon: ImageIcon,
                                    onClick: () =>
                                      setImagePreview({ url: w.qrImage.url, alt: 'Driver payment QR' }),
                                  },
                                ]
                              : []),
                            ...(w.bankDetails?.accountNumber
                              ? [
                                  {
                                    label: 'Bank details',
                                    icon: Banknote,
                                    onClick: () => setViewTarget(w),
                                  },
                                ]
                              : []),
                            ...(w.status === 'pending'
                              ? [
                                  {
                                    label: 'Mark paid',
                                    icon: CheckCircle2,
                                    onClick: () => openProcess(w),
                                  },
                                  {
                                    label: 'Reject',
                                    icon: XCircle,
                                    variant: 'danger',
                                    onClick: () => setRejectTarget(w),
                                  },
                                ]
                              : []),
                            ...(w.status === 'processed' && w.paymentProof?.url
                              ? [
                                  {
                                    label: 'Proof',
                                    icon: ImageIcon,
                                    onClick: () =>
                                      setImagePreview({ url: w.paymentProof.url, alt: 'Payment proof' }),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && withdrawals.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-text-muted">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 rounded-lg border border-border-light disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 rounded-lg border border-border-light disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">Could not load withdrawals: {error}</p>}

      <ConfirmDialog
        open={Boolean(rejectTarget)}
        onClose={() => {
          if (updatingId) return;
          setRejectTarget(null);
          setRejectReason('');
        }}
        onConfirm={confirmReject}
        title="Reject withdrawal?"
        description="The driver will be notified. They can submit a new request later."
        confirmLabel="Reject"
        variant="danger"
        loading={Boolean(updatingId)}
      >
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={3}
          className="w-full mt-3 rounded-xl border border-border-light px-3 py-2 text-sm"
        />
      </ConfirmDialog>

      <WithdrawalDetailModal
        withdrawal={viewTarget}
        open={Boolean(viewTarget)}
        onClose={() => setViewTarget(null)}
      />

      <AdminDetailModal
        isOpen={Boolean(processTarget)}
        onClose={() => {
          if (updatingId) return;
          setProcessTarget(null);
          setTxnForm(EMPTY_TXN_FORM);
          setProofFile(null);
        }}
        title="Process payout"
        subtitle={
          processTarget
            ? `${processTarget.driverName || 'Driver'} · ${formatCurrency(processTarget.amountRupees)}`
            : ''
        }
        size="md"
        footer={
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              disabled={Boolean(updatingId)}
              onClick={() => {
                setProcessTarget(null);
                setTxnForm(EMPTY_TXN_FORM);
                setProofFile(null);
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-xl disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={Boolean(updatingId)}
              onClick={confirmProcess}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {updatingId && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm & debit wallet
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <p className="text-xs text-text-muted mb-4">
              Transfer the money manually to the driver using their payment details, upload the proof, and record the transaction.
            </p>
            {processTarget?.qrImage?.url && (
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase text-text-muted mb-2">Driver payment QR</p>
                <button
                  type="button"
                  onClick={() =>
                    setImagePreview({ url: processTarget.qrImage.url, alt: 'Driver payment QR' })
                  }
                  className="inline-flex items-center gap-1.5 text-sm text-primary font-medium"
                >
                  View QR image <ImageIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {processTarget?.bankDetails?.accountNumber && (
              <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-1.5 text-sm">
                <p className="text-xs font-semibold uppercase text-text-muted mb-2">Bank details</p>
                <div className="flex justify-between gap-3">
                  <span className="text-text-muted text-xs">Holder</span>
                  <span className="font-medium text-right">{processTarget.bankDetails.accountHolderName || '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-text-muted text-xs">Account</span>
                  <span className="font-mono font-medium text-right">{processTarget.bankDetails.accountNumber}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-text-muted text-xs">IFSC</span>
                  <span className="font-mono font-medium text-right">{processTarget.bankDetails.ifscCode || '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-text-muted text-xs">Bank</span>
                  <span className="font-medium text-right">{processTarget.bankDetails.bankName || '—'}</span>
                </div>
                {processTarget.bankDetails.upiId ? (
                  <div className="flex justify-between gap-3">
                    <span className="text-text-muted text-xs">UPI</span>
                    <span className="font-medium text-right">{processTarget.bankDetails.upiId}</span>
                  </div>
                ) : null}
              </div>
            )}
            <AdminTransactionFields value={txnForm} onChange={setTxnForm} requireTxn={false} />
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-medium text-text mb-2">Payment proof *</p>
              <input
                ref={proofRef}
                type="file"
                accept="image/*"
                onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>
          </div>
        </div>
      </AdminDetailModal>

      <ImageLightbox
        src={imagePreview?.url}
        alt={imagePreview?.alt}
        onClose={() => setImagePreview(null)}
      />
    </div>
  );
};

export default ManageWithdrawals;
