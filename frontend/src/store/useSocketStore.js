import { create } from 'zustand';
import { io } from 'socket.io-client';
import api from '../utils/api';
import { CONNECTION_EVENTS, S2C_EVENTS } from '../constants/socketEvents';
import useDriverAuthStore from './useDriverAuthStore';
import useUserAuthStore from './useUserAuthStore';
import useAdminAuthStore from './useAdminAuthStore';
import { getAccessToken, getRefreshToken } from '../utils/authTokens';

/**
 * Singleton Socket.IO connection.
 *
 * One browser tab = one socket. The backend infers the principal (driver,
 * user, or admin) from the JWT (handshake.auth.token or cookie).
 *
 * Lifecycle:
 *   1. `connect()` is called by `useSocket` once any auth store is populated.
 *   2. On 401-like `connect_error`, we try `/auth/refresh-token` (the same
 *      endpoint the axios interceptor uses) and reconnect once.
 *   3. `disconnect()` is called when all auth stores are cleared (logout).
 */

const RAW_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000/api/v1';

/** Strip the `/api/v1` suffix so we connect to the socket root. */
function deriveSocketUrl() {
  const override = import.meta.env.VITE_SOCKET_URL;
  if (override) return override;
  try {
    const u = new URL(RAW_API_URL);
    return `${u.protocol}//${u.host}`;
  } catch {
    return RAW_API_URL.replace(/\/api\/v\d+\/?$/, '');
  }
}

const SOCKET_URL = deriveSocketUrl();

function createSocket() {
  return io(SOCKET_URL, {
    withCredentials: true,
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    timeout: 20_000,
  });
}

const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,
  connectError: null,
  /** Server greeting payload from S2C_EVENTS.CONNECTED. */
  serverHello: null,
  /** True between connect() being called and confirmed connection. */
  isConnecting: false,
  /** Whether we've already tried a token refresh for the current connect_error. */
  _refreshAttempted: false,

  connect: () => {
    let { socket } = get();
    if (socket?.connected || get().isConnecting) return socket;

    if (!socket) {
      socket = createSocket();
      get()._bindCoreHandlers(socket);
      set({ socket });
    }

    set({ isConnecting: true, connectError: null });
    socket.auth = { token: getAccessToken() };
    socket.connect();
    return socket;
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    set({
      socket: null,
      isConnected: false,
      isConnecting: false,
      connectError: null,
      serverHello: null,
      _refreshAttempted: false,
    });
  },

  _bindCoreHandlers: (socket) => {
    const debug = import.meta.env.DEV;

    socket.on(CONNECTION_EVENTS.CONNECT, () => {
      if (debug) console.log('[socket] connected', { id: socket.id });
      set({ isConnected: true, isConnecting: false, connectError: null, _refreshAttempted: false });
    });

    socket.on(CONNECTION_EVENTS.DISCONNECT, (reason) => {
      if (debug) console.log('[socket] disconnected', { reason });
      set({ isConnected: false });
    });

    socket.on(CONNECTION_EVENTS.CONNECT_ERROR, async (err) => {
      const message = err?.message || 'Socket connection failed';
      const isAuthError = /unauthor|token|auth/i.test(message);
      if (debug) console.warn('[socket] connect_error', { message, isAuthError });

      set({ isConnected: false, isConnecting: false, connectError: message });

      if (isAuthError && !get()._refreshAttempted) {
        set({ _refreshAttempted: true });
        try {
          const refreshToken = getRefreshToken();
          await api.post('/auth/refresh-token', refreshToken ? { refreshToken } : {});
          socket.auth = { token: getAccessToken() };
          socket.connect();
        } catch {
          /* refresh failed → leave disconnected, user is effectively logged out */
        }
      }
    });

    socket.on(S2C_EVENTS.CONNECTED, (payload) => {
      if (debug) console.log('[socket] server hello', payload);
      set({ serverHello: payload });
    });

    socket.on(S2C_EVENTS.AUTH_ERROR, (payload) => {
      if (debug) console.warn('[socket] auth error', payload);
      set({ connectError: payload?.message || 'Authentication error' });
    });
  },
}));

/* ------------------------------------------------------------------ */
/* Auth-driven lifecycle                                               */
/* ------------------------------------------------------------------ */

function anyoneAuthenticated() {
  return Boolean(
    useDriverAuthStore.getState().isAuthenticated ||
      useUserAuthStore.getState().isAuthenticated ||
      useAdminAuthStore.getState().isAuthenticated,
  );
}

function applyAuthState() {
  if (anyoneAuthenticated()) {
    useSocketStore.getState().connect();
  } else {
    useSocketStore.getState().disconnect();
  }
}

// Drive the socket lifecycle from every auth store so login/logout from
// any of the three role areas automatically wires/unwires the connection.
useDriverAuthStore.subscribe(applyAuthState);
useUserAuthStore.subscribe(applyAuthState);
useAdminAuthStore.subscribe(applyAuthState);

// First load: if a session is already restored from localStorage, kick off.
if (typeof window !== 'undefined') {
  // Defer one tick so all auth stores can hydrate from storage.
  queueMicrotask(applyAuthState);

  // Dev-only: expose the store on window so you can poke the socket from
  // DevTools console (e.g. `__socketStore.getState().socket.emit(...)`).
  if (import.meta.env.DEV) {
    window.__socketStore = useSocketStore;
  }
}

export default useSocketStore;
