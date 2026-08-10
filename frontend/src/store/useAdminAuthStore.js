import { create } from 'zustand';
import { useAdminNotificationStore } from './useNotificationStore';
import { endAuthSession } from '../utils/endAuthSession';

const useAdminAuthStore = create((set) => ({
  admin: null,
  isAuthenticated: false,

  setAuth: (admin) => set({ admin, isAuthenticated: !!admin }),
  logout: () => {
    useAdminNotificationStore.getState().reset();
    set({ admin: null, isAuthenticated: false });
    void endAuthSession('admin');
  },
}));

export default useAdminAuthStore;
