import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, RefreshCw, Search, User, Car, Wallet, CheckCircle2, XCircle, Play } from 'lucide-react';
import Badge from '../../../components/Badge';
import ConfirmDialog from '../../../components/ConfirmDialog';
import RowActionsMenu from '../components/RowActionsMenu';
import AdminTransactionFields, { EMPTY_TXN_FORM } from '../components/AdminTransactionFields';
import useAdminAccountDeletionsStore from '../../../store/admin/useAdminAccountDeletionsStore';
import {
  ACCOUNT_DELETION_STATUS_LABELS,
} from '../../../constants/withdrawal';

const STATUS_VARIANT = {
  pending: 'warning',
  in_progress: 'info',
  completed: 'success',
  rejected: 'danger',
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

const ManageAccountDeletions = () => {
  const requests = useAdminAccountDeletionsStore((s) => s.requests);
  const loading = useAdminAccountDeletionsStore((s) => s.loading);
  const error = useAdminAccountDeletionsStore((s) => s.error);
  const page = useAdminAccountDeletionsStore((s) => s.page);
  const limit = useAdminAccountDeletionsStore((s) => s.limit);
  const total = useAdminAccountDeletionsStore((s) => s.total);
  const filters = useAdminAccountDeletionsStore((s) => s.filters);
  const updatingId = useAdminAccountDeletionsStore((s) => s.updatingId);
  const fetchRequests = useAdminAccountDeletionsStore((s) => s.fetchRequests);
  const setFilter = useAdminAccountDeletionsStore((s) => s.setFilter);
  const setPage = useAdminAccountDeletionsStore((s) => s.setPage);
  const markInProgress = useAdminAccountDeletionsStore((s) => s.markInProgress);
  const rejectRequest = useAdminAccountDeletionsStore((s) => s.rejectRequest);
  const completeRequest = useAdminAccountDeletionsStore((s) => s.completeRequest);
  const fetchBlockers = useAdminAccountDeletionsStore((s) => s.fetchBlockers);
  const settleUserWallet = useAdminAccountDeletionsStore((s) => s.settleUserWallet);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [completeTarget, setCompleteTarget] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [blockers, setBlockers] = useState([]);
  const [blockersLoading, setBlockersLoading] = useState(false);
  const [settleTarget, setSettleTarget] = useState(null);
  const [settleForm, setSettleForm] = useState(EMPTY_TXN_FORM);

  useEffect(() => {
    fetchRequests().catch(() => {});
  }, [fetchRequests]);

  useEffect(() => {
    if (!completeTarget?._id) {
      setBlockers([]);
      return;
    }
    setBlockersLoading(true);
    fetchBlockers(completeTarget._id)
      .then((data) => setBlockers(data.blockers || []))
      .catch(() => setBlockers([]))
      .finally(() => setBlockersLoading(false));
  }, [completeTarget, fetchBlockers]);

  const openComplete = (request) => {
    setCompleteTarget(request);
    setAdminNotes('');
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const confirmReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) {
      toast.error('Rejection reason is required');
      return;
    }
    try {
      await rejectRequest(rejectTarget._id, { reason: rejectReason.trim() });
      toast.success('Request rejected');
      setRejectTarget(null);
      setRejectReason('');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not reject');
    }
  };

  const refreshBlockers = async (id) => {
    const data = await fetchBlockers(id);
    setBlockers(data.blockers || []);
    return data;
  };

  const openSettle = (request) => {
    setSettleTarget(request);
    setSettleForm(EMPTY_TXN_FORM);
  };

  const confirmSettle = async () => {
    if (!settleTarget?._id) return;
    if (!settleForm.transactionId?.trim() && !settleForm.utr?.trim()) {
      toast.error('Transaction ID or UTR is required');
      return;
    }
    try {
      const requestId = settleTarget._id;
      await settleUserWallet(requestId, settleForm);
      toast.success('Wallet settled — entry added to Refunds page');
      setSettleTarget(null);
      setSettleForm(EMPTY_TXN_FORM);
      fetchRequests().catch(() => {});
      if (completeTarget?._id === requestId) {
        await refreshBlockers(requestId);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not settle wallet');
    }
  };

  const confirmComplete = async () => {
    if (!completeTarget) return;
    if (blockers.length > 0) {
      toast.error('Resolve all blockers before deleting the account');
      return;
    }
    try {
      await completeRequest(completeTarget._id, { adminNotes: adminNotes.trim() || undefined });
      toast.success('Account deleted');
      setCompleteTarget(null);
      setAdminNotes('');
    } catch (err) {
      const data = err?.response?.data;
      const list = data?.data?.blockers;
      if (Array.isArray(list) && list.length) {
        setBlockers(list);
        toast.error('Resolve all blockers before deleting the account');
      } else {
        toast.error(data?.message || err?.message || 'Could not complete deletion');
      }
    }
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-text">Account deletions</h2>
          <p className="text-xs text-text-muted mt-1 max-w-xl">
            Wallet must be ₹0, with no active trips or subscriptions, before an account can be
            deleted. Use Bookings and Subscription Requests to resolve blockers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchRequests()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-light text-sm font-medium hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Search name or phone"
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
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={filters.subjectType}
          onChange={(e) => setFilter('subjectType', e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-border-light text-sm bg-white"
        >
          <option value="">All types</option>
          <option value="user">Users</option>
          <option value="driver">Drivers</option>
        </select>
      </div>

      <div className="bg-white border border-border-light rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg text-left text-xs text-text-muted uppercase">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Wallet</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Actions</th>
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
              {!loading && requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-text-muted">
                    No deletion requests
                  </td>
                </tr>
              )}
              {!loading &&
                requests.map((r) => (
                  <tr key={r._id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold capitalize">
                        {r.subjectType === 'user' ? (
                          <User className="w-3.5 h-3.5" />
                        ) : (
                          <Car className="w-3.5 h-3.5" />
                        )}
                        {r.subjectType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.subjectName || '—'}</p>
                      <p className="text-xs text-text-muted">{r.subjectPhone || ''}</p>
                      {r.reason && (
                        <p className="text-xs text-text-secondary mt-1 line-clamp-2">{r.reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p>{formatCurrency(r.walletBalanceAtRequest)}</p>
                      <p className="text-[10px] text-text-muted capitalize">
                        {r.walletSettlementStatus?.replace('_', ' ')}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[r.status] || 'default'}>
                        {ACCOUNT_DELETION_STATUS_LABELS[r.status] || r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {['pending', 'in_progress'].includes(r.status) ? (
                        <RowActionsMenu
                          items={[
                            ...(r.status === 'pending'
                              ? [{
                                  label: 'Start review',
                                  icon: Play,
                                  onClick: () => markInProgress(r._id),
                                }]
                              : []),
                            ...(r.subjectType === 'user' && r.walletSettlementStatus === 'pending'
                              ? [{
                                  label: 'Settle wallet',
                                  icon: Wallet,
                                  onClick: () => openSettle(r),
                                }]
                              : []),
                            {
                              label: 'Delete account',
                              icon: CheckCircle2,
                              onClick: () => openComplete(r),
                            },
                            {
                              label: 'Reject',
                              icon: XCircle,
                              variant: 'danger',
                              onClick: () => setRejectTarget(r),
                            },
                          ]}
                        />
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && requests.length > 0 && (
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

      {error && <p className="text-sm text-danger">{error}</p>}

      <ConfirmDialog
        open={Boolean(rejectTarget)}
        onClose={() => {
          if (updatingId) return;
          setRejectTarget(null);
          setRejectReason('');
        }}
        onConfirm={confirmReject}
        title="Reject deletion request?"
        description="The user will remain active and can continue using the app."
        confirmLabel="Reject"
        variant="danger"
        loading={Boolean(updatingId)}
      >
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Reason (required)"
          rows={3}
          className="w-full mt-3 rounded-xl border border-border-light px-3 py-2 text-sm"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(completeTarget)}
        onClose={() => {
          if (updatingId) return;
          setCompleteTarget(null);
          setAdminNotes('');
          setBlockers([]);
        }}
        onConfirm={confirmComplete}
        title="Delete account permanently?"
        description={
          completeTarget?.subjectType === 'driver'
            ? 'Wallet must be ₹0 and linked withdrawal processed. Cancel active trips/subscriptions first.'
            : 'Wallet must be ₹0 with no active trips or subscriptions.'
        }
        confirmLabel="Delete account"
        variant="danger"
        loading={Boolean(updatingId)}
      >
        {blockersLoading ? (
          <p className="text-sm text-text-muted mt-3 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking blockers…
          </p>
        ) : blockers.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm text-amber-900 bg-amber-50 rounded-xl p-3 border border-amber-200">
            {blockers.map((b) => (
              <li key={`${b.code}-${b.message}`}>
                {b.message}
                {b.bookingId && (
                  <span className="block text-xs text-text-muted mt-0.5">
                    Resolve in Admin → Bookings
                  </span>
                )}
                {b.subscriptionId && (
                  <span className="block text-xs text-text-muted mt-0.5">
                    Resolve in Subscription Requests
                  </span>
                )}
                {b.code === 'wallet_balance' && completeTarget?.subjectType === 'user' && (
                  <span className="block text-xs text-text-muted mt-0.5">
                    Use row menu → Settle wallet
                  </span>
                )}
                {b.code === 'pending_withdrawal' && (
                  <span className="block text-xs text-text-muted mt-0.5">
                    Resolve in Admin → Withdrawals
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-green-700 mt-3">No blockers — safe to delete.</p>
        )}
        <textarea
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          placeholder="Admin notes (optional)"
          rows={2}
          className="w-full mt-3 rounded-xl border border-border-light px-3 py-2 text-sm"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(settleTarget)}
        onClose={() => {
          if (updatingId) return;
          setSettleTarget(null);
          setSettleForm(EMPTY_TXN_FORM);
        }}
        onConfirm={confirmSettle}
        title="Settle user wallet"
        description={
          settleTarget
            ? `Transfer ${formatCurrency(settleTarget.walletBalanceAtRequest)} to ${settleTarget.subjectName || 'user'} and record settlement details. This appears on the Refunds page.`
            : ''
        }
        confirmLabel="Confirm settlement"
        variant="success"
        loading={Boolean(updatingId)}
      >
        <AdminTransactionFields value={settleForm} onChange={setSettleForm} />
      </ConfirmDialog>
    </div>
  );
};

export default ManageAccountDeletions;
