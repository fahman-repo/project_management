import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bookmark, Sparkles } from 'lucide-react';
import { projectApi } from '../../api/project.api';
import { getErrorMessage } from '../../api/client';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PROJECT_COLORS } from '../../utils/constants';
import { cn } from '../../utils/cn';

const templateSchema = z.object({
  name: z.string().min(1, 'Nama template wajib diisi').max(150, 'Maksimal 150 karakter'),
  code: z
    .string()
    .trim()
    .min(2, 'Minimal 2 karakter')
    .max(50, 'Maksimal 50 karakter')
    .regex(/^[a-z0-9-]+$/, 'Kode hanya boleh huruf kecil, angka, atau tanda hubung (-)'),
  category: z.string().min(1, 'Kategori wajib diisi').max(50, 'Maksimal 50 karakter'),
  description: z.string().max(500, 'Maksimal 500 karakter').optional().or(z.literal('')),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Format warna tidak valid').optional(),
});

const CATEGORY_OPTIONS = [
  { value: 'IT & Software', label: 'IT & Software' },
  { value: 'Konstruksi & Sipil', label: 'Konstruksi & Sipil' },
  { value: 'Marketing & Kreatif', label: 'Marketing & Kreatif' },
  { value: 'Event & Operasional', label: 'Event & Operasional' },
  { value: 'Pendidikan & Pelatihan', label: 'Pendidikan & Pelatihan' },
  { value: 'Umum / Bisnis', label: 'Umum / Bisnis' },
];

/**
 * Generate a slug from a name string.
 * @param {string} text
 */
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Dialog to save current project structure (statuses, milestones, tasks) as a reusable template.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {object} props.project
 */
export function SaveAsTemplateModal({ open, onClose, project }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: '',
      code: '',
      category: 'IT & Software',
      description: '',
      color: PROJECT_COLORS[0],
    },
  });

  useEffect(() => {
    if (!open || !project) return;
    const initialName = `Template ${project.name}`;
    const initialCode = slugify(project.name || 'template');
    reset({
      name: initialName,
      code: initialCode || 'template-baru',
      category: 'IT & Software',
      description: project.description ? `Berdasarkan proyek ${project.name}` : '',
      color: project.color || PROJECT_COLORS[0],
    });
    setServerError('');
  }, [open, project, reset]);

  const mutation = useMutation({
    mutationFn: (values) =>
      projectApi.saveAsTemplate(project.id, {
        name: values.name.trim(),
        code: values.code.trim(),
        category: values.category,
        description: values.description?.trim() || null,
        color: values.color,
      }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template berhasil disimpan!', {
        description: `Template "${saved.name}" kini dapat digunakan saat membuat proyek baru.`,
      });
      onClose();
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      setServerError(msg);
      toast.error('Gagal menyimpan template', { description: msg });
    },
  });

  const onSubmit = (values) => {
    setServerError('');
    mutation.mutate(values);
  };

  const selectedColor = watch('color') || PROJECT_COLORS[0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Simpan sebagai Template Proyek"
      description="Simpan alur status kanban, tahapan milestone, dan task struktur proyek ini agar dapat dipakai ulang di masa mendatang."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            loading={mutation.isPending || isSubmitting}
            leftIcon={<Bookmark className="h-4 w-4" />}
          >
            Simpan Template
          </Button>
        </>
      }
    >
      {serverError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label="Nama Template"
          placeholder="Contoh: Standar Renovasi Gedung"
          error={errors.name?.message}
          {...register('name', {
            onChange: (e) => {
              const currentCode = watch('code');
              if (!currentCode || currentCode === slugify(watch('name'))) {
                setValue('code', slugify(e.target.value));
              }
            },
          })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Kode Slug"
            placeholder="renovasi-gedung"
            hint="Huruf kecil, angka, dan tanda hubung"
            error={errors.code?.message}
            {...register('code')}
          />

          <Select
            label="Kategori Industri"
            options={CATEGORY_OPTIONS}
            error={errors.category?.message}
            {...register('category')}
          />
        </div>

        <Textarea
          label="Deskripsi Template"
          rows={3}
          placeholder="Jelaskan jenis proyek dan cara kerja alur template ini..."
          error={errors.description?.message}
          {...register('description')}
        />

        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
            Warna Identitas Template
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setValue('color', color, { shouldValidate: true })}
                aria-label={`Pilih warna ${color}`}
                className={cn(
                  'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-ring',
                  selectedColor === color
                    ? 'border-slate-900 dark:border-white'
                    : 'border-transparent'
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <input type="hidden" {...register('color')} />
          {errors.color?.message && (
            <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{errors.color.message}</p>
          )}
        </div>

        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-800 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300 flex items-start gap-2.5">
          <Sparkles className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
          <span>
            Semua kolom alur status, milestone, dan hierarki sub-task akan disimpan dengan tanggal offset relatif yang otomatis disesuaikan saat proyek baru dibuat dari template ini.
          </span>
        </div>
      </form>
    </Modal>
  );
}

export default SaveAsTemplateModal;

