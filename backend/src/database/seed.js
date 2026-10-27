'use strict';

/**
 * Database seeder for the Project Management System.
 *
 * Usage:
 *   node src/database/seed.js            -> wipe the data rows and re-insert the demo dataset
 *   node src/database/seed.js --fresh    -> drop & recreate the tables first, then seed
 *
 * The script is idempotent: every run truncates the data tables (the schema is
 * never dropped unless --fresh is used) and re-inserts exactly the same
 * dataset, so running it twice never duplicates rows.
 *
 * All randomness goes through a seeded PRNG (mulberry32) so the generated data
 * is reproducible for a given run order.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const dayjs = require('dayjs');

const env = require('../config/env');
const { pool } = require('../config/database');
const { hashPassword } = require('../utils/password');
const { TASK_STATUS, DEFAULT_PROJECT_STATUSES } = require('../config/constants');
const { recalculateProjects } = require('../services/progressService');

const FRESH = process.argv.includes('--fresh');
const MIGRATE_PATH = path.join(__dirname, 'migrate.js');
const UPLOAD_DIR = env.UPLOAD_PATH;
const DEFAULT_PASSWORD = 'Password123!';
const PRNG_SEED = 20260115;

const NOW = dayjs();
const DAY = 24 * 60 * 60 * 1000;

const TABLES = [
  'task_attachments',
  'project_expenses',
  'task_comments',
  'task_labels',
  'task_dependencies',
  'tasks',
  'milestones',
  'project_members',
  'project_statuses',
  'labels',
  'activities',
  'notifications',
  'projects',
  'project_template_tasks',
  'project_template_milestones',
  'project_template_statuses',
  'project_templates',
  'users',
];

// ---------------------------------------------------------------------------
// Deterministic pseudo random helpers
// ---------------------------------------------------------------------------

/**
 * mulberry32 - tiny, fast, deterministic PRNG.
 * @param {number} seed
 * @returns {() => number} generator producing floats in [0, 1)
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(PRNG_SEED);

/** @param {number} min @param {number} max */
function intBetween(min, max) {
  return min + Math.floor(rnd() * (max - min + 1));
}

