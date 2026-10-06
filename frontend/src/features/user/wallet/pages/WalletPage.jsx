import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  RefreshCcw,
  ChevronRight,
  Wallet as WalletIcon,
  CreditCard,
  Receipt,
} from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import BottomSheet from '../../../../components/BottomSheet';
import useUserWalletStore from '../../../../store/user/useUserWalletStore';
import TopupSheet from '../components/TopupSheet';
import usePaymentConfigStore, {
  selectWalletTopupEnabled,
} from '../../../../store/usePaymentConfigStore';
import { useAfterPaint } from '../../../../hooks/useAfterPaint';
import {
  WalletBalanceSkeleton,
  WalletTxSkeleton,
} from '../../../../components/skeleton/SectionSkeletons';

/**
 * Full-page wallet view: balance, lifetime totals, and the most recent
 * transaction ledger. The "+ Add money" CTA opens the shared
 * `TopupSheet`. After a successful top-up the page silently re-fetches
 * the transaction list so the new credit lands at the top.
 * Tapping a ledger row opens a breakdown sheet (same pattern as
 * driver earnings).
 */
const PAGE_SIZE = 20;

const fmtRupees = (n) =>
  `\u20B9${Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const WalletPage = () => {
  const navigate = useNavigate();
  const topupEnabled = usePaymentConfigStore(selectWalletTopupEnabled);
  const wallet = useUserWalletStore((s) => s.wallet);
  const transactions = useUserWalletStore((s) => s.transactions);
  const loading = useUserWalletStore((s) => s.loading);
  const fetched = useUserWalletStore((s) => s.fetched);
  const page = useUserWalletStore((s) => s.page);
  const hasMore = useUserWalletStore((s) => s.hasMore);
  const fetchWallet = useUserWalletStore((s) => s.fetchWallet);
  const fetchTransactions = useUserWalletStore((s) => s.fetchTransactions);

  const [topupOpen, setTopupOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [txBootstrapped, setTxBootstrapped] = useState(false);
  const txReady = useAfterPaint({ delayMs: 120 });

  // Critical: balance. Important: ledger after first paint.
  useEffect(() => {
    fetchWallet().catch(() => {});
  }, [fetchWallet]);

  useEffect(() => {
    if (!txReady) return;
    let cancelled = false;
    fetchTransactions({ page: 1, limit: PAGE_SIZE })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTxBootstrapped(true);
      });
    return () => {
      cancelled = true;
    };
  }, [txReady, fetchTransactions]);

  const onLoadMore = () => {
    if (loading || !hasMore) return;
    fetchTransactions({
      page: page + 1,
      limit: PAGE_SIZE,
      append: true,
    }).catch(() => {});
  };

  // Show the truly-spendable amount as the headline number. The raw
  // `balance` and the locked-against-bookings amount appear below it so
  // the user can see why they may have less to spend than they expect.
  const heldRupees = Number(wallet.heldRupees || 0);
  const balance = Number(wallet.balance || 0);
  const available =
    wallet.availableRupees != null
      ? Number(wallet.availableRupees)
      : Math.max(0, balance - heldRupees);
  const balanceLabel = useMemo(() => fmtRupees(available), [available]);

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-text" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-text">My wallet</h1>
            <p className="text-xs text-text-muted">
              Pay for bookings instantly from your balance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              fetchWallet().catch(() => {});
              fetchTransactions({ page: 1, limit: PAGE_SIZE }).catch(() => {});
            }}
            className="p-2 rounded-xl text-text-muted hover:bg-gray-100"
            aria-label="Refresh"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {!fetched && loading ? (
          <WalletBalanceSkeleton />
        ) : (
        <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <p className="text-[11px] uppercase tracking-wide text-white/70">
            Available balance
          </p>
          <p className="text-3xl font-bold mt-1">{balanceLabel}</p>
          {heldRupees > 0 && (
            <p className="text-[11px] text-white/60 mt-1.5 leading-snug">
              {fmtRupees(heldRupees)} reserved for active bookings
              (of {fmtRupees(balance)} total)
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 text-[11px] text-white/80">
            <div>
              <p className="uppercase tracking-wide">Lifetime added</p>
              <p className="text-sm font-semibold text-white mt-0.5">
                ₹{Number(wallet.totalCredited || 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <p className="uppercase tracking-wide">Lifetime spent</p>
              <p className="text-sm font-semibold text-white mt-0.5">
                ₹{Number(wallet.totalSpent || 0).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
          {topupEnabled ? (
            <div className="mt-5">
              <Button
                fullWidth
                variant="primary"
                icon={Plus}
                onClick={() => setTopupOpen(true)}
              >
                Add money
              </Button>
            </div>
          ) : (
            <p className="mt-5 text-[11px] text-white/70">
              Adding money is temporarily unavailable. You can still spend your
              existing balance, or pay your driver in cash.
            </p>
          )}
        </Card>
        )}

        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-sm font-semibold text-text">Recent activity</h2>
            {loading && fetched && (
              <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
            )}
          </div>

          {(!txBootstrapped || (loading && transactions.length === 0)) ? (
            <WalletTxSkeleton rows={5} />
          ) : transactions.length === 0 ? (
            <Card>
              <div className="text-center py-6 text-sm text-text-muted">
                No transactions yet.
              </div>
            </Card>
          ) : (
            <>
              <Card padding="p-0" className="divide-y divide-border-light overflow-hidden">
                {transactions.map((tx) => (
                  <TransactionRow
                    key={tx._id}
                    tx={tx}
                    onSelect={setSelectedTx}
                  />
                ))}
              </Card>
              {hasMore && (
                <Button
                  fullWidth
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  loading={loading}
                  onClick={onLoadMore}
                >
                  Load more
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <TopupSheet
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        title="Add money to wallet"
        subtitle="Use UPI, cards, netbanking or wallets."
        onSuccess={() =>
          fetchTransactions({ page: 1, limit: PAGE_SIZE }).catch(() => {})
        }
      />

      <TransactionDetailSheet
        tx={selectedTx}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
};

function TransactionRow({ tx, onSelect }) {
  const isCredit = tx.direction === 'credit';
  const Icon = isCredit ? ArrowDownLeft : ArrowUpRight;
  const tone = isCredit ? 'text-success bg-success/10' : 'text-text bg-gray-100';
  return (
    <button
      type="button"
      onClick={() => onSelect?.(tx)}
      className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 transition-colors text-left"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">
          {sourceLabel(tx.source)}
        </p>
        <p className={`text-[11px] truncate ${tx.status === 'cancelled' || tx.status === 'failed' ? 'text-rose-600' : 'text-text-muted'}`}>
          {formatDate(tx.createdAt)} · {statusLabel(tx.status)}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold ${isCredit ? 'text-success' : 'text-text'}`}>
          {isCredit ? '+' : '\u2212'}
          {fmtRupees(tx.amountRupees)}
        </p>
        <p className="text-[10px] text-text-muted">
          bal {fmtRupees(tx.balanceAfter)}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
    </button>
  );
}

