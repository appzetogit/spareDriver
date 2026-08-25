import { create } from 'zustand';
import { useDriverNotificationStore } from './useNotificationStore';
import { endAuthSession } from '../utils/endAuthSession';

const useDriverAuthStore = create((set) => ({
  driver: null,
  isAuthenticated: false,

  setAuth: (driver) => set({ driver, isAuthenticated: !!driver }),
  updateDriver: (updates) => set((state) => ({ driver: { ...state.driver, ...updates } })),
  logout: () => {
    useDriverNotificationStore.getState().reset();
    set({ driver: null, isAuthenticated: false });
    void endAuthSession('driver');
  },
}));

export default useDriverAuthStore;
