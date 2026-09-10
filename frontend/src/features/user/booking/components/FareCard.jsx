import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import Card from '../../../../components/Card';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';
import { isOutstationV2Pricing } from '../../../../constants/outstationPricing.js';
import { formatOutstationDurationLabel } from '../../../../utils/outstationDurationBilling.js';

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
  if (isOutstationV2Pricing(bd)) {
    return buildOutstationV2Rows(bd);
  }
  return buildOutstationV1Rows(bd);
}

function buildOutstationV2Rows(bd) {
  const billableDays = Number(bd.billableFullDays ?? bd.days) || 1;
  const extraHours = Number(bd.billableExtraHours) || 0;
  const extraRate = Number(bd.extraHourCharge) || 0;
  const nights = Number(bd.billableNights ?? bd.nights) || 0;
  const dailyRate = Number(bd.dailyRate) || 0;
  const foodPerDay = Number(bd.foodAllowancePerDay) || 0;
  const stayPerNight = Number(bd.stayAllowancePerNight) || 0;
  const foodTotal = Number(bd.foodAllowanceTotal) || 0;
  const stayTotal = Number(bd.stayAllowanceTotal) || 0;
  const foodDays = Number(bd.foodServiceDays ?? billableDays) || billableDays;
  const extraLabel =
    extraHours % 1 === 0
      ? `${extraHours}h`
      : `${extraHours.toFixed(1)}h`;

  const rows = [];
  if (bd.durationMinutes > 0) {
    rows.push([
      'Trip duration',
      formatOutstationDurationLabel(bd.durationMinutes),
      false,
      true,
    ]);
  }
  rows.push(
    [
      billableDays === 1 && extraHours <= 0
        ? `Base service (${rupees(dailyRate)}/day min.)`
        : `Base service ${rupees(dailyRate)} \u00d7 ${billableDays} day${billableDays === 1 ? '' : 's'}`,
      bd.dailyRateTotal,
    ],
    [
      `Extra time ${extraLabel} \u00d7 ${rupees(extraRate)}`,
      bd.extraHourTotal,
      !(extraHours > 0 && Number(bd.extraHourTotal) > 0),
    ],
    [
      `Driver food ${rupees(foodPerDay)} \u00d7 ${foodDays} day${foodDays === 1 ? '' : 's'}`,
      foodTotal,
      !(foodPerDay > 0 && foodTotal > 0),
    ],
    [
      `Driver stay ${rupees(stayPerNight)} \u00d7 ${nights} night${nights === 1 ? '' : 's'}`,
      stayTotal,
      !(nights > 0 && stayPerNight > 0 && stayTotal > 0),
    ],
  );
  return rows;
}

