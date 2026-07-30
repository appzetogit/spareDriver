/** Map catalog API items to Select component options and sort them alphabetically */
export function toSelectOptions(items = [], labelKey = 'name') {
  const options = items.map((item) => ({
    value: String(item._id),
    label: item[labelKey] || item.name,
    image: item.logo || item.image || '',
  }));
  return options.sort((a, b) =>
    (a.label || '').localeCompare(b.label || '', undefined, { sensitivity: 'base' })
  );
}

/** Display helpers for populated or legacy car documents */
export function getCarBrandName(car) {
  return car?.brandId?.name || car?.brand || '—';
}

export function getCarModelName(car) {
  return car?.modelId?.name || car?.model || '—';
}

export function getCarCategoryName(car) {
  return car?.carTypeId?.name || '—';
}

export function getCarFuelName(car) {
  return car?.fuelTypeId?.name || car?.fuelType || '—';
}

export const TRANSMISSION_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Automatic' },
];

/** One line label for driver vehicle experience (populated refs). */
export function formatVehicleExperienceLabel(entry) {
  if (!entry) return '—';
  const brand = entry.brandId?.name || '';
  const model = entry.modelId?.name || '';
  const category = entry.carTypeId?.name || '';
  const fuel = entry.fuelTypeId?.name || '';
  const parts = [brand, model].filter(Boolean).join(' ');
  const meta = [category, fuel, entry.transmission].filter(Boolean).join(' · ');
  return parts ? `${parts}${meta ? ` (${meta})` : ''}` : meta || '—';
}