/**
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

/**
 * Fisher-Yates shuffle on a copy.
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const fmtDate = (value) => dayjs(value).format('YYYY-MM-DD');
const fmtDateTime = (value) => dayjs(value).format('YYYY-MM-DD HH:mm:ss');

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

// ---------------------------------------------------------------------------
// Static demo data
// ---------------------------------------------------------------------------


const TEMPLATES = [
  {
    code: 'it-agile',
    name: 'Pengembangan Software (Agile IT)',
    category: 'IT & Software',
    description: 'Framework kerja Agile/Scrum untuk tim pengembang perangkat lunak, web, dan aplikasi mobile.',
    color: '#4f46e5',
    is_system: 1,
    statuses: [
      { key_name: 'todo', label: 'Akan Dikerjakan', color: '#64748b', category: 'todo', progress: 0, position: 0 },
      { key_name: 'in_progress', label: 'Sedang Dikerjakan', color: '#3b82f6', category: 'in_progress', progress: 50, position: 1 },
      { key_name: 'review', label: 'Dalam Code Review', color: '#a855f7', category: 'review', progress: 75, position: 2 },
      { key_name: 'blocked', label: 'Tertunda / Blocker', color: '#ef4444', category: 'blocked', progress: 0, position: 3 },
      { key_name: 'done', label: 'Selesai & Merged', color: '#10b981', category: 'done', progress: 100, position: 4 },
    ],
    milestones: [
      { name: 'Sprint 1 Review & Demo', description: 'Evaluasi hasil sprint pertama dengan stakeholder', due_offset_days: 14, position: 0 },
      { name: 'Alpha Release (UAT)', description: 'Rilis alpha untuk pengujian pengguna internal', due_offset_days: 45, position: 1 },
      { name: 'Production Go-Live', description: 'Peluncuran resmi ke lingkungan produksi', due_offset_days: 90, position: 2 },
    ],
    tasks: [
      { title: 'Setup repository & environment CI/CD', description: 'Konfigurasi Git repository, Docker container, dan automated test pipeline', status_key: 'todo', priority: 'high', estimated_hours: 8, start_offset_days: 0, due_offset_days: 5, is_milestone: 0, position: 0 },
      { title: 'Desain arsitektur database & schema', description: 'Pemodelan ERD, tabel relasional, dan indexing performa', status_key: 'todo', priority: 'high', estimated_hours: 16, start_offset_days: 2, due_offset_days: 10, is_milestone: 0, position: 1 },
      { title: 'Implementasi otentikasi & RBAC', description: 'Autentikasi JWT, proteksi route, dan manajemen hak akses pengguna', status_key: 'todo', priority: 'medium', estimated_hours: 24, start_offset_days: 5, due_offset_days: 18, is_milestone: 0, position: 2 },
      { title: 'Integrasi API frontend & backend', description: 'Penyambungan form, data fetching, dan error handling', status_key: 'todo', priority: 'medium', estimated_hours: 32, start_offset_days: 12, due_offset_days: 35, is_milestone: 0, position: 3 },
      { title: 'Testing QA dan audit performa', description: 'Uji beban, penetration test, dan cross-browser validation', status_key: 'todo', priority: 'urgent', estimated_hours: 20, start_offset_days: 30, due_offset_days: 50, is_milestone: 1, position: 4 },
    ],
  },
  {
    code: 'construction',
    name: 'Konstruksi & Sipil',
    category: 'Konstruksi & Teknik',
    description: 'Tahapan proyek fisik, renovasi gedung, dan pekerjaan sipil dengan alur tender, lapangan, hingga BAST.',
    color: '#0ea5e9',
    is_system: 1,
    statuses: [
      { key_name: 'survey', label: 'Survey & Perizinan', color: '#6366f1', category: 'todo', progress: 0, position: 0 },
      { key_name: 'design_rab', label: 'Desain & RAB', color: '#0ea5e9', category: 'in_progress', progress: 20, position: 1 },
      { key_name: 'procurement', label: 'Pengadaan Material & Alat', color: '#f59e0b', category: 'in_progress', progress: 45, position: 2 },
      { key_name: 'field_work', label: 'Konstruksi Lapangan', color: '#3b82f6', category: 'in_progress', progress: 75, position: 3 },
      { key_name: 'site_issue', label: 'Kendala Lapangan', color: '#ef4444', category: 'blocked', progress: 0, position: 4 },
      { key_name: 'bast', label: 'BAST / Serah Terima', color: '#10b981', category: 'done', progress: 100, position: 5 },
    ],
    milestones: [
      { name: 'Izin Mendirikan Bangunan (PBG/IMB) Terbit', description: 'Kelengkapan legalitas dan perizinan resmi pemerintah', due_offset_days: 30, position: 0 },
      { name: 'Penyelesaian Struktur Bawah / Pondasi', description: 'Pondasi selesai diuji tekan dan siap menopang struktur atas', due_offset_days: 60, position: 1 },
      { name: 'Topping Off Struktur Utama', description: 'Pengecoran atap lantai teratas selesai', due_offset_days: 120, position: 2 },
      { name: 'Berita Acara Serah Terima (BAST I)', description: 'Penyelesaian fisik 100% dan serah terima ke pemilik proyek', due_offset_days: 180, position: 3 },
    ],
    tasks: [
      { title: 'Pengukuran topografi & uji tanah (soil test)', description: 'Survey kontur lahan dan sondir daya dukung tanah', status_key: 'survey', priority: 'high', estimated_hours: 40, start_offset_days: 0, due_offset_days: 14, is_milestone: 0, position: 0 },
      { title: 'Penyusunan gambar DED & Rencana Anggaran Biaya (RAB)', description: 'Gambar kerja detail teknik dan bill of quantities (BOQ)', status_key: 'survey', priority: 'urgent', estimated_hours: 80, start_offset_days: 10, due_offset_days: 30, is_milestone: 0, position: 1 },
      { title: 'Tender subkontraktor & PO material baja/beton', description: 'Pengadaan material struktur utama dan sewa alat berat', status_key: 'survey', priority: 'medium', estimated_hours: 60, start_offset_days: 25, due_offset_days: 45, is_milestone: 0, position: 2 },
      { title: 'Pekerjaan galian tanah dan pondasi tapak', description: 'Pekerjaan tanah, pemasangan bekisting, dan pembesian pondasi', status_key: 'survey', priority: 'high', estimated_hours: 120, start_offset_days: 40, due_offset_days: 70, is_milestone: 0, position: 3 },
      { title: 'Pengecoran kolom dan balok lantai', description: 'Pekerjaan beton bertulang untuk struktur bangunan', status_key: 'survey', priority: 'high', estimated_hours: 160, start_offset_days: 65, due_offset_days: 110, is_milestone: 0, position: 4 },
      { title: 'Inspeksi K3 dan uji kelayakan struktur', description: 'Verifikasi keselamatan kerja lapangan dan uji mutu beton', status_key: 'survey', priority: 'medium', estimated_hours: 30, start_offset_days: 110, due_offset_days: 170, is_milestone: 1, position: 5 },
    ],
  },
  {
    code: 'marketing',
    name: 'Kampanye Marketing & Kreatif',
    category: 'Marketing & Kreatif',
    description: 'Siklus pembuatan konten kreatif, media sosial, iklan berbayar, dan persetujuan dari brand/klien.',
    color: '#ec4899',
    is_system: 1,
    statuses: [
      { key_name: 'ideation', label: 'Ide & Brief Kreatif', color: '#8b5cf6', category: 'todo', progress: 0, position: 0 },
      { key_name: 'production', label: 'Produksi Konten & Desain', color: '#3b82f6', category: 'in_progress', progress: 40, position: 1 },
      { key_name: 'internal_review', label: 'Review Internal Tim', color: '#ec4899', category: 'review', progress: 70, position: 2 },
      { key_name: 'revision', label: 'Revisi / On Hold', color: '#ef4444', category: 'blocked', progress: 0, position: 3 },
      { key_name: 'client_approval', label: 'Approval Klien / Brand', color: '#f59e0b', category: 'review', progress: 85, position: 4 },
      { key_name: 'published', label: 'Tayang / Live Campaign', color: '#10b981', category: 'done', progress: 100, position: 5 },
    ],
    milestones: [
      { name: 'Persetujuan Concept Brief & Moodboard', description: 'Konsep visual dan pesan utama kampanye disetujui', due_offset_days: 7, position: 0 },
      { name: 'Finalisasi Aset Media & Copywriting', description: 'Seluruh materi iklan dan konten siap tayang', due_offset_days: 21, position: 1 },
      { name: 'Peluncuran Kampanye (Campaign Launch)', description: 'Iklan dan promosi resmi ditayangkan ke publik', due_offset_days: 30, position: 2 },
    ],
    tasks: [
      { title: 'Riset audiens dan analisa kompetitor', description: 'Memetakan tren pasar dan persona target konsumen', status_key: 'ideation', priority: 'medium', estimated_hours: 16, start_offset_days: 0, due_offset_days: 5, is_milestone: 0, position: 0 },
      { title: 'Penyusunan copywriting landing page & script video', description: 'Penulisan naskah iklan persuasif dan narasi promosi', status_key: 'ideation', priority: 'high', estimated_hours: 24, start_offset_days: 4, due_offset_days: 12, is_milestone: 0, position: 1 },
      { title: 'Produksi grafis media sosial & banner ads', description: 'Perancangan aset visual berbagai rasio (1:1, 9:16, 16:9)', status_key: 'ideation', priority: 'high', estimated_hours: 32, start_offset_days: 8, due_offset_days: 18, is_milestone: 0, position: 2 },
      { title: 'Pengaturan target audiens Facebook & Google Ads', description: 'Setup ad set, budget harian, dan tracking pixel konversi', status_key: 'ideation', priority: 'medium', estimated_hours: 12, start_offset_days: 18, due_offset_days: 25, is_milestone: 0, position: 3 },
      { title: 'Monitoring performa CTR dan laporan konversi mingguan', description: 'Evaluasi ROAS, cost per lead, dan rekomendasi A/B testing', status_key: 'ideation', priority: 'medium', estimated_hours: 20, start_offset_days: 25, due_offset_days: 45, is_milestone: 1, position: 4 },
    ],
  },
  {
    code: 'event-ops',
    name: 'Event Organizer & Operasional',
    category: 'Event & Operasional',
    description: 'Manajemen acara, festival, pameran, atau konferensi mulai dari booking venue hingga evaluasi.',
    color: '#10b981',
    is_system: 1,
    statuses: [
      { key_name: 'concept', label: 'Konsep & Budgeting', color: '#6366f1', category: 'todo', progress: 0, position: 0 },
      { key_name: 'booking', label: 'Booking Vendor & Venue', color: '#0ea5e9', category: 'in_progress', progress: 35, position: 1 },
      { key_name: 'promotion', label: 'Promosi & Tiket / Registrasi', color: '#a855f7', category: 'in_progress', progress: 60, position: 2 },
      { key_name: 'technical_prep', label: 'Persiapan Teknis & GR', color: '#f59e0b', category: 'in_progress', progress: 85, position: 3 },
      { key_name: 'evaluation', label: 'Hari-H & Evaluasi Selesai', color: '#10b981', category: 'done', progress: 100, position: 4 },
    ],
    milestones: [
      { name: 'Venue & Main Sponsor Terkonfirmasi', description: 'Perjanjian sewa lokasi dan pendanaan sponsor tertanda tangan', due_offset_days: 20, position: 0 },
      { name: 'Penjualan Tiket / Registrasi Dibuka', description: 'Sistem pendaftaran peserta live ke publik', due_offset_days: 40, position: 1 },
      { name: 'Gladi Resik (Technical Rehearsal)', description: 'Simulasi rundown menyeluruh bersama seluruh divisi', due_offset_days: 58, position: 2 },
      { name: 'Pelaksanaan Hari-H Event', description: 'Hari pelaksanaan acara puncak', due_offset_days: 60, position: 3 },
    ],
    tasks: [
      { title: 'Penyusunan rundown acara & pembagian divisi kerja', description: 'Jadwal menit demi menit dan penunjukan penanggung jawab divisi', status_key: 'concept', priority: 'high', estimated_hours: 20, start_offset_days: 0, due_offset_days: 10, is_milestone: 0, position: 0 },
      { title: 'Negosiasi harga sewa gedung & sound system', description: 'Kontrak vendor audio visual, panggung, dan izin keramaian', status_key: 'concept', priority: 'urgent', estimated_hours: 30, start_offset_days: 5, due_offset_days: 18, is_milestone: 0, position: 1 },
      { title: 'Desain merchandise, backdrop, dan ID card panitia', description: 'Produksi atribut visual dan pencetakan materi fisik', status_key: 'concept', priority: 'medium', estimated_hours: 25, start_offset_days: 15, due_offset_days: 30, is_milestone: 0, position: 2 },
      { title: 'Briefing MC, pengisi acara, dan guest star', description: 'Penyamaan persepsi materi panggung dan riders artis', status_key: 'concept', priority: 'high', estimated_hours: 15, start_offset_days: 35, due_offset_days: 45, is_milestone: 0, position: 3 },
      { title: 'Uji coba kelistrikan, lighting, dan live streaming', description: 'Stress test genset cadangan dan rehearsal teknis panggung', status_key: 'concept', priority: 'urgent', estimated_hours: 16, start_offset_days: 50, due_offset_days: 55, is_milestone: 1, position: 4 },
    ],
  },
];

const USERS = [
  {
    key: 'admin',
    name: 'Administrator',
    email: 'admin@pm.test',
    role: 'admin',
    job_title: 'System Administrator',
    phone: '+62 812-1000-0001',
    bio: 'Administrator sistem yang menjaga platform, infrastruktur, dan keamanan data perusahaan.',
  },
  {
    key: 'budi',
    name: 'Budi Santoso',
    email: 'budi@pm.test',
    role: 'manager',
    job_title: 'Head of IT',
    phone: '+62 812-1000-0002',
    bio: 'Kepala Divisi IT yang memimpin tim pengembangan produk digital dan Platform Cloud.',
  },
  {
    key: 'siti',
    name: 'Siti Rahayu',
    email: 'siti@pm.test',
    role: 'manager',
    job_title: 'HR Manager',
    phone: '+62 812-1000-0003',
    bio: 'Manajer SDM yang berfokus pada proses payroll, rekrutmen, dan pengembangan karyawan.',
  },
  {
    key: 'andi',
    name: 'Andi Pratama',
    email: 'andi@pm.test',
    role: 'member',
    job_title: 'Frontend Developer',
    phone: '+62 812-1000-0004',
    bio: 'Frontend developer yang membangun antarmuka web responsif dengan React dan Tailwind CSS.',
  },
  {
    key: 'dewi',
    name: 'Dewi Lestari',
    email: 'dewi@pm.test',
    role: 'member',
    job_title: 'Backend Developer',
    phone: '+62 812-1000-0005',
    bio: 'Backend developer yang fokus pada API, integrasi database, dan optimasi query.',
  },
  {
    key: 'rizky',
    name: 'Rizky Maulana',
    email: 'rizky@pm.test',
    role: 'member',
    job_title: 'UI/UX Designer',
    phone: '+62 812-1000-0006',
    bio: 'UI/UX designer yang merancang design system, prototipe, dan riset kegunaan produk.',
  },
  {
    key: 'maya',
    name: 'Maya Sari',
    email: 'maya@pm.test',
    role: 'member',
    job_title: 'QA Engineer',
    phone: '+62 812-1000-0007',
    bio: 'QA engineer yang menjaga kualitas rilis melalui pengujian manual dan pengujian otomatis.',
  },
  {
    key: 'fajar',
    name: 'Fajar Nugroho',
    email: 'fajar@pm.test',
    role: 'member',
    job_title: 'DevOps Engineer',
    phone: '+62 812-1000-0008',
    bio: 'DevOps engineer yang mengelola CI/CD, infrastruktur cloud, dan monitoring aplikasi.',
  },
];

const PROJECTS = [
  {
    key: 'p1',
    code: 'PRJ-2026-001',
    name: 'Redesign Portal_In(iset)',
    description:
      'Complete redesign of the employee self-service portal with a new design system and responsive layout.',
    status: 'active',
    priority: 'high',
    managerKey: 'budi',
    creatorKey: 'admin',
    start_date: '2026-01-15',
    end_date: '2026-12-30',
    budget: 850000000,
    color: '#4f46e5',
    labels: ['Design', 'Frontend', 'Documentation', 'Feature', 'Performance'],
    groups: [
      {
        parent: 'Audit ulang kebutuhan pengguna portal karyawan',
        children: [
          'Wawancara 8 pengguna untuk memetakan pain point',
          'Analisis heatmap halaman absensi lama',
          'Susun matriks kebutuhan fitur baru',
        ],
      },
      {
        parent: 'Bangun design system portal',
        children: ['Buat token warna dan tipografi', 'Komponen tombol dan form terpusat'],
      },
      {
        parent: 'Migrasi halaman portal ke layout baru',
        children: ['Halaman dashboard karyawan', 'Halaman pengajuan cuti'],
      },
      {
        parent: 'Migrasi data pengguna ke portal baru',
        children: ['Import data karyawan lama', 'Validasi hak akses per peran'],
      },
    ],
    singles: ['Rancangan wireframe halaman dashboard', 'Uji responsivitas di perangkat mobile'],
    childStatuses: [
      'done',
      'done',
      'done',
      'in_progress',
      'todo',
      'blocked',
      'done',
      'todo',
      'todo',
    ],
    singleStatuses: ['review', 'done'],
  },
  {
    key: 'p2',
    code: 'PRJ-2026-002',
    name: 'Implementasi Modul Payroll',
    description:
      'New payroll module covering attendance integration, slip generation and tax calculations.',
    status: 'active',
    priority: 'urgent',
    managerKey: 'siti',
    creatorKey: 'siti',
    start_date: '2026-03-01',
    end_date: '2026-11-30',
    budget: 1200000000,
    color: '#ef4444',
    labels: ['Backend', 'Feature', 'Database', 'Testing', 'Bug'],
    groups: [
      {
        parent: 'Integrasi API absensi dengan modul payroll',
        children: [
          'Buat adapter pembacaan data absensi',
          'Hitung jam kerja efektif per hari',
          'Tangani data absensi tidak lengkap',
        ],
      },
      {
        parent: 'Pembuatan slip gaji PDF',
        children: ['Template slip gaji dengan logo perusahaan', 'Ekspor slip gaji dalam format PDF'],
      },
      {
        parent: 'Implementasi perhitungan pajak penghasilan',
        children: ['Hitung PPh Pasal 21 bulanan', 'Terapkan threshold PTKP terbaru'],
      },
      {
        parent: 'Validasi siklus gaji bulanan',
        children: ['Unit test kasus pajak lembur', 'Rekonsiliasi manual dengan bagian HR'],
      },
    ],
    singles: ['Optimasi query laporan kehadiran', 'Uji kompatibilitas generator slip gaji'],
    childStatuses: [
      'done',
      'done',
      'in_progress',
      'in_progress',
      'todo',
      'todo',
      'blocked',
      'todo',
      'review',
    ],
    singleStatuses: ['done', 'in_progress'],
  },
  {
    key: 'p3',
    code: 'PRJ-2026-003',
    name: 'Migrasi Database ke MySQL 8',
    description:
      'Migrate all legacy schemas from MySQL 5.7 to MySQL 8 with zero downtime.',
    status: 'planning',
    priority: 'medium',
    managerKey: 'budi',
    creatorKey: 'budi',
    start_date: '2026-10-01',
    end_date: '2027-02-28',
    budget: 600000000,
    color: '#0ea5e9',
    labels: ['Database', 'DevOps', 'Backend', 'Performance', 'Testing'],
    groups: [
      {
        parent: 'Inventory skema legacy MySQL 5.7',
        children: ['Daftar tabel dan relasi antar tabel', 'Identifikasi stored procedure lama'],
      },
      {
        parent: 'Siapkan lingkungan MySQL 8',
        children: ['Provisioning server replika MySQL 8', 'Konfigurasi charset utf8mb4'],
      },
      {
        parent: 'Migrasi data inti payroll dan absensi',
        children: ['Skrip migrasi tabel karyawan', 'Verifikasi jumlah baris setelah migrasi'],
      },
      {
        parent: 'Rancang strategi zero downtime',
        children: ['Uji konsistensi data sebelum dan sesudah migrasi', 'Dokumentasi rollback plan migrasi'],
      },
    ],
    singles: [
      'Setup monitoring query lambat',
      'Petakan tipe data yang tidak kompatibel',
      'Uji throughput query pada replika',
    ],
    childStatuses: [
      'todo',
      'todo',
      'todo',
      'blocked',
      'in_progress',
      'todo',
      'todo',
      'todo',
    ],
    singleStatuses: ['todo', 'todo', 'in_progress'],
  },
  {
    key: 'p4',
    code: 'PRJ-2026-004',
    name: 'Aplikasi Mobile Karyawan',
    description:
      'Cross-platform mobile app for employees to check attendance, leave and payslips.',
    status: 'on_hold',
    priority: 'high',
    managerKey: 'siti',
    creatorKey: 'admin',
    start_date: '2026-05-10',
    end_date: '2026-12-15',
    budget: 750000000,
    color: '#a855f7',
    labels: ['Frontend', 'Feature', 'Testing', 'DevOps', 'Design'],
    groups: [
      {
        parent: 'Rancang arsitektur aplikasi mobile',
        children: [
          'Tentukan strategi React Native atau Flutter',
          'Rancang skema offline sync',
          'Evaluasi opsi pushed notification',
        ],
      },
      {
        parent: 'Modul absensi berbasis geofence',
        children: ['Implementasi pembacaan lokasi GPS', 'Fallback absensi via QR code'],
      },
      {
        parent: 'Modul pengajuan cuti',
        children: ['Formulir pengajuan dengan kalender', 'Alur persetujuan berjenjang'],
      },
      {
        parent: 'Tampilan slip gaji di aplikasi',
        children: ['Riwayat pengajuan karyawan', 'Unduh slip gaji dari perangkat'],
      },
    ],
    singles: [
      'Buat mockup layar aplikasi mobile',
      'Uji performa pada jaringan low speed',
    ],
    childStatuses: [
      'todo',
      'todo',
      'todo',
      'blocked',
      'todo',
      'todo',
      'todo',
      'review',
      'in_progress',
    ],
    singleStatuses: ['done', 'todo'],
  },
  {
    key: 'p5',
    code: 'PRJ-2026-005',
    name: 'Audit & Perbaikan Keamanan',
    description:
      'Security audit, penetration testing and remediation of all critical findings.',
    status: 'completed',
    priority: 'urgent',
    managerKey: 'budi',
    creatorKey: 'admin',
    start_date: '2026-01-05',
    end_date: '2026-09-30',
    budget: 400000000,
    color: '#10b981',
    labels: ['Security', 'Bug', 'Backend', 'Testing', 'DevOps'],
    groups: [
      {
        parent: 'Audit keamanan aplikasi web',
        children: ['Pemindaian OWASP Top 10', 'Review kode untuk SQL injection'],
      },
      {
        parent: 'Penetration testing internal',
        children: ['Simulasi serangan pada modul login', 'Uji akses horizontal antar pengguna'],
      },
      {
        parent: 'Perbaikan temuan kritis',
        children: ['Validasi input pada seluruh endpoint', 'Tambahkan proteksi CSRF dan rate limit'],
      },
      {
        parent: 'Hardening infrastruktur produksi',
        children: ['Uji privilege escalation', 'Audit log akses server'],
      },
    ],
    singles: [
      'Pengaturan password dan policy strength',
      'Update dependency yang rentan',
      'Pelatihan keamanan untuk developer',
    ],
    childStatuses: ['done', 'done', 'done', 'done', 'done', 'done', 'done', 'done'],
    singleStatuses: ['done', 'done', 'done'],
  },
  {
    key: 'p6',
    code: 'PRJ-2026-006',
    name: 'Dashboard Analytics (BI)',
    description:
      'Executive BI dashboard with self-service reports and scheduled exports.',
    status: 'active',
    priority: 'medium',
    managerKey: 'siti',
    creatorKey: 'siti',
    start_date: '2026-09-15',
    end_date: '2027-03-31',
    budget: 950000000,
    color: '#f59e0b',
    labels: ['Backend', 'Database', 'Performance', 'Feature', 'Frontend'],
    groups: [
      {
        parent: 'Rancang model data untuk analitik',
        children: ['Dimensi waktu, karyawan, dan unit kerja', 'Fakta transaksi dan nilai payroll'],
      },
      {
        parent: 'Pipeline ETL harian',
        children: ['Job ekstraksi data ke data warehouse', 'Transformasi dan agregasi data'],
      },
      {
        parent: 'Dashboard eksekutif',
        children: ['Visualisasi KPI ketepatan waktu', 'Drill-down performa per unit kerja'],
      },
      {
        parent: 'Ekspor dan distribusi laporan',
        children: ['Ekspor laporan terjadwal', 'Mekanisme pembaruan incremental'],
      },
    ],
    singles: [
      'Tambahkan filter tanggal pada dashboard',
      'Optimasi query agregat pada data warehouse',
      'Validasi kualitas data terjadwal',
    ],
    childStatuses: [
      'done',
      'done',
      'in_progress',
      'in_progress',
      'review',
      'todo',
      'todo',
      'blocked',
    ],
    singleStatuses: ['done', 'review', 'todo'],
  },
];

const LABELS = [
  { name: 'Bug', color: '#ef4444' },
  { name: 'Feature', color: '#3b82f6' },
  { name: 'Documentation', color: '#64748b' },
  { name: 'Design', color: '#a855f7' },
  { name: 'Backend', color: '#0ea5e9' },
  { name: 'Frontend', color: '#10b981' },
  { name: 'Database', color: '#f59e0b' },
  { name: 'DevOps', color: '#6366f1' },
  { name: 'Testing', color: '#ec4899' },
  { name: 'Security', color: '#dc2626' },
  { name: 'Performance', color: '#14b8a6' },
  { name: 'Refactoring', color: '#8b5cf6' },
];

const MILESTONES = [
  {
    projectKey: 'p1',
    name: 'Phase 1 - Discovery Selesai',
    description: 'Riset pengguna dan matriks kebutuhan sudah disetujui stakeholders.',
    due_date: '2026-03-31',
    status: 'achieved',
    progress: 100,
  },
  {
    projectKey: 'p1',
    name: 'Design System Freeze',
    description: 'Token, tipografi, dan komponen inti dikunci sebelum migrasi halaman.',
    due_date: '2026-06-30',
    status: 'achieved',
    progress: 100,
  },
  {
    projectKey: 'p2',
    name: 'Integrasi Absensi Selesai',
    description: 'Data absensi terhubung penuh dengan perhitungan gaji bulanan.',
    due_date: '2026-06-15',
    status: 'achieved',
    progress: 100,
  },
  {
    projectKey: 'p2',
    name: 'UAT Sign-off Modul Payroll',
    description: 'UAT dengan pihak HR ditutup dan modul siap masuk produksi.',
    due_date: '2026-11-10',
    status: 'in_progress',
    progress: 75,
  },
  {
    projectKey: 'p3',
    name: 'Environment Replika MySQL 8 Ready',
    description: 'Server replika MySQL 8 siap dipakai untuk uji migrasi tanpa downtime.',
    due_date: '2026-10-25',
    status: 'in_progress',
    progress: 50,
  },
  {
    projectKey: 'p4',
    name: 'Rancangan Arsitektur Mobile Disetujui',
    description: 'Pilihan stack mobile dan skema offline sync disetujui manajemen.',
    due_date: '2026-07-31',
    status: 'missed',
    progress: 25,
  },
  {
    projectKey: 'p5',
    name: 'Go Live Produksi',
    description: 'Semua temuan kritis ditutup dan aplikasi berjalan di produksi.',
    due_date: '2026-09-30',
    status: 'achieved',
    progress: 100,
  },
  {
    projectKey: 'p6',
    name: 'Pipeline ETL Harian Berjalan',
    description: 'Pipeline ETL harian berjalan stabil di server data warehouse.',
    due_date: '2026-11-30',
    status: 'in_progress',
    progress: 50,
  },
  {
    projectKey: 'p6',
    name: 'Dashboard Beta Rilis ke Manajemen',
    description: 'Versi beta dashboard analitik dibagikan ke direksi untuk umpan balik.',
    due_date: '2026-12-20',
    status: 'planned',
    progress: 0,
  },
];

const COMMENT_BODIES = [
  'Bisa tolong tambahkan validasi untuk inputan kosong?',
  'Sudah saya perbaiki di branch feature/payroll-validation, siap direview.',
  'Hasil testing menunjukkan tidak ada regresi di modul absensi.',
  'Mohon konfirmasi soal batas zona absensi dengan tim HR.',
  'Estimasi jam perlu disesuaikan karena ada tambahan integrasi.',
  'Pull request sudah di-merge ke branch develop, silakan dicek.',
  'Kita lanjutkan ke task berikutnya setelah review selesai.',
  'Perlu tambahan test case untuk kondisi data null.',
  'Desain sudah disetujui tim, implementasi bisa dimulai.',
  'Saya push revisi terbaru, tolong dicek bagian notifikasi.',
  'Dataset sample sudah saya lampirkan, silakan cek.',
  'Untuk target hari ini kita fokuskan pada optimasi query.',
  'Catatan review sudah saya update di deskripsi task.',
  'Sudah dicek di perangkat saya, tampilannya sudah sesuai mockup.',
  'Endpoint ini perlu rate limit tambahan karena dipanggil otomatis.',
  'Bisa tolong konfirmasi nama environment untuk staging?',
  'Semua test case pada pipeline hijau, tidak ada yang gagal.',
  'Saya konsultasikan dengan tim infra soal lisensi tool.',
  'Uji beban menunjukkan waktu respons turun di jam sibuk.',
  'Perlu selisih antara estimasi dan aktual jam kerja.',
  'Sudah saya koreksi referensinya, sekarang sesuai dokumen.',
  'Menunggu konfirmasi dari tim legal sebelum proceed.',
  'Saya tambahkan catatan tambahan untuk konteks di thread ini.',
  'Sekarang sudah aman, tolong direview dan di-merge.',
];

const NOTIFICATION_TEMPLATES = [
  {
    type: 'task',
    title: 'Task baru ditugaskan',
    message: 'Anda ditugaskan untuk mengerjakan task "{task}".',
    link: '/tasks?task={taskId}',
  },
  {
    type: 'mention',
    title: 'Anda disebut dalam komentar',
    message: 'Nama Anda disebut pada komentar task "{task}".',
    link: '/tasks?task={taskId}',
  },
  {
    type: 'success',
    title: 'Task ditandai selesai',
    message: 'Task "{task}" telah ditandai selesai dan menunggu verifikasi.',
    link: '/tasks?task={taskId}',
  },
  {
    type: 'warning',
    title: 'Task mendekati tenggat',
    message: 'Task "{task}" akan jatuh tempo dalam beberapa hari lagi.',
    link: '/tasks?task={taskId}',
  },
  {
    type: 'danger',
    title: 'Task melewati tenggat',
    message: 'Task "{task}" sudah melewati tenggat waktu, segera ditindaklanjuti.',
    link: '/tasks?task={taskId}',
  },
  {
    type: 'info',
    title: 'Proyek dalam pantauan',
    message: 'Proyek {project} memerlukan perhatian Anda pada pembaruan terbaru.',
    link: '/projects/{projectId}',
  },
];

const DESCRIPTION_FRAGMENTS = [
  'Bagian dari {project} dan harus selesai sebelum gate review berikutnya.',
  'Estimasi awal {hours} jam, dikoordinasikan bersama {assignee} dan {reporter}.',
  'Seluruh artefak dan dokumentasi disimpan di repository internal tim.',
  'Menjadi prasyarat beberapa task lain di dalam proyek yang sama.',
  'Hasil akhir wajib disetujui oleh {reporter} sebelum masuk tahap berikutnya.',
  'Prioritas mengikuti dampak langsung terhadap target go-live proyek.',
  'Perlu pengujian lintas perangkat sebelum task dikirim ke review.',
  'Semua perubahan wajib melewati code review dan pipeline CI.',
  'Risiko utamanya adalah ketergantungan pada tim lain yang belum final.',
  'Deliverable diunggah sebagai lampiran pada task ini.',
  'Pengujian dijalankan pada data contoh dari lingkungan staging.',
  'Rencana rollback disiapkan bila terjadi regresi di produksi.',
  'Pembahasan awal sudah dilakukan pada rapat scope mingguan.',
  'Kriteria penerimaan dicatat pada checklist di lampiran task.',
  'Komunikasi terbaru dilakukan lewat kanal proyek agar stakeholder tidak tertinggal.',
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const INSERT_CHUNK = 400;

/**
 * Bulk insert using a multi-row VALUES clause with bound parameters.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {string} table
 * @param {string[]} columns
 * @param {Array<Array<any>>} rows
 * @returns {Promise<number>} number of inserted rows
 */
