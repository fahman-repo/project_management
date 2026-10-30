# Rencana Implementasi: Bukti Lampiran & Alur Approval Pengeluaran Proyek

## 1. Tujuan

Menambahkan dua kemampuan pada `ProjectBudgetTab`:

1. **Bukti lampiran** (foto/PDF kwitansi/nota) untuk setiap item di `project_expenses`.
2. **Alur approval** `pending → approved / rejected`, di mana anggota tim dapat mengajukan klaim dan Manager/Admin menyetujui sebelum nominal masuk ke `actual_cost`.

## 2. Kondisi Saat Ini (Temuan Kode)

- Tabel `project_expenses` di `backend/src/database/schema.sql` (sekitar baris 317–332) belum memiliki kolom status maupun lampiran.
- Route expense ada di `backend/src/routes/project.routes.js` (GET/POST/PATCH/DELETE `/:id/expenses...`) dan saat ini mutasi memakai `requireRole('admin','manager')` + `assertCanManage`.
- Handler expense ada di `backend/src/controllers/projectController.js` (`listExpenses`, `createExpense`, `updateExpense`, `deleteExpense`, sekitar baris 735–864). Sudah memakai `assertCanView/assertCanManage`, `socketService.emitProjectEvent`, dan `activityService.record`.
- Query expense ada di `backend/src/models/projectModel.js` (`listProjectExpenses`, `findExpenseById`, `createProjectExpense`, `updateProjectExpense`, `deleteProjectExpense`, sekitar baris 942–1078).
- Perhitungan `actual_cost` menjumlahkan `project_expenses` tanpa filter status di:
  - `projectModel.js` `PROJECT_ENRICHED_FIELDS` (sekitar baris 18)
  - `projectModel.js` `getProjectStats` (sekitar baris 386–387)
  - `reportController.js` (sekitar baris 99 dan 114)
- Upload sudah tersedia di `backend/src/middleware/upload.js` (`uploadSingle`, `ALLOWED_MIME`); file disajikan statis dari `/uploads` di `backend/src/app.js`.
- Frontend target: `frontend/src/components/shared/ProjectBudgetTab.jsx`; API client: `frontend/src/api/project.api.js`; permission `canManage` dihitung di `frontend/src/pages/projects/ProjectDetail.jsx` (sekitar baris 369–370).
- Pola attachment yang sudah ada: `task_attachments` + `TaskDetailDrawer` memakai URL `/uploads/<stored_name>`. Untuk expense, gunakan pola URL yang sama.

## 3. Keputusan Desain (Default yang Dipakai)

1. **Satu file bukti per pengeluaran** (dapat diganti). Kolom file disimpan langsung di `project_expenses`. Multi-file menjadi follow-up.
2. **Status**: `pending`, `approved`, `rejected`.
3. **Siapa boleh mengajukan**: semua anggota proyek (`assertCanView`). Manager/Admin juga boleh mencatat langsung.
4. **Auto-approve**: pengeluaran yang dibuat user dengan hak `canManage` langsung `approved` (menjaga perilaku lama & menghindari antrean approval tanpa approver). Pengajuan anggota biasa menjadi `pending`.
5. **Approval**: hanya user dengan hak manage proyek (`assertCanManage`) yang boleh approve/reject. Reject wajib menyertakan `rejection_reason`.
6. **Edit/Delete**:
   - `pending`/`rejected`: creator boleh edit/delete miliknya; manager boleh edit/delete semua.
   - `rejected` yang diedit creator otomatis menjadi `pending` (resubmission), approval lama dibersihkan.
   - `approved`: creator tidak boleh edit; manager/admin boleh edit, status tetap `approved`, perubahan dicatat di activity log. Delete oleh manager/admin diperbolehkan.