/**
 * Bottom sheet opened when the user taps a ledger row — mirrors the
 * driver earnings breakdown sheet.
 */
function TransactionDetailSheet({ tx, onClose }) {
  const isOpen = !!tx;
  const isCredit = tx?.direction === 'credit';
  const title = sourceLabel(tx?.source);
  const Icon = isCredit ? ArrowDownLeft : ArrowUpRight;
  const tone = isCredit ? 'text-success bg-success/10' : 'text-text bg-gray-100';
  const amountTone = isCredit ? 'text-success' : 'text-rose-700';
  const sign = isCredit ? '+' : '\u2212';

  const rzp = tx?.razorpay || {};
  const grossPaise = Number(rzp.amountPaise) || 0;
  const showTopupBreakdown = tx?.source === 'topup' && grossPaise > 0;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title} showHandle>
      {tx && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${tone}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text truncate">{title}</p>
              <p className="text-[11px] text-text-muted truncate">
                {[formatDate(tx.createdAt), statusLabel(tx.status)]
                  .filter(Boolean)
                  .join(' \u00B7 ')}
              </p>
            </div>
            <p className={`text-base font-bold ${amountTone} shrink-0`}>
              {sign}
              {fmtRupees(tx.amountRupees)}
            </p>
          </div>

          {showTopupBreakdown ? (
            <TopupBreakdownBlock
              grossPaise={grossPaise}
              credited={tx.amountRupees}
            />
          ) : (
            <div className="bg-gray-50 rounded-2xl divide-y divide-border-light">
              <DetailLine
                icon={isCredit ? ArrowDownLeft : ArrowUpRight}
                tone={tone}
                label={isCredit ? 'Amount credited' : 'Amount debited'}
                sublabel={sourceLabel(tx.source)}
                value={`${sign}${fmtRupees(tx.amountRupees)}`}
                valueClass={amountTone}
              />
            </div>
          )}

          <div className="bg-gray-50 rounded-2xl divide-y divide-border-light">
            <DetailLine
              icon={WalletIcon}
              tone="text-slate-700 bg-slate-100"
              label="Balance after"
              value={fmtRupees(tx.balanceAfter)}
            />
            {tx.description ? (
              <DetailLine
                icon={Receipt}
                tone="text-slate-700 bg-slate-100"
                label="Description"
                sublabel={tx.description}
              />
            ) : null}
            {tx.refType && tx.refId ? (
              <DetailLine
                icon={Receipt}
                tone="text-slate-700 bg-slate-100"
                label="Reference"
                sublabel={`${tx.refType} · ${tx.refId}`}
              />
            ) : null}
            {rzp.paymentId ? (
              <DetailLine
                icon={CreditCard}
                tone="text-indigo-700 bg-indigo-100"
                label="Razorpay payment"
                sublabel={rzp.paymentId}
              />
            ) : null}
            {rzp.orderId ? (
              <DetailLine
                icon={CreditCard}
                tone="text-indigo-700 bg-indigo-100"
                label="Razorpay order"
                sublabel={rzp.orderId}
              />
            ) : null}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function TopupBreakdownBlock({ grossPaise, credited }) {
  const gross = grossPaise / 100;
  const creditedAmt = Number(credited) || gross;

  return (
    <div className="bg-gray-50 rounded-2xl divide-y divide-border-light">
      {grossPaise > 0 && (
        <DetailLine
          icon={CreditCard}
          tone="text-indigo-700 bg-indigo-100"
          label="Amount paid"
          sublabel="Charged via Razorpay"
          value={fmtRupees(gross)}
        />
      )}
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-semibold text-text">Credited to wallet</p>
        <p className="text-base font-bold text-success">{fmtRupees(creditedAmt)}</p>
      </div>
    </div>
  );
}

function DetailLine({
  icon: Icon,
  tone,
  label,
  sublabel,
  value,
  valueClass = 'text-text',
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tone}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">{label}</p>
        {sublabel && (
          <p className="text-[11px] text-text-muted break-all">{sublabel}</p>
        )}
      </div>
      {value != null && value !== '' && (
        <p className={`text-sm font-bold shrink-0 ${valueClass}`}>{value}</p>
      )}
    </div>
  );
}

function sourceLabel(source) {
  switch (source) {
    case 'topup':
      return 'Wallet top-up';
    case 'admin_credit':
      return 'Credit from support';
    case 'admin_debit':
      return 'Adjustment by support';
    case 'booking_payment':
      return 'Booking payment';
    case 'booking_refund':
      return 'Booking refund';
    case 'booking_no_drivers_refund':
      return 'Refund (no driver by ride time)';
    case 'waiting_charge':
      return 'Waiting charge';
    case 'waiting_buffer_refund':
      return 'Waiting buffer refund';
    case 'booking_extension_payment':
      return 'Extension payment';
    case 'cancellation_fee_waived':
      return 'Cancellation fee waived';
    case 'referral_reward':
      return 'Referral reward';
    default:
      return source ? String(source).replace(/_/g, ' ') : 'Transaction';
  }
}

function statusLabel(status) {
  if (!status) return '';
  if (status === 'cancelled') return 'Cancelled';
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default WalletPage;
