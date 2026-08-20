import { create } from 'zustand';
import { useUserNotificationStore } from './useNotificationStore';
import useUserWalletStore from './user/useUserWalletStore';
import { endAuthSession } from '../utils/endAuthSession';

const useUserAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  onboarding: null,

  setAuth: (user) => set({ user, isAuthenticated: !!user }),
  setOnboarding: (onboarding) => set({ onboarding }),
  logout: () => {
    useUserNotificationStore.getState().reset();
    useUserWalletStore.getState().reset();
    set({ user: null, isAuthenticated: false, onboarding: null });
    void endAuthSession('user');
  },
}));

export default useUserAuthStore;
