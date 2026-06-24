import { useState } from 'react';
import { Compass, Gauge, MapPinned, X } from 'lucide-react';
import BottomSheet from '../../../../components/BottomSheet';
import Button from '../../../../components/Button';
import Toggle from '../../../../components/Toggle';

const HOUR_OPTIONS = [6, 8, 10, 12, 14, 16];

const OutstationPreferencesSheet = ({
  isOpen,
  onClose,
  onConfirm,
  submitting = false,
  initialAllIndiaOk = false,
  initialHours = 10,
}) => {
  const [allIndiaOk, setAllIndiaOk] = useState(!!initialAllIndiaOk);
  const [hours, setHours] = useState(initialHours || 10);

  const canConfirm = !submitting;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm?.({ allIndiaOk, maxDrivingHoursPerDay: hours });
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      showHandle={false}
      className="!max-w-xl"
    >
      <div className="-mt-2">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Compass className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-text leading-tight">
              Outstation preferences
            </h3>
            <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
              First-time setup — tell us your comfort with long-distance trips.
            </p>
          </div>
          <button
            type="button"
            onClick={submitting ? undefined : onClose}
            disabled={submitting}
            className="p-1.5 rounded-full hover:bg-gray-100 text-text-secondary disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border-light p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text inline-flex items-center gap-1.5">
                  <MapPinned className="w-4 h-4 text-primary" />
                  All-India / multi-state trips
                </p>
                <p className="text-[11px] text-text-muted mt-1 leading-snug">
                  Are you comfortable driving across multiple states on outstation assignments?
                </p>
              </div>
              <Toggle checked={allIndiaOk} onChange={setAllIndiaOk} disabled={submitting} />
            </div>
          </div>

          <div className="rounded-2xl border border-border-light p-4">
            <p className="text-sm font-semibold text-text inline-flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-primary" />
              Per-day driving capacity
            </p>
            <p className="text-[11px] text-text-muted mt-1 mb-3">
              How many hours can you drive per day on an outstation trip?
            </p>
            <div className="flex flex-wrap gap-2">
              {HOUR_OPTIONS.map((h) => {
                const active = hours === h;
                return (
                  <button
                    key={h}
                    type="button"
                    disabled={submitting}
                    onClick={() => setHours(h)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border-light bg-white text-text-secondary'
                    }`}
                  >
                    {h}h
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-border-light flex items-center gap-3">
          <Button variant="outline" size="md" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="driver"
            size="md"
            className="flex-1"
            onClick={handleConfirm}
            disabled={!canConfirm}
            loading={submitting}
          >
            Save & continue
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
};

export default OutstationPreferencesSheet;
