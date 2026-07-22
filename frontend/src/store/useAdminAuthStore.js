import { create } from 'zustand';
import { useAdminNotificationStore } from './useNotificationStore';
import { clearAuthTokens } from '../utils/authTokens';

const useAdminAuthStore = create((set) => ({
  admin: null,
  isAuthenticated: false,

  setAuth: (admin) => set({ admin, isAuthenticated: !!admin }),
  logout: () => {
    useAdminNotificationStore.getState().reset();
    clearAuthTokens();
    set({ admin: null, isAuthenticated: false });
  },
}));

export default useAdminAuthStore;