7. **Actual cost**: hanya `approved` yang dihitung. `pending` ditampilkan terpisah; `rejected` tidak dihitung.
8. **Pengeluaran terkait task** (`task_id` tidak null): tetap bersifat informasional dan **tidak** dijumlahkan ke `actual_cost` proyek pada v1 (perilaku saat ini: actual cost proyek = `tasks.actual_cost` + direct expenses `task_id IS NULL`). Roll-up ke task actual cost masuk out-of-scope.
9. **Lampiran wajib** untuk klaim anggota (`pending`); opsional untuk entri manager/admin yang auto-approved. Validasi MIME: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`; ukuran mengikuti limit upload yang ada.
10. **Legacy data**: semua baris lama di-backfill menjadi `approved` saat migrasi agar total biaya tidak berubah.

## 4. Perubahan Database & Migrasi

### 4.1 `schema.sql` (fresh install)

Tambahkan kolom ke `CREATE TABLE project_expenses`:

- `status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'`
- `receipt_file VARCHAR(255) NULL` (nama file tersimpan)
- `receipt_original_name VARCHAR(255) NULL`
- `receipt_mime_type VARCHAR(120) NULL`
- `receipt_size INT UNSIGNED NULL`
- `approved_by INT UNSIGNED NULL`
- `approved_at DATETIME NULL`
- `rejection_reason VARCHAR(500) NULL`
- Index `idx_pe_project_status (project_id, status)`
- FK `approved_by` → `users(id) ON DELETE SET NULL`

### 4.2 Patch migrasi (`backend/src/database/migrate.js`)

Tambahkan patch di bagian `applyPatchMigrations` (pola pengecekan `information_schema` sudah ada):

1. Cek kolom via `information_schema.COLUMNS`.
2. Jika kolom `status` belum ada:
   - `ALTER TABLE project_expenses ADD COLUMN status ENUM(...) NOT NULL DEFAULT 'pending'`.
   - **Backfill**: `UPDATE project_expenses SET status='approved'` (hanya pada migrasi pertama).
3. Tambahkan kolom lampiran & approval jika belum ada.
4. Tambahkan index `idx_pe_project_status` dan FK `approved_by` jika belum ada (guard constraint).
5. Pastikan idempotent: migrasi berikutnya tidak mengulang backfill.

### 4.3 Seed (`backend/src/database/seed.js`)

- Update `seedProjectExpenses` agar semua baris seed eksplisit `status: 'approved'` (termasuk `approved_by` admin bila memungkinkan) sehingga total demo tidak menjadi 0.
- Opsional: tambahkan 1 contoh `pending` dan 1 `rejected` untuk demo UI; jika ditambahkan, sesuaikan ekspektasi skrip verifikasi.
- Jangan mengubah jumlah baris seed tanpa menyesuaikan verifikasi.

## 5. Backend: Model, Controller, Route, Validator

### 5.1 Model (`backend/src/models/projectModel.js`)

- `PROJECT_ENRICHED_FIELDS`: tambahkan `AND pe_dir.status = 'approved'` pada subquery direct expenses.
- `getProjectStats`: filter approved untuk `total_direct_expenses`; tambahkan `total_pending_expenses` dan `pending_expense_count`.
- `getExpenseSummaryByCategory`: filter `status='approved'` (kategori actual). Bila perlu, sediakan parameter status untuk kebutuhan lain.
- `listProjectExpenses`: select kolom baru; dukung filter `status`; map `receipt_url` = `receipt_file ? '/uploads/' + receipt_file : null` di `normalizeExpense`.
- `findExpenseById`: select kolom baru.
- `createProjectExpense`: izinkan insert `status`, `receipt_*`, `approved_by`, `approved_at`, `rejection_reason`.
- `updateProjectExpense`: perluas `ALLOWED` fields dengan kolom baru; jangan izinkan `created_by`/`project_id`.
- Tambahkan `updateExpenseStatus(expenseId, { status, approved_by, approved_at, rejection_reason })` dengan `WHERE id=? AND status='pending'` dan kembalikan `affectedRows` untuk concurrency.
- `deleteProjectExpense`: tetap; controller akan menghapus file setelah row dihapus.

### 5.2 Controller (`backend/src/controllers/projectController.js`)

Tambahkan import `fs`, `path`, `env`, `uploadSingle`/`ALLOWED_MIME`, dan helper permission (`canManageProject`/`assertCanManage`).

- **`listExpenses`**
  - Teruskan `req.query.status` ke model.
  - Kembalikan `expenses`, `summary_by_category`, `financials` termasuk `total_pending_expenses`, `pending_expense_count`.
  - Normalisasi `receipt_url`, `receipt_original_name`, `status`, `rejection_reason`.

