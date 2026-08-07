import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useAdminSupportStore = createQueryStore(async (params = {}) => {
  const res = await api.get('/admin/support', { params });
  return res.data?.data?.tickets ?? [];
});

export async function fetchSupportTicketDetail(id) {
  const res = await api.get(`/admin/support/${id}`);
  return res.data?.data?.ticket ?? null;
}

export async function updateSupportTicket(id, payload) {
  const res = await api.put(`/admin/support/${id}`, payload);
  return res.data?.data?.ticket ?? null;
}

export async function assignSupportTicket(id, { assigneeId }) {
  const res = await api.patch(`/admin/support/${id}/assign`, { assigneeId });
  return res.data?.data?.ticket ?? null;
}
