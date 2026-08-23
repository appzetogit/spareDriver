function dateStamp(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const src = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${src.getFullYear()}${String(src.getMonth() + 1).padStart(2, '0')}${String(src.getDate()).padStart(2, '0')}`;
}

function randSuffix(n = 5) {
  const min = 10 ** (n - 1);
  return String(Math.floor(min + Math.random() * (9 * min)));
}

export function generateKitOrderNumber() {
  return `KIT-${dateStamp()}-${randSuffix(5)}`;
}

export function generateBookingNumber() {
  return `BK-${dateStamp()}-${randSuffix(6)}`;
}

export function generateSubscriptionNumber() {
  return `SUB-${dateStamp()}-${randSuffix(5)}`;
}

/** Public driver id, same shape as booking numbers: DR-YYYYMMDD-XXXXXX */
export function generateDriverNumber(date) {
  return `DR-${dateStamp(date)}-${randSuffix(6)}`;
}
