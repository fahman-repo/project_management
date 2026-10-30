# ProjectFlow — Project Management System

Aplikasi manajemen proyek dan tugas dengan **monitoring progress real-time**.

## Tech Stack

| Layer | Teknologi |
|---|---|
| Backend | Node.js 24 · Express 4 · Socket.IO 4 · mysql2 · Zod · JWT · Multer |
| Frontend | React 18 · Vite 5 · Tailwind CSS 3.4 · TanStack Query 5 · Zustand · Recharts 3 · dnd-kit |
| Database | MySQL / MariaDB (`project_management_db`) |

## Persyaratan

- Node.js ≥ 18 (diuji pada v24.15.0)
- MySQL atau MariaDB berjalan di `localhost:3306` dengan user `root` dan password kosong
- Database `project_management_db` (dibuat otomatis oleh migrasi bila belum ada)

> **Catatan kompatibilitas**: server ini berjalan pada **MariaDB 10.1**, yang tidak mendukung
> window function, CTE (`WITH`), maupun tipe `JSON` native. Seluruh query pada aplikasi
> dirancang kompatibel dengan MySQL 8 maupun MariaDB 10.1.

## Menjalankan Aplikasi

### 1. Backend

```powershell
cd backend
npm install
Copy-Item .env.example .env      # sesuaikan bila perlu
npm run migrate                  # membuat tabel (idempotent)
npm run seed                     # mengisi data contoh
npm run dev                      # http://localhost:5000
```

Perintah tambahan:

```powershell
npm run db:reset                 # drop + recreate tabel, lalu seed ulang
```

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

Vite memproxy `/api`, `/uploads`, dan `/socket.io` ke backend pada port 5000, sehingga
tidak diperlukan konfigurasi CORS tambahan saat pengembangan.

## Akun Demo & Kredensial Database

Seluruh akun pengguna demo pada database menggunakan password default: **`Password123!`**

| Nama Pengguna | Email | Peran | Jabatan | Password Default |
|---|---|---|---|---|
| Administrator | `admin@pm.test` | Administrator (`admin`) | System Administrator | `Password123!` |
| Budi Santoso | `budi@pm.test` | Manajer (`manager`) | Head of IT | `Password123!` |
| Siti Rahayu | `siti@pm.test` | Manajer (`manager`) | HR Manager | `Password123!` |
| Andi Pratama | `andi@pm.test` | Anggota (`member`) | Frontend Developer | `Password123!` |
| Dewi Lestari | `dewi@pm.test` | Anggota (`member`) | Backend Developer | `Password123!` |
| Rizky Maulana | `rizky@pm.test` | Anggota (`member`) | UI/UX Designer | `Password123!` |
| Maya Sari | `maya@pm.test` | Anggota (`member`) | QA Engineer | `Password123!` |
| Fajar Nugroho | `fajar@pm.test` | Anggota (`member`) | DevOps Engineer | `Password123!` |

> **Catatan Penggunaan**:
> - Halaman Login (`/login`) menyediakan panel interaktif **Akun Login & Kredensial DB** yang tersinkronisasi langsung dengan database (`GET /api/v1/auth/demo-accounts`).
> - Dilengkapi tombol satu-klik **Salin Password**, filter per peran (Admin, Manajer, Anggota), serta auto-fill email & password saat akun diklik.

## Fitur

- **Autentikasi** — JWT 7 hari, role `admin` / `manager` / `member`, ganti password, upload avatar
- **Manajemen Proyek** — CRUD, anggota tim, milestone, statistik, lifecycle status
- **Manajemen Tugas** — CRUD, sub-task, label, komentar, attachment, dependency (deteksi siklus)
- **Kanban Board** — drag & drop 5 kolom dengan pembaruan optimistis dan sinkronisasi antar pengguna
- **List View** — filter multi, sorting, paginasi server-side, aksi massal
- **Dashboard** — KPI, distribusi status, progres proyek, tugas saya, feed aktivitas
- **Reports** — produktivitas, burndown, tren penyelesaian, ekspor CSV
- **Calendar** — grid bulan + agenda, tugas dan milestone
- **Activity Log** — jejak audit lengkap dengan filter
- **Notifikasi** — pusat notifikasi real-time
- **Dark Mode** — terang / gelap / mengikuti sistem

## Arsitektur Real-time

```
Client (PATCH /api/tasks/:id/status)
   └─> Controller (validasi + RBAC)
        └─> Service (ubah DB, hitung ulang progress project)
             ├─> Tulis activities + notifications
             └─> Emit Socket.IO -> room project:{id} + global
                  └─> Client lain: invalidate cache -> UI ter-update
```

Event yang dipropagasikan: `task:created`, `task:updated`, `task:deleted`, `task:moved`,
`task:assigned`, `task:commented`, `project:created`, `project:updated`, `project:progress`,
`project:member_added`, `milestone:updated`, `notification:new`, `activity:new`, `presence:update`.

Socket.IO memakai JWT handshake dan room terpisah: `global`, `project:{id}`, `user:{id}`.
Bila koneksi realtime terputus, antarmuka menampilkan indikator **Offline** dan TanStack
Query tetap memuat ulang data secara berkala.

## Struktur Proyek

```
backend/
  src/
    config/       konfigurasi env, pool database, konstanta
    controllers/  logika endpoint per modul
    middleware/   auth, RBAC, validasi zod, upload, error handler, rate limit
    models/       query builder dengan prepared statement
    routes/       definisi endpoint
    services/     progress, activity, notification, socket, akses
    sockets/      inisialisasi Socket.IO
    utils/        ApiError, asyncHandler, jwt, password, pagination, response
    validators/   skema zod
    database/     schema.sql, migrate.js, seed.js
frontend/
  src/
    api/          klien axios + modul API per domain
    components/   ui/ (design system), layout/, shared/, charts/
    hooks/        useSocket, useRealtimeInvalidate, useDebounce, usePermissions
    pages/        Dashboard, Projects, Tasks, Kanban, Calendar, Reports, Team, ...
    store/        zustand auth, theme
    utils/        cn, constants, formatters
```

## Keamanan

- Password di-hash dengan **bcrypt** (cost 10); kebijakan minimal 8 karakter berisi huruf dan angka
- Seluruh query memakai **prepared statement** (`?` binding) — tidak ada interpolasi input pengguna
- **RBAC** + pemeriksaan kepemilikan data di lapisan service
- Rate limit: 600 permintaan/10 menit untuk API. Endpoint autentikasi (`/auth/login`, `/auth/register`, `/auth/email-check`) dikecualikan agar pengguna tidak terkunci akibat IP bersama
- Upload: whitelist MIME, batas 10 MB, nama berkas diacak (mencegah path traversal)
- `helmet` dengan CSP, CORS whitelist, `express-rate-limit`

## API

Prefix: `/api/v1`. Semua respons memakai envelope konsisten.

```jsonc
// sukses
{ "success": true, "message": "...", "data": { }, "meta": { "page": 1, "perPage": 10, "total": 0, "totalPages": 0 } }

// gagal
{ "success": false, "message": "...", "errors": { "field": ["pesan"] } }
```

Health check: `GET /api/v1/health`