function buildOutstationV1Rows(bd) {
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

const FareCard = ({
  estimate,
  estimating = false,
  error = null,
  dense = false,
  footnote = null,
  title = 'Fare breakdown',
  bare = false,
}) => {
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
      .filter(([, value, suppress, isLabel]) => {
        if (isLabel) return true;
        return !suppress && Number(value || 0) !== 0;
      })
      .map(([label, value, , isLabel]) => [
        label,
        isLabel ? value : Number(value) || 0,
        isLabel,
      ]);
  }, [breakdown, isOutstation]);

  const detailRowsDisplay = detailRows.filter(([, , isLabel]) => !isLabel);
  const durationLabelRow = detailRows.find(([, , isLabel]) => isLabel);

  const subtotal = Number(breakdown.subtotal) || 0;
  const couponDiscount = Number(breakdown.couponDiscount) || 0;
  const netSubtotal = Number(breakdown.netSubtotal) || Math.max(0, subtotal - couponDiscount);
  const serviceCharge = Number(breakdown.serviceCharge) || 0;
  const gst = Number(breakdown.gstAmount) || 0;
  const subscriptionDiscount = Number(breakdown.subscriptionDiscount) || 0;
  const fareTotal = breakdown.totalPayable || 0;
  const grandTotal = Math.round((fareTotal + bufferRupees) * 100) / 100;
  const hasDiscounts = couponDiscount > 0 || subscriptionDiscount > 0;

  const body = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-text tracking-tight">{title}</h3>
          {isOutstation && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark">
              Outstation
            </span>
          )}
        </div>
        {estimating && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-dark" />
            <span>Updating fare…</span>
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <span>{error}</span>
        </div>
      )}

      {!error && (
        <div className="space-y-2.5">
          {/* Main Trip Line Items */}
          <div className="rounded-xl bg-gray-50/70 p-3 space-y-2 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">
              Base &amp; Service Charges
            </p>
            {durationLabelRow && (
              <div className="flex items-center justify-between pb-1 border-b border-gray-200/60">
                <span className="text-text-secondary">{durationLabelRow[0]}</span>
                <span className="font-medium text-text">{durationLabelRow[1]}</span>
              </div>
            )}
            {detailRowsDisplay.map(([label, amount]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-text-secondary">{label}</span>
                <span className={`font-semibold ${amount < 0 ? 'text-emerald-600' : 'text-text'}`}>
                  {rupees(amount)}
                </span>
              </div>
            ))}
          </div>

          {/* Discounts section if applied */}
          {hasDiscounts && (
            <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 p-3 space-y-1.5 text-xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 mb-1">
                Discounts &amp; Savings
              </p>
              {couponDiscount > 0 && (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>Coupon discount</span>
                  <span className="font-bold">{rupees(-couponDiscount)}</span>
                </div>
              )}
              {subscriptionDiscount > 0 && (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>Subscription discount</span>
                  <span className="font-bold">{rupees(-subscriptionDiscount)}</span>
                </div>
              )}
            </div>
          )}

          {/* Taxes & Platform Fees */}
          {(serviceCharge > 0 || gst > 0) && (
            <div className="space-y-1.5 px-1 text-xs">
              {serviceCharge > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">
                    Platform fee
                    {breakdown.platformFeeType === 'flat'
                      ? ' (flat)'
                      : (breakdown.platformFeeAmount ?? breakdown.serviceChargePercent) > 0 && (
                          <span className="ml-1 text-[10px] text-text-muted">
                            ({breakdown.platformFeeAmount ?? breakdown.serviceChargePercent}%)
                          </span>
                        )}
                  </span>
                  <span className="text-text font-medium">{rupees(serviceCharge)}</span>
                </div>
              )}
              {gst > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">
                    GST
                    {breakdown.gstPercent > 0 && (
                      <span className="ml-1 text-[10px] text-text-muted">
                        ({breakdown.gstPercent}%)
                      </span>
                    )}
                  </span>
                  <span className="text-text font-medium">{rupees(gst)}</span>
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-border-light my-1" />

          {/* Fare Total Row */}
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-xs font-semibold text-text">Fare Total</p>
              <p className="text-[10px] text-text-muted">Direct fare charged to wallet</p>
            </div>
            <span className="text-base font-bold text-text">{rupees(fareTotal)}</span>
          </div>

          {/* Waiting Reserve Buffer */}
          {bufferRupees > 0 && (
            <div className="rounded-xl bg-amber-50/70 border border-amber-200/80 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-amber-950">Waiting Reserve</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                    Refundable Hold
                  </span>
                </div>
                <span className="font-bold text-amber-950">₹{bufferRupees}</span>
              </div>
              <p className="text-[11px] text-amber-900/90 leading-snug">
                Held for extra waiting beyond {buffer?.freeWaitingMinutes || 0} min. Unused amount is automatically unlocked after trip completion.
              </p>
              <div className="pt-1.5 border-t border-amber-200/60 flex items-center justify-between">
                <span className="font-bold text-amber-950">Total Wallet Amount Needed</span>
                <span className="text-base font-extrabold text-amber-950">₹{grandTotal}</span>
              </div>
            </div>
          )}

          {footnote && <p className="text-[11px] text-text-muted px-1">{footnote}</p>}
        </div>
      )}
    </div>
  );

  if (bare) return <div>{body}</div>;
  return <Card>{body}</Card>;
};

export default FareCard;
