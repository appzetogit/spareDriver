import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
} from 'lucide-react';
import BottomSheet from '../BottomSheet';
import Button from '../Button';

/**
 * Reusable date + time picker used across the booking flow.
 *
 * Pattern: the field on the page is a button-style "select" that
 * shows the current selection (or a placeholder when empty). Tapping
 * it opens a bottom-sheet with two stacked selectors:
 *
 *   1. Day chips  — a horizontal strip of the next `dayWindow` days
 *      (default 14). Each chip is disabled when no time on that day
 *      satisfies the `minDate` floor (e.g. lead-time pushes "today"
 *      entirely into tomorrow).
 *   2. Time grid  — 30-min slots for the full 24-hour day
 *      (`dayStartHour` 0 → `dayEndHour` 24). Slots earlier than `minDate`
 *      (and never in the past) on the chosen day are disabled.
 *
 * The picker is **blank by default**: when `value` is `null/undefined`,
 * no day or time is preselected and the bottom Confirm button stays
 * disabled until the customer makes a real choice. The page calling
 * the picker should likewise disable its own Continue CTA until
 * `value` becomes a real date.
 *
 *   ┌─ DateTimePickerField (collapsed) ──────────┐
 *   │ 🗓  Pickup time                            ▾ │
 *   │     Tap to choose a date and time           │
 *   └─────────────────────────────────────────────┘
 *
 *   ┌─ Bottom sheet ─────────────────────────────┐
 *   │ Pickup time                                │
 *   │ ─── Choose a day ───                       │
 *   │ [Today][Tomorrow][Sat 14][Sun 15] …        │
 *   │ ─── Choose a time ───                      │
 *   │ [12:00 AM][12:30 AM] … [11:00 PM][11:30 PM] │
 *   │ ─── Or pick a specific date ───            │
 *   │ < native date input >                      │
 *   │ [ Confirm ]                                │
 *   └─────────────────────────────────────────────┘
 *
 * Props
 *   - `value`          ISO string / Date / null
 *   - `onChange(iso)`  called with an ISO string when the user
 *                      confirms a selection. The page is responsible
 *                      for persisting it onto the booking draft.
 *   - `minDate`        Date / ISO / null. The picker prevents any
 *                      selection earlier than this moment (lead time).
 *   - `maxDate`        Date / ISO / null. Hides days beyond this.
 *   - `label`          Field label (shown above the button).
 *   - `placeholder`    Empty-state hint ("Tap to choose…").
 *   - `helper`         Helper text below the field; rendered muted.
 *   - `error`          Error text below the field; rendered red.
 *   - `icon`           Lucide icon component used in the field
 *                      (defaults to `<CalendarClock>`).
 *   - `sheetTitle`     Bottom-sheet heading (defaults to `label`).
 *   - `dayWindow`      How many days to show as chips (default 14).
 *   - `dayStartHour`   Earliest slot to show (default 0 → 12:00 AM).
 *   - `dayEndHour`     Latest slot to show, exclusive (default 24 → last slot 11:30 PM).
 *   - `stepMinutes`    Grid step in minutes (default 30).
 *   - `disabled`       Disable the field button entirely.
 */
