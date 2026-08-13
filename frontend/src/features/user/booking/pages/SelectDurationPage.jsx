import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Check,
  Loader2,
  HandCoins,
  RefreshCw,
  CalendarRange,
  AlertCircle,
  CalendarClock,
} from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import DateTimePickerField from '../../../../components/inputs/DateTimePickerField';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useUserServicePricingsStore } from '../../../../store/user/useUserPricingStore';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';
import useBookingDraftStore from '../../../../store/user/useBookingDraftStore';
import {
  computeOutstationDuration,
  computeOutstationTripMetrics,
  formatOutstationExactDuration,
  addCalendarDays,
  startOfLocalDay,
} from '../../../../utils/outstationSchedule';
import {
  mergeScheduledDispatchConfig,
  readDispatchNumber,
  SCHEDULED_BOOKING,
} from '../../../../constants/bookingStatus';

/**
 * Step 3 — pick duration (hourly) or date range (outstation).
 *
 * Branches at the top based on the draft's serviceType. Both branches end up
 * pushing the relevant fields back to the draft store and navigating to
 * review.
 */
const SelectDurationPage = () => {
  const navigate = useNavigate();
  const serviceType = useBookingDraftStore((s) => s.serviceType);
  const hourlyDraft = useBookingDraftStore((s) => s.hourly);
  const outstationDraft = useBookingDraftStore((s) => s.outstation);
  const setHourly = useBookingDraftStore((s) => s.setHourly);
  const setOutstation = useBookingDraftStore((s) => s.setOutstation);

  const { data, loading } = useCachedQuery(
    useUserServicePricingsStore,
    buildCacheKey('user-services-active'),
  );
  const servicePricing = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    return list.find((s) => s.serviceType === serviceType) || null;
  }, [data, serviceType]);

  useEffect(() => {
    if (!serviceType) navigate('/user/book/service', { replace: true });
  }, [serviceType, navigate]);

  if (loading && !servicePricing) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg min-h-dvh">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (serviceType === SERVICE_TYPES.HOURLY) {
    return (
      <HourlyBranch
        pricing={servicePricing}
        draft={hourlyDraft}
        onPatch={setHourly}
        onContinue={() => navigate('/user/book/confirm')}
      />
    );
  }

  return (
    <OutstationBranch
      pricing={servicePricing}
      draft={outstationDraft}
      onPatch={setOutstation}
      onContinue={() => navigate('/user/book/confirm')}
    />
  );
};

/* ------------------------------------------------------------------ */
/* Hourly branch                                                       */
/* ------------------------------------------------------------------ */

