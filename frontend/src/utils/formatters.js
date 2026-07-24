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
