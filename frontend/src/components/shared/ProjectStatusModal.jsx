import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Edit2,
  Plus,
  Trash2,
  Workflow,
  Sliders,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { projectApi } from '../../api/project.api';
import { getErrorMessage } from '../../api/client';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';

const CATEGORY_OPTIONS = [
  { value: 'todo', label: 'Belum Dimulai (Todo)' },
  { value: 'in_progress', label: 'Sedang Berjalan (In Progress)' },
  { value: 'review', label: 'Peninjauan / Approval (Review)' },
  { value: 'blocked', label: 'Tertunda / Kendala (Blocked)' },
  { value: 'done', label: 'Selesai / Final (Done)' },
];

const PRESET_COLORS = [
  '#64748b', // slate
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6366f1', // indigo
];

function slugifyKey(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Modal to manage custom workflow columns/statuses for a project.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {number} props.projectId
 * @param {string} [props.projectName]
 */
export function ProjectStatusModal({ open, onClose, projectId, projectName }) {
  const queryClient = useQueryClient();

  const [editingStatus, setEditingStatus] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingStatus, setDeletingStatus] = useState(null);
  const [transferTargetKey, setTransferTargetKey] = useState('');

  // Form states for Add/Edit
  const [formData, setFormData] = useState({
    label: '',
    key_name: '',
    color: '#3b82f6',
    category: 'in_progress',
    progress: 50,
  });

  const { data: statuses = [], isLoading, refetch } = useQuery({
    queryKey: ['project-statuses', projectId],
    queryFn: () => projectApi.statuses(projectId),
    enabled: open && Boolean(projectId),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['project-statuses', projectId] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload) => projectApi.createStatus(projectId, payload),
    onSuccess: (newStatus) => {
      toast.success(`Status "${newStatus.label}" berhasil ditambahkan`);
      setIsAdding(false);
      resetForm();
      invalidateAll();
    },
    onError: (err) => {
      toast.error('Gagal menambahkan status', { description: getErrorMessage(err) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ statusId, payload }) => projectApi.updateStatus(projectId, statusId, payload),
    onSuccess: () => {
      toast.success('Status berhasil diperbarui');
      setEditingStatus(null);
      resetForm();
      invalidateAll();
    },
    onError: (err) => {
      toast.error('Gagal memperbarui status', { description: getErrorMessage(err) });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds) => projectApi.reorderStatuses(projectId, orderedIds),
    onSuccess: () => {
      toast.success('Urutan kolom diperbarui');
      invalidateAll();
    },
    onError: (err) => {
      toast.error('Gagal mengubah urutan', { description: getErrorMessage(err) });
      refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ statusId, transferToKey }) =>
      projectApi.removeStatus(projectId, statusId, transferToKey ? { transfer_to_key: transferToKey } : {}),
    onSuccess: () => {
      toast.success('Status berhasil dihapus');
      setDeletingStatus(null);
      setTransferTargetKey('');
      invalidateAll();
    },
    onError: (err) => {
      toast.error('Gagal menghapus status', { description: getErrorMessage(err) });
    },
  });

  const resetForm = () => {
    setFormData({
      label: '',
      key_name: '',
      color: '#3b82f6',
      category: 'in_progress',
      progress: 50,
    });
  };

  const startAdd = () => {
    resetForm();
    setIsAdding(true);
    setEditingStatus(null);
  };

  const startEdit = (status) => {
    setIsAdding(false);
    setEditingStatus(status);
    setFormData({
      label: status.label,
      key_name: status.key_name,
      color: status.color || '#3b82f6',
      category: status.category || 'in_progress',
      progress: status.progress ?? 0,
    });
  };

  const handleSaveForm = (e) => {
    e.preventDefault();
    if (!formData.label.trim()) {
      toast.error('Nama status wajib diisi');
      return;
    }

    if (editingStatus) {
      updateMutation.mutate({
        statusId: editingStatus.id,
        payload: {
          label: formData.label.trim(),
          color: formData.color,
          category: formData.category,
          progress: Number(formData.progress),
        },
      });
    } else {
      const finalKey = formData.key_name.trim() || slugifyKey(formData.label);
      if (!finalKey) {
        toast.error('Kode unik status wajib diisi');
        return;
      }
      createMutation.mutate({
        key_name: finalKey,
        label: formData.label.trim(),
        color: formData.color,
        category: formData.category,
        progress: Number(formData.progress),
      });
    }
  };

  const moveStatus = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= statuses.length) return;

    const reordered = [...statuses];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const orderedIds = reordered.map((s) => s.id);
    reorderMutation.mutate(orderedIds);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Atur Alur Kerja & Kolom Kanban"
      description={`Kustomisasi tahapan kerja khusus untuk proyek ${projectName || ''}. Setiap kolom memiliki bobot progres dan kategori alur.`}
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-slate-500">
            Total {statuses.length} kolom alur kerja
          </span>
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Top action bar */}
        {!isAdding && !editingStatus && (
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Daftar Kolom & Status
            </span>
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={startAdd}>
              Tambah Kolom
            </Button>
          </div>
        )}

        {/* Form Add / Edit */}
        {(isAdding || editingStatus) && (
          <form
            onSubmit={handleSaveForm}
            className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {editingStatus ? `Edit Kolom: ${editingStatus.label}` : 'Tambah Kolom Baru'}
              </span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setIsAdding(false);
                  setEditingStatus(null);
                }}
              >
                Batal
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Nama Kolom (Label)"
                placeholder="Contoh: Inspeksi K3 Lapangan"
                value={formData.label}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    label: val,
                    ...(!editingStatus && !prev.key_name_touched
                      ? { key_name: slugifyKey(val) }
                      : {}),
                  }));
                }}
                required
              />

              {!editingStatus ? (
                <Input
                  label="Kode Slug (Unik)"
                  placeholder="inspeksi_k3"
                  hint="Hanya huruf kecil, angka, dan underscore"
                  value={formData.key_name}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      key_name: e.target.value,
                      key_name_touched: true,
                    }))
                  }
                  required
                />
              ) : (
                <Input
                  label="Kode Internal"
                  value={formData.key_name}
                  disabled
                  hint="Kode status tetap untuk integritas task"
                />
              )}

              <Select
                label="Kategori Alur"
                value={formData.category}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                options={CATEGORY_OPTIONS}
              />

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Bobot Progres ({formData.progress}%)
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={formData.progress}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, progress: Number(e.target.value) }))
                    }
                    className="h-2 w-full cursor-pointer rounded-lg bg-slate-200 accent-indigo-600 dark:bg-slate-700"
                  />
                  <span className="w-12 text-right text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {formData.progress}%
                  </span>
                </div>
              </div>
            </div>

            {/* Color selection */}
            <div className="mt-3">
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Warna Kolom
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, color: c }))}
                    className={cn(
                      'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none',
                      formData.color === c
                        ? 'border-slate-900 ring-2 ring-indigo-500 dark:border-white'
                        : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsAdding(false);
                  setEditingStatus(null);
                }}
              >
                Batal
              </Button>
              <Button
                type="submit"
                size="sm"
                loading={createMutation.isPending || updateMutation.isPending}
                leftIcon={<Check className="h-4 w-4" />}
              >
                {editingStatus ? 'Simpan Perubahan' : 'Tambah Status'}
              </Button>
            </div>
          </form>
        )}

        {/* Delete Confirmation Modal Overlay */}
        {deletingStatus && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900/50 dark:bg-rose-950/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                    Hapus Kolom Status "{deletingStatus.label}"?
                  </h4>
                  <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                    Jika ada task yang saat ini berada di kolom ini, Anda dapat memindahkannya ke kolom lain di bawah ini.
                  </p>
                </div>

                <Select
                  label="Pindahkan task yang ada ke kolom:"
                  value={transferTargetKey}
                  onChange={(e) => setTransferTargetKey(e.target.value)}
                  options={[
                    { value: '', label: '-- Pilih Kolom Tujuan (Opsional) --' },
                    ...statuses
                      .filter((s) => s.id !== deletingStatus.id)
                      .map((s) => ({ value: s.key_name, label: `${s.label} (${s.key_name})` })),
                  ]}
                />

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => {
                      setDeletingStatus(null);
                      setTransferTargetKey('');
                    }}
                  >
                    Batal
                  </Button>
                  <Button
                    size="xs"
                    variant="danger"
                    loading={deleteMutation.isPending}
                    onClick={() =>
                      deleteMutation.mutate({
                        statusId: deletingStatus.id,
                        transferToKey: transferTargetKey || null,
                      })
                    }
                  >
                    Hapus Kolom
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Statuses List */}
        <div className="space-y-2">
          {isLoading && (
            <div className="py-8 text-center text-xs text-slate-500">Memuat status...</div>
          )}

          {!isLoading && statuses.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
              Belum ada status kustom untuk proyek ini.
            </div>
          )}

          {statuses.map((status, index) => {
            const isFirst = index === 0;
            const isLast = index === statuses.length - 1;

            return (
              <div
                key={status.id}
                className={cn(
                  'flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 transition-colors dark:border-slate-800 dark:bg-slate-900',
                  editingStatus?.id === status.id && 'ring-2 ring-indigo-500'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={isFirst || reorderMutation.isPending}
                      onClick={() => moveStatus(index, -1)}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 dark:hover:bg-slate-800"
                      title="Geser ke atas"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isLast || reorderMutation.isPending}
                      onClick={() => moveStatus(index, 1)}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 dark:hover:bg-slate-800"
                      title="Geser ke bawah"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: status.color || '#64748b' }}
                  />

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {status.label}
                      </span>
                      <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {status.key_name}
                      </code>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      <span>Kategori: {status.category || 'in_progress'}</span>
                      <span>&bull;</span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        Progres: {status.progress}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => startEdit(status)}
                    title="Ubah status"
                  >
                    <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={statuses.length <= 1}
                    onClick={() => setDeletingStatus(status)}
                    title={statuses.length <= 1 ? 'Minimal harus ada 1 status' : 'Hapus status'}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400 flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0 text-slate-400" />
          <span>
            Saat task dipindahkan antar kolom di Papan Kanban, progres task dan persentase proyek akan otomatis diperbarui mengikuti bobot kolom tujuan.
          </span>
        </div>
      </div>
    </Modal>
  );
}

export default ProjectStatusModal;