- **`createExpense`**
  - `await assertCanView(req.user, projectId)` (anggota proyek).
  - `const canManage = await canManageProject(req.user, projectId)` (tambahkan/gunakan helper accessService).
  - Status: `canManage ? 'approved' : 'pending'`; set `approved_by`/`approved_at` jika approved.
  - Jika bukan `canManage` dan tidak ada `req.file` → 400 “Bukti pengeluaran wajib diunggah”.
  - Validasi MIME file; jika tidak valid, hapus file dan 400.
  - Simpan `receipt_file`, `receipt_original_name`, `receipt_mime_type`, `receipt_size`.
  - Activity: `project.expense_submitted` (pending) / `project.expense_created` (approved).
  - Notifikasi ke approver jika pending; emit `project:expense_updated`.

- **`updateExpense`**
  - Ambil expense; `assertCanView`.
  - Otorisasi: `canManage` ATAU (`created_by === req.user.id` DAN status `pending`/`rejected`).
  - Jika creator mengedit `rejected` → set `status='pending'`, `approved_by=NULL`, `approved_at=NULL`, `rejection_reason=NULL`.
  - Jika manager mengedit `approved` → status tetap `approved`; catat activity.
  - Ganti lampiran bila `req.file` ada; validasi MIME; hapus file lama setelah update sukses.
  - Activity + emit `project:expense_updated`; notifikasi approver bila berubah menjadi pending.

- **`updateExpenseStatus` (baru)**
  - `await assertCanManage(req.user, projectId)`.
  - Body: `{ status: 'approved' | 'rejected', rejection_reason? }`; reject wajib reason.
  - Transisi hanya dari `pending`. Jika sudah diproses → 409 Conflict.
  - Update status + `approved_by` + `approved_at` (null untuk rejected) + `rejection_reason`.
  - Activity: `project.expense_approved` / `project.expense_rejected`.
  - Notifikasi ke submitter; emit `project:expense_updated`.

- **`deleteExpense`**
  - Otorisasi: `canManage` ATAU creator dengan status `pending`/`rejected`.
  - Hapus row, lalu hapus file lampiran (try/catch, abaikan jika file sudah tidak ada).
  - Activity + emit `project:expense_updated`.

- **Helper file**
  - `assertReceiptMime(file)` dan `removeUploadedFile(filename)`; gunakan `path.basename` dan `env.UPLOAD_PATH`.

### 5.3 Route (`backend/src/routes/project.routes.js`)

- Hapus `requireRole('admin','manager')` dari POST/PATCH/DELETE expense; otorisasi proyek ditegakkan di controller.
- GET expense tetap dapat diakses anggota proyek.
- Susun middleware multipart:
  - `POST /:id/expenses`: `validate({ params })` → `uploadSingle('receipt')` → `validate({ body: createExpenseSchema })` → controller.
  - `PATCH /:id/expenses/:expenseId`: `validate({ params })` → `uploadSingle('receipt')` → `validate({ body: updateExpenseSchema })` → controller.
  - JSON request tetap kompatibel karena multer melewati non-multipart.
- Tambahkan `PATCH /:id/expenses/:expenseId/status` dengan `validate({ params: expenseParams, body: expenseStatusSchema })` → controller; jangan pakai `requireRole` global, gunakan `assertCanManage` proyek.

### 5.4 Validator (`backend/src/validators/project.validator.js`)

- Perketat `createExpenseSchema`/`updateExpenseSchema`: `amount` > 0; field opsional tetap; jangan terima `status`/`approved_*` dari client.
- Pastikan koersi multipart: `amount` dan `task_id` memakai `z.coerce.number()`; `expense_date` string valid.
- `listExpensesQuery`: tambahkan `status: z.enum(['pending','approved','rejected']).optional()`.
- Tambahkan `expenseStatusSchema`:
  - `status: z.enum(['approved','rejected'])`
  - `rejection_reason: optionalString(500)`
  - `superRefine`: wajib reason jika `rejected`.
- Ekspor schema baru di bagian bawah file.

## 6. Perhitungan Finansial

- Update semua agregasi `project_expenses` agar hanya `approved`:
  - `projectModel.js`: `PROJECT_ENRICHED_FIELDS`, `getProjectStats`, `getExpenseSummaryByCategory`.
  - `reportController.js`: subquery `actual_cost` dan `total_direct_expenses` (sekitar baris 99, 114).
  - Cari ulang referensi `project_expenses` di backend dan pastikan setiap query agregat memiliki filter status.
