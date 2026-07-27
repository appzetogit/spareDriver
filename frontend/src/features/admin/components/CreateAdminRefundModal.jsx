import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Banknote,
  Car,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Search,
  User,
  Wallet,
  X,
} from 'lucide-react';
import AdminDetailModal from './AdminDetailModal';
import AdminTransactionFields, { EMPTY_TXN_FORM } from './AdminTransactionFields';
import { useAdminUsersStore } from '../../../store/admin/useAdminUsersStore';
import { useAdminDriversStore } from '../../../store/admin/useAdminDriversStore';
import useAdminRefundsStore from '../../../store/admin/useAdminRefundsStore';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { REFUND_PAYOUT_METHOD_LABELS } from '../../../constants/refund';

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

const STEPS = { SELECT: 'select', REFUND: 'refund' };
const PAGE_LIMIT = 10;

/* --- Skeleton loader ------------------------------------------------------- */
function SkeletonCard() {
  return (
    <div className="w-full flex items-center gap-3 p-3 rounded-2xl border border-border-light animate-pulse">
      <div className="w-10 h-10 rounded-xl bg-slate-200 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 w-32 bg-slate-200 rounded-full" />
        <div className="h-2.5 w-20 bg-slate-100 rounded-full" />
      </div>
      <div className="h-4 w-12 bg-slate-100 rounded-full shrink-0" />
    </div>
  );
}

/* --- Avatar gradient helper ------------------------------------------------ */
const GRADIENTS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-600',
  'from-indigo-500 to-blue-600',
];
function avatarGradient(name = '') {
  const code = (name.charCodeAt(0) || 0) % GRADIENTS.length;
  return GRADIENTS[code];
}

/* --- Subject card ---------------------------------------------------------- */
function SubjectCard({ subject, disabled, onClick }) {
  const name = subject.name || '\u2014';
  const phone = subject.phone_no || subject.phone || '\u2014';
  const balance = subject.wallet?.balance;
  const grad = avatarGradient(name);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group w-full flex items-center gap-3 p-3 rounded-2xl border border-border-light hover:border-primary/50 hover:bg-primary/[0.03] text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div
        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center font-bold text-sm text-white uppercase shrink-0 shadow-sm group-hover:scale-105 transition-transform duration-200`}
      >
        {name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text truncate leading-tight">{name}</p>
        <p className="text-[11px] text-text-muted mt-0.5">{phone}</p>
      </div>
      {balance != null ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold shrink-0 border border-emerald-100">
          {formatCurrency(balance)}
        </span>
      ) : null}
      <ChevronDown className="w-3.5 h-3.5 text-text-muted -rotate-90 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  );
}

/* --- Wallet stat card ------------------------------------------------------ */
function WalletStat({ label, value, icon: Icon, accent, gradient }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-light bg-white p-3">
      {gradient && (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-[0.04]`} />
      )}
      <div className="relative flex items-center justify-between">
        <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium">{label}</p>
        <Icon className={`w-3.5 h-3.5 ${accent}`} />
      </div>
      <p className={`relative mt-1.5 text-sm font-bold ${accent}`}>{value}</p>
    </div>
  );
}