async function bulkInsert(connection, table, columns, rows) {
  if (!rows.length) return 0;

  const rowPlaceholder = `(${columns.map(() => '?').join(', ')})`;
  const columnList = columns.map((column) => `\`${column}\``).join(', ');

  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK) {
    const chunk = rows.slice(offset, offset + INSERT_CHUNK);
    const params = [];
    for (const row of chunk) params.push(...row);

    await connection.execute(
      `INSERT INTO \`${table}\` (${columnList}) VALUES ${chunk
        .map(() => rowPlaceholder)
        .join(', ')}`,
      params
    );
  }

  return rows.length;
}

/** Remove the attachment files created by a previous seed run. */
function cleanSeedUploads() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    return;
  }
  for (const file of fs.readdirSync(UPLOAD_DIR)) {
    if (/^spec-.*-notes\.txt$/.test(file)) {
      fs.unlinkSync(path.join(UPLOAD_DIR, file));
    }
  }
}

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[seed] ${message}`);
}

// ---------------------------------------------------------------------------
// Seeding steps
// ---------------------------------------------------------------------------

async function truncateAll(connection) {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TABLES) {
    await connection.query(`TRUNCATE TABLE \`${table}\``);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  log(`Tabel data dikosongkan (${TABLES.length} tabel).`);
}

