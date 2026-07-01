import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { unregisterFcmToken } from '../hooks/useFcmRegistration';
import { useDriverNotificationStore } from './useNotificationStore';

const useDriverAuthStore = create(
  persist(
    (set) => ({
      driver: null,
      isAuthenticated: false,

      setAuth: (driver) => set({ driver, isAuthenticated: !!driver }),
      updateDriver: (updates) => set((state) => ({ driver: { ...state.driver, ...updates } })),
      logout: () => {
        unregisterFcmToken('driver').catch(() => null);
        useDriverNotificationStore.getState().reset();
        set({ driver: null, isAuthenticated: false });
      },
    }),
    {
      name: 'driver-session',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

export default useDriverAuthStore;
