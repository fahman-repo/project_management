'use strict';

const PROJECT_STATUS = {
  planning: { label: 'Perencanaan', color: '#6366f1' },
  active: { label: 'Aktif', color: '#10b981' },
  on_hold: { label: 'Ditunda', color: '#f59e0b' },
  completed: { label: 'Selesai', color: '#3b82f6' },
  cancelled: { label: 'Dibatalkan', color: '#ef4444' },
};

const TASK_STATUS = {
  todo: { label: 'Akan Dikerjakan', color: '#64748b', progress: 0 },
  in_progress: { label: 'Sedang Dikerjakan', color: '#3b82f6', progress: 50 },
  review: { label: 'Dalam Review', color: '#a855f7', progress: 75 },
  done: { label: 'Selesai', color: '#10b981', progress: 100 },
  blocked: { label: 'Tertunda', color: '#ef4444', progress: 0 },
};

const DEFAULT_PROJECT_STATUSES = [
  { key_name: 'todo', label: 'Akan Dikerjakan', color: '#64748b', category: 'todo', progress: 0, position: 0 },
  { key_name: 'in_progress', label: 'Sedang Dikerjakan', color: '#3b82f6', category: 'in_progress', progress: 50, position: 1 },
  { key_name: 'review', label: 'Dalam Review', color: '#a855f7', category: 'review', progress: 75, position: 2 },
  { key_name: 'blocked', label: 'Tertunda', color: '#ef4444', category: 'blocked', progress: 0, position: 3 },
  { key_name: 'done', label: 'Selesai', color: '#10b981', category: 'done', progress: 100, position: 4 },
];

const PRIORITY = {
  low: { label: 'Rendah', color: '#64748b', weight: 1 },
  medium: { label: 'Sedang', color: '#3b82f6', weight: 2 },
  high: { label: 'Tinggi', color: '#f59e0b', weight: 3 },
  urgent: { label: 'Mendesak', color: '#ef4444', weight: 4 },
};

const ROLES = {
  admin: { label: 'Administrator' },
  manager: { label: 'Manajer' },
  member: { label: 'Anggota' },
};

const PROJECT_MEMBER_ROLES = {
  owner: { label: 'Pemilik' },
  manager: { label: 'Manajer' },
  member: { label: 'Anggota' },
  reviewer: { label: 'Reviewer' },
};

const MILESTONE_STATUS = {
  planned: { label: 'Direncanakan', color: '#64748b' },
  in_progress: { label: 'Berjalan', color: '#3b82f6' },
  achieved: { label: 'Tercapai', color: '#10b981' },
  missed: { label: 'Terlewat', color: '#ef4444' },
};

const DEPENDENCY_TYPES = {
  blocked_by: 'Diblokir oleh',
  blocks: 'Memblokir',
  relates_to: 'Berkaitan dengan',
  duplicate_of: 'Duplikat dari',
};

const KANBAN_COLUMNS = [
  { key: 'todo', title: 'Akan Dikerjakan', color: '#64748b' },
  { key: 'in_progress', title: 'Sedang Dikerjakan', color: '#3b82f6' },
  { key: 'review', title: 'Dalam Review', color: '#a855f7' },
  { key: 'blocked', title: 'Tertunda', color: '#ef4444' },
  { key: 'done', title: 'Selesai', color: '#10b981' },
];

const DEFAULT_PROJECT_COLORS = [
  '#4f46e5',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
];

module.exports = {
  PROJECT_STATUS,
  TASK_STATUS,
  DEFAULT_PROJECT_STATUSES,
  PRIORITY,
  ROLES,
  PROJECT_MEMBER_ROLES,
  MILESTONE_STATUS,
  DEPENDENCY_TYPES,
  KANBAN_COLUMNS,
  DEFAULT_PROJECT_COLORS,
};
