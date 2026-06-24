import { X, Phone, Star, Gauge, MapPin, Car, Compass } from 'lucide-react';
import Modal from '../../../components/Modal';
import { DriverCarExperienceChips } from './DriverCarExperienceChips';

export default function AdminDriverDetailModal({ driver, subscriptionZone, open, onClose }) {
  if (!open || !driver) return null;

  const zones = driver.preferredOutstationZones || [];
  const inZone = driver.inSubscriptionZone;

  return (
    <Modal isOpen={open} onClose={onClose} title="Driver details">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-lg text-slate-600">
            {driver.name?.charAt(0) || '?'}
          </div>
          <div>
            <p className="font-bold text-slate-900">{driver.name}</p>
            <p className="text-sm text-slate-500 inline-flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" />
              {driver.phone || '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <InfoPill icon={Star} label="Rating" value={Number(driver.rating || 0).toFixed(1)} />
          <InfoPill icon={Car} label="Experience" value={`${driver.experienceYears || 0} yrs`} />
          <InfoPill
            icon={Compass}
            label="All-India"
            value={driver.outstationAllIndiaOk ? 'Yes' : 'No'}
          />
          <InfoPill
            icon={Gauge}
            label="Daily capacity"
            value={driver.outstationMaxDrivingHoursPerDay ? `${driver.outstationMaxDrivingHoursPerDay}h` : '—'}
          />
        </div>

        <div>
          <p className="text-xs font-bold uppercase text-slate-500 mb-1.5">Car experience</p>
          <DriverCarExperienceChips experience={driver.carTypeExperience} />
        </div>

        <div>
          <p className="text-xs font-bold uppercase text-slate-500 mb-1.5">Outstation zones</p>
          {zones.length === 0 ? (
            <p className="text-sm text-slate-400">No zones selected</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {zones.map((z) => {
                const id = String(z?._id || z);
                const isSubZone = subscriptionZone && String(subscriptionZone._id || subscriptionZone) === id;
                return (
                  <span
                    key={id}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      isSubZone
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <MapPin className="w-3 h-3" />
                    {z?.name || 'Zone'}
                    {isSubZone && ' ✓'}
                  </span>
                );
              })}
            </div>
          )}
          {subscriptionZone && (
            <p className={`text-xs mt-2 font-medium ${inZone ? 'text-emerald-600' : 'text-amber-600'}`}>
              {inZone
                ? `Covers subscription zone: ${subscriptionZone.name || 'selected zone'}`
                : `Not in subscription zone: ${subscriptionZone.name || 'selected zone'}`}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full h-10 rounded-xl bg-slate-100 text-sm font-semibold text-slate-700 hover:bg-slate-200"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

function InfoPill({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] text-slate-400 flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