export default function DateTimePickerField({
  value,
  onChange,
  minDate,
  maxDate,
  label,
  placeholder = 'Tap to choose a date and time',
  helper,
  error,
  icon: Icon = CalendarClock,
  sheetTitle,
  dayWindow = 14,
  dayStartHour = 0,
  dayEndHour = 24,
  stepMinutes = 30,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);

  const parsedValue = useMemo(() => parseDate(value), [value]);
  const parsedMin = useMemo(() => parseDate(minDate), [minDate]);
  const parsedMax = useMemo(() => parseDate(maxDate), [maxDate]);

  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-text-muted mb-2">
          {label}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`w-full text-left flex items-center gap-3 h-12 rounded-xl border px-3 transition-all bg-gray-50 ${
          error
            ? 'border-danger ring-2 ring-danger/20'
            : parsedValue
              ? 'border-primary/40 bg-primary/[0.04]'
              : 'border-border hover:border-text-muted/60'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : 'active:scale-[0.99]'}`}
      >
        <span
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            parsedValue ? 'bg-primary/10 text-primary' : 'bg-white text-text-muted'
          }`}
        >
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          {parsedValue ? (
            <>
              <span className="block text-[11px] font-medium text-text-muted leading-none">
                {formatDayLabel(parsedValue)}
              </span>
              <span className="block text-sm font-semibold text-text truncate mt-0.5">
                {formatLongDate(parsedValue)} · {formatTime(parsedValue)}
              </span>
            </>
          ) : (
            <span className="text-sm text-text-muted truncate">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
      </button>
      {error ? (
        <p className="mt-1.5 text-[11px] text-danger inline-flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      ) : helper ? (
        <p className="mt-1.5 text-[11px] text-text-muted">{helper}</p>
      ) : null}

      {/* Sheet body lives in a child component that only mounts while
          `open` is true so its internal state (draftDay/draftTime) is
          seeded once per open via `useState` lazy initialisers — no
          setState-in-effect, no refs read during render. */}
      <BottomSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title={sheetTitle || label || 'Pick date and time'}
      >
        {open && (
          <DateTimeSheetBody
            value={parsedValue}
            minDate={parsedMin}
            maxDate={parsedMax}
            dayWindow={dayWindow}
            dayStartHour={dayStartHour}
            dayEndHour={dayEndHour}
            stepMinutes={stepMinutes}
            onConfirm={(date) => {
              onChange?.(date.toISOString());
              setOpen(false);
            }}
          />
        )}
      </BottomSheet>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom-sheet body                                                   */
/* ------------------------------------------------------------------ */

function DateTimeSheetBody({
  value,
  minDate,
  maxDate,
  dayWindow,
  dayStartHour,
  dayEndHour,
  stepMinutes,
  onConfirm,
}) {
  // The component only mounts when the sheet opens, so these lazy
  // initialisers run exactly once per open — no useEffect-with-
  // setState dance needed to "seed" the draft from `value`. We memo
  // the numeric bounds so the React Compiler can preserve the deps
  // graph of the derived useMemos below.
  const minMs = useMemo(
    () => (minDate instanceof Date ? minDate.getTime() : 0),
    [minDate],
  );
  const [nowMs] = useState(() => Date.now());
  const effectiveMinMs = Math.max(minMs, nowMs);
  const maxMs = useMemo(
    () =>
      maxDate instanceof Date ? maxDate.getTime() : Number.POSITIVE_INFINITY,
    [maxDate],
  );

  // Snapshot "today" at mount so the day strip doesn't visibly shift
  // if the user keeps the sheet open across a clock minute roll-over.
  // Lazy useState keeps the call out of render-purity hot paths.
  const [todayMidnight] = useState(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });

  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < dayWindow; i += 1) {
      const d = new Date(todayMidnight);
      d.setDate(d.getDate() + i);
      out.push(d);
    }
    return out;
  }, [todayMidnight, dayWindow]);

  const timeSlots = useMemo(
    () => buildTimeSlots(dayStartHour, dayEndHour, stepMinutes),
    [dayStartHour, dayEndHour, stepMinutes],
  );

  const [draftDay, setDraftDay] = useState(() => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return stripTime(value);
    }
    return null;
  });
  const [draftTime, setDraftTime] = useState(() => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return { h: value.getHours(), m: value.getMinutes() };
    }
    return null;
  });
  const [customDateStr, setCustomDateStr] = useState(() => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return dateInputValue(stripTime(value));
    }
    return '';
  });

  const dayHasAnyValidSlot = (day) => {
    if (!(day instanceof Date)) return false;
    const dayMs = day.getTime();
    if (Number.isFinite(maxMs) && dayMs > maxMs) return false;
    const last = timeSlots[timeSlots.length - 1];
    if (!last) return false;
    const lastMs = combine(day, last.h, last.m).getTime();
    return lastMs >= effectiveMinMs;
  };

  const isSlotDisabled = (slot) => {
    if (!draftDay) return true;
    const ms = combine(draftDay, slot.h, slot.m).getTime();
    if (ms < effectiveMinMs) return true;
    if (ms > maxMs) return true;
    return false;
  };

  const draftMoment = useMemo(() => {
    if (!draftDay || !draftTime) return null;
    return combine(draftDay, draftTime.h, draftTime.m);
  }, [draftDay, draftTime]);

  const draftOutOfRange = useMemo(() => {
    if (!draftMoment) return false;
    const ms = draftMoment.getTime();
    return ms < effectiveMinMs || ms > maxMs;
  }, [draftMoment, effectiveMinMs, maxMs]);

  const canConfirm = !!draftMoment && !draftOutOfRange;

  const onConfirmClick = () => {
    if (!canConfirm) return;
    onConfirm(draftMoment);
  };

  const onPickCustomDate = (str) => {
    setCustomDateStr(str);
    if (!str) {
      setDraftDay(null);
      return;
    }
    // `YYYY-MM-DD` from <input type="date"> is parsed as UTC by the
    // Date constructor; build a local-time Date instead so the day
    // boundary aligns with the user's clock.
    const [yStr, mStr, dStr] = str.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (!y || !m || !d) return;
    const next = new Date(y, m - 1, d, 0, 0, 0, 0);
    setDraftDay(next);
    // Drop a now-invalid time when the new day pushes us before the
    // lead-time floor so the user re-picks it.
    if (draftTime && combine(next, draftTime.h, draftTime.m).getTime() < effectiveMinMs) {
      setDraftTime(null);
    }
  };

  const minCustomDate = useMemo(() => {
    const floor = new Date(effectiveMinMs);
    floor.setHours(0, 0, 0, 0);
    return dateInputValue(floor);
  }, [effectiveMinMs]);

  const maxCustomDate = useMemo(() => {
    if (!Number.isFinite(maxMs)) return undefined;
    const ceil = new Date(maxMs);
    ceil.setHours(0, 0, 0, 0);
    return dateInputValue(ceil);
  }, [maxMs]);

  return (
    <div className="space-y-4">
      {/* Day chips */}
      <section>
        <div className="flex items-center gap-1.5 mb-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-text-muted" />
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Choose a day
          </h4>
        </div>
        <div className="-mx-5 px-5 overflow-x-auto">
          <div className="flex gap-2 pb-1 pr-5">
            {days.map((day) => {
              const enabled = dayHasAnyValidSlot(day);
              const selected =
                draftDay && stripTime(day).getTime() === stripTime(draftDay).getTime();
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    if (!enabled) return;
                    setDraftDay(day);
                    setCustomDateStr(dateInputValue(day));
                    if (
                      draftTime &&
                      combine(day, draftTime.h, draftTime.m).getTime() < effectiveMinMs
                    ) {
                      setDraftTime(null);
                    }
                  }}
                  disabled={!enabled}
                  className={`shrink-0 min-w-[72px] rounded-xl border px-2 py-1.5 text-left transition ${
                    selected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : enabled
                        ? 'border-border bg-white hover:border-text-muted/60'
                        : 'border-border bg-gray-50 text-text-muted/70 cursor-not-allowed opacity-60'
                  }`}
                >
                  <p className="text-[10px] font-semibold text-text-muted leading-none">
                    {dayChipTopLabel(day, todayMidnight)}
                  </p>
                  <p className="text-sm font-bold text-text leading-snug">
                    {dayChipDateLabel(day)}
                  </p>
                  <p className="text-[9px] text-text-muted leading-none">
                    {dayChipMonthLabel(day)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Time slots */}
      <section>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Clock3 className="w-3.5 h-3.5 text-text-muted" />
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Choose a time
          </h4>
        </div>
        {draftDay ? (
          <div className="grid grid-cols-4 gap-1.5 max-h-56 overflow-y-auto pr-1">
            {timeSlots.map((slot) => {
              const slotDisabled = isSlotDisabled(slot);
              const isSelected =
                draftTime && draftTime.h === slot.h && draftTime.m === slot.m;
              return (
                <button
                  key={`${slot.h}:${slot.m}`}
                  type="button"
                  disabled={slotDisabled}
                  onClick={() => setDraftTime({ h: slot.h, m: slot.m })}
                  className={`relative h-8 rounded-xl border text-[11px] font-semibold transition ${
                    isSelected
                      ? 'border-primary bg-primary text-slate-900'
                      : slotDisabled
                        ? 'border-border bg-gray-50 text-text-muted/60 cursor-not-allowed'
                        : 'border-border bg-white text-text hover:border-primary/50'
                  }`}
                >
                  {formatHourMinute(slot.h, slot.m)}
                  {isSelected && (
                    <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-900 text-primary flex items-center justify-center">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[12px] text-text-muted py-3 px-3 bg-gray-50 rounded-xl">
            Pick a day first to see available times.
          </p>
        )}
      </section>

      {/* Custom date — when the day chip strip doesn't go far enough */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-text-muted" />
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Or pick a specific date
          </h4>
        </div>
        <input
          type="date"
          value={customDateStr}
          min={minCustomDate}
          max={maxCustomDate}
          onChange={(e) => onPickCustomDate(e.target.value)}
          className="w-full h-11 bg-gray-50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </section>

      {draftOutOfRange && (
        <p className="text-[12px] text-amber-700 inline-flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            That time is outside the allowed window. Pick another day
            or a later time.
          </span>
        </p>
      )}

      <div className="pt-2 sticky bottom-0 bg-white">
        <Button fullWidth onClick={onConfirmClick} disabled={!canConfirm}>
          {draftMoment
            ? `Confirm · ${formatLongDate(draftMoment)}, ${formatTime(draftMoment)}`
            : 'Confirm'}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function parseDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function stripTime(d) {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function combine(day, h, m) {
  const next = new Date(day);
  next.setHours(h, m, 0, 0);
  return next;
}

function buildTimeSlots(startHour, endHour, stepMinutes) {
  const out = [];
  const step = Math.max(5, Math.min(60, stepMinutes));
  for (let h = startHour; h < endHour; h += 1) {
    for (let m = 0; m < 60; m += step) {
      out.push({ h, m });
    }
  }
  return out;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateInputValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayChipTopLabel(d, anchor) {
  const base = anchor instanceof Date ? anchor : new Date();
  const tomorrow = new Date(base);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(d, base)) return 'Today';
  if (isSameDay(d, tomorrow)) return 'Tomorrow';
  return DOW[d.getDay()];
}

function dayChipDateLabel(d) {
  return String(d.getDate());
}

function dayChipMonthLabel(d) {
  return MONTH[d.getMonth()];
}

function formatDayLabel(d) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(d, now)) return 'Today';
  if (isSameDay(d, tomorrow)) return 'Tomorrow';
  return DOW[d.getDay()];
}

function formatLongDate(d) {
  return `${DOW[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()}`;
}

function formatTime(d) {
  return formatHourMinute(d.getHours(), d.getMinutes());
}

function formatHourMinute(h, m) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${pad2(h12)}:${pad2(m)} ${suffix}`;
}
