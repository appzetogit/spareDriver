import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Navigation,
  Phone,
  Star,
} from 'lucide-react';
import { DriverCarExperienceChips } from './DriverCarExperienceChips';
import { formatDateTime12 } from '../../../utils/datetime';

const AssignDriverPickerRow = ({ driver, selected, onSelect }) => {
  const hasConflict = driver.hasConflict;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left flex flex-col gap-0 rounded-2xl border transition-all duration-150 overflow-hidden ${
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : hasConflict
            ? 'border-rose-200 bg-rose-50/30 opacity-70'
            : 'border-slate-100 hover:border-primary/30 hover:bg-slate-50/80'
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm uppercase shrink-0 ${
            selected
              ? 'bg-primary text-dark'
              : hasConflict
                ? 'bg-rose-100 text-rose-600'
                : 'bg-slate-100 text-slate-600'
          }`}
        >
          {driver.name?.charAt(0) || '?'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-900 truncate">{driver.name}</p>
            {selected && !hasConflict ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-2.5 h-2.5" /> Selected
              </span>
            ) : null}
            {hasConflict ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-full">
                <AlertTriangle className="w-2.5 h-2.5" /> Conflict
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400 mt-0.5">
            <span className="inline-flex items-center gap-1">
              <Phone className="w-2.5 h-2.5" />
              {driver.phone || driver.phone_no || '—'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Star className="w-2.5 h-2.5 text-amber-400" />
              {Number(driver.rating || 0).toFixed(1)}
            </span>
            <span>{driver.experienceYears || 0}y exp</span>
            {driver.isOnline ? (
              <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Online
              </span>
            ) : null}
            {driver.isOnTrip ? (
              <span className="text-amber-500 font-semibold">On trip</span>
            ) : null}
            {driver.distanceKm !== null && driver.distanceKm !== undefined ? (
              <span className="inline-flex items-center gap-1 text-indigo-600 font-semibold">
                <Navigation className="w-2.5 h-2.5" />
                {driver.distanceKm} km
              </span>
            ) : null}
          </div>
          <DriverCarExperienceChips experience={driver.carTypeExperience} className="mt-1.5" />
          {driver.outstationAllIndiaOk || driver.outstationMaxDrivingHoursPerDay ? (
            <p className="text-[10px] text-slate-500 mt-1">
              {driver.outstationAllIndiaOk ? 'All-India OK' : 'Zone trips only'}
              {driver.outstationMaxDrivingHoursPerDay
                ? ` · ${driver.outstationMaxDrivingHoursPerDay}h/day capacity`
                : ''}
            </p>
          ) : null}
          {(driver.preferredOutstationZones || []).length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {driver.preferredOutstationZones.slice(0, 3).map((z) => (
                <span
                  key={z._id || z}
                  className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full bg-indigo-50 text-indigo-500 text-[9px] font-semibold"
                >
                  <MapPin className="w-2 h-2" />
                  {z?.name || 'Zone'}
                </span>
              ))}
              {driver.preferredOutstationZones.length > 3 ? (
                <span className="text-[9px] text-slate-300">
                  +{driver.preferredOutstationZones.length - 3}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {hasConflict && (driver.conflicts || []).length > 0 ? (
        <div className="bg-rose-50/80 border-t border-rose-100 px-4 py-2.5 space-y-1.5">
          {driver.conflicts.slice(0, 3).map((c) => (
            <div key={c._id} className="flex items-start gap-2 text-[11px] text-rose-600">
              <span className="w-1 h-1 rounded-full bg-rose-400 mt-1.5 shrink-0" />
              <span className="font-mono text-[10px] bg-rose-100 px-1.5 py-0.5 rounded shrink-0">
                {c.bookingNumber || c._id?.slice?.(-6)}
              </span>
              <span className="truncate text-rose-500">
                {formatDateTime12(c.startMs)} → {formatDateTime12(c.endMs)}
                {c.conflictKind === 'subscription' || c.bookingType === 'subscription'
                  ? ` · subscription${c.planName ? ` (${c.planName})` : ''}`
                  : ` · ${c.serviceType}/${c.bookingType}`}
              </span>
            </div>
          ))}
          {driver.conflicts.length > 3 ? (
            <p className="text-[10px] text-rose-400 pl-3">
              +{driver.conflicts.length - 3} more conflicts
            </p>
          ) : null}
        </div>
      ) : null}
    </button>
  );
};

export default AssignDriverPickerRow;
