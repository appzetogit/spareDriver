import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import Card from '../../../../components/Card';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';

/**
 * Renders the line-by-line fare breakdown returned by `/auth/bookings/estimate`.
 *
 * Two row sets are derived from the breakdown — one for HOURLY, one for
 * OUTSTATION — so the customer sees the same per-multiplier detail the
 * admin sees in the live preview (Daily rate \u00d7 N days, Night halt
 * \u00d7 N nights, Driver food \u00d7 N days, etc.). Field names come
 * straight from `calculateHourlyFare` / `calculateOutstationFare`.
 *
 *   props:
 *     - estimate       full /estimate response (we read `estimate.fareBreakdown`)
 *     - estimating     boolean → shows a spinner next to the title
 *     - error          string → renders the error banner
 *     - dense          boolean → tighter spacing (used inline on slab page)
 *     - footnote       optional string under the total (e.g. "incl. food")
 */
function rupees(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  return `${sign}\u20B9${Math.abs(v)}`;
}

function buildHourlyRows(bd) {
  return [
    ['Base fare', bd.packagePrice || 0],
    [`Extra hours (${bd.extraHours || 0})`, bd.extraHourCharge, !(bd.extraHours > 0)],
    ['Waiting', bd.waitingCharge],
    ['Night charge', bd.nightCharge],
    ['Stay allowance', bd.stayAllowance],
    ['Food allowance', bd.foodAllowance],
    ['Toll & parking', bd.tollParking],
  ];
}

function buildOutstationRows(bd) {
  const days = Number(bd.days) || 1;
  const nights = Number(bd.nights) || 0;
  const dailyRate = Number(bd.dailyRate) || 0;
  const foodPerDay = Number(bd.foodAllowancePerDay) || 0;
  const stayPerNight = Number(bd.stayAllowancePerNight) || 0;
  const foodTotal = Number(bd.foodAllowanceTotal) || 0;
  const stayTotal = Number(bd.stayAllowanceTotal) || 0;
  const legacyAllowancePerNight = Number(bd.allowancePerNight) || 0;
  const legacyAllowanceTotal = Number(bd.legacyAllowanceTotal) || 0;
  return [
    [
      `Daily rate ${rupees(dailyRate)} \u00d7 ${days} day${days === 1 ? '' : 's'}`,
      bd.dailyRateTotal,
    ],
    // Per-day food (new model). Suppress when admin hasn't configured
    // it or the customer opted to feed the driver themselves.
    [
      `Driver food ${rupees(foodPerDay)} \u00d7 ${days} day${days === 1 ? '' : 's'}`,
      foodTotal,
      !(foodPerDay > 0 && foodTotal > 0),
    ],
    // Per-night stay (new model). Same suppression rules.
    [
      `Driver stay ${rupees(stayPerNight)} \u00d7 ${nights} night${nights === 1 ? '' : 's'}`,
      stayTotal,
      !(nights > 0 && stayPerNight > 0 && stayTotal > 0),
    ],
    // Legacy combined allowance — only renders when the pricing doc
    // hasn't migrated to the split fields (both new fields are 0).
    [
      `Driver allowance ${rupees(legacyAllowancePerNight)} \u00d7 ${nights} night${nights === 1 ? '' : 's'}`,
      legacyAllowanceTotal,
      !(
        nights > 0 &&
        legacyAllowancePerNight > 0 &&
        legacyAllowanceTotal > 0
      ),
    ],
  ];
}

