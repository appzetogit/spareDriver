import api from '../../../../utils/api';

export const PERIOD_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '365d', label: 'Last year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

export function resolveDateParams(period, fromDate, toDate) {
  if (period === 'custom') {
    return { from: fromDate || undefined, to: toDate || undefined };
  }
  if (period === 'all') return { period: 'all' };
  return { period };
}

export function buildReportQueryParams({ period, fromDate, toDate, extra = {} }) {
  const base = resolveDateParams(period, fromDate, toDate);
  const params = { ...base, ...extra };
  Object.keys(params).forEach((key) => {
    if (params[key] === '' || params[key] == null) delete params[key];
  });
  return params;
}

export async function downloadCsvExport(path, params, filenamePrefix) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value);
    }
  });
  const qs = search.toString();
  const res = await api.get(`${path}${qs ? `?${qs}` : ''}`, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
