import { ChevronDown, Filter, MapPin } from 'lucide-react';

export const DEFAULT_DRIVER_FILTERS = {
  carTypeMatch: 'true',
  minRating: '',
  onlineOnly: false,
  allIndiaOnly: false,
  minDrivingHoursPerDay: '',
  zoneId: '',
};

export function appendDriverFilterParams(params, filters, { outstation = true } = {}) {
  if (filters.carTypeMatch) params.append('carTypeMatch', filters.carTypeMatch);
  if (filters.minRating) params.append('minRating', filters.minRating);
  if (filters.onlineOnly) params.append('onlineOnly', 'true');
  if (outstation) {
    if (filters.allIndiaOnly) params.append('allIndiaOnly', 'true');
    if (filters.minDrivingHoursPerDay) {
      params.append('minDrivingHoursPerDay', filters.minDrivingHoursPerDay);
    }
    if (filters.zoneId) params.append('zoneId', filters.zoneId);
  }
}

export function applyClientDriverFilters(drivers, filters, { outstation = true } = {}) {
  let rows = drivers;
  if (!outstation && filters.onlineOnly) {
    rows = rows.filter((d) => d.isOnline);
  }
  if (!outstation && filters.minRating) {
    const min = Number(filters.minRating);
    if (Number.isFinite(min)) {
      rows = rows.filter((d) => Number(d.rating || 0) >= min);
    }
  }
  return rows;
}

function OutstationDriverFilterBar({
  filters,
  onChange,
  showOutstationOptions = true,
  zones = [],
}) {
  const set = (key, value) => onChange((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="mt-2 grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100">
      <p className="col-span-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1">
        <Filter className="w-3 h-3" />
        Driver filters
      </p>
      {showOutstationOptions && zones.length > 0 ? (
        <div className="relative col-span-2">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <select
            value={filters.zoneId || ''}
            onChange={(e) => set('zoneId', e.target.value)}
            className="w-full h-9 pl-9 pr-8 rounded-xl border border-slate-200 text-xs bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">All booking zones</option>
            {zones.map((z) => (
              <option key={z._id || z} value={z._id || z}>
                {z.name || 'Zone'}
                {z.city ? ` · ${z.city}` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-[11px] text-slate-600 col-span-2">
        <input
          type="checkbox"
          checked={filters.carTypeMatch === 'true'}
          onChange={(e) => set('carTypeMatch', e.target.checked ? 'true' : 'false')}
        />
        Match vehicle car type experience
      </label>
      <label className="flex items-center gap-2 text-[11px] text-slate-600">
        <input
          type="checkbox"
          checked={filters.onlineOnly}
          onChange={(e) => set('onlineOnly', e.target.checked)}
        />
        Online only
      </label>
      {showOutstationOptions ? (
        <label className="flex items-center gap-2 text-[11px] text-slate-600">
          <input
            type="checkbox"
            checked={filters.allIndiaOnly}
            onChange={(e) => set('allIndiaOnly', e.target.checked)}
          />
          All-India OK
        </label>
      ) : (
        <span />
      )}
      <input
        type="number"
        min="0"
        max="5"
        step="0.1"
        placeholder="Min rating"
        value={filters.minRating}
        onChange={(e) => set('minRating', e.target.value)}
        className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
      />
      {showOutstationOptions ? (
        <input
          type="number"
          min="4"
          max="16"
          placeholder="Min hrs/day"
          value={filters.minDrivingHoursPerDay}
          onChange={(e) => set('minDrivingHoursPerDay', e.target.value)}
          className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
        />
      ) : null}
    </div>
  );
}

export default OutstationDriverFilterBar;
