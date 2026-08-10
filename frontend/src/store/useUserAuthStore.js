import { create } from 'zustand';
import { useUserNotificationStore } from './useNotificationStore';
import { endAuthSession } from '../utils/endAuthSession';

const useUserAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  onboarding: null,

  setAuth: (user) => set({ user, isAuthenticated: !!user }),
  setOnboarding: (onboarding) => set({ onboarding }),
  logout: () => {
    useUserNotificationStore.getState().reset();
    set({ user: null, isAuthenticated: false, onboarding: null });
    void endAuthSession('user');
  },
}));

export default useUserAuthStore;
