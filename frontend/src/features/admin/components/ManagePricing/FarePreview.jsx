import { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import {
  calculateHourlyFare,
  calculateOutstationFare,
  formatCurrency,
} from '../../../../utils/fareCalculator';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';

const Row = ({ label, value, highlight, sub, muted }) => (
  <div
    className={`flex items-center justify-between text-sm py-1.5 ${
      highlight
        ? 'text-slate-900 font-semibold'
        : muted
        ? 'text-slate-400'
        : 'text-slate-700'
    }`}
  >
    <span className={sub ? 'pl-3' : ''}>{label}</span>
    <span>{value}</span>
  </div>
);

const ShellHeader = () => (
  <div className="flex items-center gap-2 mb-3">
    <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
      <Calculator className="w-4 h-4 text-primary" />
    </div>
    <div>
      <h4 className="text-sm font-bold text-slate-900">Live fare preview</h4>
      <p className="text-[10px] text-slate-500">Adjust inputs to see the customer total</p>
    </div>
  </div>
);

// ─── Hourly preview ───────────────────────────────────────────────────────────
const HourlyPreview = ({ form }) => {
  const previewSlab = useMemo(() => {
    if (!form.slabs?.length) return null;
    return [...form.slabs].sort((a, b) => a.maxHours - b.maxHours)[0];
  }, [form.slabs]);

  const [actualMin, setActualMin] = useState(() =>
    previewSlab ? Math.round(previewSlab.maxHours * 60) : 60,
  );
  const [waitMin, setWaitMin] = useState(0);
  const [toll, setToll] = useState(0);
  const [night, setNight] = useState(false);

  const breakdown = useMemo(
    () =>
      previewSlab
        ? calculateHourlyFare({
            pricing: form,
            slab: previewSlab,
            actualDurationMin: Number(actualMin),
            isNightRide: night,
            waitingMinutes: Number(waitMin),
            tollParking: Number(toll),
          })
        : null,
    [form, previewSlab, actualMin, waitMin, toll, night],
  );

  if (!previewSlab) {
    return (
      <p className="text-sm text-slate-500 p-4 bg-white rounded-xl text-center">
        Add at least one slab to preview the fare.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2 mb-3">
        <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
          Hourly simulation
        </p>
        <div className="grid grid-cols-2 gap-2">
          <SimInput label="Actual min" value={actualMin} onChange={setActualMin} />
          <SimInput label="Waiting min" value={waitMin} onChange={setWaitMin} />
          <SimInput label="Toll ₹" value={toll} onChange={setToll} />
          <FlagToggle label="Night" active={night} onClick={() => setNight((v) => !v)} />
        </div>
        <p className="text-[10px] text-slate-400">
          Slab used: <strong>{previewSlab.label}</strong> ({formatCurrency(previewSlab.price)})
        </p>
      </div>

      <div className="bg-white rounded-xl p-3 border border-slate-200">
        <Row label="Package price" value={formatCurrency(breakdown.packagePrice)} />
        {breakdown.extraHours > 0 && (
          <Row
            label={`Extra hours (${breakdown.extraHours})`}
            value={formatCurrency(breakdown.extraHourCharge)}
            sub
          />
        )}
        {breakdown.waitingCharge > 0 && (
          <Row label="Waiting" value={formatCurrency(breakdown.waitingCharge)} sub />
        )}
        {breakdown.nightCharge > 0 && (
          <Row label="Night charge" value={formatCurrency(breakdown.nightCharge)} sub />
        )}
        {breakdown.tollParking > 0 && (
          <Row label="Toll & parking" value={formatCurrency(breakdown.tollParking)} sub />
        )}
        <Divider />
        <PlatformRows breakdown={breakdown} />
      </div>
    </>
  );
};

// ─── Outstation preview ───────────────────────────────────────────────────────
//
// Billing model — up to three line items:
//   1. Daily rate           × days
//   2. Food allowance       × days   (waived if customer feeds driver)
//   3. Stay allowance       × nights (waived if customer hosts driver)
//
// When a legacy pricing doc only has the deprecated combined
// `allowancePerNight`, the calculator returns a single
// `legacyAllowanceTotal` line instead and we render it as the
// fallback. Toll & parking are paid by the customer to the driver and
// are not added to the fare here.
const OutstationPreview = ({ form }) => {
  const [days, setDays] = useState(3);
  const [customerArrangesAll, setCustomerArrangesAll] = useState(false);

  const breakdown = useMemo(
    () =>
      calculateOutstationFare({
        pricing: form,
        days: Number(days),
        // The customer's UI surfaces a single all-or-nothing toggle —
        // we mirror that here by flipping both flags together.
        foodProvided: customerArrangesAll,
        stayProvided: customerArrangesAll,
      }),
    [form, days, customerArrangesAll],
  );

  if (!breakdown || !(form.outstation?.dailyRate > 0)) {
    return (
      <p className="text-sm text-slate-500 p-4 bg-white rounded-xl text-center">
        Set a daily rate to preview the fare.
      </p>
    );
  }

  const foodPerDay = Number(breakdown.foodAllowancePerDay) || 0;
  const stayPerNight = Number(breakdown.stayAllowancePerNight) || 0;
  const legacyAllowance = Number(breakdown.legacyAllowanceTotal) || 0;

  return (
    <>
      <div className="space-y-2 mb-3">
        <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
          Outstation simulation
        </p>
        <div className="grid grid-cols-2 gap-2">
          <SimInput label="Days" value={days} onChange={setDays} min={1} />
          <FlagToggle
            label={customerArrangesAll ? 'Customer arranges all' : 'We arrange'}
            active={customerArrangesAll}
            onClick={() => setCustomerArrangesAll((v) => !v)}
          />
        </div>
        <p className="text-[10px] text-slate-400">
          {breakdown.days} day(s) · {breakdown.nights} night(s) · toll &amp;
          parking paid directly to driver
        </p>
      </div>

      <div className="bg-white rounded-xl p-3 border border-slate-200">
        <Row
          label={`Daily rate × ${breakdown.days}`}
          value={formatCurrency(breakdown.dailyRateTotal)}
        />
        {foodPerDay > 0 && breakdown.foodAllowanceTotal > 0 && (
          <Row
            label={`Food allowance × ${breakdown.days}`}
            value={formatCurrency(breakdown.foodAllowanceTotal)}
            sub
          />
        )}
        {stayPerNight > 0 && breakdown.stayAllowanceTotal > 0 && (
          <Row
            label={`Stay allowance × ${breakdown.nights}`}
            value={formatCurrency(breakdown.stayAllowanceTotal)}
            sub
          />
        )}
        {legacyAllowance > 0 && (
          <Row
            label={`Allowance (legacy) × ${breakdown.nights}`}
            value={formatCurrency(legacyAllowance)}
            sub
          />
        )}
        <Divider />
        <PlatformRows breakdown={breakdown} />
      </div>
    </>
  );
};

// ─── Shared bits ──────────────────────────────────────────────────────────────
const SimInput = ({ label, value, onChange, min }) => (
  <label className="text-xs text-slate-600">
    {label}
    <input
      type="number"
      value={value}
      min={min}
      onChange={(e) => onChange(e.target.value)}
      className="w-full mt-1 h-9 px-2 bg-white border border-slate-200 rounded-lg text-sm"
    />
  </label>
);

const FlagToggle = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-1 h-9 rounded-lg text-[11px] font-semibold transition-colors ${
      active
        ? 'bg-slate-900 text-primary border border-slate-900'
        : 'bg-white border border-slate-200 text-slate-500'
    }`}
  >
    {label}
  </button>
);

const Divider = () => <div className="border-t border-slate-100 my-1.5" />;

const PlatformRows = ({ breakdown }) => {
  const feeType = breakdown.platformFeeType || 'percentage';
  const feeLabel =
    feeType === 'flat'
      ? 'Platform fee (flat)'
      : `Platform fee (${breakdown.platformFeeAmount ?? breakdown.serviceChargePercent ?? 0}%)`;
  const feeValue = breakdown.platformFee ?? breakdown.serviceCharge;
  return (
    <>
      <Row label="Subtotal" value={formatCurrency(breakdown.subtotal)} />
      {Number(breakdown.couponDiscount) > 0 && (
        <Row
          label="Coupon discount"
          value={`− ${formatCurrency(breakdown.couponDiscount)}`}
          muted
        />
      )}
      <Row label={feeLabel} value={formatCurrency(feeValue)} muted />
      <Row
        label={`GST (${breakdown.gstPercent}%)`}
        value={formatCurrency(breakdown.gstAmount)}
        muted
      />
      {breakdown.subscriptionDiscount > 0 && (
        <Row
          label="Subscription discount"
          value={`− ${formatCurrency(breakdown.subscriptionDiscount)}`}
          muted
        />
      )}
      <Divider />
      <Row label="Total payable" value={formatCurrency(breakdown.totalPayable)} highlight />
      <Divider />
      <Row
        label={`Platform commission (${breakdown.platformCommissionPercent}%)`}
        value={formatCurrency(breakdown.platformCommission)}
        muted
      />
      <Row label="Driver earns" value={formatCurrency(breakdown.driverEarning)} highlight />
    </>
  );
};

// ─── Entry component ──────────────────────────────────────────────────────────
const FarePreview = ({ form }) => (
  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 sticky top-2">
    <ShellHeader />
    {form.serviceType === SERVICE_TYPES.HOURLY ? (
      <HourlyPreview form={form} />
    ) : (
      <OutstationPreview form={form} />
    )}
  </div>
);

export default FarePreview;
