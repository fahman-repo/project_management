import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, Save } from 'lucide-react';
import { taskApi } from '../../api/task.api';
import { projectApi } from '../../api/project.api';
import { labelApi } from '../../api';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input, Textarea, Select, Switch } from '../ui/Input';
import { TASK_STATUS, PRIORITY } from '../../utils/constants';
import { parseLabelIds } from './TaskCard';

const taskSchema = z
  .object({
    title: z.string().trim().min(1, 'Judul wajib diisi').max(220, 'Judul maksimal 220 karakter'),
    description: z.string().max(5000, 'Deskripsi terlalu panjang').optional().or(z.literal('')),
    project_id: z.string().optional(),
    status: z.string().min(1, 'Status wajib dipilih'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    assignee_id: z.string().optional(),
    parent_id: z.string().optional(),
    start_date: z.string().optional(),
    due_date: z.string().optional(),
    estimated_hours: z.string().optional(),
    actual_hours: z.string().optional(),
    estimated_cost: z.string().optional(),
    actual_cost: z.string().optional(),
    is_milestone: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.start_date && values.due_date && values.start_date > values.due_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['due_date'],
        message: 'Tanggal jatuh tempo harus setelah tanggal mulai',
      });
    }
  });

/**
 * Convert a `YYYY-MM-DD` value to the empty string the API expects for "no date".
 * @param {any} value
 */
function toDateInput(value) {
  if (!value) return '';
  const raw = String(value);
  return raw.slice(0, 10);
}

/**
 * Create / edit task dialog.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {object|null} props.task existing task when editing
 * @param {number|string|null} props.projectId required when creating
 * @param {() => void} props.onSaved called after a successful save
 */
