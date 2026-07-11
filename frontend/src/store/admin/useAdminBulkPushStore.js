import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export async function fetchBulkPushAudienceStats(audience) {
  const res = await api.get('/admin/notifications/bulk-push/stats', {
    params: { audience },
  });
  return res.data?.data ?? { audience, total: 0, withPush: 0 };
}

export async function sendBulkPromotionalPush({
  audience,
  title,
  body,
  mode,
  recipientIds = [],
}) {
  const res = await api.post('/admin/notifications/bulk-push', {
    audience,
    title,
    body,
    mode,
    recipientIds,
  });
  return res.data?.data;
}

/** Server-paginated recipient picker for bulk push. */
export const useAdminBulkPushRecipientsStore = createQueryStore(
  async ({ audience, page, limit, search }) => {
    const params = new URLSearchParams({
      audience: String(audience || 'user'),
      page: String(page ?? 1),
      limit: String(limit ?? 10),
    });
    if (search) params.append('search', search);

    const res = await api.get(
      `/admin/notifications/bulk-push/recipients?${params.toString()}`,
    );
    const payload = res.data?.data;
    return {
      recipients: payload?.data ?? [],
      pagination: payload?.pagination ?? { total: 0, pages: 1, page: 1, limit: 10 },
    };
  },
);

export const useAdminBulkPushHistoryStore = createQueryStore(
  async ({ page, limit }) => {
    const params = new URLSearchParams({
      page: String(page ?? 1),
      limit: String(limit ?? 10),
    });
    const res = await api.get(`/admin/notifications/bulk-push/history?${params}`);
    const payload = res.data?.data;
    return {
      campaigns: payload?.data ?? [],
      pagination: payload?.pagination ?? { total: 0, pages: 1, page: 1, limit: 10 },
    };
  },
);
