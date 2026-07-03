import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import BottomSheet from '../../../../components/BottomSheet';
import {
  Loader2,
  AlertCircle,
  Wallet,
  Inbox,
  Car,
  XCircle,
  AlertOctagon,
  Clock4,
  TimerReset,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import {
  useDriverEarningsStore,
  useDriverEarningsLedgerStore,
} from '../../../../store/driver/useDriverTripsStore';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { formatCurrency } from '../../../../utils/formatters';
import { MIN_DRIVER_WALLET_BALANCE } from '../../../../constants/withdrawal';
import DriverScreenShell from '../../components/DriverScreenShell';

const EMPTY = { earnings: 0, trips: 0 };

/**
 * Driver earnings dashboard.
 *
 *   Sticky header  → title + this-week hero
 *   Scrolling body → bar chart · today/week/month stats · payout CTA · recent payouts
 *
 * No mock fallbacks: if the API hasn't loaded yet we show a skeleton; if
 * it errors we surface a retry. Never fake numbers in an earnings UI.
 */
const EarningsPage = () => {
  const navigate = useNavigate();
  const cacheKey = buildCacheKey('driver-earnings', {});
  const { data, loading, error, refetch } = useCachedQuery(
    useDriverEarningsStore,
    cacheKey,
    {},
  );

  // Driver profile carries the live wallet balance — the header hero
  // shows this (and the "withdraw" CTA implicitly anchors on it)
  // instead of the weekly-earnings number, which is already covered by
  // the stat tiles below.
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: profile } = useCachedQuery(useDriverProfileStore, profileKey, {});
  const wallet = profile?.wallet || {};
  const walletBalance = Number(wallet.balance) || 0;
  const lifetimeEarnings = Number(wallet.totalEarnings) || 0;
  const totalWithdrawn = Number(wallet.totalWithdrawn) || 0;

  // Ledger: paginated feed of every earning (trip + cancellation share).
  const ledgerRows = useDriverEarningsLedgerStore((s) => s.rows);
  const ledgerTotals = useDriverEarningsLedgerStore((s) => s.totals);
  const ledgerPage = useDriverEarningsLedgerStore((s) => s.page);
  const ledgerLimit = useDriverEarningsLedgerStore((s) => s.limit);
  const ledgerHasMore = useDriverEarningsLedgerStore((s) => s.hasMore);
  const ledgerLoading = useDriverEarningsLedgerStore((s) => s.loading);
  const ledgerFetched = useDriverEarningsLedgerStore((s) => s.fetched);
  const fetchLedger = useDriverEarningsLedgerStore((s) => s.fetch);

  useEffect(() => {
    fetchLedger({ page: 1, limit: 20 }).catch(() => {});
  }, [fetchLedger]);

  const summary = data?.summary || {};
  const today = summary.today || EMPTY;
  const week = summary.week || EMPTY;
  const month = summary.month || EMPTY;
  const buckets = data?.daily?.buckets || [];
  const peak = data?.daily?.peak || 0;

  const stats = useMemo(
    () => [
      { label: 'Today', amount: formatCurrency(today.earnings), trips: today.trips },
      { label: 'This Week', amount: formatCurrency(week.earnings), trips: week.trips },
      { label: 'This Month', amount: formatCurrency(month.earnings), trips: month.trips },
    ],
    [today, week, month],
  );

  const onLoadMore = () => {
    if (ledgerLoading || !ledgerHasMore) return;
    fetchLedger({ page: ledgerPage + 1, limit: ledgerLimit, append: true }).catch(
      () => {},
    );
  };

  const [selectedLedgerRow, setSelectedLedgerRow] = useState(null);

  return (
    <DriverScreenShell
      header={
        <header className="bg-dark px-4 pt-4 pb-5 rounded-b-3xl">
          <h1 className="text-lg font-bold text-white mb-3">Earnings</h1>
          <Card className="!bg-white/10 backdrop-blur-sm !shadow-none border-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-white/70 uppercase tracking-wide font-semibold">
                  Wallet balance
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-white">
                    {formatCurrency(walletBalance)}
                  </span>
                </div>
                <p className="text-[11px] text-white/70 mt-1">
                  Available to withdraw
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/driver/withdraw')}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-dark text-xs font-semibold hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={walletBalance <= MIN_DRIVER_WALLET_BALANCE}
              >
                <Wallet className="w-3.5 h-3.5" />
                Withdraw
              </button>
            </div>
            {(lifetimeEarnings > 0 || totalWithdrawn > 0) && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10 text-[11px] text-white/80">
                <span>
                  Lifetime{' '}
                  <span className="font-semibold text-white">
                    {formatCurrency(lifetimeEarnings)}
                  </span>
                </span>
                {totalWithdrawn > 0 && (
                  <>
                    <span className="text-white/30">&middot;</span>
                    <span>
                      Withdrawn{' '}
                      <span className="font-semibold text-white">
                        {formatCurrency(totalWithdrawn)}
                      </span>
                    </span>
                  </>
                )}
              </div>
            )}
          </Card>
        </header>
      }
      bodyClassName="p-4 -mt-2 pb-8 space-y-4"
    >
      {loading && !data && (
        <Card className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
        </Card>
      )}

      {error && (
        <Card className="border-l-4 border-l-danger">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-text">Couldn't load earnings</p>
              <p className="text-xs text-text-muted mt-0.5">{error}</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => refetch()}
              >
                Retry
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!!data && (
        <>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-text-muted font-semibold uppercase tracking-wide">
                Last 7 days
              </p>
              {peak > 0 && (
                <span className="text-[11px] text-text-muted">
                  Peak {formatCurrency(peak)}
                </span>
              )}
            </div>
            <EarningsBarChart buckets={buckets} peak={peak} />
          </Card>

          <Card padding="p-0">
            <ul className="divide-y divide-border-light">
              {stats.map((stat) => (
                <li
                  key={stat.label}
                  className="flex items-center justify-between px-4 py-3.5"
                >
                  <div>
                    <p className="text-xs text-text-muted font-semibold uppercase tracking-wide">
                      {stat.label}
                    </p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {stat.trips} trip{stat.trips === 1 ? '' : 's'}
                    </p>
                  </div>
                  <p className="text-base font-bold text-text">{stat.amount}</p>
                </li>
              ))}
            </ul>
          </Card>

          <EarningsBreakdown totals={ledgerTotals} />

          <Button
            fullWidth
            variant="driver"
            icon={Wallet}
            onClick={() => navigate('/driver/payments')}
          >
            View payout history
          </Button>

          <AllEarningsFeed
            rows={ledgerRows}
            loading={ledgerLoading}
            fetched={ledgerFetched}
            hasMore={ledgerHasMore}
            onLoadMore={onLoadMore}
            onSelect={setSelectedLedgerRow}
          />
        </>
      )}

      <LedgerBreakdownSheet
        row={selectedLedgerRow}
        onClose={() => setSelectedLedgerRow(null)}
      />
    </DriverScreenShell>
  );
};

