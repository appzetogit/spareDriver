import { create } from 'zustand';
import api from '../utils/api';

function makeNotificationStore(basePath) {
  return create((set, get) => ({
    notifications: [],
    unreadCount: 0,
    total: 0,
    page: 1,
    limit: 20,
    loading: false,
    error: null,

    reset() {
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

    async fetchUnread() {
      try {
        const res = await api.get(`${basePath}/notifications/unread`);
        const data = res?.data?.data || {};
        set({ unreadCount: data.unreadCount || 0 });
        return data;
      } catch {
        return null;
      }
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
