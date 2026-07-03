import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminSosStore = createQueryStore(async ({ page, limit, status, search }) => {
  const params = new URLSearchParams({
    page: String(page || 1),
    limit: String(limit || 20),
  });
  if (status) params.append('status', status);
  if (search) params.append('search', search);

  const res = await api.get(`/admin/sos?${params.toString()}`);
  const payload = res.data?.data;

  return {
    alerts: payload?.alerts ?? [],
    pagination: payload?.pagination ?? { page: 1, limit: 20, total: 0, pages: 1 },
  };
});

export async function fetchSosDetail(sosId) {
  const res = await api.get(`/admin/sos/${sosId}`);
  return res.data?.data;
}

export async function resolveSosAlert(sosId) {
  const res = await api.patch(`/sos/${sosId}/resolve`);
  return res.data?.data;
}
