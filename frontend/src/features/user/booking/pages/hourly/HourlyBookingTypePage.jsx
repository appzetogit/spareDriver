import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, CalendarClock, Check } from 'lucide-react';
import Button from '../../../../../components/Button';
import DateTimePickerField from '../../../../../components/inputs/DateTimePickerField';
import PageShell from '../../components/PageShell';
import useBookingDraftStore from '../../../../../store/user/useBookingDraftStore';
import { useCachedQuery } from '../../../../../hooks/useCachedQuery';
import { useUserServicePricingsStore } from '../../../../../store/user/useUserPricingStore';
import { SERVICE_TYPES } from '../../../../../constants/serviceTypes';
import {
  BOOKING_TYPE,
  BOOKING_TYPE_LABELS,
  BOOKING_TYPE_DESCRIPTIONS,
  mergeScheduledDispatchConfig,
} from '../../../../../constants/bookingStatus';
import { formatPickupDateTime } from '../../../../../utils/datetime';

/**
 * Step 1 of the hourly booking flow.
 *
 *   "Do you need a driver right now, or later?"
 *
 *   - Instant   → pickup time defaults to now + 15 minutes (dispatch buffer).
 *   - Scheduled → user picks a future date+time; minimum is now +
 *     hourly pricing's `scheduledDispatch.MIN_SCHEDULED_LEAD_HOURS` so the
 *     emergency-pool safety net has room to fire. Reading the value from
 *     the live ServicePricing keeps the UI in lockstep with whatever the
 *     admin set in Settings → Service Pricing → Scheduled-ride dispatcher.
 *
 * Users with multiple cars can have parallel bookings, so we no longer
 * redirect into an existing active booking here — the home page surfaces
 * those as resume tiles instead.
 */
const HourlyBookingTypePage = () => {
  const navigate = useNavigate();
  const setServiceType = useBookingDraftStore((s) => s.setServiceType);
  const draftBookingType = useBookingDraftStore((s) => s.bookingType);
  const setBookingType = useBookingDraftStore((s) => s.setBookingType);
  const setHourly = useBookingDraftStore((s) => s.setHourly);

  // Pull the active service-pricing rows so we can use the admin's
  // per-service `scheduledDispatch` knobs (min lead time, etc.) for the
  // date-picker constraint. Cached across the whole booking flow.
  const { data: pricingRows } = useCachedQuery(
    useUserServicePricingsStore,
    'user-pricing-services',
  );
  const dispatchConfig = useMemo(() => {
    const hourly = (pricingRows || []).find(
      (p) => p.serviceType === SERVICE_TYPES.HOURLY,
    );
    return mergeScheduledDispatchConfig(hourly?.scheduledDispatch);
  }, [pricingRows]);

  const [selected, setSelected] = useState(draftBookingType || null);
  // Blank-by-default — the scheduled card stays empty until the user
  // taps the picker. No more "tomorrow 9 AM" surprise prefill.
  const [scheduledAt, setScheduledAt] = useState(null);

  // Make sure the service is locked to hourly the moment the user opens this
  // screen — keeps the rest of the flow consistent if they arrived via a
  // deep link instead of the home tile.
  useEffect(() => {
    setServiceType(SERVICE_TYPES.HOURLY);
  }, [setServiceType]);

  const minLeadHours = dispatchConfig.MIN_SCHEDULED_LEAD_HOURS;
  // Lazy-snapshot the wall clock so `Date.now()` stays out of render
  // (react-hooks/purity) — the floor is stable for the mount, the
  // backend re-validates against the live clock on Continue.
  const [nowAnchorMs] = useState(() => Date.now());
  const minScheduledDate = useMemo(
    () => new Date(nowAnchorMs + minLeadHours * 60 * 60_000),
    [nowAnchorMs, minLeadHours],
  );
  const handleContinue = () => {
    if (!selected) return;
    setBookingType(selected);
    if (selected === BOOKING_TYPE.INSTANT) {
      // 15 min buffer so dispatch has time to find a driver before the
      // "ride starts" countdown is meaningful.
      setHourly({ scheduledStartAt: new Date(Date.now() + 15 * 60_000).toISOString() });
    } else {
      const iso = new Date(scheduledAt).toISOString();
      setHourly({ scheduledStartAt: iso });
    }
    navigate('/user/book/hourly/details');
  };

  const canContinue =
    selected === BOOKING_TYPE.INSTANT ||
    (selected === BOOKING_TYPE.SCHEDULED &&
      scheduledAt &&
      new Date(scheduledAt).getTime() >= minScheduledDate.getTime());

  return (
    <PageShell
      title="When do you need a driver?"
      subtitle="Hourly bookings"
      footer={
        <Button fullWidth disabled={!canContinue} onClick={handleContinue}>
          Continue
        </Button>
      }
    >
      <div className="space-y-3">
        <Option
          icon={Zap}
          accent="amber"
          active={selected === BOOKING_TYPE.INSTANT}
          title={BOOKING_TYPE_LABELS[BOOKING_TYPE.INSTANT]}
          description={BOOKING_TYPE_DESCRIPTIONS[BOOKING_TYPE.INSTANT]}
          onClick={() => setSelected(BOOKING_TYPE.INSTANT)}
        />
        <Option
          icon={CalendarClock}
          accent="indigo"
          active={selected === BOOKING_TYPE.SCHEDULED}
          title={BOOKING_TYPE_LABELS[BOOKING_TYPE.SCHEDULED]}
          description={BOOKING_TYPE_DESCRIPTIONS[BOOKING_TYPE.SCHEDULED]}
          onClick={() => setSelected(BOOKING_TYPE.SCHEDULED)}
        >
          {selected === BOOKING_TYPE.SCHEDULED && (
            <div className="mt-3 pt-3 border-t border-border-light">
              <DateTimePickerField
                label="Pickup date & time"
                icon={CalendarClock}
                value={scheduledAt}
                onChange={setScheduledAt}
                minDate={minScheduledDate}
                placeholder="Tap to choose pickup"
                helper={`Earliest available is ${formatPickupDateTime(minScheduledDate)} — we need at least ${minLeadHours} hour${minLeadHours === 1 ? '' : 's'} lead time for scheduled rides.`}
                sheetTitle="Pickup date & time"
              />
            </div>
          )}
        </Option>
      </div>
    </PageShell>
  );
};

/* ------------------------------------------------------------------ */

function Option({ icon: Icon, accent, active, title, description, onClick, children }) {
  const ring = active ? 'border-primary bg-primary/5' : 'border-border bg-white hover:bg-gray-50';
  const accentBg = accent === 'amber' ? 'bg-amber-100' : 'bg-indigo-100';
  const accentColor = accent === 'amber' ? 'text-amber-700' : 'text-indigo-700';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      className={`w-full text-left rounded-2xl border p-4 transition cursor-pointer ${ring}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${accentBg}`}
        >
          <Icon className={`w-5 h-5 ${accentColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-base font-bold text-text">{title}</p>
          </div>
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        </div>
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
            active ? 'border-primary bg-primary' : 'border-gray-300'
          }`}
        >
          {active && <Check className="w-3 h-3 text-white" />}
        </div>
      </div>
      {children}
    </div>
  );
}

export default HourlyBookingTypePage;
