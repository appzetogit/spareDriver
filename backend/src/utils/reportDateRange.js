export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** IANA timezone used for day buckets (matches Node's local TZ when TZ is set). */
export function appTimeZone() {
  return process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Server-local YYYY-MM-DD — do not use toISOString() (UTC drift on IST). */
export function localDateKey(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Mongo `$dateToString` day bucket aligned with `localDateKey`. */
export function mongoDayBucket(dateField = '$createdAt') {
  return {
    $dateToString: {
      format: '%Y-%m-%d',
      date: dateField,
      timezone: appTimeZone(),
    },
  };
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function resolveDateRange(query = {}) {
  const { period, from, to } = query;
  const now = new Date();

  if (from || to) {
    const range = {};
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) range.from = startOfDay(fromDate);
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) range.to = endOfDay(toDate);
    }
    if (range.from || range.to) {
      if (!range.to) range.to = endOfDay(now);
      if (!range.from) range.from = new Date(0);
      return range;
    }
  }

  switch (period) {
    case '7d':
      return { from: addDays(startOfDay(now), -6), to: endOfDay(now) };
    case '90d':
      return { from: addDays(startOfDay(now), -89), to: endOfDay(now) };
    case '365d':
      return { from: addDays(startOfDay(now), -364), to: endOfDay(now) };
    case 'all':
      return { from: null, to: null };
    case '30d':
    default:
      return { from: addDays(startOfDay(now), -29), to: endOfDay(now) };
  }
}

export function resolvePreviousRange(range) {
  if (!range?.from || !range?.to) return { from: null, to: null };
  const durationMs = range.to.getTime() - range.from.getTime();
  const prevTo = endOfDay(addDays(range.from, -1));
  const prevFrom = startOfDay(new Date(prevTo.getTime() - durationMs));
  return { from: prevFrom, to: prevTo };
}

export function mongoDateRange(range, field = 'createdAt') {
  if (!range?.from && !range?.to) return null;
  const filter = {};
  if (range.from) filter.$gte = range.from;
  if (range.to) filter.$lte = range.to;
  return { [field]: filter };
}

export function percentChange(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

export function fillDailyTrend(rawPoints, valueKey, range) {
  const map = new Map(
    rawPoints.map((p) => [p._id || p.date, Number(p[valueKey]) || 0]),
  );

  const end = range?.to ? startOfDay(range.to) : startOfDay();
  const start = range?.from ? startOfDay(range.from) : addDays(end, -29);

  const points = [];
  let cursor = new Date(start);
  const last = new Date(end);

  while (cursor <= last) {
    const key = localDateKey(cursor);
    points.push({ date: key, [valueKey]: round2(map.get(key) ?? 0) });
    cursor = addDays(cursor, 1);
  }

  if (points.length > 90) {
    return points.slice(points.length - 90);
  }
  return points;
}

export function bookingFareExpr() {
  return {
    $cond: [
      { $gt: [{ $ifNull: ['$payment.amountPaidRupees', 0] }, 0] },
      '$payment.amountPaidRupees',
      { $ifNull: ['$fareSnapshot.total', 0] },
    ],
  };
}

export function bookingGstExpr() {
  return {
    $cond: [
      { $gt: [{ $ifNull: ['$fareSnapshot.gst', 0] }, 0] },
      '$fareSnapshot.gst',
      { $ifNull: ['$fareSnapshot.breakdown.gst', 0] },
    ],
  };
}

/** GST on paid subscriptions — uses stored gstAmount, with fallback from amount breakdown. */
export function subscriptionGstExpr() {
  return {
    $let: {
      vars: {
        stored: { $ifNull: ['$gstAmount', 0] },
        base: { $ifNull: ['$netBasePrice', { $ifNull: ['$basePrice', 0] }] },
        svc: { $ifNull: ['$serviceCharge', 0] },
        amt: { $ifNull: ['$amount', 0] },
      },
      in: {
        $cond: [
          { $gt: ['$$stored', 0] },
          '$$stored',
          {
            $max: [
              0,
              { $subtract: ['$$amt', { $add: ['$$base', '$$svc'] }] },
            ],
          },
        ],
      },
    },
  };
}

export function buildFiltersMeta(query, dateRange) {
  return {
    period: query.period || (query.from || query.to ? 'custom' : '30d'),
    from: dateRange.from?.toISOString() || null,
    to: dateRange.to?.toISOString() || null,
    serviceType: query.serviceType || null,
    zoneId: query.zoneId || null,
    status: query.status || null,
  };
}