/* ------------------------------------------------------------------ */
/* Earnings breakdown (trips vs. cancellation shares)                  */
/* ------------------------------------------------------------------ */

function EarningsBreakdown({ totals }) {
  const trip = Number(totals?.tripEarnings) || 0;
  const cancellation = Number(totals?.cancellationEarnings) || 0;
  const subscription = Number(totals?.subscriptionEarnings) || 0;
  const penalty = Number(totals?.penaltyDeductions) || 0;
  const netEarnings =
    Number(totals?.netEarnings) || trip + cancellation + subscription - penalty;
  const lifetimeCredit = trip + cancellation + subscription;
  if (lifetimeCredit <= 0 && penalty <= 0) return null;
  return (
    <Card padding="p-0">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <p className="text-xs text-text-muted font-semibold uppercase tracking-wide">
          Net earnings
        </p>
        <p
          className={`text-base font-bold ${
            netEarnings < 0 ? 'text-rose-700' : 'text-text'
          }`}
        >
          {formatCurrency(netEarnings)}
        </p>
      </div>
      <ul className="divide-y divide-border-light">
        <BreakdownRow
          icon={Car}
          tone="text-primary bg-primary/10"
          label="Trip payouts"
          subLabel={`${Number(totals?.tripCount) || 0} trip${
            (totals?.tripCount || 0) === 1 ? '' : 's'
          }`}
          amount={trip}
          direction="credit"
        />
        <BreakdownRow
          icon={XCircle}
          tone="text-amber-600 bg-amber-100"
          label="Cancellation shares"
          subLabel={`${Number(totals?.cancellationCount) || 0} cancel${
            (totals?.cancellationCount || 0) === 1 ? '' : 's'
          }`}
          amount={cancellation}
          direction="credit"
        />
        {subscription > 0 && (
          <BreakdownRow
            icon={Sparkles}
            tone="text-violet-700 bg-violet-100"
            label="Subscription payouts"
            subLabel={`${Number(totals?.subscriptionCount) || 0} payout${
              (totals?.subscriptionCount || 0) === 1 ? '' : 's'
            }`}
            amount={subscription}
            direction="credit"
          />
        )}
        {penalty > 0 && (
          <BreakdownRow
            icon={AlertOctagon}
            tone="text-rose-700 bg-rose-100"
            label="Cancel penalties"
            subLabel={`${Number(totals?.penaltyCount) || 0} penalt${
              (totals?.penaltyCount || 0) === 1 ? 'y' : 'ies'
            }`}
            amount={penalty}
            direction="debit"
          />
        )}
      </ul>
    </Card>
  );
}

