/**
 * Shared label/colour maps mirroring the backend constants.
 * Kept in sync with `backend/src/config/constants.js`.
 */

export const PROJECT_STATUS = {
  planning: { label: 'Perencanaan', color: '#6366f1', bg: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' },
  active: { label: 'Aktif', color: '#10b981', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  on_hold: { label: 'Ditunda', color: '#f59e0b', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
  completed: { label: 'Selesai', color: '#3b82f6', bg: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' },
  cancelled: { label: 'Dibatalkan', color: '#ef4444', bg: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' },
};

export const TASK_STATUS = {
  todo: { label: 'Akan Dikerjakan', color: '#64748b', bg: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300' },
  in_progress: { label: 'Sedang Dikerjakan', color: '#3b82f6', bg: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' },
  review: { label: 'Dalam Review', color: '#a855f7', bg: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300' },
  done: { label: 'Selesai', color: '#10b981', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  blocked: { label: 'Tertunda', color: '#ef4444', bg: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' },
};

export const PRIORITY = {
  low: { label: 'Rendah', color: '#64748b', bg: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300' },
  medium: { label: 'Sedang', color: '#3b82f6', bg: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' },
  high: { label: 'Tinggi', color: '#f59e0b', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
  urgent: { label: 'Mendesak', color: '#ef4444', bg: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' },
};

export const ROLES = {
  admin: { label: 'Administrator', bg: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300' },
  manager: { label: 'Manajer', bg: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' },
  member: { label: 'Anggota', bg: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300' },
};

export const MILESTONE_STATUS = {
  planned: { label: 'Direncanakan', color: '#64748b', bg: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300' },
  in_progress: { label: 'Berjalan', color: '#3b82f6', bg: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' },
  achieved: { label: 'Tercapai', color: '#10b981', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  missed: { label: 'Terlewat', color: '#ef4444', bg: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' },
};

export const DEPENDENCY_TYPES = {
  blocked_by: 'Diblokir oleh',
  blocks: 'Memblokir',
  relates_to: 'Berkaitan dengan',
  duplicate_of: 'Duplikat dari',
};

export const KANBAN_COLUMNS = [
  { key: 'todo', title: 'Akan Dikerjakan', color: '#64748b' },
  { key: 'in_progress', title: 'Sedang Dikerjakan', color: '#3b82f6' },
  { key: 'review', title: 'Dalam Review', color: '#a855f7' },
  { key: 'blocked', title: 'Tertunda', color: '#ef4444' },
  { key: 'done', title: 'Selesai', color: '#10b981' },
];

export const PROJECT_COLORS = [
  '#4f46e5',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
];

/**
 * Look up a map entry with a safe fallback.
 * @param {object} map
 * @param {string} key
 * @param {object} [fallback]
 */
export function lookup(map, key, fallback = { label: '-', color: '#94a3b8', bg: 'bg-slate-100 text-slate-600' }) {
  return map[key] || fallback;
}
