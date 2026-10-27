import { create } from 'zustand';

const STORAGE_KEY = 'pm-theme';

function readStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch (error) {
    return null;
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/**
 * Light / dark / system theme.
 */
export const useThemeStore = create((set, get) => ({
  theme: readStoredTheme() || 'light',

  /**
   * Resolve the effective theme, following the OS when set to `system`.
   */
  resolvedTheme: () => {
    const { theme } = get();
    if (theme !== 'system') return theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  },

  /**
   * @param {'light'|'dark'|'system'} theme
   */
  setTheme: (theme) => {
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;

    applyTheme(resolved);
    try {
      if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      /* ignore */
    }
    set({ theme });
  },

  /** Flip between light and dark based on the currently resolved theme. */
  toggle: () => {
    const current = get().resolvedTheme();
    get().setTheme(current === 'dark' ? 'light' : 'dark');
  },

  /** Apply the persisted theme on boot. */
  init: () => {
    const theme = readStoredTheme() || 'light';
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    applyTheme(resolved);
    set({ theme });
  },
}));
