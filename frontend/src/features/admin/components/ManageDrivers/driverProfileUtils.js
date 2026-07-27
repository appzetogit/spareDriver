export const formatDate = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const formatAvailability = (availability) => {
  if (!availability) return '—';
  return availability.replace(/-/g, ' ');
};

export const getCarTypeLabel = (type) => {
  if (!type) return null;
  if (typeof type === 'object' && type.name) {
    return type.name.charAt(0).toUpperCase() + type.name.slice(1);
  }
  return null;
};

export const ONBOARDING_STEP_LABELS = {
  1: 'Identity',
  2: 'Credentials',
  3: 'Bank details',
  4: 'Safety & documents',
  5: 'Live verification',
  6: 'Training / submitted',
};
