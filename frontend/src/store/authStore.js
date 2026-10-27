import { create } from 'zustand';
import api, { clearSession, getStoredUser, getToken, storeSession } from '../api/client';

/**
 * Auth session state.
 *
 * The token is persisted in localStorage; `user` is hydrated from storage on
 * load and refreshed from the API when a token is present.
 */
export const useAuthStore = create((set, get) => ({
  user: getStoredUser(),
  token: getToken(),
  isAuthenticated: Boolean(getToken()),
  isLoading: false,
  isInitialized: false,

  /**
   * Restore the session on app boot.
   */
  initialize: async () => {
    const token = getToken();
    if (!token) {
      set({ isInitialized: true, isLoading: false });
      return;
    }

    set({ isLoading: true });
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data.data.user, token, isAuthenticated: true, isLoading: false, isInitialized: true });
    } catch (error) {
      clearSession();
      set({ user: null, token: null, isAuthenticated: false, isLoading: false, isInitialized: true });
    }
  },

  /**
   * @param {{email:string, password:string}} credentials
   */
  login: async (credentials) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/auth/login', credentials);
      const { token, user } = data.data;
      storeSession(token, user);
      set({ user, token, isAuthenticated: true, isLoading: false });
      return user;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  /**
   * @param {{name:string, email:string, password:string}} payload
   */
  register: async (payload) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/auth/register', payload);
      const { token, user } = data.data;
      storeSession(token, user);
      set({ user, token, isAuthenticated: true, isLoading: false });
      return user;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      /* logging out locally matters more than the server call */
    }
    clearSession();
    set({ user: null, token: null, isAuthenticated: false });
  },

  /**
   * Merge partial user fields into the stored session.
   * @param {object} patch
   */
  updateUser: (patch) => {
    const current = get().user;
    if (!current) return;
    const next = { ...current, ...patch };
    storeSession(get().token, next);
    set({ user: next });
  },
}));