async function seedUsers(connection, passwordHash) {
  const rows = USERS.map((user) => {
    const lastLogin = NOW.subtract(intBetween(1, 20), 'hour').subtract(intBetween(0, 59), 'minute');
    const createdAt = NOW.subtract(intBetween(120, 320), 'day').subtract(intBetween(0, 23), 'hour');
    return [
      user.name,
      user.email,
      passwordHash,
      user.role,
      user.phone,
      user.job_title,
      user.bio,
      1,
      fmtDateTime(lastLogin),
      fmtDateTime(createdAt),
    ];
  });

  await bulkInsert(
    connection,
    'users',
    [
      'name',
      'email',
      'password',
      'role',
      'phone',
      'job_title',
      'bio',
      'is_active',
      'last_login_at',
      'created_at',
    ],
    rows
  );

  const [inserted] = await connection.query('SELECT id FROM users ORDER BY id');
  const idByKey = {};
  USERS.forEach((user, index) => {
    idByKey[user.key] = inserted[index].id;
  });

  log(`users            : ${rows.length} pengguna (password: ${DEFAULT_PASSWORD}).`);
  return idByKey;
}

async function seedProjects(connection, userIds) {
  const rows = PROJECTS.map((project) => {
    const createdAt = dayjs(project.start_date)
      .subtract(intBetween(10, 30), 'day')
      .subtract(intBetween(0, 10), 'hour');
    return [
      project.code,
      project.name,
      project.description,
      project.status,
      project.priority,
      project.color,
      project.budget,
      project.start_date,
      project.end_date,
      userIds[project.managerKey],
      userIds[project.creatorKey],
      fmtDateTime(createdAt),
    ];
  });

  await bulkInsert(
    connection,
    'projects',
    [
      'code',
      'name',
      'description',
      'status',
      'priority',
      'color',
      'budget',
      'start_date',
      'end_date',
      'manager_id',
      'created_by',
      'created_at',
    ],
    rows
  );

  const [inserted] = await connection.query('SELECT id FROM projects ORDER BY id');
  const idByKey = {};
  PROJECTS.forEach((project, index) => {
    idByKey[project.key] = inserted[index].id;
  });

  log(`projects         : ${rows.length} proyek.`);
  return idByKey;
}


