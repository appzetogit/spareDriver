import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useAdminNotificationStore } from './useNotificationStore';

const useAdminAuthStore = create(
  persist(
    (set) => ({
      admin: null,
      isAuthenticated: false,

      setAuth: (admin) => set({ admin, isAuthenticated: !!admin }),
      logout: () => {
        useAdminNotificationStore.getState().reset();
        set({ admin: null, isAuthenticated: false });
      },
    }),
    {
      name: 'admin-session',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

export default useAdminAuthStore;
