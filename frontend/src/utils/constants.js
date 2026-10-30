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

export const EXPENSE_STATUS = {
  pending: { label: 'Menunggu Persetujuan', color: '#f59e0b', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
  approved: { label: 'Disetujui', color: '#10b981', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  rejected: { label: 'Ditolak', color: '#ef4444', bg: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' },
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

export const RISK_TYPES = {
  risk: { label: 'Potensi Risiko', color: '#f59e0b', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
  issue: { label: 'Masalah Aktual', color: '#ef4444', bg: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' },
};

export const RISK_CATEGORIES = {
  technical: { label: 'Teknis & Arsitektur', color: 'indigo' },
  schedule: { label: 'Jadwal & Waktu', color: 'amber' },
  budget: { label: 'Anggaran & Biaya', color: 'emerald' },
  resource: { label: 'SDM & Tim', color: 'pink' },
  scope: { label: 'Ruang Lingkup (Scope)', color: 'purple' },
  external: { label: 'Eksternal & Vendor', color: 'sky' },
  other: { label: 'Lain-lain', color: 'slate' },
};

export const RISK_STATUS = {
  identified: { label: 'Teridentifikasi', color: '#64748b', bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  analyzing: { label: 'Dalam Analisis', color: '#8b5cf6', bg: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300' },
  mitigating: { label: 'Dalam Mitigasi', color: '#3b82f6', bg: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' },
  monitoring: { label: 'Dipantau', color: '#f59e0b', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
  resolved: { label: 'Teratasi', color: '#10b981', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  closed: { label: 'Ditutup', color: '#94a3b8', bg: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400' },
};

export const RISK_SEVERITY = {
  low: { label: 'Rendah', color: '#10b981', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  medium: { label: 'Sedang', color: '#f59e0b', bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  high: { label: 'Tinggi', color: '#f97316', bg: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800' },
  critical: { label: 'Kritis', color: '#ef4444', bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' },
};

export const PROBABILITY_SCALE = {
  1: '1 - Sangat Rendah (Hampir mustahil)',
  2: '2 - Rendah (Jarang terjadi)',
  3: '3 - Sedang (Mungkin terjadi)',
  4: '4 - Tinggi (Sangat mungkin terjadi)',
  5: '5 - Sangat Tinggi (Hampir pasti terjadi)',
};

export const IMPACT_SCALE = {
  1: '1 - Sangat Rendah (Dampak dapat diabaikan)',
  2: '2 - Rendah (Dampak minor terhadap jadwal/biaya)',
  3: '3 - Sedang (Dampak moderat, butuh penyesuaian)',
  4: '4 - Tinggi (Dampak signifikan terhadap deliverable)',
  5: '5 - Sangat Tinggi (Kritis, mengancam kelangsungan proyek)',
};

export function calculateRiskSeverity(probability, impact) {
  const p = Math.max(1, Math.min(5, Number(probability) || 1));
  const i = Math.max(1, Math.min(5, Number(impact) || 1));
  const score = p * i;
  let severity = 'low';
  if (score >= 16) severity = 'critical';
  else if (score >= 10) severity = 'high';
  else if (score >= 5) severity = 'medium';
  return { score, severity, probability: p, impact: i };
}

export const DOCUMENT_CATEGORIES = {
  charter: {
    label: 'Project Charter',
    color: '#6366f1',
    badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    description: 'Piagam proyek, visi, & tujuan strategis',
  },
  contract: {
    label: 'Kontrak & MoU',
    color: '#0284c7',
    badge: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    description: 'Perjanjian kerja sama, SPK, dan berkas legal',
  },
  mom: {
    label: 'Notulensi Rapat (MOM)',
    color: '#8b5cf6',
    badge: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
    description: 'Catatan hasil meeting, keputusan, & action items',
  },
  sop: {
    label: 'SOP & Panduan',
    color: '#10b981',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    description: 'Prosedur operasional baku & petunjuk teknis',
  },
  technical: {
    label: 'Spesifikasi Teknis',
    color: '#06b6d4',
    badge: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
    description: 'Arsitektur, skema API, dan spesifikasi sistem',
  },
  wiki: {
    label: 'Catatan & Wiki',
    color: '#f59e0b',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    description: 'Basis pengetahuan & catatan bebas tim proyek',
  },
  other: {
    label: 'Dokumen Lainnya',
    color: '#64748b',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    description: 'Dokumen pendukung dan arsip umum',
  },
};

export const DOCUMENT_STATUS = {
  draft: {
    label: 'Draft',
    color: '#64748b',
    bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  review: {
    label: 'Dalam Review',
    color: '#a855f7',
    bg: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300',
  },
  published: {
    label: 'Dipublikasikan',
    color: '#10b981',
    bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  final: {
    label: 'Final / Resmi',
    color: '#2563eb',
    bg: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  },
  archived: {
    label: 'Diarsipkan',
    color: '#94a3b8',
    bg: 'bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400',
  },
};

export const DOCUMENT_TEMPLATES = [
  {
    id: 'charter',
    name: 'Project Charter',
    category: 'charter',
    title: 'Project Charter - [Nama Proyek]',
    summary: 'Dokumen piagam otorisasi formal proyek, tujuan strategis, dan ruang lingkup.',
    content: `# Project Charter: [Nama Proyek]

> **Status:** Draft / Resmi
> **Tanggal Efektif:** ${new Date().toISOString().slice(0, 10)}
> **Disponsori Oleh:** [Nama Sponsor / Manajemen]

---

## 1. Latar Belakang & Urgensi
Jelaskan konteks bisnis dan masalah utama yang melatarbelakangi inisiasi proyek ini.

## 2. Tujuan & Sasaran (Objectives)
- **Sasaran Utama:** Menyelesaikan [Deliverable Utama] tepat waktu.
- **KPI Keberhasilan:**
  1. Target adopsi pengguna 80% pada Q1.
  2. SLA ketersediaan sistem 99.9%.

## 3. Ruang Lingkup Proyek (Scope)
### In-Scope (Termasuk)
- Implementasi modul A, B, dan C.
- Migrasi data dari sistem lama.
- Pelatihan tim operasional.

### Out-of-Scope (Tidak Termasuk)
- Integrasi pihak ketiga di luar API standar.
- Pengadaan server fisik onsite.

## 4. Tim Inti & Pemangku Kepentingan (Stakeholders)
- **Project Sponsor:** [Nama Sponsor]
- **Project Manager:** [Nama PM]
- **Lead Developer / Architect:** [Nama Lead]

## 5. Asumsi & Ketergantungan
- Infrastruktur cloud sudah tersedia pada fase pengujian.
`,
  },
  {
    id: 'contract',
    name: 'Ringkasan Kontrak / MoU',
    category: 'contract',
    title: 'Ringkasan Kontrak & MoU - [Nama Mitra / Vendor]',
    summary: 'Dokumen ringkasan klausul perjanjian kerja sama, deliverable, dan nilai kontrak.',
    content: `# Ringkasan Kontrak / MoU

> **Nomor Perjanjian:** SPK/2026/XX-YY
> **Pihak Pertama:** [Nama Instansi / Perusahaan]
> **Pihak Kedua (Mitra):** [Nama Vendor / Kontraktor]
> **Masa Berlaku:** [Tanggal Mulai] s/d [Tanggal Selesai]

---

## 1. Pokok Perjanjian
Uraian ringkas kesepakatan kerja sama antara kedua belah pihak.

## 2. Ruang Lingkup Deliverables
- [ ] Penyerahan lisensi perangkat lunak.
- [ ] Pelaksanaan konfigurasi & instalasi.
- [ ] Penyerahan Berita Acara Serah Terima (BAST).

## 3. Nilai Kontrak & Termin Pembayaran
- **Total Nilai:** Rp [Nominal] (Termasuk PPN)
- **Termin 1 (DP 30%):** Setelah penandatanganan kontrak.
- **Termin 2 (Progress 40%):** Setelah lolos uji coba UAT.
- **Termin 3 (Pelunasan 30%):** Setelah penandatanganan BAST final.

## 4. SLA & Dukungan Pemeliharaan
- Waktu respon garansi maksimal 4 jam kerja untuk kendala kritis.
- Masa garansi berlaku selama 6 bulan sejak BAST.
`,
  },
  {
    id: 'mom',
    name: 'Notulensi Rapat (MOM)',
    category: 'mom',
    title: 'MOM: Rapat Koordinasi Mingguan Proyek - [Tanggal]',
    summary: 'Catatan jalannya rapat koordinasi, pembahasan isu, keputusan, dan tindak lanjut.',
    content: `# Minutes of Meeting (MOM)

> **Agenda:** Rapat Koordinasi Mingguan Proyek
> **Waktu:** ${new Date().toISOString().slice(0, 10)} | 10:00 - 11:30 WIB
> **Tempat / Media:** Ruang Rapat Utama / Google Meet
> **Notulis:** [Nama Notulis]

---

## 1. Peserta Hadir
- [Nama PM] (Project Manager)
- [Nama Tech Lead] (Lead Engineer)
- [Nama QA] (Quality Assurance)
- [Nama Stakeholder] (Product Owner)

## 2. Topik Pembahasan
1. Evaluasi progres Sprint berjalan.
2. Kendala integrasi API pembayaran dengan bank mitra.
3. Rencana rilis versi beta minggu depan.

## 3. Keputusan Rapat (Decisions)
- **D-01:** Rilis modul absensi disetujui untuk masuk tahap staging per hari Jumat.
- **D-02:** Penyesuaian jadwal deployment produksi diundur 2 hari untuk pengetesan beban (load testing).

## 4. Tindak Lanjut (Action Items)
- [ ] Menghubungi technical support bank mitra terkait response code 504. (PIC: [Nama Lead] | Due: Besok)
- [ ] Melakukan finalisasi skenario UAT bersama tim operasional. (PIC: [Nama QA] | Due: Kamis)
`,
  },
  {
    id: 'sop',
    name: 'SOP & Panduan',
    category: 'sop',
    title: 'SOP: [Judul Prosedur Operasional]',
    summary: 'Prosedur standar operasional langkah demi langkah untuk tim proyek.',
    content: `# Standar Operasional Prosedur (SOP)

> **Kode Dokumen:** SOP-PRJ-001
> **Divisi / Unit:** Engineering & Operations
> **Versi:** 1.0

---

## 1. Tujuan
Memastikan seluruh proses [Nama Proses] berjalan secara konsisten, aman, dan terdokumentasi.

## 2. Ruang Lingkup
Prosedur ini berlaku untuk seluruh anggota tim proyek yang terlibat dalam [Lingkup Pekerjaan].

## 3. Prasyarat & Kelengkapan
- Akses ke dashboard staging / production.
- Akun berwenang dengan hak akses level 2.

## 4. Alur Langkah-langkah (Step-by-Step)
1. **Persiapan:**
   - Lakukan backup database sebelum memulai migrasi.
   - Periksa ketersediaan log aktivitas.
2. **Eksekusi:**
   - Jalankan skrip rilis melalui pipeline CI/CD.
   - Verifikasi status health check service.
3. **Penyelesaian & Verifikasi:**
   - Uji coba fungsional fitur utama.
   - Kirimkan konfirmasi rilis ke grup koordinasi tim.

## 5. Penanganan Kondisi Darurat (Rollback Plan)
Apabila terjadi kegagalan sistem lebih dari 15 menit, lakukan eksekusi perintah rollback ke versi tag git sebelumnya.
`,
  },
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
