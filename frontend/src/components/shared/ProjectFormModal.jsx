import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, Layers, CheckSquare, Flag, ArrowRight } from 'lucide-react';
import { userApi, templateApi } from '../../api';
import projectApi from '../../api/project.api';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PROJECT_COLORS, PROJECT_STATUS, PRIORITY } from '../../utils/constants';
import { cn } from '../../utils/cn';

/**
 * Turn an empty string into `undefined` so optional numeric fields stay empty.
 * @param {any} value
 */
function emptyToUndefined(value) {
  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}

const projectSchema = z
  .object({
    name: z.string().min(1, 'Nama project wajib diisi').max(150, 'Maksimal 150 karakter'),
    code: z
      .string()
      .trim()
      .max(20, 'Maksimal 20 karakter')
      .regex(/^[A-Za-z0-9-]*$/, 'Kode hanya boleh huruf, angka, atau tanda hubung')
      .optional()
      .or(z.literal('')),
    description: z.string().max(1000, 'Maksimal 1000 karakter').optional().or(z.literal('')),
    status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Format warna tidak valid').optional().or(z.literal('')),
    budget: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(0, 'Anggaran tidak boleh negatif').optional()
    ),
    start_date: z.string().optional().or(z.literal('')),
    end_date: z.string().optional().or(z.literal('')),
    manager_id: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().positive().optional()
    ),
  })
  .refine(
    (values) => !values.start_date || !values.end_date || values.end_date >= values.start_date,
    { message: 'Tanggal akhir harus setelah tanggal mulai', path: ['end_date'] }
  );

const EMPTY_VALUES = {
  name: '',
  code: '',
  description: '',
  status: 'planning',
  priority: 'medium',
  color: PROJECT_COLORS[0],
  budget: '',
  start_date: '',
  end_date: '',
  manager_id: '',
};

/**
 * Normalise a date-only string for an `<input type="date">`.
 * @param {string} value
 */
function toDateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

/**
 * Create / edit project dialog with template support.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {object|null} [props.project] pass a project to edit; omit to create
 * @param {(project:object) => void} [props.onSaved] called after a successful write
 */
