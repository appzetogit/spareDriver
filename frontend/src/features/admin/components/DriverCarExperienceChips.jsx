import { Car } from 'lucide-react';

export function formatCarLabel(car) {
  if (!car) return '—';
  const brand = car.brandId?.name || '';
  const model = car.modelId?.name || '';
  const type = car.carTypeId?.name || '';
  const number = car.vehicleNumber || '';
  const name = [brand, model].filter(Boolean).join(' ');
  if (name && number) return `${name} · ${number}`;
  return name || number || 'Car';
}

export function DriverCarExperienceChips({ experience = [], className = '' }) {
  const items = (Array.isArray(experience) ? experience : [])
    .map((ct) => (typeof ct === 'object' ? ct?.name : null))
    .filter(Boolean);

  if (!items.length) {
    return (
      <span className={`text-[10px] text-slate-400 ${className}`}>No car experience listed</span>
    );
  }

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {items.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full bg-slate-100 text-slate-600 text-[9px] font-semibold"
        >
          <Car className="w-2.5 h-2.5" />
          {name}
        </span>
      ))}
    </div>
  );
}
