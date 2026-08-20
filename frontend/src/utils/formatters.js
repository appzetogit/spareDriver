/**
 * Format currency in INR
 */
export const formatCurrency = (amount) => {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
};

/**
 * Format distance 
 */
export const formatDistance = (km) => {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
};

/**
 * Format duration from minutes
 */
export const formatDuration = (minutes) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours} Hours`;
};

/**
 * Live ride countdown for customers — always includes a ticking seconds
 * component so long bookings (e.g. 3h 59m) still count down by the second.
 *
 *   ≥ 1 day  → `2d 5h 03m 09s`
 *   ≥ 1 hour → `3h 59m 45s`
 *   < 1 hour → `59:45`
 */
export const formatRideCountdown = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days >= 1) {
    const parts = [`${days}d`];
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${String(minutes).padStart(2, '0')}m`);
    parts.push(`${String(secs).padStart(2, '0')}s`);
    return parts.join(' ');
  }
  if (hours >= 1) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/**
 * Booked-time remaining for drivers — hours/minutes only (no seconds).
 * Matches the customer-facing `Xh MMm` shape without the live seconds tick.
 */
export const formatBookedTimeRemaining = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days >= 1) {
    return hours > 0 ? `${days}d ${hours}h` : `${days} day${days === 1 ? '' : 's'}`;
  }
  if (hours >= 1) {
    return minutes > 0
      ? `${hours}h ${String(minutes).padStart(2, '0')}m`
      : `${hours}h`;
  }
  if (minutes >= 1) return `${minutes} min`;
  return 'less than a minute';
};

/**
 * Format a ride-extension length stored as fractional hours
 * (0.25 = 15 min, 0.5 = 30 min, 1 = 1 hour).
 */
export const formatExtensionHours = (hours, { compact = true } = {}) => {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return compact ? '0' : '0 min';
  const totalMin = Math.round(h * 60);
  if (totalMin < 60) {
    return compact ? `${totalMin} min` : `${totalMin} minutes`;
  }
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins === 0) {
    return compact
      ? `${hrs}h`
      : `${hrs} hour${hrs === 1 ? '' : 's'}`;
  }
  return compact ? `${hrs}h ${mins}m` : `${hrs}h ${mins}m`;
};

/** Preset options for hourly/scheduled ride extensions (minutes). */
export const HOURLY_EXTENSION_PRESETS_MINUTES = Object.freeze([
  15, 30, 60, 120, 180, 240, 300, 360, 420, 480,
]);

/**
 * Format phone number
 */
export const formatPhone = (phone) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
};

/**
 * Mask a person name for privacy (nearby drivers / pre-ride).
 * Uses the first word only: "Rajesh Kumar" → "Ra**h", "raj" → "ra**j".
 */
export const maskPersonName = (name) => {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const first = raw.split(/\s+/)[0];
  if (first.length <= 1) return '*';
  if (first.length === 2) return `${first[0]}*`;
  return `${first.slice(0, 2)}**${first.slice(-1)}`;
};

/**
 * Format date
 */
export const formatDate = (dateStr, fallback = '—') => {
  if (!dateStr) return fallback;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return fallback;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Generate initials from name
 */
export const getInitials = (name) => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

/**
 * Generate random ID
 */
export const generateId = () => {
  return Math.random().toString(36).substring(2, 9);
};

/**
 * Truncate text
 */
export const truncate = (text, maxLength = 30) => {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};