async function seedTemplates(connection, userIds) {
  const adminId = userIds.admin || Object.values(userIds)[0];
  for (const tpl of TEMPLATES) {
    const [res] = await connection.execute(
      `INSERT INTO project_templates (code, name, category, description, color, is_system, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tpl.code, tpl.name, tpl.category, tpl.description, tpl.color, tpl.is_system, adminId]
    );
    const templateId = res.insertId;

    if (tpl.statuses && tpl.statuses.length) {
      const statusRows = tpl.statuses.map((s) => [
        templateId,
        s.key_name,
        s.label,
        s.color,
        s.category,
        s.progress,
        s.position,
      ]);
      await bulkInsert(
        connection,
        'project_template_statuses',
        ['template_id', 'key_name', 'label', 'color', 'category', 'progress', 'position'],
        statusRows
      );
    }

    if (tpl.milestones && tpl.milestones.length) {
      const msRows = tpl.milestones.map((m) => [
        templateId,
        m.name,
        m.description || null,
        m.due_offset_days || 0,
        m.position || 0,
      ]);
      await bulkInsert(
        connection,
        'project_template_milestones',
        ['template_id', 'name', 'description', 'due_offset_days', 'position'],
        msRows
      );
    }

    if (tpl.tasks && tpl.tasks.length) {
      const taskRows = tpl.tasks.map((t) => [
        templateId,
        null,
        t.title,
        t.description || null,
        t.status_key || 'todo',
        t.priority || 'medium',
        t.estimated_hours || null,
        t.estimated_cost || (t.estimated_hours ? t.estimated_hours * 250000 : 0),
        t.start_offset_days !== undefined ? t.start_offset_days : null,
        t.due_offset_days !== undefined ? t.due_offset_days : null,
        t.position || 0,
        t.is_milestone ? 1 : 0,
      ]);
      await bulkInsert(
        connection,
        'project_template_tasks',
        [
          'template_id',
          'parent_temp_id',
          'title',
          'description',
          'status_key',
          'priority',
          'estimated_hours',
          'estimated_cost',
          'start_offset_days',
          'due_offset_days',
          'position',
          'is_milestone',
        ],
        taskRows
      );
    }
  }
  log(`project_templates: ${TEMPLATES.length} template industri dibuat.`);
}

async function seedProjectStatuses(connection, projectIds) {
  const rows = [];
  for (const projectId of Object.values(projectIds)) {
    for (const s of DEFAULT_PROJECT_STATUSES) {
      rows.push([projectId, s.key_name, s.label, s.color, s.category, s.progress, s.position]);
    }
  }
  await bulkInsert(
    connection,
    'project_statuses',
    ['project_id', 'key_name', 'label', 'color', 'category', 'progress', 'position'],
    rows
  );
  log(`project_statuses : ${rows.length} status proyek diinisialisasi.`);
}

async function seedProjectMembers(connection, projectIds, userIds) {
  const rows = [];
  const membersByProject = {};

  PROJECTS.forEach((project, index) => {
    const managerId = userIds[project.managerKey];
    const candidates = USERS.filter((user) => user.key !== project.managerKey).map(
      (user) => userIds[user.key]
    );
    const memberCount = 3 + (index % 3);
    const chosen = shuffle(candidates).slice(0, memberCount);
    const wantsReviewer = index < 4;

    const members = [managerId];
    const joinedAt = fmtDateTime(dayjs(project.start_date).subtract(intBetween(0, 12), 'day'));

    chosen.forEach((userId) => {
      rows.push([projectIds[project.key], userId, 'member', joinedAt]);
      members.push(userId);
    });

    if (wantsReviewer) {
      const remaining = candidates.filter((userId) => !members.includes(userId));
      if (remaining.length) {
        const reviewerId = remaining[0];
        rows.push([projectIds[project.key], reviewerId, 'reviewer', joinedAt]);
        members.push(reviewerId);
      }
    }

    // The manager is stored once with the "owner" role.
    rows.push([projectIds[project.key], managerId, 'owner', joinedAt]);

    membersByProject[project.key] = members;
  });

  await bulkInsert(connection, 'project_members', ['project_id', 'user_id', 'role', 'joined_at'], rows);
  log(`project_members  : ${rows.length} baris.`);
  return membersByProject;
}

async function seedLabels(connection) {
  const rows = LABELS.map((label) => [label.name, label.color, fmtDateTime(NOW.subtract(200, 'day'))]);
  await bulkInsert(connection, 'labels', ['name', 'color', 'created_at'], rows);

  const [inserted] = await connection.query('SELECT id, name FROM labels ORDER BY id');
  const idByName = {};
  inserted.forEach((label) => {
    idByName[label.name] = label.id;
  });

  log(`labels           : ${rows.length} label.`);
  return idByName;
}

/** Roll a parent status up from its children. */
function deriveParentStatus(children) {
  if (!children.length) return 'todo';
  if (children.every((child) => child.status === 'done')) return 'done';
  if (children.some((child) => child.status === 'in_progress')) return 'in_progress';
  if (children.some((child) => child.status === 'review')) return 'review';
  if (children.some((child) => child.status === 'done')) return 'in_progress';
  if (children.some((child) => child.status === 'blocked')) return 'blocked';
  return 'todo';
}

function buildDescription(project, hours, assigneeName, reporterName, index) {
  const replacements = {
    project: `${project.code} (${project.name})`,
    hours: String(hours),
    assignee: assigneeName,
    reporter: reporterName,
  };

  const parts = [0, 3, 7].map(
    (offset) => DESCRIPTION_FRAGMENTS[(index + offset) % DESCRIPTION_FRAGMENTS.length]
  );
  return parts
    .map((part) =>
      part.replace(/\{(project|hours|assignee|reporter)\}/g, (_, key) => replacements[key])
    )
    .join(' ');
}

const TASK_COLUMNS = [
  'project_id',
  'parent_id',
  'title',
  'description',
  'status',
  'priority',
  'assignee_id',
  'reporter_id',
  'start_date',
  'due_date',
  'completed_at',
  'estimated_hours',
  'actual_hours',
  'estimated_cost',
  'actual_cost',
  'progress',
  'position',
  'is_milestone',
  'created_at',
];

function taskRow(item, parentId) {
  return [
    item.projectId,
    parentId,
    item.title,
    item.description,
    item.status,
    item.priority,
    item.assigneeId,
    item.reporterId,
    fmtDate(item.startDate),
    fmtDate(item.dueDate),
    item.completedAt ? fmtDateTime(item.completedAt) : null,
    item.estimated,
    item.actualHours,
    item.estimatedCost || 0,
    item.actualCost || 0,
    item.progress,
    item.position,
    item.isMilestone,
    fmtDateTime(item.createdAt),
  ];
}

async function seedTasks(connection, projectIds, userIds, membersByProject) {
  const nameById = {};
  USERS.forEach((user) => {
    nameById[userIds[user.key]] = user.name;
  });

  const taskSpecs = [];

  PROJECTS.forEach((project) => {
    const managerId = userIds[project.managerKey];
    const members = membersByProject[project.key];
    const specs = [];

    project.groups.forEach((group) => {
      const parentIndex = specs.length;
      specs.push({ title: group.parent, parentIndex: null, isChild: false, group });
      group.children.forEach((childTitle) => {
        specs.push({ title: childTitle, parentIndex, isChild: true, group });
      });
    });
    project.singles.forEach((title) => {
      specs.push({ title, parentIndex: null, isChild: false, group: null });
    });

    const childSpecs = specs.filter((spec) => spec.isChild);
    const singleSpecs = specs.filter((spec) => !spec.isChild && !spec.group);
    childSpecs.forEach((spec, index) => {
      spec.status = project.childStatuses[index];
    });
    singleSpecs.forEach((spec, index) => {
      spec.status = project.singleStatuses[index];
    });
    project.groups.forEach((group) => {
      const parentSpec = specs.find((spec) => spec.group === group && !spec.isChild);
      const children = specs.filter((spec) => spec.isChild && spec.group === group);
      parentSpec.status = deriveParentStatus(children);
    });

    const assigneeOffset = intBetween(0, members.length - 1);
    specs.forEach((spec, specIndex) => {
      let assignee = members[(specIndex + assigneeOffset) % members.length];
      if (assignee === managerId) {
        assignee = members[(specIndex + assigneeOffset + 1) % members.length];
      }
      taskSpecs.push({
        project,
        projectId: projectIds[project.key],
        spec,
        title: spec.title,
        status: spec.status,
        parentTitle: spec.isChild ? specs[spec.parentIndex].title : null,
        assigneeId: assignee,
        reporterId: managerId,
      });
    });
  });

  // Due-date buckets are spread over the tasks that are not done yet:
  // 18 overdue (20% of 90), 23 due within 14 days, the rest further ahead.
  const openSpecs = taskSpecs.filter((spec) => spec.status !== 'done');
  const buckets = [
    ...Array(18).fill('overdue'),
    ...Array(23).fill('soon'),
    ...Array(Math.max(0, openSpecs.length - 41)).fill('later'),
  ];
  const shuffledBuckets = shuffle(buckets);
  let openIndex = 0;

  const priorityPool = ['low', 'medium', 'medium', 'high', 'high', 'urgent'];

  taskSpecs.forEach((item, globalIndex) => {
    const estimated = intBetween(2, 40);
    let startDate;
    let dueDate;
    let completedAt = null;

    if (item.status === 'done') {
      if (rnd() < 0.35) {
        // Recently finished work keeps the "completed this week" widget alive.
        const completedOffset = intBetween(0, 2);
        const startOffset = completedOffset + intBetween(3, 14);
        startDate = NOW.subtract(startOffset, 'day');
        completedAt = NOW.subtract(completedOffset, 'day');
        dueDate = completedAt.add(intBetween(-2, 4), 'day');
        if (dueDate.isBefore(startDate)) dueDate = startDate.add(intBetween(2, 6), 'day');
      } else {
        startDate = NOW.subtract(intBetween(15, 75), 'day');
        dueDate = startDate.add(intBetween(4, 30), 'day');
        if (dueDate.isAfter(NOW)) dueDate = NOW.subtract(intBetween(1, 8), 'day');
        const latest = dueDate.isBefore(NOW) ? dueDate : NOW;
        const span = Math.max(latest.diff(startDate), 0);
        completedAt =
          span > 0
            ? startDate.add(Math.max(1, Math.floor(span * (0.3 + rnd() * 0.6))), 'millisecond')
            : startDate;
        if (completedAt.isAfter(NOW)) completedAt = NOW.subtract(1, 'hour');
      }
    } else {
      const bucket = shuffledBuckets[openIndex];
      openIndex += 1;
      if (bucket === 'overdue') {
        dueDate = NOW.subtract(intBetween(1, 75), 'day');
        startDate = dueDate.subtract(intBetween(5, 30), 'day');
      } else if (bucket === 'soon') {
        dueDate = NOW.add(intBetween(1, 14), 'day');
        startDate = dueDate.subtract(intBetween(5, 30), 'day');
      } else {
        dueDate = NOW.add(intBetween(20, 160), 'day');
        startDate = dueDate.subtract(intBetween(10, 45), 'day');
      }
      if (startDate.isAfter(NOW)) startDate = NOW.subtract(intBetween(0, 5), 'day');
    }

    const actualRatio =
      item.status === 'done'
        ? 0.8 + rnd() * 0.5
        : item.status === 'review'
          ? 0.75 + rnd() * 0.35
          : item.status === 'in_progress'
            ? 0.3 + rnd() * 0.4
            : item.status === 'blocked'
              ? rnd() * 0.3
              : rnd() * 0.15;

    const createdAt = startDate
      .subtract(intBetween(1, 10), 'day')
      .subtract(intBetween(0, 12), 'hour');

    item.estimated = estimated;
    item.actualHours = Math.round(estimated * actualRatio * 100) / 100;
    const hourlyRate = 200000;
    item.estimatedCost = estimated * hourlyRate;
    item.actualCost = Math.round(item.actualHours * hourlyRate);
    item.priority = pick(priorityPool);
    item.startDate = startDate;
    item.dueDate = dueDate;
    item.completedAt = completedAt;
    item.createdAt = createdAt;
    item.description = buildDescription(
      item.project,
      estimated,
      nameById[item.assigneeId],
      nameById[item.reporterId],
      globalIndex
    );
    item.isMilestone = globalIndex % 8 === 0 ? 1 : 0;
    item.progress = TASK_STATUS[item.status]?.progress ?? 0;
  });

  // Position is unique per project + status column.
  const positionCounters = {};
  taskSpecs.forEach((item) => {
    const key = `${item.projectId}:${item.status}`;
    positionCounters[key] = (positionCounters[key] || 0) + 1;
    item.position = positionCounters[key] - 1;
  });

  // Parents are inserted first so the children can reference their parent_id.
  const topLevel = taskSpecs.filter((item) => !item.spec.isChild);
  const children = taskSpecs.filter((item) => item.spec.isChild);

  await bulkInsert(
    connection,
    'tasks',
    TASK_COLUMNS,
    topLevel.map((item) => taskRow(item, null))
  );

  const [parentRows] = await connection.query(
    'SELECT id, project_id, title FROM tasks ORDER BY id'
  );
  const idByKey = new Map();
  parentRows.forEach((row) => {
    idByKey.set(`${row.project_id}::${row.title}`, row.id);
  });

  await bulkInsert(
    connection,
    'tasks',
    TASK_COLUMNS,
    children.map((item) => taskRow(item, idByKey.get(`${item.projectId}::${item.parentTitle}`)))
  );

  // Re-read the final ids so the parent/child mapping is exact.
  const [finalRows] = await connection.query(
    'SELECT id, project_id, title, parent_id FROM tasks ORDER BY id'
  );
  const finalByKey = new Map();
  finalRows.forEach((row) => {
    finalByKey.set(`${row.project_id}::${row.title}`, row);
  });
  taskSpecs.forEach((item) => {
    const row = finalByKey.get(`${item.projectId}::${item.title}`);
    if (row) {
      item.id = row.id;
      item.parentId = row.parent_id;
    }
  });

  log(`tasks            : ${taskSpecs.length} task (${children.length} sub-task).`);
  return taskSpecs;
}

async function seedTaskLabels(connection, tasks, labelIds) {
  const rows = [];
  const seen = new Set();
  const allLabelNames = LABELS.map((label) => label.name);

  tasks.forEach((task) => {
    const preferred = task.project.labels;
    const pool = [
      ...preferred,
      ...allLabelNames.filter((name) => !preferred.includes(name)),
    ];
    const count = intBetween(1, 3);
    const chosen = shuffle(pool).slice(0, count);

    chosen.forEach((name) => {
      const key = `${task.id}:${labelIds[name]}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push([task.id, labelIds[name]]);
    });
  });

  await bulkInsert(connection, 'task_labels', ['task_id', 'label_id'], rows);
  log(`task_labels      : ${rows.length} baris.`);
}

