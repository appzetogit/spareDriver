import axios from 'axios';
import useDriverAuthStore from '../store/useDriverAuthStore';
import useAdminAuthStore from '../store/useAdminAuthStore';
import useUserAuthStore from '../store/useUserAuthStore';
import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  persistTokensFromPayload,
} from './authTokens';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

function shouldSkipTokenRefresh(config) {
  const url = config?.url || '';
  return (
    url.includes('/auth/refresh-token') ||
    url.includes('/auth/logout') ||
    url.includes('/auth/login') ||
    url.includes('/auth/google') ||
    url.includes('/auth/send-otp') ||
    url.includes('/auth/register/') ||
    url.includes('/auth/referrals/validate') ||
    url.includes('/auth/verify-otp') ||
    url.includes('/admin/auth/login') ||
    url.includes('/driver/auth/login') ||
    url.includes('/driver/auth/google') ||
    url.includes('/driver/auth/send-otp') ||
    url.includes('/driver/auth/verify-otp') ||
    url.includes('/driver/referrals/validate') ||
    url.includes('/driver/auth/forgot-password/') ||
    url.includes('/auth/forgot-password/')
  );
}

/** Wipe in-memory auth + localStorage + cookies after a failed refresh. */
function clearClientSession() {
  useDriverAuthStore.setState({ driver: null, isAuthenticated: false });
  useAdminAuthStore.setState({ admin: null, isAuthenticated: false });
  useUserAuthStore.setState({ user: null, isAuthenticated: false, onboarding: null });
  clearAuthTokens();
  api.post('/auth/logout').catch(() => {});
}

api.interceptors.request.use((config) => {
  const accessToken = getAccessToken();
  if (accessToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshInFlight = null;

async function refreshSession() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    await api.post('/auth/refresh-token', refreshToken ? { refreshToken } : {});
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => {
    persistTokensFromPayload(response?.data?.data);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest || shouldSkipTokenRefresh(originalRequest)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await refreshSession();
        const accessToken = getAccessToken();
        if (accessToken) {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        clearClientSession();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
