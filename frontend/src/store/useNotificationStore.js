import { create } from 'zustand';
import api from '../utils/api';

function makeNotificationStore(basePath) {
  let unreadInflight = null;
  let unreadFetchedAt = 0;
  const UNREAD_TTL_MS = 30_000;

  return create((set, get) => ({
    notifications: [],
    unreadCount: 0,
    total: 0,
    page: 1,
    limit: 20,
    loading: false,
    error: null,

    reset() {
      unreadInflight = null;
      unreadFetchedAt = 0;
      set({
        notifications: [],
        unreadCount: 0,
        total: 0,
        page: 1,
        loading: false,
        error: null,
      });
    },

    setUnreadCount(count) {
      set({ unreadCount: Math.max(0, Number(count) || 0) });
    },

    async fetchUnread({ force = false } = {}) {
      const fresh = Date.now() - unreadFetchedAt < UNREAD_TTL_MS;
      if (!force && fresh) {
        return { unreadCount: get().unreadCount };
      }
      if (unreadInflight) return unreadInflight;

      unreadInflight = (async () => {
        try {
          const res = await api.get(`${basePath}/notifications/unread`);
          const data = res?.data?.data || {};
          unreadFetchedAt = Date.now();
          set({ unreadCount: data.unreadCount || 0 });
          return data;
        } catch {
          return null;
        } finally {
          unreadInflight = null;
        }
      })();

      return unreadInflight;
    },

    async fetchNotifications({ page } = {}) {
      const nextPage = page || get().page;
      set({ loading: true, error: null });
      try {
        const res = await api.get(`${basePath}/notifications`, {
          params: { page: nextPage, limit: get().limit },
        });
        const data = res?.data?.data || {};
        set({
          notifications: data.notifications || [],
          total: data.total || 0,
          unreadCount: data.unreadCount ?? get().unreadCount,
          page: data.page || nextPage,
          loading: false,
        });
        return data;
      } catch (err) {
        const message = err?.response?.data?.message || err?.message || 'Failed to load notifications';
        set({ error: message, loading: false });
        throw err;
      }
    },

    async markRead(id) {
      await api.patch(`${basePath}/notifications/${id}/read`);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n._id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    },

    async markAllRead() {
      await api.patch(`${basePath}/notifications/read-all`);
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      }));
    },
  }));
}

export const useUserNotificationStore = makeNotificationStore('/auth');
export const useDriverNotificationStore = makeNotificationStore('/driver');
export const useAdminNotificationStore = makeNotificationStore('/admin');