- Tambahkan `total_pending_expenses`/`pending_expense_count` pada response financials proyek dan list expenses.
- Perilaku `task_id` tidak berubah; dokumentasikan bahwa approved task-linked expense tidak menambah `tasks.actual_cost`.

## 7. Frontend

### 7.1 `ProjectDetail.jsx`

- Perbaiki derivasi `canManage` agar mempertimbangkan role anggota proyek:
  - admin/manager global, ATAU `project.manager_id === user.id`, ATAU role anggota `owner`/`manager` dari `members`.
- Teruskan `canManage` dan `currentUserId={user?.id}` ke `ProjectBudgetTab`.
- Pastikan tab tetap tampil untuk semua anggota proyek; tombol pengajuan klaim terlihat untuk anggota.

### 7.2 `ProjectBudgetTab.jsx`

- **State**: tambah `receiptFile`, `receiptPreview`, `approvalModal` (`{ expense, action }`), `rejectionReason`, `statusFilter`.
- **Form modal**:
  - Tambah input file native (`accept="image/*,application/pdf"`), tampilkan nama file lama + opsi ganti.
  - Saat submit, bangun `FormData` (title, category, amount, expense_date, vendor_name, receipt_note, task_id hanya jika terisi, receipt file jika ada) dan panggil API.
  - Reset file state saat modal dibuka/ditutup.
- **Tabel**:
  - Tambah kolom **Status** (Badge: pending amber, approved emerald, rejected rose) dan **Bukti** (link `Lihat` ke `/uploads/<receipt_file>`; tampilkan `receipt_original_name`; dash jika kosong).
  - Tampilkan `rejection_reason` pada baris rejected (teks kecil/tooltip).
- **Filter**: dropdown status (`Semua`, `Pending`, `Approved`, `Rejected`), kirim sebagai query param; masukkan ke query key.
- **Aksi**:
  - Tombol pengajuan untuk semua anggota (`Ajukan Klaim`; manager label `Catat Pengeluaran`).
  - Edit/Delete: tampil jika `canManage` ATAU (`created_by === currentUserId` DAN status pending/rejected).
  - Approve/Reject: hanya `canManage` DAN status `pending`. Reject membuka modal wajib alasan.
- **Ringkasan**: tambah strip/card “Menunggu Persetujuan” dari `financials.total_pending_expenses` dan `pending_expense_count`.
- **Invalidasi query** setelah mutasi: expenses, project, projects, reports/dashboard yang relevan.
- **Socket**: gunakan `useSocket`/`useProjectSubscription` untuk mendengarkan `project:expense_updated` dan invalidasi query expenses. Pastikan cleanup listener.
- **Upload UI**: validasi ukuran/MIME di client; tampilkan toast error yang jelas.
- **Badge**: gunakan `Badge` dengan prop `style` (bukan class warna Tailwind) sesuai pola existing.

### 7.3 `project.api.js`

- `createExpense(id, payload)` dan `updateExpense(id, expenseId, payload)`:
  - Jika payload `FormData`, jangan set `Content-Type: application/json`; biarkan axios mengatur boundary atau set `multipart/form-data`.
- Tambah `updateExpenseStatus(id, expenseId, payload)` → `PATCH /projects/:id/expenses/:expenseId/status`.
- `expenses(id, params)` meneruskan `status` filter.
- Tambah/pertahankan `removeExpense`.

### 7.4 Konstanta

- Tambahkan `EXPENSE_STATUS` (label/warna) di `frontend/src/utils/constants.js`; impor ke tab. Tambahkan padanan enum di `backend/src/config/constants.js` bila modul constants dipakai untuk status lain.

## 8. Notifikasi, Activity, Socket

- Activity baru: `project.expense_submitted`, `project.expense_created`, `project.expense_approved`, `project.expense_rejected`, `project.expense_updated`, `project.expense_deleted`.
- Notifikasi:
  - Saat pending: kirim ke manager/owner proyek (dan admin bila tersedia). Tambahkan helper `projectModel.listProjectApproverIds(projectId)` atau gunakan `notificationService.notifyProjectMembers` dengan filter approver.
  - Saat approved/rejected: kirim ke `created_by`.
