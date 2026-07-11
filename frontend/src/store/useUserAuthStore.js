import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { unregisterFcmToken } from '../hooks/useFcmRegistration';
import { useUserNotificationStore } from './useNotificationStore';
import { clearAuthTokens } from '../utils/authTokens';

const useUserAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      onboarding: null,

      setAuth: (user) => set({ user, isAuthenticated: !!user }),
      setOnboarding: (onboarding) => set({ onboarding }),
      logout: () => {
        useUserNotificationStore.getState().reset();
        set({ user: null, isAuthenticated: false, onboarding: null });
        void unregisterFcmToken('user')
          .catch(() => null)
          .finally(() => clearAuthTokens());
      },
    }),
    {
      name: 'user-session',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useUserAuthStore;