export function TaskFormModal({ open, onClose, task, projectId, onSaved }) {
  const isEditing = Boolean(task?.id);

  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: '',
      description: '',
      project_id: '',
      status: 'todo',
      priority: 'medium',
      assignee_id: '',
      parent_id: '',
      start_date: '',
      due_date: '',
      estimated_hours: '',
      actual_hours: '',
      estimated_cost: '',
      actual_cost: '',
      is_milestone: false,
    },
  });

  const watchedProjectId = watch('project_id');
  const watchedMilestone = watch('is_milestone');

  // --- Reference data ------------------------------------------------------
  const { data: projectResponse } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => projectApi.list({ perPage: 100, sort: 'name', direction: 'asc' }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: labelResponse } = useQuery({
    queryKey: ['labels'],
    queryFn: () => labelApi.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: memberResponse } = useQuery({
    queryKey: ['project', watchedProjectId, 'members'],
    queryFn: () =>
      watchedProjectId ? projectApi.members(Number(watchedProjectId)) : Promise.resolve([]),
    enabled: Boolean(watchedProjectId),
    staleTime: 60 * 1000,
  });

  const { data: taskResponse } = useQuery({
    queryKey: ['tasks', 'project', watchedProjectId],
    queryFn: () =>
      watchedProjectId
        ? taskApi.list({ project_id: Number(watchedProjectId), perPage: 100 })
        : Promise.resolve({ data: [] }),
    enabled: Boolean(watchedProjectId),
    staleTime: 30 * 1000,
  });

  const { data: projectStatuses = [] } = useQuery({
    queryKey: ['project-statuses', watchedProjectId],
    queryFn: () =>
      watchedProjectId ? projectApi.statuses(Number(watchedProjectId)) : Promise.resolve([]),
    enabled: Boolean(watchedProjectId),
    staleTime: 60 * 1000,
  });

  const projects = projectResponse?.data ?? [];
  const labels = Array.isArray(labelResponse) ? labelResponse : labelResponse?.labels ?? [];
  const members = Array.isArray(memberResponse) ? memberResponse : memberResponse?.members ?? [];
  const projectTasks = taskResponse?.data ?? [];

  // --- Prefill -------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    setServerError('');
    setFieldErrors({});

    if (task?.id) {
      reset({
        title: task.title || '',
        description: task.description || '',
        project_id: String(task.project_id ?? ''),
        status: task.status || 'todo',
        priority: task.priority || 'medium',
        assignee_id: task.assignee_id ? String(task.assignee_id) : '',
        parent_id: task.parent_id ? String(task.parent_id) : '',
        start_date: toDateInput(task.start_date),
        due_date: toDateInput(task.due_date),
        estimated_hours:
          task.estimated_hours === null || task.estimated_hours === undefined
            ? ''
            : String(task.estimated_hours),
        actual_hours:
          task.actual_hours === null || task.actual_hours === undefined
            ? ''
            : String(task.actual_hours),
        estimated_cost:
          task.estimated_cost === null || task.estimated_cost === undefined
            ? ''
            : String(task.estimated_cost),
        actual_cost:
          task.actual_cost === null || task.actual_cost === undefined
            ? ''
            : String(task.actual_cost),
        is_milestone: Boolean(task.is_milestone),
      });
      setSelectedLabels(parseLabelIds(task.label_ids));
    } else {
      reset({
        title: '',
        description: '',
        project_id: projectId ? String(projectId) : '',
        status: 'todo',
        priority: 'medium',
        assignee_id: '',
        parent_id: '',
        start_date: '',
        due_date: '',
        estimated_hours: '',
        actual_hours: '',
        estimated_cost: '',
        actual_cost: '',
        is_milestone: false,
      });
      setSelectedLabels([]);
    }
  }, [open, task, projectId, reset]);

  // Parent task must belong to the same project and cannot be the task itself.
  const parentOptions = useMemo(
    () =>
      projectTasks
        .filter((item) => !task?.id || Number(item.id) !== Number(task.id))
        .filter((item) => !item.parent_id)
        .map((item) => ({ value: String(item.id), label: item.title })),
    [projectTasks, task]
  );

  const statusOptions = useMemo(() => {
    if (projectStatuses.length > 0) {
      return projectStatuses.map((s) => ({
        value: s.key_name,
        label: `${s.label} (${s.progress}%)`,
      }));
    }
    return Object.entries(TASK_STATUS).map(([value, meta]) => ({
      value,
      label: meta.label,
    }));
  }, [projectStatuses]);

  const priorityOptions = Object.entries(PRIORITY).map(([value, meta]) => ({
    value,
    label: meta.label,
  }));
  const projectOptions = projects.map((project) => ({
    value: String(project.id),
    label: `${project.code} - ${project.name}`,
  }));
  const memberOptions = members.map((member) => ({
    value: String(member.id),
    label: member.name,
  }));

  const toggleLabel = (id) => {
    setSelectedLabels((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const onSubmit = async (values) => {
    setServerError('');
    setFieldErrors({});
    setSubmitting(true);

    const payload = {
      title: values.title,
      description: values.description ? values.description : null,
      status: values.status,
      priority: values.priority,
      assignee_id: values.assignee_id ? Number(values.assignee_id) : null,
      parent_id: values.parent_id ? Number(values.parent_id) : null,
      start_date: values.start_date || null,
      due_date: values.due_date || null,
      estimated_hours: values.estimated_hours === '' ? null : Number(values.estimated_hours),
      actual_hours: values.actual_hours === '' ? null : Number(values.actual_hours),
      estimated_cost: values.estimated_cost === '' ? 0 : Number(values.estimated_cost),
      actual_cost: values.actual_cost === '' ? 0 : Number(values.actual_cost),
      label_ids: selectedLabels,
    };

    try {
      if (isEditing) {
        await taskApi.update(task.id, payload);
        toast.success('Task berhasil diperbarui');
      } else {
        await taskApi.create({
          ...payload,
          project_id: Number(values.project_id),
          is_milestone: values.is_milestone,
        });
        toast.success('Task berhasil dibuat');
      }

      onSaved?.();
      onClose?.();
    } catch (error) {
      setServerError(getErrorMessage(error));
      setFieldErrors(getFieldErrors(error) || {});
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMilestone = (checked) => {
    setValue('is_milestone', checked, { shouldDirty: true });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={isEditing ? 'Edit Task' : 'Tambah Task'}
      description={
        isEditing ? 'Perbarui detail task yang dipilih.' : 'Isi detail task baru untuk dipilih.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            loading={submitting}
            leftIcon={<Save className="h-4 w-4" />}
          >
            {isEditing ? 'Simpan Perubahan' : 'Simpan Task'}
          </Button>
        </>
      }
    >
      {serverError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label="Judul"
          required
          placeholder="Contoh: Redesign halaman login"
          error={errors.title?.message || fieldErrors.title?.[0]}
          {...register('title')}
        />

        <Textarea
          label="Deskripsi"
          rows={3}
          placeholder="Jelaskan detail pekerjaan yang perlu dikerjakan"
          error={errors.description?.message || fieldErrors.description?.[0]}
          {...register('description')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Project"
            required={!isEditing}
            placeholder="Pilih project"
            options={projectOptions}
            error={errors.project_id?.message || fieldErrors.project_id?.[0]}
            disabled={isEditing}
            {...register('project_id')}
          />

          <Select
            label="Parent Task"
            placeholder="Tidak ada (task utama)"
            options={parentOptions}
            error={errors.parent_id?.message || fieldErrors.parent_id?.[0]}
            disabled={!watchedProjectId}
            {...register('parent_id')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Status"
            options={statusOptions}
            error={errors.status?.message || fieldErrors.status?.[0]}
            {...register('status')}
          />

          <Select
            label="Prioritas"
            options={priorityOptions}
            error={errors.priority?.message || fieldErrors.priority?.[0]}
            {...register('priority')}
          />
        </div>

        <Select
          label="Assignee"
          placeholder="Belum ditugaskan"
          options={memberOptions}
          error={errors.assignee_id?.message || fieldErrors.assignee_id?.[0]}
          disabled={!watchedProjectId}
          {...register('assignee_id')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Tanggal Mulai"
            type="date"
            error={errors.start_date?.message || fieldErrors.start_date?.[0]}
            {...register('start_date')}
          />

          <Input
            label="Tanggal Jatuh Tempo"
            type="date"
            error={errors.due_date?.message || fieldErrors.due_date?.[0]}
            {...register('due_date')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Estimasi Jam"
            type="number"
            min="0"
            step="0.5"
            placeholder="0"
            error={errors.estimated_hours?.message || fieldErrors.estimated_hours?.[0]}
            {...register('estimated_hours')}
          />

          <Input
            label="Jam Aktual"
            type="number"
            min="0"
            step="0.5"
            placeholder="0"
            error={errors.actual_hours?.message || fieldErrors.actual_hours?.[0]}
            {...register('actual_hours')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Rencana Biaya / RAB (Rp)"
            type="number"
            min="0"
            step="1000"
            placeholder="0"
            error={errors.estimated_cost?.message || fieldErrors.estimated_cost?.[0]}
            {...register('estimated_cost')}
          />

          <Input
            label="Biaya Aktual / Realisasi (Rp)"
            type="number"
            min="0"
            step="1000"
            placeholder="0"
            error={errors.actual_cost?.message || fieldErrors.actual_cost?.[0]}
            {...register('actual_cost')}
          />
        </div>

        {/* Labels */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">Label</p>
          {labels.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Belum ada label tersedia.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => {
                const active = selectedLabels.includes(Number(label.id));
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => toggleLabel(Number(label.id))}
                    aria-pressed={active}
                    className={
                      active
                        ? 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90'
                        : 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }
                    style={active ? { backgroundColor: label.color } : undefined}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: active ? '#ffffff' : label.color }}
                    />
                    {label.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!isEditing && (
          <Switch
            label="Tandai sebagai milestone"
            checked={Boolean(watchedMilestone)}
            onChange={toggleMilestone}
          />
        )}

        {isEditing && task?.is_milestone ? (
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
            Task ini ditandai sebagai milestone.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

export default TaskFormModal;