export function ProjectFormModal({ open, onClose, project = null, onSaved }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(project?.id);

  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Template options for new projects
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [includeTasks, setIncludeTasks] = useState(true);
  const [includeMilestones, setIncludeMilestones] = useState(true);

  // Managers are picked from the list of active users.
  const { data: activeUsers = [] } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => userApi.active(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // Templates list
  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templateApi.list(),
    enabled: open && !isEdit,
    staleTime: 5 * 60 * 1000,
  });

  // Details of chosen template (statuses, tasks, milestones preview)
  const { data: templateDetail } = useQuery({
    queryKey: ['template', selectedTemplateId],
    queryFn: () => templateApi.get(selectedTemplateId),
    enabled: Boolean(selectedTemplateId),
  });

  const defaultValues = useMemo(() => {
    if (!isEdit) return { ...EMPTY_VALUES };
    return {
      name: project.name ?? '',
      code: project.code ?? '',
      description: project.description ?? '',
      status: project.status ?? 'planning',
      priority: project.priority ?? 'medium',
      color: project.color ?? PROJECT_COLORS[0],
      budget: project.budget ?? '',
      start_date: toDateInput(project.start_date),
      end_date: toDateInput(project.end_date),
      manager_id: project.manager_id ? String(project.manager_id) : '',
    };
  }, [isEdit, project]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(projectSchema),
    defaultValues: EMPTY_VALUES,
  });

  // Re-seed the form whenever the dialog opens or the target project changes.
  useEffect(() => {
    if (!open) return;
    reset(defaultValues);
    setServerError('');
    setFieldErrors({});
    setSelectedTemplateId('');
    setIncludeTasks(true);
    setIncludeMilestones(true);
  }, [open, defaultValues, reset]);

  // Sync color when template changes
  useEffect(() => {
    if (templateDetail?.color) {
      setValue('color', templateDetail.color, { shouldValidate: true });
    }
  }, [templateDetail, setValue]);

  const mutation = useMutation({
    mutationFn: (values) => {
      const payload = {
        name: values.name.trim(),
        code: values.code?.trim() || undefined,
        description: values.description?.trim() || undefined,
        status: values.status,
        priority: values.priority,
        color: values.color || undefined,
        budget: values.budget === undefined ? undefined : Number(values.budget),
        start_date: values.start_date || undefined,
        end_date: values.end_date || undefined,
        manager_id: values.manager_id ? Number(values.manager_id) : undefined,
        template_id: selectedTemplateId ? Number(selectedTemplateId) : undefined,
        include_template_tasks: includeTasks,
        include_template_milestones: includeMilestones,
      };
      return isEdit
        ? projectApi.update(project.id, payload)
        : projectApi.create(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['project', project.id] });

      toast.success(isEdit ? 'Project berhasil diperbarui' : 'Project berhasil dibuat', {
        description: saved?.name,
      });

      onSaved?.(saved);
      onClose?.();
    },
    onError: (error) => {
      setServerError(getErrorMessage(error));
      setFieldErrors(getFieldErrors(error) || {});
      toast.error(isEdit ? 'Gagal memperbarui project' : 'Gagal membuat project');
    },
  });

  const onSubmit = (values) => {
    setServerError('');
    setFieldErrors({});
    mutation.mutate(values);
  };

  const selectedColor = watch('color') || PROJECT_COLORS[0];
  const selectedStatus = watch('status') || 'planning';
  const selectedPriority = watch('priority') || 'medium';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit Project' : 'Project Baru'}
      description={
        isEdit
          ? 'Perbarui informasi project, task, dan anggota tim akan mengikuti.'
          : 'Pilih template industri atau bangun project kustom sesuai alur tim Anda.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            loading={mutation.isPending || isSubmitting}
            leftIcon={<Save className="h-4 w-4" />}
          >
            {isEdit ? 'Simpan Perubahan' : 'Buat Project'}
          </Button>
        </>
      }
    >
      {serverError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 animate-slide-up dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Template Selector for New Projects */}
        {!isEdit && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                <Layers className="h-4 w-4 text-indigo-500" />
                Template Industri / Alur Proyek
              </label>
              <span className="text-[11px] text-slate-500">Opsional</span>
            </div>

            <Select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              options={[
                { value: '', label: '-- Mulai Tanpa Template (Standar Kanban) --' },
                ...templates.map((tpl) => ({
                  value: String(tpl.id),
                  label: `${tpl.name} [${tpl.category}]`,
                })),
              ]}
            />

            {/* Template Preview Section */}
            {templateDetail && (
              <div className="mt-3 space-y-2.5 rounded-lg border border-indigo-200/60 bg-white/80 p-3 dark:border-indigo-800/40 dark:bg-slate-900/80">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  {templateDetail.description}
                </div>

                {/* Workflow Statuses sequence */}
                <div>
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                    Alur Kolom Kanban:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {templateDetail.statuses?.map((st, i) => (
                      <div key={st.id || i} className="flex items-center gap-1">
                        <span
                          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border"
                          style={{
                            borderColor: `${st.color}40`,
                            backgroundColor: `${st.color}15`,
                            color: st.color,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: st.color }}
                          />
                          {st.label}
                          <span className="text-[10px] opacity-75">({st.progress}%)</span>
                        </span>
                        {i < templateDetail.statuses.length - 1 && (
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Inclusion Toggles */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={includeTasks}
                      onChange={(e) => setIncludeTasks(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700"
                    />
                    <CheckSquare className="h-3.5 w-3.5 text-slate-400" />
                    Sertakan {templateDetail.tasks?.length || 0} task awal template
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={includeMilestones}
                      onChange={(e) => setIncludeMilestones(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700"
                    />
                    <Flag className="h-3.5 w-3.5 text-slate-400" />
                    Sertakan {templateDetail.milestones?.length || 0} milestone template
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nama Project"
            placeholder="Contoh: Redesign Aplikasi Mobile"
            containerClassName="sm:col-span-2"
            error={errors.name?.message || fieldErrors.name?.[0]}
            {...register('name')}
          />

          <Input
            label="Kode Project"
            placeholder="PRJ-001"
            hint="Dibuat otomatis bila dikosongkan"
            error={errors.code?.message || fieldErrors.code?.[0]}
            {...register('code')}
          />

          <Select
            label="Manajer Project"
            placeholder="Belum ditentukan"
            options={activeUsers.map((user) => ({
              value: String(user.id),
              label: `${user.name} - ${user.email}`,
            }))}
            error={errors.manager_id?.message || fieldErrors.manager_id?.[0]}
            {...register('manager_id')}
          />
        </div>

        <Textarea
          label="Deskripsi"
          rows={3}
          placeholder="Ringkasan singkat tentang tujuan dan cakupan project"
          error={errors.description?.message || fieldErrors.description?.[0]}
          {...register('description')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Status"
            options={Object.entries(PROJECT_STATUS).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
            error={errors.status?.message || fieldErrors.status?.[0]}
            {...register('status')}
          />

          <Select
            label="Prioritas"
            options={Object.entries(PRIORITY).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
            error={errors.priority?.message || fieldErrors.priority?.[0]}
            {...register('priority')}
          />

          <Input
            label="Anggaran (IDR)"
            type="number"
            min="0"
            step="1000"
            placeholder="0"
            error={errors.budget?.message || fieldErrors.budget?.[0]}
            {...register('budget')}
          />

          <div className="w-full">
            <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Warna Project
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setValue('color', color, { shouldValidate: true })}
                  aria-label={`Pilih warna ${color}`}
                  aria-pressed={selectedColor === color}
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Tanggal Mulai"
            type="date"
            error={errors.start_date?.message || fieldErrors.start_date?.[0]}
            {...register('start_date')}
          />

          <Input
            label="Tanggal Selesai"
            type="date"
            error={errors.end_date?.message || fieldErrors.end_date?.[0]}
            {...register('end_date')}
          />
        </div>

        {/* Live preview of the chosen badges. */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Pratinjau
          </span>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: selectedColor }}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
            {PROJECT_STATUS[selectedStatus]?.label || selectedStatus}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            &bull; {PRIORITY[selectedPriority]?.label || selectedPriority}
          </span>
        </div>

        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default ProjectFormModal;
