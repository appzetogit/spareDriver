import { useEffect, useMemo, useState } from 'react';
import { Compass, Gauge, Loader2, MapPin, Search, X } from 'lucide-react';
import BottomSheet from '../../../../components/BottomSheet';
import Button from '../../../../components/Button';
import Toggle from '../../../../components/Toggle';
import api from '../../../../utils/api';

const HOUR_OPTIONS = [6, 8, 10, 12, 14, 16];

/**
 * Combined outstation settings: zones + all-India preference + daily driving capacity.
 */
const OutstationSettingsSheet = ({
  isOpen,
  onClose,
  onConfirm,
  initialZoneIds = [],
  initialAllIndiaOk = false,
  initialHours = 10,
  submitting = false,
  requirePreferences = false,
}) => {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set(initialZoneIds.map(String)));
  const [allIndiaOk, setAllIndiaOk] = useState(!!initialAllIndiaOk);
  const [hours, setHours] = useState(initialHours || 10);

  // Reset drafts only when the sheet transitions to open — the initial* props
  // get new identities on every parent render, so keying the effect on them
  // would wipe the user's in-progress selection.
  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set(initialZoneIds.map(String)));
    setAllIndiaOk(!!initialAllIndiaOk);
    setHours(initialHours || 10);
    setSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get('/common/zones')
      .then((res) => {
        if (cancelled) return;
        const list = res?.data?.data || [];
        setZones(Array.isArray(list) ? list.filter((z) => z?.isActive !== false) : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || 'Could not load zones');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((z) => {
      const name = (z?.name || '').toLowerCase();
      const city = (z?.city || '').toLowerCase();
      return name.includes(q) || city.includes(q);
    });
  }, [zones, search]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const canConfirm = selected.size > 0 && !submitting;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm?.({
      zoneIds: Array.from(selected),
      allIndiaOk,
      maxDrivingHoursPerDay: hours,
    });
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      showHandle
      className="!max-w-xl"
    >
      <div className="px-1 pb-1">
        <div className="flex items-start gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-text">Round trip settings</h3>
            <p className="text-[10px] text-text-muted mt-0.5">Zones, travel range & daily capacity</p>
          </div>
          <button
            type="button"
            onClick={submitting ? undefined : onClose}
            className="p-1 rounded-full hover:bg-gray-100 text-text-secondary"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 max-h-[62vh] overflow-y-auto pr-0.5">
          {/* Zones — compact */}
          <section className="rounded-xl border border-border-light p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted mb-2">
              Pickup zones ({selected.size})
            </p>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search zone"
                className="w-full h-8 pl-8 pr-2 text-xs rounded-lg border border-border-light"
              />
            </div>
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
              </div>
            ) : error ? (
              <p className="text-xs text-rose-600">{error}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {filtered.map((z) => {
                  const id = String(z._id);
                  const on = selected.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle(id)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border transition ${
                        on
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border-light bg-white text-text-secondary'
                      }`}
                    >
                      <MapPin className="w-2.5 h-2.5" />
                      {z.name}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Preferences */}
          <section className="rounded-xl border border-border-light p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text">All-India / multi-state</p>
                <p className="text-[10px] text-text-muted">Comfortable across states?</p>
              </div>
              <Toggle checked={allIndiaOk} onChange={setAllIndiaOk} disabled={submitting} />
            </div>
            <div>
              <p className="text-xs font-semibold text-text inline-flex items-center gap-1 mb-1.5">
                <Gauge className="w-3.5 h-3.5 text-primary" />
                Daily driving capacity
              </p>
              <div className="flex flex-wrap gap-1.5">
                {HOUR_OPTIONS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    disabled={submitting}
                    onClick={() => setHours(h)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      hours === h
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border-light text-text-secondary'
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
            {requirePreferences && (
              <p className="text-[10px] text-amber-700">
                Required the first time you turn on outstation.
              </p>
            )}
          </section>
        </div>

        <div className="mt-3 pt-3 border-t border-border-light flex gap-2">
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
            Save
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
};

export default OutstationSettingsSheet;