/* --- Payout method pill ---------------------------------------------------- */
function PayoutPill({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 ${
        active
          ? 'border-primary bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm'
          : 'border-border-light hover:bg-gray-50 text-text-secondary'
      }`}
    >
      {label}
    </button>
  );
}

/* --- Subject type tab ------------------------------------------------------ */
function SubjectTypeTab({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 ${
        active
          ? 'border-primary bg-gradient-to-br from-primary/10 to-primary/5 text-primary shadow-sm'
          : 'border-border-light hover:bg-gray-50 text-text-secondary'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

/* --- Step indicator -------------------------------------------------------- */
function StepIndicator({ step }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-colors ${
          step === STEPS.SELECT ? 'bg-primary text-dark' : 'bg-slate-200 text-slate-500'
        }`}
      >
        1
      </span>
      <div className="w-8 h-0.5 rounded-full bg-slate-200" />
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-colors ${
          step === STEPS.REFUND ? 'bg-primary text-dark' : 'bg-slate-200 text-slate-500'
        }`}
      >
        2
      </span>
    </div>
  );
}

/* =========================================================================== */
/*  Main modal                                                                  */
/* =========================================================================== */
const CreateAdminRefundModal = ({ open, onClose, onCreated }) => {
  const [step, setStep] = useState(STEPS.SELECT);
  const [subjectType, setSubjectType] = useState('user');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [accList, setAccList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [walletInfo, setWalletInfo] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('wallet');
  const [reason, setReason] = useState('');
  const [txnForm, setTxnForm] = useState(EMPTY_TXN_FORM);
  const searchInputRef = useRef(null);
  const prevPageRef = useRef(0);

  /* Debounce search 300ms, reset pagination on new query */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
      setAccList([]);
      prevPageRef.current = 0;
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  /* Reset list when switching user <-> driver */
  useEffect(() => {
    setPage(1);
    setAccList([]);
    prevPageRef.current = 0;
  }, [subjectType]);

  /* Cache key includes page so every page is cached independently */
  const queryParams = useMemo(
    () => ({ page, limit: PAGE_LIMIT, search: debouncedSearch }),
    [page, debouncedSearch],
  );

  const usersCacheKey = buildCacheKey('admin-refund-users', queryParams);
  const driversCacheKey = buildCacheKey('admin-refund-drivers', queryParams);

  const { data: usersData, loading: usersLoading } = useCachedQuery(
    useAdminUsersStore,
    usersCacheKey,
    queryParams,
    { enabled: open && subjectType === 'user' },
  );

  const { data: driversData, loading: driversLoading } = useCachedQuery(
    useAdminDriversStore,
    driversCacheKey,
    queryParams,
    { enabled: open && subjectType === 'driver' },
  );

  /* Merge current page results into accumulated list */
  const currentPageItems =
    subjectType === 'user' ? (usersData?.users ?? []) : (driversData?.drivers ?? []);
  const pagination =
    subjectType === 'user' ? (usersData?.pagination ?? {}) : (driversData?.pagination ?? {});
  const subjectsLoading = subjectType === 'user' ? usersLoading : driversLoading;

  useEffect(() => {
    if (!subjectsLoading && currentPageItems.length > 0 && page !== prevPageRef.current) {
      prevPageRef.current = page;
      setAccList((prev) =>
        page === 1
          ? currentPageItems
          : [
              ...prev,
              ...currentPageItems.filter((item) => !prev.some((p) => p._id === item._id)),
            ],
      );
    }
  }, [currentPageItems, subjectsLoading, page]);

  const totalSubjects = pagination?.total ?? 0;
  const hasMore = accList.length < totalSubjects;
  const remaining = Math.max(0, totalSubjects - accList.length);
  const nextBatch = Math.min(PAGE_LIMIT, remaining);

  /* Store actions */
  const fetchSubjectWallet = useAdminRefundsStore((s) => s.fetchSubjectWallet);
  const createManualRefund = useAdminRefundsStore((s) => s.createManualRefund);
  const creating = useAdminRefundsStore((s) => s.creatingRefund);

  const reset = useCallback(() => {
    setStep(STEPS.SELECT);
    setSubjectType('user');
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
    setAccList([]);
    setSelected(null);
    setWalletInfo(null);
    setAmount('');
    setPayoutMethod('wallet');
    setReason('');
    setTxnForm(EMPTY_TXN_FORM);
    prevPageRef.current = 0;
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleClose = () => {
    if (creating) return;
    onClose();
  };

  const proceedToRefund = async (subject) => {
    setSelected(subject);
    setWalletLoading(true);
    try {
      const data = await fetchSubjectWallet(subjectType, subject._id);
      setWalletInfo(data);
      setStep(STEPS.REFUND);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not load wallet');
    } finally {
      setWalletLoading(false);
    }
  };

  const submitRefund = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Enter a valid refund amount'); return; }
    if (reason.trim().length < 3) { toast.error('Refund reason is required'); return; }
    if (
      payoutMethod === 'bank_account' &&
      !txnForm.transactionId?.trim() &&
      !txnForm.utr?.trim()
    ) {
      toast.error('Transaction ID or UTR is required for bank refunds');
      return;
    }
    try {
      await createManualRefund({
        subjectType,
        subjectId: selected._id,
        amountRupees: amt,
        payoutMethod,
        reason: reason.trim(),
        transactionDetails:
          payoutMethod === 'bank_account'
            ? txnForm
            : { mode: 'wallet', notes: txnForm.notes },
      });
      toast.success('Refund created successfully');
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not create refund');
    }
  };

  const wallet = walletInfo?.wallet;
  const subjectName = selected?.name || walletInfo?.name || 'Subject';

  return (
    <AdminDetailModal
      isOpen={open}
      onClose={handleClose}
      title=""
      headerExtra={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm border border-primary/10">
              <Banknote className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">
                {step === STEPS.SELECT ? 'Create Refund' : `Refund \u2014 ${subjectName}`}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {step === STEPS.SELECT
                  ? 'Select a user or driver to refund'
                  : payoutMethod === 'wallet'
                  ? 'Amount will be credited to wallet'
                  : 'Record a bank payout'}
              </p>
            </div>
          </div>
          <StepIndicator step={step} />
        </div>
      }
      footer={
        step === STEPS.REFUND ? (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep(STEPS.SELECT)}
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border-light text-sm font-semibold text-text-secondary hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              onClick={submitRefund}
              disabled={creating}
              className="relative inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-dark text-sm font-bold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50 transition-all duration-200 overflow-hidden"
            >
              {creating && <span className="absolute inset-0 bg-white/20 animate-pulse" />}
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {creating ? 'Creating\u2026' : 'Create refund'}
            </button>
          </div>
        ) : null
      }
    >
      {step === STEPS.SELECT ? (
        /* STEP 1: Pick subject */
        <div className="space-y-4">
          {/* Subject type toggle */}
          <div className="flex gap-2">
            <SubjectTypeTab
              active={subjectType === 'user'}
              onClick={() => { setSubjectType('user'); setSelected(null); }}
              icon={User}
              label="User"
            />
            <SubjectTypeTab
              active={subjectType === 'driver'}
              onClick={() => { setSubjectType('driver'); setSelected(null); }}
              icon={Car}
              label="Driver"
            />
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${subjectType === 'user' ? 'users' : 'drivers'} by name or phone\u2026`}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border-light text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all placeholder:text-slate-300"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); searchInputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Count hint */}
          {!subjectsLoading && totalSubjects > 0 && (
            <p className="text-[11px] text-text-muted -mb-1">
              Showing{' '}
              <span className="font-semibold text-text">{accList.length}</span> of{' '}
              <span className="font-semibold text-text">{totalSubjects}</span>{' '}
              {subjectType === 'user' ? 'users' : 'drivers'}
              {debouncedSearch ? ` matching "${debouncedSearch}"` : ''}
            </p>
          )}

          {/* List */}
          <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-0.5">
            {subjectsLoading && page === 1 ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : accList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <Search className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-text-secondary">No matches found</p>
                <p className="text-xs text-text-muted mt-1">
                  {debouncedSearch ? 'Try a different search term' : `No ${subjectType}s available`}
                </p>
              </div>
            ) : (
              <>
                {accList.map((subject) => (
                  <SubjectCard
                    key={subject._id}
                    subject={subject}
                    disabled={walletLoading}
                    onClick={() => proceedToRefund(subject)}
                  />
                ))}

                {/* Loading next page: inline skeletons */}
                {subjectsLoading && page > 1 && (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                )}

                {/* Load more button */}
                {!subjectsLoading && hasMore && (
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border-light text-sm font-medium text-text-muted hover:border-primary/40 hover:text-primary hover:bg-primary/[0.02] transition-all duration-200 mt-1"
                  >
                    <ChevronDown className="w-4 h-4" />
                    Load {nextBatch} more
                    <span className="text-xs opacity-60">· {remaining} remaining</span>
                  </button>
                )}
              </>
            )}
          </div>

          {walletLoading && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading wallet info\u2026
            </div>
          )}
        </div>
      ) : (
        /* STEP 2: Refund form */
        <div className="space-y-5">
          {/* Wallet stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <WalletStat
              label="Balance"
              value={formatCurrency(wallet?.balance)}
              icon={Wallet}
              accent="text-primary"
              gradient="from-primary to-blue-400"
            />
            <WalletStat
              label="Available"
              value={formatCurrency(wallet?.availableRupees ?? wallet?.balance)}
              icon={Banknote}
              accent="text-emerald-600"
              gradient="from-emerald-400 to-teal-400"
            />
            <WalletStat
              label="Total credited"
              value={formatCurrency(wallet?.totalCredited ?? wallet?.totalEarnings)}
              icon={Banknote}
              accent="text-slate-600"
            />
            <WalletStat
              label={subjectType === 'driver' ? 'Withdrawn' : 'Total spent'}
              value={formatCurrency(wallet?.totalSpent ?? wallet?.totalWithdrawn)}
              icon={Banknote}
              accent="text-slate-400"
            />
          </div>

          {/* Held warning */}
          {Number(wallet?.heldRupees) > 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100">
              <span className="text-amber-500 text-sm">⚠️</span>
              <p className="text-xs text-amber-700 font-medium">
                {formatCurrency(wallet.heldRupees)} is held against active bookings.
              </p>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              Refund amount (₹) <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">₹</span>
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border-light text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
              />
            </div>
          </div>

          {/* Payout method */}
          <div>
            <p className="text-xs font-semibold text-text-secondary mb-2">
              Payout method <span className="text-danger">*</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              {Object.entries(REFUND_PAYOUT_METHOD_LABELS).map(([key, label]) => (
                <PayoutPill
                  key={key}
                  label={label}
                  active={payoutMethod === key}
                  onClick={() => setPayoutMethod(key)}
                />
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              Refund reason <span className="text-danger">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Why is this refund being issued?"
              className="w-full rounded-xl border border-border-light px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
            />
          </div>

          {/* Bank / wallet notes */}
          {payoutMethod === 'bank_account' ? (
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-2">Bank transfer details</p>
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
                placeholder="Internal notes about this refund"
                className="w-full rounded-xl border border-border-light px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
              />
            </div>
          )}
        </div>
      )}
    </AdminDetailModal>
  );
};

export default CreateAdminRefundModal;
