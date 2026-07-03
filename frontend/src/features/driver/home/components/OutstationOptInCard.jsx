import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Compass, Gauge, MapPin, Pencil } from 'lucide-react';
import Card from '../../../../components/Card';
import Toggle from '../../../../components/Toggle';
import api from '../../../../utils/api';
import OutstationSettingsSheet from './OutstationSettingsSheet';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';

const OutstationOptInCard = ({
  initial,
  initialZones = [],
  preferencesCompleted = false,
  initialAllIndiaOk = false,
  initialMaxHours = 10,
}) => {
  const refetchProfile = useDriverProfileStore((s) => s.fetch);
  const profileKey = buildCacheKey('driver-profile', {});

  const initialZoneIds = useMemo(
    () =>
      (Array.isArray(initialZones) ? initialZones : [])
        .map((z) => String(z?._id || z))
        .filter(Boolean),
    [initialZones],
  );

  const [available, setAvailable] = useState(!!initial);
  const [zones, setZones] = useState(Array.isArray(initialZones) ? initialZones : []);
  const [allIndiaOk, setAllIndiaOk] = useState(!!initialAllIndiaOk);
  const [maxHours, setMaxHours] = useState(initialMaxHours || 10);
  const [prefsDone, setPrefsDone] = useState(!!preferencesCompleted);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingEnable, setPendingEnable] = useState(false);

  useEffect(() => { setAvailable(!!initial); }, [initial]);
  useEffect(() => { setZones(Array.isArray(initialZones) ? initialZones : []); }, [initialZones]);
  useEffect(() => { setAllIndiaOk(!!initialAllIndiaOk); }, [initialAllIndiaOk]);
  useEffect(() => { setMaxHours(initialMaxHours || 10); }, [initialMaxHours]);
  useEffect(() => { setPrefsDone(!!preferencesCompleted); }, [preferencesCompleted]);

  const persist = async ({ nextAvailable, zoneIds, allIndiaOk: india, maxDrivingHoursPerDay }) => {
    setSaving(true);
    try {
      const payload = { available: nextAvailable };
      if (Array.isArray(zoneIds)) payload.zoneIds = zoneIds;
      if (india != null) payload.allIndiaOk = india;
      if (maxDrivingHoursPerDay != null) payload.maxDrivingHoursPerDay = maxDrivingHoursPerDay;
      const res = await api.put('/driver/preferences/outstation-availability', payload);
      const updated = res?.data?.data || null;
      setAvailable(!!updated?.availableForOutstation);
      setZones(updated?.preferredOutstationZones || []);
      setAllIndiaOk(!!updated?.outstationAllIndiaOk);
      setMaxHours(updated?.outstationMaxDrivingHoursPerDay || maxHours);
      setPrefsDone(!!updated?.outstationPreferencesCompletedAt);
      refetchProfile?.(profileKey, {}, { force: true });
      toast.success(nextAvailable ? "You're visible for outstation trips" : "Opted out of outstation");
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't update outstation preference");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (next) => {
    if (saving) return;
    if (!next) {
      setAvailable(false);
      const ok = await persist({ nextAvailable: false });
      if (!ok) setAvailable(true);
      return;
    }
    if (!initialZoneIds.length || !prefsDone) {
      setPendingEnable(true);
      setSettingsOpen(true);
      return;
    }
    setAvailable(true);
    const ok = await persist({
      nextAvailable: true,
      zoneIds: initialZoneIds,
      allIndiaOk,
      maxDrivingHoursPerDay: maxHours,
    });
    if (!ok) setAvailable(false);
  };

  const handleSettingsConfirm = async ({ zoneIds, allIndiaOk: india, maxDrivingHoursPerDay }) => {
    const enabling = pendingEnable || !available;
    const ok = await persist({
      nextAvailable: enabling ? true : available,
      zoneIds,
      allIndiaOk: india,
      maxDrivingHoursPerDay,
    });
    if (ok) {
      if (enabling) setAvailable(true);
      setSettingsOpen(false);
      setPendingEnable(false);
    }
  };

  const zoneChips = useMemo(
    () =>
      zones
        .map((z) => ({ id: String(z?._id || z), name: z?.name || 'Zone', city: z?.city || '' }))
        .filter((z) => z.id && z.id !== 'undefined'),
    [zones],
  );

  return (
    <>
      <Card className="animate-fade-in-up !p-3 sm:!p-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${available ? 'bg-primary/15' : 'bg-bg'}`}>
            <Compass className={`w-4 h-4 ${available ? 'text-primary' : 'text-text-secondary'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text leading-tight">Outstation trips</p>
            <p className="text-[10px] text-text-muted">Admin-assigned multi-day trips</p>
          </div>
          <Toggle checked={available} onChange={handleToggle} disabled={saving} />
        </div>

        {available && (
          <div className="mt-3 pt-3 border-t border-border-light space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase text-text-muted mb-1">Zones & capacity</p>
                {zoneChips.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {zoneChips.slice(0, 4).map((z) => (
                      <span key={z.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-primary/10 text-[10px] font-semibold text-slate-700">
                        <MapPin className="w-2.5 h-2.5 text-primary" />
                        {z.name}
                      </span>
                    ))}
                    {zoneChips.length > 4 && (
                      <span className="text-[10px] text-text-muted">+{zoneChips.length - 4}</span>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-amber-700">No zones selected</p>
                )}
                <p className="text-[10px] text-text-muted mt-1 inline-flex items-center gap-1 flex-wrap">
                  <Gauge className="w-3 h-3" />
                  {allIndiaOk ? 'All-India OK' : 'Zone trips only'}
                  <span className="text-text-muted/50">·</span>
                  {maxHours}h/day
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setPendingEnable(false); setSettingsOpen(true); }}
                disabled={saving}
                className="shrink-0 text-[10px] font-bold text-primary inline-flex items-center gap-0.5 px-2 py-1 rounded-lg bg-primary/10"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
            </div>
          </div>
        )}

        {!available && zoneChips.length === 0 && (
          <button
            type="button"
            onClick={() => { setPendingEnable(true); setSettingsOpen(true); }}
            className="mt-2 w-full text-[11px] font-semibold text-primary py-1.5 rounded-lg bg-primary/5"
          >
            Set up outstation preferences
          </button>
        )}
      </Card>

      <OutstationSettingsSheet
        isOpen={settingsOpen}
        onClose={() => { if (!saving) { setSettingsOpen(false); setPendingEnable(false); } }}
        onConfirm={handleSettingsConfirm}
        initialZoneIds={zoneChips.map((z) => z.id)}
        initialAllIndiaOk={allIndiaOk}
        initialHours={maxHours}
        submitting={saving}
        requirePreferences={pendingEnable && !prefsDone}
      />
    </>
  );
};

export default OutstationOptInCard;
