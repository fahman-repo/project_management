import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, Pencil, UserPlus } from 'lucide-react';
import { userApi } from '../../api/index';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select, Switch, Textarea } from '../ui/Input';
import { ROLES } from '../../utils/constants';

const ROLE_OPTIONS = [
  { value: 'admin', label: ROLES.admin.label },
  { value: 'manager', label: ROLES.manager.label },
  { value: 'member', label: ROLES.member.label },
];

const BASE_FIELDS = {
  name: z.string().trim().min(1, 'Nama wajib diisi').max(120, 'Nama maksimal 120 karakter'),
  email: z.string().trim().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  role: z.enum(['admin', 'manager', 'member']),
  job_title: z.string().trim().max(120, 'Jabatan maksimal 120 karakter').optional(),
  phone: z.string().trim().max(30, 'Telepon maksimal 30 karakter').optional(),
  bio: z.string().trim().max(2000, 'Bio maksimal 2000 karakter').optional(),
};

const createSchema = z.object({
  ...BASE_FIELDS,
  password: z
    .string()
    .min(8, 'Password minimal 8 karakter')
    .regex(/[A-Za-z]/, 'Password harus mengandung huruf')
    .regex(/\d/, 'Password harus mengandung angka'),
  is_active: z.boolean().optional(),
});

const editSchema = z.object({
  ...BASE_FIELDS,
  password: z
    .string()
    .optional()
    .refine(
      (value) => !value || (value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value)),
      'Password minimal 8 karakter, mengandung huruf dan angka'
    ),
  is_active: z.boolean().optional(),
});

/**
 * Build the default form values for the current mode.
 * @param {object|null} user
 */
function buildDefaults(user) {
  if (!user) {
    return {
      name: '',
      email: '',
      password: '',
      role: 'member',
      job_title: '',
      phone: '',
      bio: '',
      is_active: true,
    };
  }

  return {
    name: user.name || '',
    email: user.email || '',
    password: '',
    role: user.role || 'member',
    job_title: user.job_title || '',
    phone: user.phone || '',
    bio: user.bio || '',
    is_active: Boolean(user.is_active),
  };
}

/**
 * Create / edit user modal shared by the Team and User Management pages.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {object|null} props.user  null creates a new user, otherwise edits
 * @param {(user:object) => void} [props.onSaved]
 */
export function UserFormModal({ open, onClose, user = null, onSaved }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(user);

  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const schema = useMemo(() => (isEdit ? editSchema : createSchema), [isEdit]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(user),
  });

  const isActive = watch('is_active', true);

  // Re-seed the form whenever the modal opens for a different user.
  useEffect(() => {
    if (!open) return;
    reset(buildDefaults(user));
    setServerError('');
    setFieldErrors({});
  }, [open, user, reset]);

  const mutation = useMutation({
    mutationFn: async (values) => {
      const payload = {
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        role: values.role,
        job_title: values.job_title?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        bio: values.bio?.trim() || undefined,
      };

      if (values.password) payload.password = values.password;

      if (isEdit) {
        payload.is_active = Boolean(values.is_active);
        return userApi.update(user.id, payload);
      }

      return userApi.create({ ...payload, password: values.password });
    },
    onSuccess: (result) => {
      const saved = result?.user || result;
      toast.success(isEdit ? 'Pengguna berhasil diperbarui' : 'Pengguna berhasil dibuat');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user', user?.id] });
      onSaved?.(saved);
      onClose?.();
    },
    onError: (error) => {
      setServerError(getErrorMessage(error));
      setFieldErrors(getFieldErrors(error) || {});
      toast.error(getErrorMessage(error));
    },
  });

  const onSubmit = (values) => {
    setServerError('');
    setFieldErrors({});
    mutation.mutate(values);
  };

  const errorFor = (field) => errors[field]?.message || fieldErrors[field]?.[0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit Pengguna' : 'Tambah Pengguna'}
      description={
        isEdit
          ? 'Perbarui data pengguna. Kosongkan password bila tidak ingin mengubahnya.'
          : 'Lengkapi data untuk membuat akun pengguna baru.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            loading={mutation.isPending}
            leftIcon={isEdit ? <Pencil className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          >
            {isEdit ? 'Simpan Perubahan' : 'Tambah Pengguna'}
          </Button>
        </>
      }
    >
      {serverError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 animate-slide-up dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nama Lengkap"
            placeholder="Budi Santoso"
            required
            error={errorFor('name')}
            {...register('name')}
          />
          <Input
            label="Email"
            type="email"
            placeholder="nama@perusahaan.com"
            required
            error={errorFor('email')}
            {...register('email')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder={isEdit ? 'Kosongkan untuk tidak mengubah' : 'Minimal 8 karakter'}
            required={!isEdit}
            hint={isEdit ? 'Kosongkan bila tidak ingin mengganti password' : 'Minimal 8 karakter, mengandung huruf dan angka'}
            error={errorFor('password')}
            {...register('password')}
          />
          <Select
            label="Peran"
            options={ROLE_OPTIONS}
            required
            error={errorFor('role')}
            {...register('role')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Jabatan"
            placeholder="Frontend Engineer"
            error={errorFor('job_title')}
            {...register('job_title')}
          />
          <Input
            label="Telepon"
            placeholder="081234567890"
            error={errorFor('phone')}
            {...register('phone')}
          />
        </div>

        <Textarea
          label="Bio"
          rows={3}
          placeholder="Ceritakan singkat tentang anggota tim ini..."
          error={errorFor('bio')}
          {...register('bio')}
        />

        {isEdit && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
            <Switch
              label="Akun aktif"
              checked={isActive}
              onChange={(value) => setValue('is_active', value, { shouldDirty: true })}
            />
            <p className="mt-1.5 pl-11 text-xs text-slate-500 dark:text-slate-400">
              Nonaktifkan akun agar pengguna tidak dapat masuk ke sistem.
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}

export default UserFormModal;
