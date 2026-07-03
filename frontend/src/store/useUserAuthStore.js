import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { unregisterFcmToken } from '../hooks/useFcmRegistration';
import { useUserNotificationStore } from './useNotificationStore';

const useUserAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      onboarding: null,

      setAuth: (user) => set({ user, isAuthenticated: !!user }),
      setOnboarding: (onboarding) => set({ onboarding }),
      logout: () => {
        unregisterFcmToken('user').catch(() => null);
        useUserNotificationStore.getState().reset();
        set({ user: null, isAuthenticated: false, onboarding: null });
      },
    }),
    {
      name: 'user-session',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

export default useUserAuthStore;