function BreakdownRow({ icon: Icon, tone, label, subLabel, amount, direction = 'credit' }) {
  const isDebit = direction === 'debit';
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">{label}</p>
        <p className="text-[11px] text-text-muted">{subLabel}</p>
      </div>
      <p
        className={`text-sm font-bold shrink-0 ${
          isDebit ? 'text-rose-700' : 'text-text'
        }`}
      >
        {isDebit ? '\u2212 ' : ''}
        {formatCurrency(amount)}
      </p>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* All-earnings feed (paginated ledger)                                */
/* ------------------------------------------------------------------ */

/**
 * Unified, paginated feed of every earning the driver has ever
 * received: trip payouts AND cancellation shares (when a user cancels
 * and the admin policy splits the fee with the driver).
 *
 * Pagination is "Load more" — same UX as the user wallet. Replacing the
 * old "last 10 completed trips" tile so drivers can scroll their full
 * history without leaving the page.
 */
function AllEarningsFeed({ rows, loading, fetched, hasMore, onLoadMore, onSelect }) {
  const isEmpty = fetched && rows.length === 0;
  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs uppercase tracking-wide font-semibold text-text-muted">
          All earnings
        </p>
        {loading && rows.length > 0 && (
          <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
        )}
      </div>

      {!fetched && loading ? (
        <Card>
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
          </div>
        </Card>
      ) : isEmpty ? (
        <Card className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Inbox className="w-6 h-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-text">No earnings yet</p>
          <p className="text-xs text-text-muted mt-1 max-w-[240px]">
            Completed trips and your share of cancellation fees show up here.
          </p>
        </Card>
      ) : (
        <>
          <Card padding="p-0" className="divide-y divide-border-light overflow-hidden">
            {rows.map((row) => (
              <EarningsLedgerRow
                key={row._id}
                row={row}
                onSelect={onSelect}
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
    </section>
  );
}

function EarningsLedgerRow({ row, onSelect }) {
  const isPenalty = row.kind === 'penalty';
  const isCancellation = row.kind === 'cancellation_share';
  const isSubscription = row.kind === 'subscription_payout';
  const Icon = isPenalty
    ? AlertOctagon
    : isCancellation
      ? XCircle
      : isSubscription
        ? Sparkles
        : Car;
  const tone = isPenalty
    ? 'text-rose-700 bg-rose-100'
    : isCancellation
      ? 'text-amber-600 bg-amber-100'
      : isSubscription
        ? 'text-violet-700 bg-violet-100'
        : 'text-success bg-success/10';
  const title = isPenalty
    ? 'Cancellation penalty'
    : isCancellation
      ? 'Cancellation share'
      : isSubscription
        ? 'Subscription payout'
        : 'Trip earning';
  const subline = [
    row.bookingNumber ? `#${row.bookingNumber}` : null,
    isSubscription ? row.meta?.planName || 'Dedicated subscription' : null,
    row.serviceType ? labelForService(row.serviceType) : null,
    formatLedgerDate(row.occurredAt),
  ]
    .filter(Boolean)
    .join(' \u00B7 ');

  const sign = row.direction === 'debit' ? '\u2212' : '+';
  const amountTone =
    row.direction === 'debit' ? 'text-rose-700' : 'text-success';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(row)}
      className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 transition-colors text-left"
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">{title}</p>
        <p className="text-[11px] text-text-muted truncate">{subline}</p>
      </div>
      <p className={`text-sm font-bold ${amountTone} shrink-0`}>
        {sign}
        {formatCurrency(row.amountRupees)}
      </p>
      <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
    </button>
  );
}

function labelForService(serviceType) {
  switch (serviceType) {
    case 'hourly':
      return 'Hourly';
    case 'outstation':
      return 'Outstation';
    case 'oneway':
      return 'One-way';
    case 'round_trip':
      return 'Round trip';
    default:
      return serviceType;
  }
}

function formatLedgerDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* Bar chart                                                           */
/* ------------------------------------------------------------------ */

function EarningsBarChart({ buckets, peak }) {
  const safePeak = peak > 0 ? peak : 1;
  return (
    <div className="flex items-stretch justify-between gap-2.5 h-36 mt-2">
      {buckets.map((bucket) => {
        const hasEarnings = bucket.earnings > 0;
        const heightPct = hasEarnings ? Math.max(6, Math.round((bucket.earnings / safePeak) * 100)) : 0;
        const isPeak = hasEarnings && bucket.earnings === peak;
        return (
          <div
            key={bucket.date}
            className="flex-1 flex flex-col items-center min-w-0 h-full justify-between"
          >
            {/* Value Label */}
            <span className="text-[9px] font-bold text-slate-500 h-4 flex items-center shrink-0">
              {hasEarnings ? `₹${Math.round(bucket.earnings)}` : '—'}
            </span>
            
            {/* Bar Track & Fill */}
            <div className="flex-1 w-3 bg-slate-100 rounded-full relative flex items-end overflow-hidden border border-slate-100/30">
              {hasEarnings && (
                <div
                  className={`w-full rounded-full transition-all duration-500 ease-out ${
                    isPeak 
                      ? 'bg-primary shadow-sm shadow-primary/20' 
                      : 'bg-slate-300'
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
              )}
            </div>
            
            {/* Date Label */}
            <span className="text-[10px] font-semibold text-slate-400 mt-2 shrink-0 capitalize">
              {bucket.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Breakdown sheet                                                     */
/* ------------------------------------------------------------------ */

/**
 * Bottom sheet that opens when a driver taps any ledger row. Shows the
 * source-specific breakdown so the driver can see exactly how the
 * amount on that row was made up — fare share + waiting + extension
 * uplift for trip rows, fee + share% for cancellation rows, and the
 * cancel reason for penalty rows.
 *
 * Trip-row components come pre-computed on the row's `meta` (see
 * `listDriverEarningsLedgerService` projection) so there's no extra
 * round-trip on tap.
 */
function LedgerBreakdownSheet({ row, onClose }) {
  const isOpen = !!row;
  const meta = row?.meta || {};

  let title = 'Earnings breakdown';
  let Icon = Car;
  let tone = 'text-success bg-success/10';
  if (row?.kind === 'penalty') {
    title = 'Cancellation penalty';
    Icon = AlertOctagon;
    tone = 'text-rose-700 bg-rose-100';
  } else if (row?.kind === 'cancellation_share') {
    title = 'Cancellation share';
    Icon = XCircle;
    tone = 'text-amber-600 bg-amber-100';
  } else if (row?.kind === 'subscription_payout') {
    title = 'Subscription payout';
    Icon = Sparkles;
    tone = 'text-violet-700 bg-violet-100';
  } else if (row?.kind === 'trip') {
    title = 'Trip earning';
  }

  const direction = row?.direction === 'debit' ? 'debit' : 'credit';
  const sign = direction === 'debit' ? '\u2212' : '+';
  const amountTone = direction === 'debit' ? 'text-rose-700' : 'text-success';

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      showHandle
    >
      {row && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${tone}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text truncate">
                {row.bookingNumber
                  ? `#${row.bookingNumber}`
                  : row.meta?.planName || title}
              </p>
              <p className="text-[11px] text-text-muted truncate">
                {[
                  row.serviceType ? labelForService(row.serviceType) : null,
                  formatLedgerDate(row.occurredAt),
                ]
                  .filter(Boolean)
                  .join(' \u00B7 ')}
              </p>
            </div>
            <p className={`text-base font-bold ${amountTone} shrink-0`}>
              {sign}
              {formatCurrency(row.amountRupees)}
            </p>
          </div>

          {row.kind === 'trip' && <TripBreakdownBlock meta={meta} row={row} />}
          {row.kind === 'cancellation_share' && (
            <CancellationShareBlock meta={meta} row={row} />
          )}
          {row.kind === 'subscription_payout' && (
            <SubscriptionPayoutBlock meta={meta} row={row} />
          )}
          {row.kind === 'penalty' && <PenaltyBlock meta={meta} row={row} />}
        </div>
      )}
    </BottomSheet>
  );
}

function TripBreakdownBlock({ meta, row }) {
  const fareEarning = Number(meta.fareEarning) || 0;
  const waitingCharge = Number(meta.waitingChargeRupees) || 0;
  const waitingMinutes = Number(meta.waitingMinutes) || 0;
  const waitingNoShow = !!meta.waitingNoShow;
  const extensionsCount = Number(meta.extensionsCount) || 0;
  const extensionHours = Number(meta.extensionAdditionalHours) || 0;
  const extensionDriverEarning = Number(meta.extensionDriverEarning) || 0;
  const baseFare = Math.max(0, fareEarning - extensionDriverEarning);

  return (
    <div className="bg-gray-50 rounded-2xl divide-y divide-border-light">
      <BreakdownLine
        icon={Car}
        tone="text-emerald-700 bg-emerald-100"
        label="Fare share"
        sublabel="Daily rate after platform commission"
        amount={baseFare}
      />
      {extensionsCount > 0 && (
        <BreakdownLine
          icon={TimerReset}
          tone="text-indigo-700 bg-indigo-100"
          label={`Extensions \u00B7 +${extensionHours}h`}
          sublabel={`${extensionsCount} paid extension${
            extensionsCount === 1 ? '' : 's'
          }`}
          amount={extensionDriverEarning}
        />
      )}
      {waitingCharge > 0 && (
        <BreakdownLine
          icon={Clock4}
          tone="text-amber-700 bg-amber-100"
          label="Waiting charge"
          sublabel={
            waitingNoShow
              ? 'Customer no-show \u2014 auto-billed'
              : `${waitingMinutes} billable min \u00B7 100% to you`
          }
          amount={waitingCharge}
        />
      )}
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-semibold text-text">Total credited</p>
        <p className="text-base font-bold text-success">
          {formatCurrency(row.amountRupees)}
        </p>
      </div>
    </div>
  );
}

function CancellationShareBlock({ meta, row }) {
  const feeCharged = Number(meta.feeCharged) || 0;
  const cancelledBy = meta.cancelledBy ? humanise(meta.cancelledBy) : '';
  const reason = meta.reason ? humanise(meta.reason) : '';
  return (
    <div className="bg-gray-50 rounded-2xl divide-y divide-border-light">
      {feeCharged > 0 && (
        <BreakdownLine
          icon={XCircle}
          tone="text-amber-700 bg-amber-100"
          label="Fee charged to customer"
          sublabel="Split between you and the platform"
          amount={feeCharged}
        />
      )}
      <BreakdownLine
        icon={Wallet}
        tone="text-emerald-700 bg-emerald-100"
        label="Your share"
        sublabel="Credited to your wallet"
        amount={row.amountRupees}
      />
      {(cancelledBy || reason) && (
        <div className="px-4 py-3 text-xs text-text-muted space-y-1">
          {cancelledBy && (
            <p>
              <span className="text-text-secondary">Cancelled by:</span>{' '}
              {cancelledBy}
            </p>
          )}
          {reason && (
            <p>
              <span className="text-text-secondary">Reason:</span> {reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SubscriptionPayoutBlock({ meta, row }) {
  const workingDays = Number(meta.workingDays) || 0;
  return (
    <div className="bg-gray-50 rounded-2xl divide-y divide-border-light">
      <BreakdownLine
        icon={Sparkles}
        tone="text-violet-700 bg-violet-100"
        label="Subscription driver share"
        sublabel={meta.planName || 'Dedicated subscription'}
        amount={row.amountRupees}
      />
      {workingDays > 0 && (
        <div className="px-4 py-3 text-xs text-text-muted">
          <p>
            <span className="text-text-secondary">Working days covered:</span>{' '}
            {workingDays}
          </p>
        </div>
      )}
    </div>
  );
}

function PenaltyBlock({ meta, row }) {
  const reason = meta.reason ? humanise(meta.reason) : '';
  const bookingStatus = meta.bookingStatus ? humanise(meta.bookingStatus) : '';
  return (
    <div className="bg-gray-50 rounded-2xl divide-y divide-border-light">
      <BreakdownLine
        icon={AlertOctagon}
        tone="text-rose-700 bg-rose-100"
        label="Penalty deducted"
        sublabel="Out-of-grace cancellation"
        amount={row.amountRupees}
        direction="debit"
      />
      {(reason || bookingStatus) && (
        <div className="px-4 py-3 text-xs text-text-muted space-y-1">
          {reason && (
            <p>
              <span className="text-text-secondary">Reason:</span> {reason}
            </p>
          )}
          {bookingStatus && (
            <p>
              <span className="text-text-secondary">Cancelled at:</span>{' '}
              {bookingStatus}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BreakdownLine({
  icon: Icon,
  tone,
  label,
  sublabel,
  amount,
  direction = 'credit',
}) {
  const isDebit = direction === 'debit';
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
          <p className="text-[11px] text-text-muted truncate">{sublabel}</p>
        )}
      </div>
      <p
        className={`text-sm font-bold shrink-0 ${
          isDebit ? 'text-rose-700' : 'text-text'
        }`}
      >
        {isDebit ? '\u2212 ' : ''}
        {formatCurrency(amount)}
      </p>
    </div>
  );
}

function humanise(value) {
  if (!value) return '';
  return String(value).replace(/_/g, ' ');
}

export default EarningsPage;
