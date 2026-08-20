import Input from '../../../../components/Input';

/**
 * Outstation V2 duration-based pricing:
 *
 *   Base = dailyRate × 24h blocks (+ min 1 day under 24h)
 *        + extraHourCharge × remaining hours
 *   Food = foodAllowancePerDay × service days
 *   Stay = stayAllowancePerNight × overnight halts (≥24h trips only)
 */
const OutstationFieldsEditor = ({ outstation, onChange }) => {
  const update = (patch) => onChange({ ...outstation, ...patch });
  const o = outstation || {};

  // Legacy combined per-night allowance — if a saved doc still has it
  // and the new split fields are both 0, surface a notice so the admin
  // knows to migrate. The fare engine keeps honouring the legacy
  // value until the admin saves new split values.
  const legacyAllowance = Number(o.allowancePerNight) || 0;
  const hasSplit =
    (Number(o.foodAllowancePerDay) || 0) > 0 ||
    (Number(o.stayAllowancePerNight) || 0) > 0;
  const showLegacyNotice = legacyAllowance > 0 && !hasSplit;

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-bold text-slate-900">
          Outstation rates
          <span className="text-[10px] uppercase tracking-wide text-primary font-semibold ml-1">
            Round trip
          </span>
        </h4>
        <p className="text-xs text-slate-500">
          Fare is calculated from exact trip duration (not calendar dates):
          daily rate × 24-hour blocks (minimum 1 day under 24h) + extra
          hour charge for remaining hours + food/stay allowances. Min/max
          days enforce minimum and maximum trip length in hours (minDays ×
          24h). Service charge and GST are added on top. Toll &amp; parking
          are paid directly by the customer to the driver.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Daily rate (₹/day)"
          type="number"
          min={0}
          value={o.dailyRate ?? 0}
          onChange={(e) => update({ dailyRate: Number(e.target.value) })}
          helper="Charged per complete 24-hour block (minimum 1 block under 24h)."
        />
        <Input
          label="Extra hour charge (₹/hr)"
          type="number"
          min={0}
          value={o.extraHourCharge ?? 0}
          onChange={(e) => update({ extraHourCharge: Number(e.target.value) })}
          helper="Used when the customer extends by hours mid-trip. Leave 0 to use daily rate ÷ 24."
        />
        <Input
          label="Food allowance (₹/day)"
          type="number"
          min={0}
          value={o.foodAllowancePerDay ?? 0}
          onChange={(e) =>
            update({ foodAllowancePerDay: Number(e.target.value) })
          }
          helper="Charged once per billed 24h service block. Waived when the customer feeds the driver."
        />
        <Input
          label="Stay allowance (₹/night)"
          type="number"
          min={0}
          value={o.stayAllowancePerNight ?? 0}
          onChange={(e) =>
            update({ stayAllowancePerNight: Number(e.target.value) })
          }
          helper="Charged when trip spans ≥24h (one per 24h block). Waived when the customer hosts the driver."
        />
        <div />
        <div className="grid grid-cols-2 gap-3 md:col-span-2">
          <Input
            label="Min days"
            type="number"
            min={1}
            value={o.minDays ?? 1}
            onChange={(e) => update({ minDays: Number(e.target.value) })}
          />
          <Input
            label="Max days (0 = unlimited)"
            type="number"
            min={0}
            value={o.maxDays ?? 0}
            onChange={(e) => update({ maxDays: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100 space-y-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Return lifecycle</h4>
          <p className="text-xs text-slate-500">
            Outstation extend nudge uses the same in-app popup +{' '}
            <code className="text-[10px]">ride_ending_soon</code> push as
            hourly (no Redis). Values below are snapshotted when the trip
            starts.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Return reminder (minutes before)"
            type="number"
            min={0}
            value={o.returnReminderMinutes ?? 120}
            onChange={(e) =>
              update({ returnReminderMinutes: Number(e.target.value) })
            }
            helper="First “extend your trip” popup + push before expected return."
          />
          <Input
            label="Return grace (minutes after)"
            type="number"
            min={0}
            value={o.returnGraceMinutes ?? 30}
            onChange={(e) =>
              update({ returnGraceMinutes: Number(e.target.value) })
            }
            helper="No overtime during grace. Trip stays active."
          />
          <Input
            label="Return prompt repeat (minutes)"
            type="number"
            min={0}
            value={o.returnPromptRepeatMinutes ?? 30}
            onChange={(e) =>
              update({ returnPromptRepeatMinutes: Number(e.target.value) })
            }
            helper="Re-prompt before return until the user taps Not now. 0 = once only."
          />
          <Input
            label="Return auto-complete (deprecated)"
            type="number"
            min={0}
            value={o.returnAutoCompleteHours ?? 0}
            onChange={(e) =>
              update({ returnAutoCompleteHours: Number(e.target.value) })
            }
            helper="Deprecated. After grace the trip stays active and the customer pays overtime online. This knob no longer auto-completes the trip."
          />
        </div>
      </div>

      {showLegacyNotice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-snug">
          <strong>Legacy allowance detected:</strong> this pricing doc
          still uses the old combined &ldquo;allowance per night&rdquo;
          of <strong>₹{legacyAllowance}</strong> for both food and
          stay. The fare engine is using that as a fallback. Enter food
          and stay amounts above to migrate — the legacy value will be
          ignored once either of the new fields is non-zero.
        </div>
      )}
    </div>
  );
};

export default OutstationFieldsEditor;
