import axios from 'axios';

export const TOKEN_KEY = 'pm-token';
export const USER_KEY = 'pm-user';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

/**
 * Read the persisted auth token.
 */
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    return null;
  }
}

/**
 * Read the persisted user object.
 */
export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

/**
 * Persist the auth session.
 * @param {string} token
 * @param {object} user
 */
export function storeSession(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (error) {
    /* storage unavailable - session stays in memory only */
  }
}

/** Clear the auth session. */
export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (error) {
    /* ignore */
  }
}

// Attach the bearer token to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Redirect to the login page when the session is no longer valid.
 * A module-level flag prevents a redirect storm when several requests 401 at once.
 */
let redirecting = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const isAuthRoute = error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/auth/register');

    if (status === 401 && !isAuthRoute && !redirecting) {
      redirecting = true;
      clearSession();
      const current = window.location.pathname;
      if (current !== '/login') {
        window.location.href = `/login?redirect=${encodeURIComponent(current)}`;
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Extract a human-readable message from an API error.
 * @param {any} error
 */
export function getErrorMessage(error) {
  const message = error?.response?.data?.message;
  if (message) return message;
  if (error?.code === 'ECONNABORTED') return 'Permintaan timeout, coba lagi';
  if (error?.message === 'Network Error') return 'Tidak dapat terhubung ke server';
  return error?.message || 'Terjadi kesalahan';
}

/**
 * Extract field-level validation errors.
 * @param {any} error
 */
export function getFieldErrors(error) {
  return error?.response?.data?.errors || null;
}

export default api;
