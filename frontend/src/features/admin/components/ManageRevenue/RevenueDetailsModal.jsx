import {
  Banknote,
  CircleSlash,
  TrendingUp,
  AlertOctagon,
  Wallet,
  Clock4,
  TimerReset,
} from 'lucide-react';
import AdminDetailModal from '../AdminDetailModal';
import Badge from '../../../../components/Badge';
import { formatExtensionHours } from '../../../../utils/formatters';

/**
 * Admin → Account → Revenue → row click → details popup.
 *
 * Renders the full meta payload for a single PlatformRevenue row so the
 * admin can see exactly which components made up the rupee total the
 * platform kept on that booking — including waiting charges (100% to
 * driver, surfaced for transparency) and any extension uplifts.
 *
 * The popup is dumb: it just shows what's on the row. The commission
 * row's `meta` is pre-baked by `buildCommissionRevenueMeta` so this
 * component never has to re-derive any math.
 */

const SOURCE_META = {
  commission: {
    label: 'Commission',
    variant: 'success',
    icon: TrendingUp,
    tone: 'text-emerald-700',
  },
  platform_fee: {
    label: 'Platform fee',
    variant: 'success',
    icon: Banknote,
    tone: 'text-emerald-700',
  },
  coupon_discount: {
    label: 'Coupon absorbed',
    variant: 'warning',
    icon: CircleSlash,
    tone: 'text-amber-700',
  },
  cancellation_fee: {
    label: 'Cancellation fee',
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

function humanise(s) {
  if (!s) return '';
  return String(s).replace(/_/g, ' ');
}

const RevenueDetailsModal = ({ isOpen, onClose, row }) => {
  if (!row) return null;
  const meta = row.meta || {};
  const sourceMeta = SOURCE_META[row.source] || {
    label: row.source,
    variant: 'muted',
    icon: Wallet,
    tone: 'text-slate-700',
  };
  const Icon = sourceMeta.icon;
  const customer = row.userId?.name || row.userId?.phone_no || '\u2014';
  const driver = row.driverId?.name || row.driverId?.phone_no || '\u2014';
  const customerPhone = row.userId?.phone_no || '';
  const driverPhone = row.driverId?.phone_no || '';

  return (
    <AdminDetailModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Revenue \u2014 ${sourceMeta.label}`}
      subtitle={
        row.bookingNumber
          ? `Booking ${row.bookingNumber}`
          : `Booking ${String(row.bookingId || '').slice(-8)}`
      }
      headerExtra={
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={sourceMeta.variant}>
                <span className="inline-flex items-center gap-1">
                  <Icon className="w-3 h-3" />
                  {sourceMeta.label}
                </span>
              </Badge>
              <span className="font-mono text-xs text-slate-500">
                {row.bookingNumber || `\u2026${String(row.bookingId || '').slice(-8)}`}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {formatDateTime(row.occurredAt || row.createdAt)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">
              {row.source === 'coupon_discount' ? 'Platform cost' : 'Platform kept'}
            </p>
            <p className={`text-2xl font-bold ${sourceMeta.tone}`}>
              {row.source === 'coupon_discount'
                ? formatCurrency(Math.abs(Number(row.amountRupees) || 0))
                : formatCurrency(row.amountRupees)}
            </p>
            {row.source === 'coupon_discount' && (
              <p className="text-[10px] text-amber-600 mt-0.5">Deducted from revenue</p>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <SectionCard title="Parties">
          <KV label="Customer" value={customer} hint={customerPhone || null} />
          <KV label="Driver" value={driver} hint={driverPhone || null} />
          <KV
            label="Service"
            value={row.serviceType ? humanise(row.serviceType) : '\u2014'}
          />
        </SectionCard>

        {row.source === 'commission' && (
          <CommissionBreakdown meta={meta} amount={row.amountRupees} />
        )}
        {row.source === 'platform_fee' && (
          <PlatformFeeBreakdown meta={meta} amount={row.amountRupees} />
        )}
        {row.source === 'coupon_discount' && (
          <CouponDiscountBreakdown meta={meta} amount={row.amountRupees} />
        )}
        {row.source === 'cancellation_fee' && (
          <CancellationBreakdown meta={meta} amount={row.amountRupees} />
        )}
        {row.source === 'driver_penalty' && (
          <DriverPenaltyBreakdown meta={meta} amount={row.amountRupees} />
        )}

        <SectionCard title="Audit">
          <KV
            label="Occurred at"
            value={formatDateTime(row.occurredAt || row.createdAt)}
          />
          <KV
            label="Written at"
            value={formatDateTime(row.createdAt)}
          />
          <KV
            label="Revenue ID"
            value={
              <span className="font-mono text-[11px] text-slate-500">
                {String(row._id || '')}
              </span>
            }
          />
        </SectionCard>
      </div>
    </AdminDetailModal>
  );
};

/* ---------- Source-specific breakdown blocks ---------- */

function CommissionBreakdown({ meta, amount }) {
  const {
    commissionPercent = 0,
    totalPayable = 0,
    subtotal = 0,
    netSubtotal = 0,
    couponCode = null,
    couponDiscount = 0,
    platformFee = 0,
    baseDriverEarning = 0,
    basePlatformCommission = 0,
    extensionsCount = 0,
    extensionAdditionalHours = 0,
    extensionFareDelta = 0,
    extensionDriverEarning = 0,
    extensionPlatformCommission = 0,
    waitingChargeRupees = 0,
    waitingDriverEarning = 0,
    waitingPlatformCommission = 0,
    waitingBillableMinutes = 0,
    waitingPerMinuteRupees = 0,
    waitingFreeMinutes = 0,
    waitingNoShow = false,
    driverEarning = 0,
    platformCommission = 0,
    effectiveTotal = 0,
    noShowAutoComplete = false,
  } = meta;

  const hasExtensions = extensionsCount > 0 || extensionFareDelta > 0;
  const hasWaiting = waitingChargeRupees > 0;
  const hasCoupon = couponDiscount > 0;

  return (
    <>
      {hasCoupon && (
        <SectionCard
          title="Coupon discount"
          subtitle="Customer saved — platform absorbs; driver commission unchanged"
        >
          <KV label="Coupon code" value={couponCode || '\u2014'} />
          <KV label="Ride subtotal (before coupon)" value={formatCurrency(subtotal)} />
          <KV label="Customer discount" value={formatCurrency(couponDiscount)} />
          <KV label="Net ride subtotal" value={formatCurrency(netSubtotal)} />
          <KV
            label="Platform cost absorbed"
            value={
              <span className="font-bold text-amber-700">
                {formatCurrency(couponDiscount)}
              </span>
            }
            hint="Booked as a separate coupon_discount ledger row on completion"
          />
        </SectionCard>
      )}

      <SectionCard
        title="Base fare"
        subtitle={`Original booking quote \u2014 ${commissionPercent}% platform commission`}
      >
        <KV label="Customer paid (original)" value={formatCurrency(totalPayable)} />
        <KV
          label={`Platform commission (${commissionPercent}%)`}
          value={formatCurrency(basePlatformCommission)}
        />
        <KV label="Driver earning" value={formatCurrency(baseDriverEarning)} />
      </SectionCard>

      {hasExtensions && (
        <SectionCard
          title="Extensions"
          subtitle={`${extensionsCount} ride extension${extensionsCount === 1 ? '' : 's'} \u2014 +${formatExtensionHours(extensionAdditionalHours)} total`}
          icon={TimerReset}
        >
          <KV
            label="Extra fare collected"
            value={formatCurrency(extensionFareDelta)}
          />
          <KV
            label={`Platform commission (${commissionPercent}%)`}
            value={formatCurrency(extensionPlatformCommission)}
          />
          <KV
            label="Driver earning from extensions"
            value={formatCurrency(extensionDriverEarning)}
          />
        </SectionCard>
      )}

      {hasWaiting && (
        <SectionCard
          title="Waiting charge"
          subtitle={
            waitingNoShow
              ? 'Customer no-show \u2014 auto-billed at trip end'
              : `${waitingBillableMinutes} billable min \u00D7 ${formatCurrency(waitingPerMinuteRupees)}/min (${waitingFreeMinutes} min free)`
          }
          icon={Clock4}
        >
          <KV
            label="Customer paid (waiting)"
            value={formatCurrency(waitingChargeRupees)}
          />
          <KV
            label="Platform commission"
            value={formatCurrency(waitingPlatformCommission)}
            hint="100% to driver under current policy"
          />
          <KV
            label="Driver earning from waiting"
            value={formatCurrency(waitingDriverEarning)}
          />
        </SectionCard>
      )}

      <SectionCard title="Totals" subtitle="What the customer paid vs. how it was split" icon={Banknote}>
        <KV label="Customer paid (effective total)" value={formatCurrency(effectiveTotal)} />
        {platformFee > 0 && (
          <KV label="Platform fee (customer)" value={formatCurrency(platformFee)} />
        )}
        <KV
          label="Platform kept (commission only)"
          value={
            <span className="font-bold text-emerald-700">
              {formatCurrency(amount)}
            </span>
          }
          hint={
            platformCommission && platformCommission !== amount
              ? `Stored commission: ${formatCurrency(platformCommission)}`
              : null
          }
        />
        {hasCoupon && (
          <KV
            label="Less coupon absorbed"
            value={
              <span className="font-bold text-amber-700">
                −{formatCurrency(couponDiscount)}
              </span>
            }
          />
        )}
        {hasCoupon && platformFee > 0 && (
          <KV
            label="Net platform (commission + fee − coupon)"
            value={formatCurrency(
              Math.max(0, Number(amount) + Number(platformFee) - Number(couponDiscount)),
            )}
          />
        )}
        <KV
          label="Driver received (this trip)"
          value={
            <span className="font-bold text-text">
              {formatCurrency(driverEarning + waitingDriverEarning)}
            </span>
          }
          hint={`Fare ${formatCurrency(driverEarning)}${hasWaiting ? ` + waiting ${formatCurrency(waitingDriverEarning)}` : ''}`}
        />
        {noShowAutoComplete && (
          <p className="text-[11px] text-amber-700 mt-2">
            Auto-completed by no-show timer.
          </p>
        )}
      </SectionCard>
    </>
  );
}

function PlatformFeeBreakdown({ meta, amount }) {
  const {
    platformFeeType = null,
    platformFeeAmount = null,
    totalPayable = 0,
    subtotal = 0,
    couponDiscount = 0,
  } = meta;
  return (
    <SectionCard
      title="Platform fee"
      subtitle="Customer-facing fee collected on this trip"
    >
      <KV label="Ride subtotal" value={formatCurrency(subtotal)} />
      {couponDiscount > 0 && (
        <KV label="Coupon discount (absorbed separately)" value={formatCurrency(couponDiscount)} />
      )}
      <KV label="Customer total (base fare)" value={formatCurrency(totalPayable)} />
      <KV
        label="Platform fee kept"
        value={
          <span className="font-bold text-emerald-700">{formatCurrency(amount)}</span>
        }
        hint={
          platformFeeType === 'flat'
            ? 'Flat fee'
            : platformFeeAmount
              ? `${platformFeeAmount}% of net subtotal`
              : null
        }
      />
    </SectionCard>
  );
}

function CouponDiscountBreakdown({ meta, amount }) {
  const {
    couponCode = null,
    couponDiscount = 0,
    subtotal = 0,
    netSubtotal = 0,
    totalPayable = 0,
    driverEarning = 0,
    platformCommission = 0,
  } = meta;
  const absorbed = Math.abs(Number(amount) || couponDiscount || 0);
  return (
    <SectionCard
      title="Coupon cost absorbed"
      subtitle="Platform bears the discount — driver earning is not reduced"
    >
      <KV label="Coupon code" value={couponCode || '\u2014'} />
      <KV label="Ride subtotal (before coupon)" value={formatCurrency(subtotal)} />
      <KV label="Customer discount" value={formatCurrency(couponDiscount || absorbed)} />
      <KV label="Net ride subtotal" value={formatCurrency(netSubtotal)} />
      <KV label="Customer paid (incl. fees & GST)" value={formatCurrency(totalPayable)} />
      <KV
        label="Amount absorbed by platform"
        value={
          <span className="font-bold text-amber-700">{formatCurrency(absorbed)}</span>
        }
      />
      <KV
        label="Driver earning"
        value={formatCurrency(driverEarning)}
        hint={
          platformCommission > 0
            ? `Commission ${formatCurrency(platformCommission)} on pre-coupon subtotal`
            : 'Unchanged by coupon'
        }
      />
    </SectionCard>
  );
}

function CancellationBreakdown({ meta, amount }) {
  const {
    feeCharged = 0,
    driverShare = 0,
    companyShare = 0,
    driverSharePercent = 0,
    arrivedFeeType = 'flat',
    arrivedFeeAmount = 0,
    cancelledAtStatus = '',
  } = meta;
  return (
    <SectionCard title="Cancellation fee" subtitle="Fee split between platform and driver">
      <KV label="Fee charged to customer" value={formatCurrency(feeCharged)} />
      <KV
        label={`Driver share (${driverSharePercent}%)`}
        value={formatCurrency(driverShare)}
      />
      <KV
        label="Platform share (kept)"
        value={
          <span className="font-bold text-amber-700">
            {formatCurrency(companyShare || amount)}
          </span>
        }
      />
      <KV
        label="Fee policy"
        value={
          arrivedFeeType === 'percentage'
            ? `${arrivedFeeAmount}% of fare`
            : `Flat ${formatCurrency(arrivedFeeAmount)}`
        }
      />
      {cancelledAtStatus ? (
        <KV label="Reason" value={humanise(cancelledAtStatus)} />
      ) : null}
    </SectionCard>
  );
}

function DriverPenaltyBreakdown({ meta, amount }) {
  const { reason = '', status = '' } = meta;
  return (
    <SectionCard
      title="Driver cancellation penalty"
      subtitle="Flat amount debited from driver wallet \u2014 100% to platform"
    >
      <KV
        label="Penalty kept"
        value={
          <span className="font-bold text-rose-700">{formatCurrency(amount)}</span>
        }
      />
      {reason ? <KV label="Reason" value={humanise(reason)} /> : null}
      {status ? <KV label="Cancelled at" value={humanise(status)} /> : null}
    </SectionCard>
  );
}

/* ---------- Layout primitives ---------- */

function SectionCard({ title, subtitle, icon: IconCmp, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        {IconCmp ? <IconCmp className="w-4 h-4 text-slate-500" /> : null}
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? (
            <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function KV({ label, value, hint }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        {hint ? (
          <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>
        ) : null}
      </div>
      <div className="text-xs text-slate-900 font-medium text-right shrink-0 max-w-[55%] break-words">
        {value}
      </div>
    </div>
  );
}

export default RevenueDetailsModal;
