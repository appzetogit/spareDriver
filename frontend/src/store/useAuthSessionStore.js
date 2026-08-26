import { create } from 'zustand';
import api from '../utils/api';
import { getAccessToken, getRefreshToken, clearAuthTokens } from '../utils/authTokens';
import useUserAuthStore from './useUserAuthStore';
import useDriverAuthStore from './useDriverAuthStore';
import useAdminAuthStore from './useAdminAuthStore';

const STAFF_ROLES = new Set(['admin', 'sub_admin', 'team_member', 'developer']);
const LEGACY_SESSION_KEYS = ['user-session', 'driver-session', 'admin-session'];

let bootPromise = null;

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function clearLegacySessionKeys() {
  if (typeof window === 'undefined') return;
  for (const key of LEGACY_SESSION_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function clearMemorySessions() {
  useUserAuthStore.setState({ user: null, isAuthenticated: false, onboarding: null });
  useDriverAuthStore.setState({ driver: null, isAuthenticated: false });
  useAdminAuthStore.setState({ admin: null, isAuthenticated: false });
}

function toDriverSession(doc) {
  if (!doc) return null;
  return {
    id: doc.id || doc._id,
    name: doc.name,
    phone: doc.phone,
    email: doc.email,
    onboardingStep: doc.onboardingStep ?? 0,
    approvalStatus: doc.approvalStatus,
    approvalNote: doc.approvalNote || '',
    needsPhone: doc.needsPhone,
    // Needed immediately so DriverLocationBridge does not call stopTracking
    // on remount while the native foreground service is still uploading.
    isOnline: doc.isOnline === true,
    isOnTrip: doc.isOnTrip === true,
  };
}

async function ensureAccessToken() {
  if (getAccessToken()) return true;
  try {
    const refreshToken = getRefreshToken();
    await api.post('/auth/refresh-token', refreshToken ? { refreshToken } : {});
    return Boolean(getAccessToken());
  } catch {
    return false;
  }
}

async function restorePrincipal() {
  const token = getAccessToken();
  if (!token) return;

  const payload = decodeJwtPayload(token);
  if (!payload) {
    clearAuthTokens();
    return;
  }

  const isDriver = payload.accountType === 'driver' || payload.role === 'driver';

  if (isDriver) {
    const res = await api.get('/driver/profile');
    useDriverAuthStore.getState().setAuth(toDriverSession(res.data?.data));
    return;
  }

  if (STAFF_ROLES.has(payload.role)) {
    const res = await api.get('/admin/auth/me');
    useAdminAuthStore.getState().setAuth(res.data?.data?.admin);
    return;
  }

  const res = await api.get('/auth/onboarding/status');
  const data = res.data?.data;
  if (data?.user) useUserAuthStore.getState().setAuth(data.user);
  useUserAuthStore.getState().setOnboarding({
    carCount: data?.carCount,
    hasCar: data?.hasCar,
    hasChecklist: data?.hasChecklist,
  });
}

async function runBootstrap() {
  clearLegacySessionKeys();
  try {
    const hasToken = await ensureAccessToken();
    if (hasToken) await restorePrincipal();
  } catch {
    clearAuthTokens();
    clearMemorySessions();
  }
}

const useAuthSessionStore = create((set, get) => ({
  /** idle → loading → ready */
  status: 'idle',

  bootstrap: () => {
    if (get().status === 'ready') return bootPromise ?? Promise.resolve();
    if (bootPromise) return bootPromise;

    set({ status: 'loading' });
    bootPromise = runBootstrap().finally(() => {
      set({ status: 'ready' });
    });
    return bootPromise;
  },
}));

export default useAuthSessionStore;