async function seedDependencies(connection, tasks) {
  const rows = [];
  const seen = new Set();

  const addEdge = (taskId, dependsOnId, type) => {
    if (!taskId || !dependsOnId || taskId === dependsOnId) return;
    // Edges always point backwards in task id order, so a cycle is impossible.
    if (dependsOnId > taskId) return;
    const key = `${taskId}:${dependsOnId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const lag = intBetween(0, 3);
rows.push([taskId, dependsOnId, type, lag, fmtDateTime(NOW.subtract(intBetween(1, 60), 'day'))]);
  };

  // 1. Every blocked task depends on an open predecessor.
  for (const task of tasks) {
    if (task.status !== 'blocked') continue;
    const sameProject = tasks.filter(
      (candidate) =>
        candidate.id < task.id &&
        candidate.status !== 'done' &&
        candidate.projectId === task.projectId
    );
    const pool = sameProject.length
      ? sameProject
      : tasks.filter((candidate) => candidate.id < task.id && candidate.status !== 'done');
    if (!pool.length) continue;
    addEdge(task.id, pick(pool).id, 'blocked_by');
  }

  // 2. Extra blocked_by edges on the open tasks so the graph is visible.
  for (const task of tasks) {
    if (!['todo', 'in_progress', 'review'].includes(task.status)) continue;
    if (rnd() > 0.5) continue;
    const sameProject = tasks.filter(
      (candidate) =>
        candidate.id < task.id &&
        candidate.status !== 'done' &&
        candidate.projectId === task.projectId &&
        candidate.parentId !== task.id
    );
    const pool = sameProject.length
      ? sameProject
      : tasks.filter((candidate) => candidate.id < task.id && candidate.status !== 'done');
    if (!pool.length) continue;
    addEdge(task.id, pick(pool).id, 'blocked_by');
  }

  // 3. A few "relates_to" edges.
  let related = 0;
  for (const task of tasks) {
    if (related >= 6) break;
    if (rnd() > 0.2) continue;
    const candidates = tasks.filter(
      (candidate) => candidate.id < task.id && candidate.projectId === task.projectId
    );
    if (!candidates.length) continue;
    const before = rows.length;
    addEdge(task.id, pick(candidates).id, 'relates_to');
    if (rows.length > before) related += 1;
  }

  await bulkInsert(
    connection,
    'task_dependencies',
    ['task_id', 'depends_on_id', 'type', 'lag_days', 'created_at'],
    rows
  );
  log(`task_dependencies : ${rows.length} baris.`);
}

async function seedMilestones(connection, projectIds, userIds) {
  const rows = MILESTONES.map((milestone) => {
    const project = PROJECTS.find((item) => item.key === milestone.projectKey);
    const createdAt = dayjs(milestone.due_date).subtract(intBetween(30, 90), 'day');
    return [
      projectIds[milestone.projectKey],
      milestone.name,
      milestone.description,
      milestone.due_date,
      milestone.status,
      milestone.progress,
      userIds[project.managerKey],
      fmtDateTime(createdAt),
    ];
  });

  await bulkInsert(
    connection,
    'milestones',
    [
      'project_id',
      'name',
      'description',
      'due_date',
      'status',
      'progress',
      'created_by',
      'created_at',
    ],
    rows
  );
  log(`milestones       : ${rows.length} milestone.`);
}

async function seedComments(connection, tasks, membersByProject) {
  const rows = [];
  const earliest = NOW.subtract(60, 'day');

  for (const task of tasks) {
    let count = 0;
    if (task.status === 'review') count = 3;
    else if (task.status === 'done') count = 1;
    else if (task.status === 'in_progress') count = rnd() < 0.8 ? 1 : 0;
    else if (task.status === 'todo') count = rnd() < 0.35 ? 1 : 0;
    else if (task.status === 'blocked') count = rnd() < 0.6 ? 1 : 0;

    if (!count) continue;

    const members = membersByProject[task.project.key];
    for (let index = 0; index < count; index += 1) {
      const commenter = pick(members);
      const body = pick(COMMENT_BODIES);
      const window = Math.max(
        1,
        Math.floor((NOW.diff(task.createdAt) / DAY) * (0.2 + rnd() * 0.7))
      );
      let createdAt = task.createdAt.add(window, 'day');
      if (createdAt.isAfter(NOW)) createdAt = NOW.subtract(intBetween(1, 48), 'hour');
      if (createdAt.isBefore(earliest)) createdAt = earliest.add(intBetween(0, 240), 'minute');
      rows.push([task.id, commenter, body, fmtDateTime(createdAt)]);
    }
  }

  await bulkInsert(connection, 'task_comments', ['task_id', 'user_id', 'body', 'created_at'], rows);
  log(`task_comments    : ${rows.length} baris.`);
}

async function seedAttachments(connection, tasks, membersByProject) {
  const rows = [];

  for (const task of tasks) {
    if (rnd() > 0.38) continue;

    const members = membersByProject[task.project.key];
    const uploader = pick(members);
    const storedName = `spec-${task.id}-notes.txt`;
    const originalName = `spesifikasi-${slugify(task.title)}.txt`;

    const content = [
      `Spesifikasi sementara - ${task.title}`,
      `Proyek: ${task.project.code} - ${task.project.name}`,
      `Status: ${TASK_STATUS[task.status].label}`,
      `Diperbarui: ${fmtDate(NOW)}`,
    ].join('\n');

    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), `${content}\n`, 'utf8');
    const size = fs.statSync(path.join(UPLOAD_DIR, storedName)).size;

    rows.push([
      task.id,
      uploader,
      originalName,
      storedName,
      'text/plain',
      size,
      fmtDateTime(NOW.subtract(intBetween(1, 45), 'day')),
    ]);
  }

  await bulkInsert(
    connection,
    'task_attachments',
    ['task_id', 'uploader_id', 'original_name', 'stored_name', 'mime_type', 'size', 'created_at'],
    rows
  );
  log(`task_attachments : ${rows.length} lampiran (file dibuat di ${UPLOAD_DIR}).`);
}

async function seedProjectExpenses(connection, projectIds, userIds, tasks) {
  const adminId = userIds.admin || Object.values(userIds)[0];
  const rows = [];

  const sampleExpenses = [
    { cat: 'material', title: 'Pembelian Semen & Pasir Beton K-300', amount: 45000000, vendor: 'PT Semen Maju Bersama' },
    { cat: 'material', title: 'Baja Tulangan Ulir 16mm (5 Ton)', amount: 62500000, vendor: 'Cahaya Baja Perkasa' },
    { cat: 'equipment', title: 'Sewa Excavator PC200 & Operator (14 hari)', amount: 28000000, vendor: 'Rental Alat Berat Nusantara' },
    { cat: 'vendor', title: 'Jasa Uji Kelayakan Tanah & Topografi (Sondir)', amount: 12000000, vendor: 'Lab Geoteknik Mandiri' },
    { cat: 'operational', title: 'Biaya Retribusi IMB & AMDAL Proyek', amount: 18500000, vendor: 'Dinas Penanaman Modal' },
    { cat: 'vendor', title: 'Lisensi Software Cloud AWS & Database Hosting', amount: 15400000, vendor: 'Amazon Web Services' },
    { cat: 'vendor', title: 'Paket Desain UI/UX Design System Proyek', amount: 25000000, vendor: 'Kreatif Studio Indonesia' },
    { cat: 'operational', title: 'Konsumsi Tim Lapangan & Rapat Koordinasi', amount: 6500000, vendor: 'Berkah Katering' },
    { cat: 'material', title: 'Cetak Spanduk, Brosur & Banner Promosi (1000 pcs)', amount: 8200000, vendor: 'Digital Print Cepat' },
    { cat: 'vendor', title: 'Jasa Influencer & Iklan Berbayar Meta Ads', amount: 22000000, vendor: 'Meta Platforms Ireland' },
    { cat: 'equipment', title: 'Sewa Sound System & Lighting Panggung Utama', amount: 35000000, vendor: 'Mega Sound Production' },
    { cat: 'operational', title: 'Honorarium Pengamanan Kepolisian & Dishub', amount: 9500000, vendor: 'Polsek & Dishub Setempat' },
  ];

  const projectKeyList = Object.keys(projectIds);

  sampleExpenses.forEach((exp, i) => {
    const pKey = projectKeyList[i % projectKeyList.length];
    const pId = projectIds[pKey];
    const pTasks = tasks.filter((t) => t.projectId === pId);
    const linkedTaskId = pTasks.length && (i % 2 === 0) ? pTasks[i % pTasks.length].id : null;
    const expenseDate = fmtDate(NOW.subtract(intBetween(5, 60), 'day'));

    rows.push([
      pId,
      linkedTaskId,
      exp.title,
      exp.cat,
      exp.amount,
      expenseDate,
      exp.vendor,
      `Invoice #INV-2026-${1000 + i}`,
      adminId,
    ]);
  });

  await bulkInsert(
    connection,
    'project_expenses',
    ['project_id', 'task_id', 'title', 'category', 'amount', 'expense_date', 'vendor_name', 'receipt_note', 'created_by'],
    rows
  );
  log(`project_expenses : ${rows.length} catatan pengeluaran dibuat.`);
}

