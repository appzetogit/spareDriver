import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { unregisterFcmToken } from '../hooks/useFcmRegistration';
import { useDriverNotificationStore } from './useNotificationStore';
import { clearAuthTokens } from '../utils/authTokens';

const useDriverAuthStore = create(
  persist(
    (set) => ({
      driver: null,
      isAuthenticated: false,

      setAuth: (driver) => set({ driver, isAuthenticated: !!driver }),
      updateDriver: (updates) => set((state) => ({ driver: { ...state.driver, ...updates } })),
      logout: () => {
        useDriverNotificationStore.getState().reset();
        set({ driver: null, isAuthenticated: false });
        void unregisterFcmToken('driver')
          .catch(() => null)
          .finally(() => clearAuthTokens());
      },
    }),
    {
      name: 'driver-session',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useDriverAuthStore;
