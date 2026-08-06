import { create } from 'zustand';
import { unregisterFcmToken } from '../hooks/useFcmRegistration';
import { useAdminNotificationStore } from './useNotificationStore';
import { clearAuthTokens } from '../utils/authTokens';

const useAdminAuthStore = create((set) => ({
  admin: null,
  isAuthenticated: false,

  setAuth: (admin) => set({ admin, isAuthenticated: !!admin }),
  logout: () => {
    useAdminNotificationStore.getState().reset();
    set({ admin: null, isAuthenticated: false });
    void unregisterFcmToken('admin')
      .catch(() => null)
      .finally(() => clearAuthTokens());
  },
}));

export default useAdminAuthStore;
