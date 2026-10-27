import { useThemeStore } from '../../store/themeStore';

/**
 * Shared colour palette for charts.
 * The hex values work on both light and dark surfaces.
 */
export const CHART_PALETTE = [
  '#4f46e5',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
];

/** Semantic series colours used across the reports charts. */
export const SERIES_COLORS = {
  brand: '#4f46e5',
  sky: '#0ea5e9',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#ef4444',
  violet: '#a855f7',
  slate: '#64748b',
};

/**
 * Resolve the chart theme from the global theme store.
 *
 * Recharts does not read Tailwind classes, so every grid line, axis and tick
 * colour has to be resolved to an explicit hex value that reads well on both
 * the light and the dark surface.
 *
 * @returns {{isDark:boolean, grid:string, axis:string, tick:string, text:string, muted:string}}
 */
export function useChartTheme() {
  const theme = useThemeStore((state) => state.resolvedTheme());
  const isDark = theme === 'dark';

  return {
    isDark,
    grid: isDark ? '#1e293b' : '#e2e8f0',
    axis: isDark ? '#334155' : '#cbd5e1',
    tick: isDark ? '#94a3b8' : '#64748b',
    text: isDark ? '#e2e8f0' : '#0f172a',
    muted: isDark ? '#64748b' : '#94a3b8',
  };
}

/**
 * Build a translucent tint from a hex colour.
 * Falls back to the brand colour when the input is not a hex string.
 *
 * @param {string} hex
 * @param {number} [alpha]
 * @returns {string} an `rgba()` colour
 */
export function tint(hex, alpha = 0.16) {
  const fallback = `rgba(79, 70, 229, ${alpha})`;

  if (typeof hex !== 'string' || !hex.startsWith('#')) return fallback;

  const clean = hex.slice(1);
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;

  if (full.length !== 6) return fallback;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  if ([r, g, b].some(Number.isNaN)) return fallback;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Pick a readable foreground for a filled colour.
 * @param {string} hex
 * @returns {'#ffffff'|'#0f172a'}
 */
export function readableOn(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return '#ffffff';

  const clean = hex.slice(1);
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (full.length !== 6) return '#ffffff';

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

  return luminance > 0.6 ? '#0f172a' : '#ffffff';
}
