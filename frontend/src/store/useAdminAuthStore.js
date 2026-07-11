import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useAdminNotificationStore } from './useNotificationStore';
import { clearAuthTokens } from '../utils/authTokens';

const useAdminAuthStore = create(
  persist(
    (set) => ({
      admin: null,
      isAuthenticated: false,

      setAuth: (admin) => set({ admin, isAuthenticated: !!admin }),
      logout: () => {
        useAdminNotificationStore.getState().reset();
        clearAuthTokens();
        set({ admin: null, isAuthenticated: false });
      },
    }),
    {
      name: 'admin-session',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useAdminAuthStore;