async function seedActivities(connection, tasks, projectIds, userIds) {
  const nameById = {};
  USERS.forEach((user) => {
    nameById[userIds[user.key]] = user.name;
  });

  const rows = [];
  const oldestAllowed = NOW.subtract(90, 'day');

  const push = (entry) => {
    let createdAt = dayjs(entry.createdAt);
    if (createdAt.isBefore(oldestAllowed)) createdAt = oldestAllowed;
    if (createdAt.isAfter(NOW)) createdAt = NOW.subtract(intBetween(1, 120), 'minute');
    rows.push([
      entry.userId ?? null,
      entry.projectId ?? null,
      entry.taskId ?? null,
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
      entry.description,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      fmtDateTime(createdAt),
    ]);
  };

  for (const task of tasks) {
    const assigneeName = nameById[task.assigneeId];
    const reporterName = nameById[task.reporterId];

    push({
      userId: task.reporterId,
      projectId: task.projectId,
      taskId: task.id,
      action: 'task.created',
      entityType: 'task',
      entityId: task.id,
      description: `Task "${task.title}" dibuat`,
      metadata: { status: task.status, priority: task.priority, assignee_id: task.assigneeId },
      createdAt: task.createdAt,
    });

    if (task.status !== 'todo') {
      const movedAt = task.createdAt.add(
        Math.max(1, Math.floor((NOW.diff(task.createdAt) / DAY) * (0.3 + rnd() * 0.6))),
        'day'
      );
      push({
        userId: task.assigneeId,
        projectId: task.projectId,
        taskId: task.id,
        action: 'task.status_changed',
        entityType: 'task',
        entityId: task.id,
        description: `Status task "${task.title}" diubah ke ${TASK_STATUS[task.status].label}`,
        metadata: { from: 'todo', to: task.status, by: reporterName },
        createdAt: movedAt,
      });
    }

    if (rnd() < 0.45) {
      push({
        userId: task.reporterId,
        projectId: task.projectId,
        taskId: task.id,
        action: 'task.assigned',
        entityType: 'task',
        entityId: task.id,
        description: `Task "${task.title}" ditugaskan ke ${assigneeName}`,
        metadata: { assignee_id: task.assigneeId },
        createdAt: task.createdAt.add(intBetween(1, 6), 'day'),
      });
    }

    if (rnd() < 0.5) {
      push({
        userId: task.assigneeId,
        projectId: task.projectId,
        taskId: task.id,
        action: 'task.commented',
        entityType: 'task',
        entityId: task.id,
        description: `Komentar baru pada task "${task.title}"`,
        metadata: { assignee: assigneeName },
        createdAt: task.createdAt.add(intBetween(2, 20), 'day'),
      });
    }

    if (rnd() < 0.33) {
      push({
        userId: task.reporterId,
        projectId: task.projectId,
        taskId: task.id,
        action: 'task.updated',
        entityType: 'task',
        entityId: task.id,
        description: `Detail task "${task.title}" diperbarui`,
        metadata: { fields: ['description', 'estimated_hours'] },
        createdAt: task.createdAt.add(intBetween(3, 25), 'day'),
      });
    }
  }

  PROJECTS.forEach((project) => {
    push({
      userId: userIds[project.creatorKey],
      projectId: projectIds[project.key],
      action: 'project.created',
      entityType: 'project',
      entityId: projectIds[project.key],
      description: `Proyek "${project.name}" dibuat`,
      metadata: { code: project.code, status: project.status, priority: project.priority },
      createdAt: dayjs(project.start_date).subtract(intBetween(5, 20), 'day'),
    });
  });

  USERS.forEach((user, index) => {
    if (index >= 6) return;
    push({
      userId: userIds[user.key],
      action: 'user.login',
      entityType: 'user',
      entityId: userIds[user.key],
      description: `${user.name} login ke sistem`,
      metadata: { device: 'Web Browser' },
      createdAt: NOW.subtract(intBetween(1, 80), 'day'),
    });
  });

  await bulkInsert(
    connection,
    'activities',
    [
      'user_id',
      'project_id',
      'task_id',
      'action',
      'entity_type',
      'entity_id',
      'description',
      'metadata',
      'created_at',
    ],
    rows
  );
  log(`activities       : ${rows.length} baris.`);
}

