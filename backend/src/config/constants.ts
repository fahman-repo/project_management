export const PROJECT_STATUS = {
  planning: { label: 'Perencanaan', color: '#6366f1' },
  active: { label: 'Aktif', color: '#10b981' },
  on_hold: { label: 'Ditunda', color: '#f59e0b' },
  completed: { label: 'Selesai', color: '#3b82f6' },
  cancelled: { label: 'Dibatalkan', color: '#ef4444' },
} as const;

export const TASK_STATUS = {
  todo: { label: 'Akan Dikerjakan', color: '#64748b', progress: 0 },
  in_progress: { label: 'Sedang Dikerjakan', color: '#3b82f6', progress: 50 },
  review: { label: 'Dalam Review', color: '#a855f7', progress: 75 },
  done: { label: 'Selesai', color: '#10b981', progress: 100 },
  blocked: { label: 'Tertunda', color: '#ef4444', progress: 0 },
} as const;

export const DEFAULT_PROJECT_STATUSES = [
  { key_name: 'todo', label: 'Akan Dikerjakan', color: '#64748b', category: 'todo', progress: 0, position: 0 },
  { key_name: 'in_progress', label: 'Sedang Dikerjakan', color: '#3b82f6', category: 'in_progress', progress: 50, position: 1 },
  { key_name: 'review', label: 'Dalam Review', color: '#a855f7', category: 'review', progress: 75, position: 2 },
  { key_name: 'blocked', label: 'Tertunda', color: '#ef4444', category: 'blocked', progress: 0, position: 3 },
  { key_name: 'done', label: 'Selesai', color: '#10b981', category: 'done', progress: 100, position: 4 },
];

export const PRIORITY = {
  low: { label: 'Rendah', color: '#64748b', weight: 1 },
  medium: { label: 'Sedang', color: '#3b82f6', weight: 2 },
  high: { label: 'Tinggi', color: '#f59e0b', weight: 3 },
  urgent: { label: 'Mendesak', color: '#ef4444', weight: 4 },
} as const;

export const ROLES = {
  admin: { label: 'Administrator' },
  manager: { label: 'Manajer' },
  member: { label: 'Anggota' },
} as const;

export const PROJECT_MEMBER_ROLES = {
  owner: { label: 'Pemilik' },
  manager: { label: 'Manajer' },
  member: { label: 'Anggota' },
  reviewer: { label: 'Reviewer' },
} as const;

export const MILESTONE_STATUS = {
  planned: { label: 'Direncanakan', color: '#64748b' },
  in_progress: { label: 'Berjalan', color: '#3b82f6' },
  achieved: { label: 'Tercapai', color: '#10b981' },
  missed: { label: 'Terlewat', color: '#ef4444' },
} as const;

export const EXPENSE_STATUS = {
  pending: { label: 'Menunggu Persetujuan', color: '#f59e0b' },
  approved: { label: 'Disetujui', color: '#10b981' },
  rejected: { label: 'Ditolak', color: '#ef4444' },
} as const;

export const DEPENDENCY_TYPES = {
  blocked_by: 'Diblokir oleh',
  blocks: 'Memblokir',
  relates_to: 'Berkaitan dengan',
  duplicate_of: 'Duplikat dari',
} as const;

export const KANBAN_COLUMNS = [
  { key: 'todo', title: 'Akan Dikerjakan', color: '#64748b' },
  { key: 'in_progress', title: 'Sedang Dikerjakan', color: '#3b82f6' },
  { key: 'review', title: 'Dalam Review', color: '#a855f7' },
  { key: 'blocked', title: 'Tertunda', color: '#ef4444' },
  { key: 'done', title: 'Selesai', color: '#10b981' },
];

export const DEFAULT_PROJECT_COLORS = [
  '#4f46e5',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
];

export const RISK_TYPES = {
  risk: { label: 'Potensi Risiko', color: '#f59e0b' },
  issue: { label: 'Masalah Aktual', color: '#ef4444' },
} as const;

export const RISK_CATEGORIES = {
  technical: { label: 'Teknis & Arsitektur', color: '#6366f1' },
  schedule: { label: 'Jadwal & Waktu', color: '#f59e0b' },
  budget: { label: 'Anggaran & Biaya', color: '#10b981' },
  resource: { label: 'SDM & Tim', color: '#ec4899' },
  scope: { label: 'Ruang Lingkup (Scope)', color: '#8b5cf6' },
  external: { label: 'Eksternal & Vendor', color: '#0ea5e9' },
  other: { label: 'Lain-lain', color: '#64748b' },
} as const;

export const RISK_STATUS = {
  identified: { label: 'Teridentifikasi', color: '#64748b' },
  analyzing: { label: 'Dalam Analisis', color: '#8b5cf6' },
  mitigating: { label: 'Dalam Mitigasi', color: '#3b82f6' },
  monitoring: { label: 'Dipantau', color: '#f59e0b' },
  resolved: { label: 'Teratasi', color: '#10b981' },
  closed: { label: 'Ditutup', color: '#94a3b8' },
} as const;

export const RISK_SEVERITY = {
  low: { label: 'Rendah', color: '#10b981', minScore: 1, maxScore: 4 },
  medium: { label: 'Sedang', color: '#f59e0b', minScore: 5, maxScore: 9 },
  high: { label: 'Tinggi', color: '#f97316', minScore: 10, maxScore: 15 },
  critical: { label: 'Kritis', color: '#ef4444', minScore: 16, maxScore: 25 },
} as const;

export function computeRiskSeverity(probability: number | string, impact: number | string) {
  const p = Math.max(1, Math.min(5, Number(probability) || 1));
  const i = Math.max(1, Math.min(5, Number(impact) || 1));
  const score = p * i;
  let severity = 'low';
  if (score >= 16) {
    severity = 'critical';
  } else if (score >= 10) {
    severity = 'high';
  } else if (score >= 5) {
    severity = 'medium';
  }
  return { score, severity, probability: p, impact: i };
}