function HourlyBranch({ pricing, draft, onPatch, onContinue }) {
  const navigate = useNavigate();
  const slabs = pricing?.slabs || [];
  const [selectedSlabId, setSelectedSlabId] = useState(draft.slabId || slabs[0]?._id);

  // Mirror the hourly lead-time the backend will enforce on create —
  // skipping this floor sneaks in a "10 minutes from now" that the
  // dispatcher can't serve.
  const dispatchConfig = useMemo(
    () => mergeScheduledDispatchConfig(pricing?.scheduledDispatch),
    [pricing?.scheduledDispatch],
  );
  const minLeadHours = readDispatchNumber(
    dispatchConfig.MIN_SCHEDULED_LEAD_HOURS,
    SCHEDULED_BOOKING.MIN_SCHEDULED_LEAD_HOURS,
  );
  // Read the wall clock ONCE per mount so React's purity lint stays
  // happy on the derived `minPickupDate` memo (Date.now() is impure).
  // The backend re-validates against the live clock on Continue.
  const [nowAnchorMs] = useState(() => Date.now());
  const minPickupDate = useMemo(
    () => new Date(nowAnchorMs + minLeadHours * 60 * 60 * 1000),
    [nowAnchorMs, minLeadHours],
  );

  // Blank-by-default. We rehydrate from the draft only if the saved
  // value is still in the valid window, otherwise force a re-confirm.
  const [scheduledStartAt, setScheduledStartAt] = useState(() => {
    const seed = draft.scheduledStartAt ? new Date(draft.scheduledStartAt) : null;
    if (!seed || Number.isNaN(seed.getTime())) return null;
    if (seed.getTime() < minPickupDate.getTime()) return null;
    return seed.toISOString();
  });

  const selectedSlab = slabs.find((s) => s._id === selectedSlabId);

  const handleContinue = () => {
    if (!selectedSlab || !scheduledStartAt) return;
    onPatch({
      slabId: selectedSlab._id,
      durationHours: selectedSlab.maxHours || selectedSlab.minHours,
      scheduledStartAt: new Date(scheduledStartAt).toISOString(),
    });
    onContinue();
  };

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <Header
        title="When do you need the driver?"
        subtitle="Choose a slab — extra hours are billed at the per-hour rate."
        onBack={() => navigate(-1)}
      />

      <div className="flex-1 p-4 space-y-4">
        <Card>
          <DateTimePickerField
            label="Pickup time"
            icon={CalendarClock}
            value={scheduledStartAt}
            onChange={setScheduledStartAt}
            minDate={minPickupDate}
            placeholder="Tap to choose pickup date and time"
            helper={
              minLeadHours > 0
                ? `We need at least ${formatLeadHours(minLeadHours)} between booking and pickup.`
                : undefined
            }
            sheetTitle="Pickup time"
          />
        </Card>

        <div className="space-y-3">
          {slabs.map((slab, idx) => {
            const isSelected = slab._id === selectedSlabId;
            return (
              <Card
                key={slab._id}
                onClick={() => setSelectedSlabId(slab._id)}
                hoverable
                className={`animate-fade-in-up ${isSelected ? 'ring-2 ring-primary' : ''}`}
                style={{ animationDelay: `${idx * 0.06}s` }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isSelected ? 'bg-primary/15' : 'bg-gray-100'
                    }`}
                  >
                    <Clock className={`w-5 h-5 ${isSelected ? 'text-primary' : 'text-text-muted'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-text">
                      {slab.label || `${slab.minHours}–${slab.maxHours} hours`}
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      Up to {slab.maxHours} hours · extra ₹{pricing?.extraHourCharge || 0}/hr
                    </p>
                  </div>
                  <span className="text-sm font-bold text-text">₹{slab.price}</span>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-primary bg-primary' : 'border-gray-300'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Footer
        primaryLabel="Continue"
        priceLabel={selectedSlab ? `₹${selectedSlab.price}` : '—'}
        priceHint="Starts at"
        onClick={handleContinue}
        disabled={!selectedSlab || !scheduledStartAt}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Outstation branch                                                   */
/* ------------------------------------------------------------------ */

function OutstationBranch({ pricing, draft, onPatch, onContinue }) {
  const navigate = useNavigate();

  // Pull the admin-configured outstation lead time (calendar days).
  // Backend enforces MIN_OUTSTATION_LEAD_DAYS on create — never use
  // the hourly MIN_SCHEDULED_LEAD_HOURS knob here.
  const dispatchConfig = useMemo(
    () => mergeScheduledDispatchConfig(pricing?.scheduledDispatch),
    [pricing?.scheduledDispatch],
  );
  const minLeadDays = readDispatchNumber(
    dispatchConfig.MIN_OUTSTATION_LEAD_DAYS,
    SCHEDULED_BOOKING.MIN_OUTSTATION_LEAD_DAYS,
  );
  // Lazy-snapshot the wall clock (Date.now is impure under
  // react-hooks/purity). Floor is stable for the lifetime of the
  // mount; backend re-validates against the live clock on Continue.
  const [nowAnchorMs] = useState(() => Date.now());
  const minPickupDate = useMemo(
    () =>
      addCalendarDays(new Date(nowAnchorMs), minLeadDays)
      || startOfLocalDay(new Date(nowAnchorMs)),
    [nowAnchorMs, minLeadDays],
  );

  // Blank-by-default. Rehydrate from the draft only when the saved
  // pickup is still in the valid window so the user re-confirms a
  // stale-and-now-invalid time rather than silently 422-ing later.
  const [pickupRaw, setPickupRaw] = useState(() => {
    const raw = draft.pickupAt || draft.startDate;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  });
  const [expectedReturnAt, setExpectedReturnAt] = useState(() => {
    const raw = draft.expectedReturnAt || draft.endDate;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  });
  const [destination, setDestination] = useState(draft.destinationAddress || '');

  // Derive the effective pickup from the raw draft + live lead-time
  // floor. If pricing arrives after first paint and pushes the floor
  // past a stale draft value, we surface "nothing picked" so the user
  // re-confirms instead of submitting an out-of-window time.
  const pickupAt = useMemo(() => {
    if (!pickupRaw) return null;
    const ms = new Date(pickupRaw).getTime();
    if (!Number.isFinite(ms)) return null;
    if (ms < minPickupDate.getTime()) return null;
    return pickupRaw;
  }, [pickupRaw, minPickupDate]);

  // Expected return must come AFTER the chosen pickup — feed the
  // picker the pickup moment as its min so the day-strip self-disables
  // anything earlier. We give it a 30-minute cushion so same-day round
  // trips don't get rejected at exactly the same minute as pickup.
  const minReturnDate = useMemo(() => {
    if (!pickupAt) return null;
    const ms = new Date(pickupAt).getTime();
    if (!Number.isFinite(ms)) return null;
    return new Date(ms + 30 * 60 * 1000);
  }, [pickupAt]);

  // Single all-or-nothing toggle: the customer commits to arranging
  // BOTH the driver's food AND stay themselves to skip the per-night
  // allowance. We mirror the boolean into both `needsFood` and
  // `needsStay` for the backend (it AND's them in the engine — both
  // must be `true` for the allowance to be waived).
  const initialArranges = draft.needsFood === true && draft.needsStay === true;
  const [customerArrangesAll, setCustomerArrangesAll] = useState(initialArranges);

  // Days = number of distinct calendar dates the trip spans; nights =
  // days − 1. Shared with the backend so the provisional fare here
  // matches the server's authoritative breakdown on Review. Falls back
  // to a 0-day "no trip yet" state until both pickers are filled.
  const { days, nights } = useMemo(() => {
    if (!pickupAt || !expectedReturnAt) return { days: 0, nights: 0 };
    return computeOutstationDuration(pickupAt, expectedReturnAt);
  }, [pickupAt, expectedReturnAt]);

  const tripMetrics = useMemo(() => {
    if (!pickupAt || !expectedReturnAt) return null;
    return computeOutstationTripMetrics(pickupAt, expectedReturnAt);
  }, [pickupAt, expectedReturnAt]);

  // Auto-clear return when pickup pushes past it; keeps the diff
  // non-negative without forcing a separate validation message.
  const onPickupChange = (iso) => {
    setPickupRaw(iso);
    if (
      iso &&
      expectedReturnAt &&
      new Date(iso).getTime() >= new Date(expectedReturnAt).getTime()
    ) {
      setExpectedReturnAt(null);
    }
  };

  const handleContinue = () => {
    if (!pickupAt || !expectedReturnAt) return;
    const pickupIso = new Date(pickupAt).toISOString();
    const returnIso = new Date(expectedReturnAt).toISOString();
    // Both flags flip together so the backend's AND check waives the
    // allowance only when the customer commits to arranging
    // everything (food AND stay). Convention: `true` here = "this
    // need is arranged by the customer" → no allowance.
    onPatch({
      destinationAddress: destination.trim(),
      pickupAt: pickupIso,
      expectedReturnAt: returnIso,
      startDate: pickupIso,
      endDate: returnIso,
      days,
      nights,
      needsStay: customerArrangesAll,
      needsFood: customerArrangesAll,
    });
    onContinue();
  };

  // Inline provisional breakdown — same math the server-side
  // calculateOutstationFare uses (pre-platform subtotal). Food
  // allowance scales with days, stay allowance with nights, and the
  // single "I'll arrange food + stay" toggle waives both in lockstep.
  // Legacy pricing docs (combined `allowancePerNight`, both split
  // fields zero) fall back to the old per-night line.
  const o = pricing?.outstation || {};
  const dailyRate = Number(o.dailyRate) || 0;
  const foodAllowancePerDay = Number(o.foodAllowancePerDay) || 0;
  const stayAllowancePerNight = Number(o.stayAllowancePerNight) || 0;
  const legacyAllowancePerNight = Number(o.allowancePerNight) || 0;
  const useLegacyAllowance =
    foodAllowancePerDay <= 0 &&
    stayAllowancePerNight <= 0 &&
    legacyAllowancePerNight > 0;

  const lineDaily = dailyRate * days;
  const lineFood = useLegacyAllowance
    ? 0
    : customerArrangesAll
      ? 0
      : foodAllowancePerDay * days;
  const lineStay = useLegacyAllowance
    ? 0
    : customerArrangesAll
      ? 0
      : stayAllowancePerNight * nights;
  const lineLegacyAllowance =
    useLegacyAllowance && !customerArrangesAll
      ? legacyAllowancePerNight * nights
      : 0;
  const lineAllowance = lineFood + lineStay + lineLegacyAllowance;
  const provisionalTotal = lineDaily + lineAllowance;

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <Header
        title="Round trip details"
        subtitle="Pick your travel window — we drop you back at pickup at the end."
        onBack={() => navigate(-1)}
      />

      <div className="flex-1 p-4 space-y-4">
        <div className="rounded-2xl bg-primary/5 border border-primary/20 px-3 py-2 flex items-start gap-2">
          <RefreshCw className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-[12px] leading-snug text-primary/90">
            <strong className="font-semibold">Round trip:</strong> the driver
            stays with you the whole trip and brings you back to your pickup
            {days >= 1 ? ` on day ${days}` : ''}.
          </p>
        </div>

        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Destination</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Where are you headed?"
            className="w-full h-11 bg-gray-50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Card>

        <Card>
          <div className="space-y-3">
            <DateTimePickerField
              label="Pickup date & time"
              icon={CalendarClock}
              value={pickupAt}
              onChange={onPickupChange}
              minDate={minPickupDate}
              placeholder="Tap to choose pickup"
              helper={
                minLeadHours > 0
                  ? `We need at least ${formatLeadHours(minLeadHours)} between booking and pickup so a driver can be assigned.`
                  : undefined
              }
              sheetTitle="Pickup date & time"
            />
            <DateTimePickerField
              label="Expected return"
              icon={CalendarClock}
              value={expectedReturnAt}
              onChange={setExpectedReturnAt}
              minDate={minReturnDate}
              disabled={!pickupAt}
              placeholder={pickupAt ? 'Tap to choose return' : 'Pick a pickup first'}
              helper={
                pickupAt
                  ? 'Round trip — the driver brings you back here on this date.'
                  : undefined
              }
              sheetTitle="Expected return"
            />
          </div>
          {pickupAt && expectedReturnAt ? (
            <div className="mt-3 space-y-1.5 bg-bg rounded-xl px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Trip duration
                </span>
                <span className="text-sm font-bold text-text">
                  {formatOutstationExactDuration(tripMetrics?.durationMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted inline-flex items-center gap-1.5">
                  <CalendarRange className="w-3.5 h-3.5" />
                  Billable
                </span>
                <span className="text-sm font-semibold text-text">
                  {days} day{days > 1 ? 's' : ''} · {nights} overnight
                  {nights === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-text-muted inline-flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Pick both a pickup and return so we can size the trip.
            </p>
          )}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-text mb-3">
            Driver food &amp; stay
          </h3>
          <ToggleRow
            icon={HandCoins}
            label="I will arrange the driver's food and stay"
            description={describeAllowance({
              customerArrangesAll,
              useLegacyAllowance,
              days,
              nights,
              foodAllowancePerDay,
              stayAllowancePerNight,
              legacyAllowancePerNight,
              lineFood,
              lineStay,
              lineLegacyAllowance,
            })}
            value={customerArrangesAll}
            onChange={(v) => setCustomerArrangesAll(v)}
          />
          <p className="text-[11px] text-text-muted mt-3 pt-3 border-t border-border-light">
            Turn this on only if you can feed and host the driver for
            the trip. Otherwise we&rsquo;ll add a daily food allowance
            plus a per-night stay allowance.
          </p>
        </Card>

        {/* Provisional breakdown so the user sees how the number is
            built before they reach the Review page (which shows the
            authoritative server-computed breakdown). Only meaningful
            once both dates are picked — until then we keep the page
            quiet rather than showing a fake "0 days · ₹0" total. */}
        {days >= 1 && (
          <Card>
            <h3 className="text-sm font-semibold text-text mb-3">
              Provisional fare
            </h3>
            <div className="space-y-1.5 text-sm">
              <MiniRow
                label={`Daily rate \u00d7 ${days} day${days === 1 ? '' : 's'}`}
                value={`\u20B9${lineDaily}`}
              />
              {lineFood > 0 && (
                <MiniRow
                  label={`Driver food \u00d7 ${days} day${days === 1 ? '' : 's'}`}
                  value={`\u20B9${lineFood}`}
                />
              )}
              {lineStay > 0 && (
                <MiniRow
                  label={`Driver stay \u00d7 ${nights} night${nights === 1 ? '' : 's'}`}
                  value={`\u20B9${lineStay}`}
                />
              )}
              {lineLegacyAllowance > 0 && (
                <MiniRow
                  label={`Driver allowance \u00d7 ${nights} night${nights === 1 ? '' : 's'}`}
                  value={`\u20B9${lineLegacyAllowance}`}
                />
              )}
              <div className="h-px bg-border-light my-1" />
              <MiniRow
                label="Subtotal (excl. taxes)"
                value={`\u20B9${provisionalTotal}`}
                highlight
              />
              <p className="text-[11px] text-text-muted">
                Service charge and GST are added on the next screen.
              </p>
            </div>
          </Card>
        )}

        {/* Toll & parking are paid by the customer directly to the
            driver \u2014 not part of the booking fare. Surfaced here
            so there are no surprises during the trip. */}
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
          <p className="text-[12px] leading-snug text-amber-900">
            <strong className="font-semibold">Toll &amp; parking:</strong>
            {' '}
            charges along the route are paid by you directly to the
            driver as per actuals. They are not added to this booking
            fare.
          </p>
        </div>
      </div>

      <Footer
        primaryLabel="Continue"
        priceLabel={days >= 1 ? `\u20B9${provisionalTotal}` : `\u20B9—`}
        priceHint="Provisional"
        onClick={handleContinue}
        disabled={
          !destination.trim() ||
          !pickupAt ||
          !expectedReturnAt ||
          days < 1
        }
      />
    </div>
  );
}

/**
 * Compact human label for the configured lead time. Whole hours stay
 * plain ("2 hours"), fractional ones surface in minutes ("90 minutes")
 * so the customer doesn't see "1.5 hours" which reads awkwardly next
 * to the date picker.
 */
function formatLeadHours(hours) {
  const safe = Math.max(0, Number(hours) || 0);
  if (safe === 0) return 'a moment';
  if (Number.isInteger(safe)) {
    return `${safe} hour${safe === 1 ? '' : 's'}`;
  }
  const totalMinutes = Math.round(safe * 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} minutes`;
  }
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h} hours` : `${h}h ${m}m`;
}

function MiniRow({ label, value, highlight }) {
  return (
    <div
      className={`flex items-center justify-between ${
        highlight ? 'text-text font-semibold' : 'text-text-secondary'
      }`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/**
 * Subtitle for the outstation food + stay toggle. Mirrors the
 * ConfirmAndPayPage copy so the customer sees the same breakdown on
 * both screens: "₹A × D days food + ₹B × N nights stay = ₹Total"
 * when the platform is paying, or "No allowance charged" once the
 * customer opts in. Legacy pricing docs fall back to the old
 * combined per-night line.
 */
function describeAllowance({
  customerArrangesAll,
  useLegacyAllowance,
  days,
  nights,
  foodAllowancePerDay,
  stayAllowancePerNight,
  legacyAllowancePerNight,
  lineFood,
  lineStay,
  lineLegacyAllowance,
}) {
  if (customerArrangesAll) {
    return 'No allowance charged \u2014 you take care of the driver\u2019s meals and stay directly.';
  }
  if (useLegacyAllowance) {
    if (nights > 0 && legacyAllowancePerNight > 0) {
      return `We\u2019ll add \u20B9${legacyAllowancePerNight} \u00d7 ${nights} night${nights === 1 ? '' : 's'} = \u20B9${lineLegacyAllowance} as the driver\u2019s allowance (food + stay).`;
    }
    return 'No allowance applies on a same-day trip.';
  }
  const parts = [];
  if (lineFood > 0) {
    parts.push(
      `\u20B9${foodAllowancePerDay} \u00d7 ${days} day${days === 1 ? '' : 's'} food`,
    );
  }
  if (lineStay > 0) {
    parts.push(
      `\u20B9${stayAllowancePerNight} \u00d7 ${nights} night${nights === 1 ? '' : 's'} stay`,
    );
  }
  if (!parts.length) {
    return 'No driver allowance applies on this trip.';
  }
  const total = lineFood + lineStay;
  return `We\u2019ll add ${parts.join(' + ')} = \u20B9${total} as the driver\u2019s allowance.`;
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Header({ title, subtitle, onBack }) {
  return (
    <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-text" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-text truncate">{title}</h1>
          <p className="text-xs text-text-muted">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function Footer({ primaryLabel, priceLabel, priceHint, onClick, disabled }) {
  return (
    <div className="p-4 bg-white border-t border-border-light">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-text-muted">{priceHint}</span>
        <span className="text-lg font-bold text-text">{priceLabel}</span>
      </div>
      <Button fullWidth disabled={disabled} onClick={onClick}>
        {primaryLabel}
      </Button>
    </div>
  );
}

function ToggleRow({ icon: Icon, label, description, value, onChange }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-bg flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`shrink-0 w-10 h-6 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-gray-300'} relative`}
        aria-pressed={value}
      >
        <span
          className={`absolute top-0.5 ${value ? 'left-[18px]' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`}
        />
      </button>
    </div>
  );
}

export default SelectDurationPage;