async function seedNotifications(connection, tasks, projectIds, userIds) {
  const rows = [];

  USERS.forEach((user, userIndex) => {
    for (let index = 0; index < 6; index += 1) {
      const template = NOTIFICATION_TEMPLATES[(userIndex + index) % NOTIFICATION_TEMPLATES.length];
      const task = tasks[(userIndex * 7 + index * 11) % tasks.length];
      const project = PROJECTS[(userIndex + index) % PROJECTS.length];
      const projectId = projectIds[project.key];

      const message = template.message
        .replace('{task}', task.title)
        .replace('{taskId}', String(task.id))
        .replace('{project}', `"${project.name}"`)
        .replace('{projectId}', String(projectId));
      const link = template.link
        .replace('{taskId}', String(task.id))
        .replace('{projectId}', String(projectId));

      const createdAt = NOW.subtract(intBetween(1, 30), 'day').subtract(intBetween(0, 23), 'hour');
      const isRead = rnd() < 0.35 ? 1 : 0;
      const readAt = isRead ? createdAt.add(intBetween(1, 30), 'hour') : null;

      rows.push([
        userIds[user.key],
        template.type,
        template.title,
        message,
        link,
        isRead,
        readAt ? fmtDateTime(readAt) : null,
        fmtDateTime(createdAt),
      ]);
    }
  });

  await bulkInsert(
    connection,
    'notifications',
    ['user_id', 'type', 'title', 'message', 'link', 'is_read', 'read_at', 'created_at'],
    rows
  );
  log(`notifications    : ${rows.length} baris.`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

async function printSummary() {
  const [countRows] = await pool.query(
    `SELECT 'users' AS table_name, COUNT(*) AS total FROM users
     UNION ALL SELECT 'projects', COUNT(*) FROM projects
     UNION ALL SELECT 'project_members', COUNT(*) FROM project_members
     UNION ALL SELECT 'labels', COUNT(*) FROM labels
     UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
     UNION ALL SELECT 'tasks (sub-task)', COUNT(*) FROM tasks WHERE parent_id IS NOT NULL
     UNION ALL SELECT 'task_labels', COUNT(*) FROM task_labels
     UNION ALL SELECT 'task_dependencies', COUNT(*) FROM task_dependencies
     UNION ALL SELECT 'milestones', COUNT(*) FROM milestones
     UNION ALL SELECT 'task_comments', COUNT(*) FROM task_comments
     UNION ALL SELECT 'task_attachments', COUNT(*) FROM task_attachments
     UNION ALL SELECT 'activities', COUNT(*) FROM activities
     UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
     UNION ALL SELECT 'project_templates', COUNT(*) FROM project_templates
     UNION ALL SELECT 'project_statuses', COUNT(*) FROM project_statuses`
  );

  const [projectRows] = await pool.query(
    'SELECT id, code, name, status, progress FROM projects ORDER BY id'
  );
  const [statusRows] = await pool.query(
    'SELECT status, COUNT(*) AS total FROM tasks GROUP BY status ORDER BY total DESC'
  );

  log('');
  log('==================== RINGKASAN DATA ====================');
  countRows.forEach((row) => {
    log(`${String(row.table_name).padEnd(20)}: ${row.total}`);
  });
  log('');
  log('---- Projects ----');
  log('id | code          | name                            | status    | progress');
  projectRows.forEach((row) => {
    log(
      `${String(row.id).padEnd(2)} | ${String(row.code).padEnd(13)} | ${String(row.name).padEnd(
        30
      )} | ${String(row.status).padEnd(9)} | ${row.progress}`
    );
  });
  log('');
  log('---- Task per status ----');
  statusRows.forEach((row) => {
    log(`${String(row.status).padEnd(12)}: ${row.total}`);
  });
  log('=========================================================');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  if (FRESH) {
    log('Mode --fresh: dropping dan recreating tabel...');
    execFileSync(process.execPath, [MIGRATE_PATH, '--fresh'], { stdio: 'inherit' });
  }

  log(`Menghubungkan ke ${env.DB_NAME} @ ${env.DB_HOST}:${env.DB_PORT} ...`);
  const connection = await pool.getConnection();
  let projectIds = {};

  try {
    cleanSeedUploads();
    await truncateAll(connection);

    const passwordHash = await hashPassword(DEFAULT_PASSWORD);
    const userIds = await seedUsers(connection, passwordHash);
    await seedTemplates(connection, userIds);
    projectIds = await seedProjects(connection, userIds);
    await seedProjectStatuses(connection, projectIds);
    const membersByProject = await seedProjectMembers(connection, projectIds, userIds);
    const labelIds = await seedLabels(connection);
    const tasks = await seedTasks(connection, projectIds, userIds, membersByProject);
    await seedTaskLabels(connection, tasks, labelIds);
    await seedDependencies(connection, tasks);
    await seedMilestones(connection, projectIds, userIds);
    await seedComments(connection, tasks, membersByProject);
    await seedAttachments(connection, tasks, membersByProject);
    await seedActivities(connection, tasks, projectIds, userIds);
    await seedNotifications(connection, tasks, projectIds, userIds);
  } finally {
    connection.release();
  }

  log('Menghitung ulang progress project...');
  await recalculateProjects(Object.values(projectIds));

  await printSummary();
  log('Seed selesai.');
}

main()
  .then(() => {
    // pool.end() never calls back if the pool never connected, so exit directly.
    pool.end().catch(() => {});
    process.exit(0);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[seed] Gagal:', error);
    pool.end().catch(() => {});
    process.exit(1);
  });
