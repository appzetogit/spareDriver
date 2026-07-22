import { create } from 'zustand';
import { unregisterFcmToken } from '../hooks/useFcmRegistration';
import { useDriverNotificationStore } from './useNotificationStore';
import { clearAuthTokens } from '../utils/authTokens';

const useDriverAuthStore = create((set) => ({
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
}));

export default useDriverAuthStore;
