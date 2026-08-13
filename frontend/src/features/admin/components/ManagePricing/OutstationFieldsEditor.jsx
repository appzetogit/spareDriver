import Input from '../../../../components/Input';

/**
 * Outstation pricing has three knobs:
 *
 *   - Daily rate (₹/day)               — flat base fare for every
 *                                        calendar day of the round trip.
 *   - Food allowance (₹/day)           — driver food. Charged per day,
 *                                        waived when the customer
 *                                        agrees to feed the driver.
 *   - Stay allowance (₹/night)         — driver accommodation. Charged
 *                                        per overnight halt (= days − 1),
 *                                        waived when the customer hosts
 *                                        the driver.
 *
 * The customer UI currently exposes a single all-or-nothing toggle
 * that waives BOTH allowances together. The split exists here so
 * admins can tune the two costs independently (food scales with days,
 * stay with nights) and future UIs can split the toggle.
 *
 * Toll & parking are NOT billed by the platform — the customer settles
 * those directly with the driver.
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
          Fare = daily rate × days + food allowance × days + stay
          allowance × nights. Food and stay allowances are waived when
          the customer agrees to arrange the driver&rsquo;s meals and
          accommodation themselves. Service charge and GST are added on
          top. Toll &amp; parking are paid directly by the customer to
          the driver and are not added to the fare.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Daily rate (₹/day)"
          type="number"
          min={0}
          value={o.dailyRate ?? 0}
          onChange={(e) => update({ dailyRate: Number(e.target.value) })}
          helper="Flat ₹ billed for every calendar day of the round trip."
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
          helper="Charged once per day of the trip. Waived when the customer agrees to feed the driver."
        />
        <Input
          label="Stay allowance (₹/night)"
          type="number"
          min={0}
          value={o.stayAllowancePerNight ?? 0}
          onChange={(e) =>
            update({ stayAllowancePerNight: Number(e.target.value) })
          }
          helper="Charged for every overnight halt (= days − 1). Waived when the customer hosts the driver."
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
            Outstation-only prompts around expected return. Never charges
            overtime automatically. Auto-complete stays off unless you set
            hours &gt; 0.
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
            helper="Default 120 — “Your trip is expected to end at …”"
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
            helper="How often to re-prompt after grace if still no decision."
          />
          <Input
            label="Return auto-complete (hours, 0 = off)"
            type="number"
            min={0}
            value={o.returnAutoCompleteHours ?? 0}
            onChange={(e) =>
              update({ returnAutoCompleteHours: Number(e.target.value) })
            }
            helper="Leave 0 — do not silently complete trips."
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
