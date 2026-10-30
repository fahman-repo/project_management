# Walkthrough: Pembaruan Informasi User Login & Password Sesuai Database

Pembaruan informasi user login dan password telah selesai dilakukan agar sepenuhnya akurat dan sinkron dengan basis data saat ini (`project_management_db`).

---

## 1. Ringkasan Kredensial Database Saat Ini

Seluruh 8 akun pengguna aktif di database menggunakan password default: **`Password123!`**

| ID | Nama Pengguna | Email | Peran | Jabatan | Password Default | Status DB |
|:--:|---|---|---|---|---|:--:|
| 1 | Administrator | `admin@pm.test` | Administrator (`admin`) | System Administrator | `Password123!` | Aktif |
| 2 | Budi Santoso | `budi@pm.test` | Manajer (`manager`) | Head of IT | `Password123!` | Aktif |
| 3 | Siti Rahayu | `siti@pm.test` | Manajer (`manager`) | HR Manager | `Password123!` | Aktif |
| 4 | Andi Pratama | `andi@pm.test` | Anggota (`member`) | Frontend Developer | `Password123!` | Aktif |
| 5 | Dewi Lestari | `dewi@pm.test` | Anggota (`member`) | Backend Developer | `Password123!` | Aktif |
| 6 | Rizky Maulana | `rizky@pm.test` | Anggota (`member`) | UI/UX Designer | `Password123!` | Aktif |
| 7 | Maya Sari | `maya@pm.test` | Anggota (`member`) | QA Engineer | `Password123!` | Aktif |
| 8 | Fajar Nugroho | `fajar@pm.test` | Anggota (`member`) | DevOps Engineer | `Password123!` | Aktif |

---

## 2. Perubahan yang Dilakukan

### A. Endpoint Backend Baru (`GET /api/v1/auth/demo-accounts`)
- **[authController.ts](file:///c:/xampp/htdocs/project_management/backend/src/controllers/authController.ts)**: Menambahkan method `getDemoAccounts` yang menjalankan kueri langsung ke tabel `users` untuk mengambil pengguna aktif terurut berdasarkan peran (`admin`, `manager`, `member`).
- **[auth.routes.ts](file:///c:/xampp/htdocs/project_management/backend/src/routes/auth.routes.ts)**: Meregistrasikan route publik `GET /api/v1/auth/demo-accounts`.

### B. Frontend Auth Client & Halaman Login
- **[auth.api.js](file:///c:/xampp/htdocs/project_management/frontend/src/api/auth.api.js)**: Menambahkan fungsi `getDemoAccounts()` untuk memanggil endpoint demo accounts backend.
- **[Login.jsx](file:///c:/xampp/htdocs/project_management/frontend/src/pages/auth/Login.jsx)**:
  - Menampilkan box informasi password database secara transparan: `Password DB: Password123!` dilengkapi tombol **Salin** dengan feedback visual ("Disalin!").
  - Menampilkan tab filter per peran: **Semua (8)**, **Admin (1)**, **Manajer (2)**, **Anggota (5)**.
  - Menampilkan kartu untuk seluruh 8 pengguna database lengkap dengan inisial avatar, nama lengkap, jabatan, email, dan badge peran.
  - Memilih akun akan otomatis mengisi kolom Email & Password pada formulir dan menghapus pesan error sebelumnya.
  - Menyediakan fallback data 8 akun lengkap jika frontend dijalankan saat backend sedang tidak terhubung.

### C. Dokumentasi Proyek
- **[README.md](file:///c:/xampp/htdocs/project_management/README.md)**: Memperbarui bagian `## Akun Demo & Kredensial Database` dengan tabel lengkap 8 pengguna, peran, jabatan, dan password default.

---

## 3. Hasil Verifikasi & Pengujian

### 1. Verifikasi Database & Hash Password
- Pengecekan langsung terhadap hash password di database membuktikan bcrypt compare berhasil `true` untuk seluruh 8 akun dengan password `Password123!`.

### 2. TypeScript & Build
- `npm run typecheck` backend: **Lulus 100% (0 errors)**.
- `npm run build` frontend: **Lulus 100% bundle selesai tanpa error**.

### 3. API Smoke Test
- Menjalankan `npm run verify:api`: **65 passed, 0 failed**.

### 4. End-to-End Browser Test (Playwright)
- Mengakses `http://localhost:5173/login`:
  - Panel **Akun Login & Kredensial DB** termuat sempurna dengan 8 akun dan password `Password123!`.
  - Klik salah satu akun (misal `Budi Santoso · Head of IT`) berhasil mengisikan `budi@pm.test` dan `Password123!`.
  - Tombol **Masuk** berhasil melakukan login dan mengarahkan pengguna ke `/dashboard`.