- Socket: emit `project:expense_updated` dengan payload `{ expense, financials }` setelah create/update/status/delete. Frontend invalidasi query; tidak perlu update state manual.
- Pastikan `socketService.emitProjectEvent` dipanggil setelah transaksi DB sukses.

## 9. Validasi & Pengujian

### 9.1 Backend (perluas `backend/scripts/verify-cost-gantt-api.js` atau buat script baru)

Siapkan token admin/manager dan member:

1. Member submit expense + file → 201, `status=pending`, `receipt_url` ada; `actual_cost` tidak berubah.
2. Manager GET list melihat pending; manager approve → `status=approved`; `actual_cost` bertambah sebesar amount.
3. Manager reject dengan alasan → `status=rejected`, alasan tersimpan, `actual_cost` tidak berubah.
4. Member edit rejected → kembali `pending`.
5. Member mencoba approve → 403.
6. Non-member submit/lihat → 403/404.
7. Upload MIME tidak valid / > limit → 400; file tidak tersimpan.
8. Dua approver bersamaan → satu sukses, satu 409.
9. Setelah migrasi, data lama berstatus `approved` dan total `actual_cost` sama dengan sebelum migrasi.
10. Hapus expense → file lampiran terhapus.

### 9.2 Frontend (manual + build)

1. Anggota melihat tombol `Ajukan Klaim`, upload file, submit → baris pending muncul.
2. Manager melihat tombol approve/reject hanya untuk pending; reject meminta alasan.
3. Link bukti membuka file di tab baru; file PDF/gambar tampil.
4. Filter status berfungsi; ringkasan pending akurat.
5. Setelah approve dari browser lain, daftar ter-refresh via socket.
6. Jalankan lint/build frontend dan skrip verifikasi backend yang tersedia di `backend/package.json` (mis. `verify:api`, `verify:realtime`); tambahkan skrip baru bila belum ada.

### 9.3 Pemeriksaan Database

- `SELECT status, COUNT(*), SUM(amount) FROM project_expenses GROUP BY status;`
- Bandingkan `actual_cost` proyek sebelum/sesudah migrasi (harus sama untuk data lama).

## 10. Rollout & Rollback

1. Backup database.
2. Terapkan perubahan `schema.sql` (fresh) atau jalankan patch `migrate.js` (existing). Pastikan backfill legacy → approved.
3. Deploy backend, lalu frontend.
4. Seed hanya untuk environment development/demo; jangan jalankan seed di production.
5. Verifikasi total biaya proyek tidak berubah setelah migrasi.
6. Rollback: revert kode aplikasi; kolom baru bersifat nullable/default sehingga kode lama tetap berjalan. Jika perlu, restore backup database.

## 11. Risiko & Edge Case

- **Keamanan file**: `/uploads` statis dapat diakses publik. Untuk bukti pengeluaran sensitif, pertimbangkan signed URL/otorisasi file sebagai follow-up.
- **Multipart + validasi**: pastikan multer berjalan sebelum validasi body; field kosong dari `FormData` harus diomit/dikoersi dengan benar.
- **Orphan file**: kegagalan update/delete setelah upload dapat meninggalkan file; helper cleanup harus try/catch dan dicatat.
- **Concurrency approval**: gunakan update bersyarat `status='pending'` + `affectedRows`; tampilkan 409.
- **Double submit**: nonaktifkan tombol saat mutation berjalan.
- **Task-linked expenses**: approved tidak menambah actual cost proyek; dokumentasikan agar tidak dianggap bug.
- **Legacy totals**: backfill wajib; jika terlewat, actual cost akan turun ke 0.
- **Seed**: jika seed dijalankan ulang, pastikan status approved dan jumlah baris konsisten dengan skrip verifikasi.

## 12. Out of Scope / Follow-up

- Multi-file lampiran per pengeluaran (tabel `project_expense_attachments`).
- Approval berjenjang (multi-level) dan delegasi approver.
- Pelacakan pembayaran/reimbursement (paid/unpaid, tanggal bayar).
- Roll-up approved expense bertaut task ke `tasks.actual_cost`.
- Signed URL/akses privat untuk file bukti.
- Notifikasi email/WhatsApp (v1 hanya in-app + socket).
