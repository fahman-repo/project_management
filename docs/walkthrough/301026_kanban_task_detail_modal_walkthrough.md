# Walkthrough: Detail Task & Agenda sebagai Modal Pop-up di Kanban, Gantt, dan Calendar

Tugas untuk mengubah tampilan detail task dan agenda menjadi modal pop-up tepat di tengah layar telah selesai diimplementasikan pada seluruh halaman terkait: **Kanban Board**, **Gantt Timeline**, dan **Calendar**.

---

## Ringkasan Perubahan

### 1. Komponen Shared Detail Task
- **File**: [`TaskDetailDrawer.jsx`](file:///c:/xampp/htdocs/project_management/frontend/src/components/shared/TaskDetailDrawer.jsx)
- Menambahkan dukungan prop `variant` dengan opsi `'drawer' | 'modal'` (default: `'drawer'`).
- Mengimpor komponen [`Modal`](file:///c:/xampp/htdocs/project_management/frontend/src/components/ui/Modal.jsx):
  - Saat `variant === 'modal'`: menggunakan `<Modal size="lg" ...>` yang terpusat di tengah layar dengan backdrop blur dan animasi scale-in.
  - Saat `variant === 'drawer'`: tetap menggunakan `<Drawer width="max-w-2xl" ...>` di sisi kanan layar untuk kompatibilitas.

### 2. Halaman Kanban Board
- **File**: [`Kanban.jsx`](file:///c:/xampp/htdocs/project_management/frontend/src/pages/tasks/Kanban.jsx)
- Menambahkan `variant="modal"` ke `<TaskDetailDrawer />`.
- Mengatur kondisi pembukaan `open={Boolean(detailTaskId) && !formOpen}` agar form edit (`TaskFormModal`) bertransisi mulus tanpa tumpukan modal ganda.

### 3. Halaman Gantt Timeline
- **File**: [`Gantt.jsx`](file:///c:/xampp/htdocs/project_management/frontend/src/pages/tasks/Gantt.jsx)
- Mengaktifkan `variant="modal"` pada `<TaskDetailDrawer />` ketika task di timeline atau tabel WBS diklik.
- Menambahkan integrasi [`TaskFormModal`](file:///c:/xampp/htdocs/project_management/frontend/src/components/shared/TaskFormModal.jsx) dan invalidasi query Gantt sehingga pengguna dapat mengedit task langsung dari modal detail task Gantt dengan transisi mulus.

### 4. Halaman Calendar
- **File**: [`Calendar.jsx`](file:///c:/xampp/htdocs/project_management/frontend/src/pages/Calendar.jsx)
- Mengganti drawer agenda harian (`Drawer` di sisi kanan layar) menjadi `<Modal size="md">` yang muncul di tengah layar saat tanggal pada kalender diklik.
- Menambahkan footer tombol "Tutup" untuk konsistensi pengalaman modal dialog.

---

## Verifikasi & Hasil Pengujian

### 1. Build Frontend
- Menjalankan build Vite production:
  ```powershell
  npm --prefix frontend run build
  ```
  **Hasil**: Sukses (`✓ built in 11.16s`, tanpa error).

### 2. Pengujian Interaktif Browser (Playwright E2E)
- **Halaman Kanban (`/kanban`)**:
  - Klik kartu task menampilkan modal detail task tepat di tengah layar (`box: x=355, width=669` pada viewport 1379px).
  - Tombol edit task dan tombol escape bekerja normal.
- **Halaman Gantt Timeline (`/gantt`)**:
  - Klik baris task *"Rancang arsitektur aplikasi mobile"* di tabel WBS membuka modal detail di tengah layar (`box: x=353, width=672` pada viewport 1379px).
- **Halaman Calendar (`/calendar`)**:
  - Klik tombol tanggal *"01 October 2026"* membuka modal agenda di tengah layar (`box: x=433, width=512` pada viewport 1379px).

---

## Tangkapan Layar Pengujian

````carousel
![Modal Pop-up Detail Task di Kanban](kanban_task_detail_modal.png)
<!-- slide -->
![Modal Pop-up Detail Task di Gantt Timeline](gantt_task_detail_modal.png)
<!-- slide -->
![Modal Pop-up Agenda Harian di Calendar](calendar_day_detail_modal.png)
````