const FareCard = ({ estimate, estimating = false, error = null, dense = false, footnote = null, title = 'Fare estimate' }) => {
  // `breakdown` is wrapped in useMemo so the identity is stable
  // whenever the estimate hasn't changed — otherwise the
  // `useMemo(detailRows)` below would re-fire every render
  // because the `|| {}` fallback returns a fresh object each time.
  const breakdown = useMemo(
    () => estimate?.fareBreakdown || {},
    [estimate],
  );
  const buffer = estimate?.waitingBuffer || null;
  const bufferRupees = Number(buffer?.bufferRupees || 0);
  const isOutstation =
    (estimate?.serviceType || breakdown.serviceType) === SERVICE_TYPES.OUTSTATION;

  const detailRows = useMemo(() => {
    const raw = isOutstation
      ? buildOutstationRows(breakdown)
      : buildHourlyRows(breakdown);
    return raw
      .filter(([, value, suppress]) => !suppress && Number(value || 0) !== 0)
      .map(([label, value]) => [label, Number(value) || 0]);
  }, [breakdown, isOutstation]);

  const subtotal = Number(breakdown.subtotal) || 0;
  const couponDiscount = Number(breakdown.couponDiscount) || 0;
  const netSubtotal = Number(breakdown.netSubtotal) || Math.max(0, subtotal - couponDiscount);
  const serviceCharge = Number(breakdown.serviceCharge) || 0;
  const gst = Number(breakdown.gstAmount) || 0;
  const subscriptionDiscount = Number(breakdown.subscriptionDiscount) || 0;
  const fareTotal = breakdown.totalPayable || 0;
  const grandTotal = Math.round((fareTotal + bufferRupees) * 100) / 100;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {estimating && <Loader2 className="w-4 h-4 animate-spin text-text-muted" />}
      </div>

      {error && (
        <div className="text-xs text-danger bg-danger/10 rounded-xl px-3 py-2">{error}</div>
      )}

      {!error && (
        <div className={dense ? 'space-y-1.5' : 'space-y-2.5'}>
          {/* Per-line breakdown with explicit multipliers (\u00d7 days,
              \u00d7 nights, etc.) so the customer can audit every rupee. */}
          {detailRows.map(([label, amount]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{label}</span>
              <span className={`text-sm ${amount < 0 ? 'text-success' : 'text-text'}`}>
                {rupees(amount)}
              </span>
            </div>
          ))}
          {detailRows.length > 0 && (
            <div className="h-px bg-border-light my-1" />
          )}
          {/* Pre-platform subtotal — the boundary between trip costs and
              platform-side charges. Highlighted on outstation where the
              detail is rich enough to be worth a separator. */}
          {subtotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Ride fare</span>
              <span className="text-sm text-text">{rupees(subtotal)}</span>
            </div>
          )}
          {couponDiscount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Coupon discount</span>
              <span className="text-sm text-success">{rupees(-couponDiscount)}</span>
            </div>
          )}
          {couponDiscount > 0 && netSubtotal >= 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Net ride subtotal</span>
              <span className="text-sm text-text">{rupees(netSubtotal)}</span>
            </div>
          )}
          {serviceCharge > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">
                Service charge
                {breakdown.serviceChargePercent > 0 && (
                  <span className="ml-1 text-[10px] text-text-muted">
                    ({breakdown.serviceChargePercent}%)
                  </span>
                )}
              </span>
              <span className="text-sm text-text">{rupees(serviceCharge)}</span>
            </div>
          )}
          {gst > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">
                GST
                {breakdown.gstPercent > 0 && (
                  <span className="ml-1 text-[10px] text-text-muted">
                    ({breakdown.gstPercent}%)
                  </span>
                )}
              </span>
              <span className="text-sm text-text">{rupees(gst)}</span>
            </div>
          )}
          {subscriptionDiscount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">
                Subscription discount
              </span>
              <span className="text-sm text-success">
                {rupees(-subscriptionDiscount)}
              </span>
            </div>
          )}
          <div className="h-px bg-border-light my-1" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text">Fare total</span>
            <span className="text-base font-semibold text-text">{rupees(fareTotal)}</span>
          </div>
          {/*
            Pre-collected waiting buffer. Shown as a separate row so the
            user understands the difference between the fare and the
            refundable hold. Unused portion is auto-credited to the
            wallet after the trip ends (settleWaitingBuffer in the
            backend).
          */}
          {bufferRupees > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">
                  Waiting reserve
                  <span className="ml-1 text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">
                    Held, not charged
                  </span>
                </span>
                <span className="text-sm text-text">₹{bufferRupees}</span>
              </div>
              <p className="text-[11px] text-text-muted -mt-1">
                ₹{bufferRupees} stays in your wallet and can&rsquo;t be
                spent elsewhere — used only if the driver waits beyond{' '}
                {buffer?.freeWaitingMinutes || 0} min at pickup
                (₹{buffer?.chargePerMinute || 0}/min, up to{' '}
                {buffer?.maxBillableMinutes || 0} min). Anything not used
                is unlocked after the trip.
              </p>
              <div className="h-px bg-border-light my-1" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text">
                  Wallet needed
                </span>
                <span className="text-base font-bold text-text">₹{grandTotal}</span>
              </div>
              <p className="text-[11px] text-text-muted -mt-1">
                Charged now: ₹{fareTotal}. Reserved: ₹{bufferRupees}.
              </p>
            </>
          )}
          {bufferRupees <= 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-text">Total</span>
              <span className="text-lg font-bold text-text">{rupees(fareTotal)}</span>
            </div>
          )}
          {/*
            Outstation toll/parking is intentionally NOT shown here
            anymore — it's surfaced as a confirmation popup the
            customer must acknowledge when tapping the Pay CTA on
            the review screen, instead of a passive footnote that's
            easy to miss.
          */}
          {footnote && <p className="text-[11px] text-text-muted">{footnote}</p>}
        </div>
      )}
    </Card>
  );
};

export default FareCard;
