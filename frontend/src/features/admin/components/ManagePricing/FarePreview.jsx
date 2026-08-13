import { useEffect, useMemo, useState } from 'react';
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

function waitingBufferRupees(pricing) {
  const wc = pricing?.waitingCharge || {};
  const perMin = Math.max(0, Number(wc.chargePerMinute) || 0);
  const maxBillable = Math.max(0, Number(wc.maxBillableMinutes) || 0);
  return Math.round(maxBillable * perMin * 100) / 100;
}

// ─── Hourly / scheduled preview ───────────────────────────────────────────────
const HourlyPreview = ({ form }) => {
  const previewSlab = useMemo(() => {
    if (!form.slabs?.length) return null;
    return [...form.slabs].sort((a, b) => a.maxHours - b.maxHours)[0];
  }, [form.slabs]);

  const slabHours = Number(previewSlab?.maxHours) || 0;
  const [actualMin, setActualMin] = useState(() =>
    slabHours > 0 ? Math.round(slabHours * 60) : 60,
  );
  const [waitMin, setWaitMin] = useState(0);
  const [toll, setToll] = useState(0);
  const [night, setNight] = useState(false);
  const [stayProvided, setStayProvided] = useState(true);

  // Keep simulation duration aligned with the active slab so editing
  // maxHours doesn't leave a stale actual-min that invents extra hours.
  useEffect(() => {
    if (slabHours > 0) setActualMin(Math.round(slabHours * 60));
  }, [slabHours, previewSlab?.label, previewSlab?.price]);

  const breakdown = useMemo(
    () =>
      previewSlab
        ? calculateHourlyFare({
            pricing: form,
            slab: previewSlab,
            bookedHours: slabHours,
            actualDurationMin: Number(actualMin) || 0,
            isNightRide: night,
            waitingMinutes: Number(waitMin) || 0,
            tollParking: Number(toll) || 0,
            stayProvided,
          })
        : null,
    [form, previewSlab, slabHours, actualMin, waitMin, toll, night, stayProvided],
  );

  const buffer = waitingBufferRupees(form);
  const totalWithBuffer = breakdown
    ? Math.round((Number(breakdown.totalPayable) + buffer) * 100) / 100
    : 0;

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
          Hourly / scheduled simulation
        </p>
        <div className="grid grid-cols-2 gap-2">
          <SimInput label="Actual min" value={actualMin} onChange={setActualMin} />
          <SimInput label="Waiting min" value={waitMin} onChange={setWaitMin} />
          <SimInput label="Toll ₹" value={toll} onChange={setToll} />
          <FlagToggle label="Night window" active={night} onClick={() => setNight((v) => !v)} />
          {breakdown?.stayEligible ? (
            <FlagToggle
              label={stayProvided ? 'Customer hosts stay' : 'Charge stay'}
              active={stayProvided}
              onClick={() => setStayProvided((v) => !v)}
            />
          ) : null}
        </div>
        <p className="text-[10px] text-slate-400">
          Slab used: <strong>{previewSlab.label}</strong> ({formatCurrency(previewSlab.price)}
          {' · '}
          {slabHours}h)
          {breakdown?.nightChargeTriggered && !night
            ? ' · night charge via duration threshold'
            : null}
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
        {breakdown.stayAllowance > 0 && (
          <Row label="Stay allowance" value={formatCurrency(breakdown.stayAllowance)} sub />
        )}
        {breakdown.tollParking > 0 && (
          <Row label="Toll & parking" value={formatCurrency(breakdown.tollParking)} sub />
        )}
        <Divider />
        <PlatformRows breakdown={breakdown} />
        {buffer > 0 && (
          <>
            <Divider />
            <Row
              label="Waiting buffer (held)"
              value={formatCurrency(buffer)}
              muted
            />
            <Row
              label="Wallet required"
              value={formatCurrency(totalWithBuffer)}
              highlight
            />
          </>
        )}
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
  const minDays = Math.max(1, Number(form.outstation?.minDays) || 1);
  const [pickupLocal, setPickupLocal] = useState('2026-08-10T08:00');
  const [returnLocal, setReturnLocal] = useState('2026-08-12T19:00');
  const [customerArrangesAll, setCustomerArrangesAll] = useState(false);

  const metrics = useMemo(() => {
    try {
      // Inline Kolkata-safe calendar math (mirrors outstationSchedule).
      const start = new Date(pickupLocal);
      const end = new Date(returnLocal);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return { days: minDays, nights: Math.max(0, minDays - 1), durationMinutes: 0 };
      }
      const tz = 'Asia/Kolkata';
      const ymd = (d) => {
        const parts = Object.fromEntries(
          new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
            .formatToParts(d)
            .filter((p) => p.type !== 'literal')
            .map((p) => [p.type, p.value]),
        );
        return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
      };
      const span = Math.round((ymd(end) - ymd(start)) / 86_400_000);
      const days = Math.max(1, span + 1);
      return {
        days,
        nights: Math.max(0, span),
        durationMinutes: Math.floor((end - start) / 60_000),
      };
    } catch {
      return { days: minDays, nights: Math.max(0, minDays - 1), durationMinutes: 0 };
    }
  }, [pickupLocal, returnLocal, minDays]);

  const breakdown = useMemo(
    () =>
      calculateOutstationFare({
        pricing: form,
        days: metrics.days,
        nights: metrics.nights,
        foodProvided: customerArrangesAll,
        stayProvided: customerArrangesAll,
      }),
    [form, metrics.days, metrics.nights, customerArrangesAll],
  );

  if (!breakdown || !(Number(form.outstation?.dailyRate) > 0)) {
    return (
      <p className="text-sm text-slate-500 p-4 bg-white rounded-xl text-center">
        Set a daily rate to preview the fare.
      </p>
    );
  }

  const foodPerDay = Number(breakdown.foodAllowancePerDay) || 0;
  const stayPerNight = Number(breakdown.stayAllowancePerNight) || 0;
  const legacyAllowance = Number(breakdown.legacyAllowanceTotal) || 0;
  const exactHours = (metrics.durationMinutes / 60).toFixed(
    metrics.durationMinutes % 60 === 0 ? 0 : 1,
  );

  return (
    <>
      <div className="space-y-2 mb-3">
        <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
          Round trip simulation
        </p>
        <div className="grid grid-cols-1 gap-2">
          <label className="text-[11px] text-slate-500">
            Pickup datetime
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={pickupLocal}
              onChange={(e) => setPickupLocal(e.target.value)}
            />
          </label>
          <label className="text-[11px] text-slate-500">
            Expected return datetime
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={returnLocal}
              onChange={(e) => setReturnLocal(e.target.value)}
            />
          </label>
          <FlagToggle
            label={
              customerArrangesAll
                ? 'Customer arranges food & stay'
                : 'Include food & stay allowances'
            }
            active={!customerArrangesAll}
            onClick={() => setCustomerArrangesAll((v) => !v)}
          />
        </div>
        <p className="text-[10px] text-slate-400">
          Exact {exactHours}h · Billable {breakdown.days} day(s) · Overnight{' '}
          {breakdown.nights} night(s)
          {customerArrangesAll ? ' · allowances waived' : ''}
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
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === '' ? '' : Number(raw));
      }}
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
          label="Coupon discount (platform absorbs)"
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
      {Number(breakdown.couponDiscount) > 0 && (
        <Row
          label="Net platform (commission + fee − coupon)"
          value={formatCurrency(
            Math.max(
              0,
              (Number(breakdown.platformCommission) || 0) +
                (Number(feeValue) || 0) -
                (Number(breakdown.couponDiscount) || 0),
            ),
          )}
          muted
        />
      )}
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
