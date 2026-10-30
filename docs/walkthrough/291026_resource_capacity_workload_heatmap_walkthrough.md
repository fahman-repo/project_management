# Walkthrough: Resource Capacity & Workload Heatmap di Halaman Tim

Fitur **Resource Capacity & Workload Heatmap** telah berhasil diimplementasikan secara menyeluruh di backend dan frontend. Fitur ini memungkinkan manajer dan tim untuk membandingkan total jam estimasi (`estimated_hours`) task terhadap kapasitas kerja mingguan per anggota (standar 40 jam/minggu atau kustom) guna mendeteksi *overallocation* dan ketimpangan beban kerja tim secara dini.

---

## Ringkasan Perubahan

### 1. Database & Migrasi
- **Kolom Baru**: Menambahkan `weekly_capacity_hours DECIMAL(5,2) NOT NULL DEFAULT 40.00` pada tabel `users` di [`schema.sql`](file:///c:/xampp/htdocs/project_management/backend/src/database/schema.sql#L24).
- **Idempotent Migration**: Menambahkan patch migrasi otomatis pada [`migrate.js`](file:///c:/xampp/htdocs/project_management/backend/src/database/migrate.js#L237-L251) yang memeriksa keberadaan kolom di `information_schema.COLUMNS` sebelum melakukan `ALTER TABLE`.

### 2. Backend API & Engine Alokasi Jam Kerja
- **Model & Middleware Pengguna**:
  - Di [`userModel.js`](file:///c:/xampp/htdocs/project_management/backend/src/models/userModel.js#L13-L25), `weekly_capacity_hours` dimasukkan ke `SELECT_FIELDS`, `createUser`, `updateUser`, dan dinormalisasi menjadi tipe numerik.
  - Di [`auth.js`](file:///c:/xampp/htdocs/project_management/backend/src/middleware/auth.js#L38-L75), `weekly_capacity_hours` dimuat otomatis ke objek `req.user`.
  - Di [`auth.validator.js`](file:///c:/xampp/htdocs/project_management/backend/src/validators/auth.validator.js#L74-L90), ditambahkan validasi Zod angka 1–168 jam/minggu.
- **Engine Alokasi Pro-rata & Endpoint Heatmap**:
  - Di [`dashboardController.js`](file:///c:/xampp/htdocs/project_management/backend/src/controllers/dashboardController.js):
    - `countWorkingDays`: Menghitung hari kerja efektif (Senin–Jumat) dalam rentang task.
    - `distributeTasksToWeeks`: Membagi `estimated_hours` task secara proporsional sesuai irisan hari kerja pada setiap minggu (fallback ke minggu `due_date` bila `start_date` kosong). Task aktif tanpa tanggal dikelompokkan ke `unscheduledHours`.
    - `getCapacityHeatmap` (`GET /api/v1/dashboard/capacity-heatmap`): Menghasilkan matriks anggota × minggu lengkap dengan level utilisasi (`empty`, `underload <50%`, `optimal 50–85%`, `warning 86–100%`, `overallocated >100%`), kelebihan beban (*overload hours*), dan rincian task.
    - `getWorkload` (`GET /api/v1/dashboard/workload`): Diperkaya dengan `weeklyCapacityHours`, `currentWeekHours`, `currentWeekUtilization`, dan status `isOverallocated`.
  - Di [`dashboard.routes.js`](file:///c:/xampp/htdocs/project_management/backend/src/routes/dashboard.routes.js#L16), rute `/capacity-heatmap` didaftarkan.

### 3. Frontend & Antarmuka Pengguna
- **Komponen Heatmap Baru**: [`WorkloadHeatmapView.jsx`](file:///c:/xampp/htdocs/project_management/frontend/src/components/shared/WorkloadHeatmapView.jsx):
  - **KPI Cards Ringkasan**: Rata-rata utilisasi tim, jumlah anggota yang *overallocated*, kapasitas tersedia (*underload*), dan total tim terpantau.
  - **Toolbar Interaktif**: Navigasi minggu (`←`, `Minggu Ini`, `→`), pemilih rentang (4, 8, 12 minggu), filter proyek, filter peran, quick search, toggle `Hanya anggota overallocated`, dan toggle `Sertakan task selesai`.
  - **Matriks Heatmap Sticky**: Kolom anggota *sticky* di sisi kiri dan sel-sel minggu dengan warna semantik indikator kapasitas.
  - **Cell Drill-Down Drawer**: Rincian jam teralokasi vs kapasitas, daftar task penyumbang jam pada minggu tersebut, dan integrasi klik langsung ke [`TaskDetailDrawer`](file:///c:/xampp/htdocs/project_management/frontend/src/components/shared/TaskDetailDrawer.jsx).
- **Pembaruan Halaman Team**: [`Team.jsx`](file:///c:/xampp/htdocs/project_management/frontend/src/pages/Team.jsx):
  - Segmented control `VIEW_OPTIONS` kini memiliki opsi **Heatmap Kapasitas** (`Grid | Table | Heatmap`).
  - Tampilan **Grid** & **Table**: Menampilkan meter kapasitas minggu berjalan (`Xj / Yj (Z%)`) dan badge merah `Overload` bila melebihi kapasitas.
  - **Member Detail Drawer**: Menampilkan kapasitas mingguan anggota dengan tombol pintas *"Lihat di Heatmap"*, serta kartu beban jam kerja minggu berjalan.
- **Pembaruan Form Pengguna**: [`UserFormModal.jsx`](file:///c:/xampp/htdocs/project_management/frontend/src/components/shared/UserFormModal.jsx) menambahkan input **Kapasitas (Jam/Mgg)** yang dapat diatur oleh Admin.

---

## Hasil Pengujian & Verifikasi

1. **Database Migration**:
   - Skrip `node backend/src/database/migrate.js` berhasil dieksekusi dengan output: `[migrate] Added users.weekly_capacity_hours column.`
2. **API Smoke Test**:
   - Skrip `node backend/scripts/verify-api.js` berhasil lulus **63 dari 63 pengujian** tanpa kegagalan (termasuk verifikasi `GET /api/v1/dashboard/capacity-heatmap` dan `GET /api/v1/dashboard/workload`).
3. **Frontend Production Build**:
   - `npm --prefix frontend run build` selesai sukses tanpa error kompilasi dalam 12 detik (`dist/assets/Team-*.js`, `dist/assets/index-*.js`).
4. **End-to-End Browser Automation**:
   - Pengujian navigasi, pemilihan view (Grid, Table, Heatmap), interaksi sel, dan pembukaan drawer task berhasil diverifikasi via Playwright.

