import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircle,
  KeyRound,
  Laptop,
  Monitor,
  Moon,
  Save,
  ShieldCheck,
  Sun,
  Upload,
} from 'lucide-react';
import { authApi } from '../api/auth.api';
import { getErrorMessage, getFieldErrors } from '../api/client';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Tabs } from '../components/ui/Tabs';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { cn } from '../utils/cn';

const TABS = [
  { key: 'profile', label: 'Profil' },
  { key: 'password', label: 'Password' },
  { key: 'preferences', label: 'Preferensi' },
];

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi').max(120, 'Nama maksimal 120 karakter'),
  job_title: z.string().trim().max(120, 'Jabatan maksimal 120 karakter').optional(),
  phone: z.string().trim().max(30, 'Telepon maksimal 30 karakter').optional(),
  bio: z.string().trim().max(2000, 'Bio maksimal 2000 karakter').optional(),
});

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Password saat ini wajib diisi'),
    new_password: z
      .string()
      .min(8, 'Password minimal 8 karakter')
      .regex(/[A-Za-z]/, 'Password harus mengandung huruf')
      .regex(/\d/, 'Password harus mengandung angka'),
    confirm_password: z.string().min(1, 'Konfirmasi password wajib diisi'),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    message: 'Konfirmasi password tidak cocok',
    path: ['confirm_password'],
  });

const THEME_OPTIONS = [
  {
    value: 'light',
    label: 'Terang',
    description: 'Tampilan 밝u untuk pemakaian siang hari.',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Gelap',
    description: 'Tampilan gelap yang lebih nyaman di mata.',
    icon: Moon,
  },
  {
    value: 'system',
    label: 'Ikuti Sistem',
    description: 'Otomatis mengikuti pengaturan perangkat Anda.',
    icon: Monitor,
  },
];

/**
 * Score a password from 0-4 to drive the strength indicator.
 * @param {string} value
 * @returns {{score:number, label:string, color:string}}
 */
function passwordStrength(value = '') {
  if (!value) return { score: 0, label: 'Belum diisi', color: '#94a3b8' };

  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  else if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score += 0.5;

  if (score <= 1) return { score: 1, label: 'Lemah', color: '#ef4444' };
  if (score <= 2) return { score: 2, label: 'Sedang', color: '#f59e0b' };
  if (score <= 3) return { score: 3, label: 'Kuat', color: '#3b82f6' };
  return { score: 4, label: 'Sangat kuat', color: '#10b981' };
}

/**
 * Profile settings - personal data, password and appearance preferences.
 */
export default function Profile() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const { theme, setTheme } = useThemeStore();

  const initialTab = TABS.some((tab) => tab.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'profile';
  const [tab, setTab] = useState(initialTab);

  const fileInputRef = useRef(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  const [profileServerError, setProfileServerError] = useState('');
  const [profileFieldErrors, setProfileFieldErrors] = useState({});
  const [passwordServerError, setPasswordServerError] = useState('');
  const [passwordFieldErrors, setPasswordFieldErrors] = useState({});
  const [showPasswords, setShowPasswords] = useState({
    current_password: false,
    new_password: false,
    confirm_password: false,
  });

  // Keep the tab in sync with the ?tab= query parameter.
  useEffect(() => {
    const param = searchParams.get('tab');
    if (param && TABS.some((item) => item.key === param) && param !== tab) {
      setTab(param);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (next) => {
    setTab(next);
    if (next === 'profile') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', next);
    }
    setSearchParams(searchParams, { replace: true });
  };

  const {
    register: registerProfile,
    handleSubmit: submitProfile,
    reset: resetProfile,
    formState: { errors: profileErrors },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      job_title: user?.job_title || '',
      phone: user?.phone || '',
      bio: user?.bio || '',
    },
  });

  const {
    register: registerPassword,
    handleSubmit: submitPassword,
    reset: resetPassword,
    watch: watchPassword,
    formState: { errors: passwordErrors },
  } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
  });

  const newPassword = watchPassword('new_password', '');
  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);

  // Re-seed the profile form when the stored user changes (e.g. after an update).
  useEffect(() => {
    resetProfile({
      name: user?.name || '',
      job_title: user?.job_title || '',
      phone: user?.phone || '',
      bio: user?.bio || '',
    });
  }, [user?.name, user?.job_title, user?.phone, user?.bio, resetProfile]);

  const profileMutation = useMutation({
    mutationFn: (values) =>
      authApi.updateProfile({
        name: values.name.trim(),
        job_title: values.job_title?.trim() || '',
        phone: values.phone?.trim() || '',
        bio: values.bio?.trim() || '',
      }),
    onSuccess: (result) => {
      const updated = result?.user || result;
      if (updated) updateUser(updated);
      toast.success('Profil berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => {
      setProfileServerError(getErrorMessage(error));
      setProfileFieldErrors(getFieldErrors(error) || {});
      toast.error(getErrorMessage(error));
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (values) =>
      authApi.changePassword({
        current_password: values.current_password,
        new_password: values.new_password,
      }),
    onSuccess: () => {
      toast.success('Password berhasil diubah');
      resetPassword({ current_password: '', new_password: '', confirm_password: '' });
    },
    onError: (error) => {
      setPasswordServerError(getErrorMessage(error));
      setPasswordFieldErrors(getFieldErrors(error) || {});
      toast.error(getErrorMessage(error));
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (file) => authApi.uploadAvatar(file),
    onSuccess: (result) => {
      const updated = result?.user || result;
      if (updated) updateUser(updated);
      setAvatarPreview(null);
      toast.success('Foto profil berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => {
      setAvatarPreview(null);
      toast.error(getErrorMessage(error));
    },
  });

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar');
      return;
    }

    setAvatarPreview(URL.createObjectURL(file));
    avatarMutation.mutate(file);
  };

  const onProfileSubmit = (values) => {
    setProfileServerError('');
    setProfileFieldErrors({});
    profileMutation.mutate(values);
  };

  const onPasswordSubmit = (values) => {
    setPasswordServerError('');
    setPasswordFieldErrors({});
    passwordMutation.mutate(values);
  };

  const profileErrorFor = (field) => profileErrors[field]?.message || profileFieldErrors[field]?.[0];
  const passwordErrorFor = (field) => passwordErrors[field]?.message || passwordFieldErrors[field]?.[0];

  const avatarSrc = avatarPreview || user?.avatar;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Profil Saya</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Kelola data akun, keamanan, dan tampilan aplikasi Anda.
        </p>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={handleTabChange} className="mb-5" />

      {/* --- Profil --- */}
      {tab === 'profile' && (
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Foto Profil"
              description="Gunakan foto Anda agar tim lebih mudah mengenali Anda."
            />
            <CardBody className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
              <Avatar src={avatarSrc} name={user?.name} size="2xl" />
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{user?.name}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  {user?.email}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Upload className="h-4 w-4" />}
                    loading={avatarMutation.isPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Ubah foto
                  </Button>
                  {avatarPreview && (
                    <Button variant="ghost" size="sm" onClick={() => setAvatarPreview(null)}>
                      Batalkan pratinjau
                    </Button>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Informasi Pribadi" description="Informasi ini tampil di halaman tim." />
            <CardBody>
              {profileServerError && (
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 animate-slide-up dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{profileServerError}</span>
                </div>
              )}

              <form onSubmit={submitProfile(onProfileSubmit)} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Nama Lengkap"
                    required
                    placeholder="Budi Santoso"
                    error={profileErrorFor('name')}
                    {...registerProfile('name')}
                  />
                  <Input
                    label="Jabatan"
                    placeholder="Frontend Engineer"
                    error={profileErrorFor('job_title')}
                    {...registerProfile('job_title')}
                  />
                </div>

                <Input
                  label="Telepon"
                  placeholder="081234567890"
                  error={profileErrorFor('phone')}
                  {...registerProfile('phone')}
                />

                <Textarea
                  label="Bio"
                  rows={4}
                  placeholder="Ceritakan singkat tentang diri Anda..."
                  error={profileErrorFor('bio')}
                  {...registerProfile('bio')}
                />

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    loading={profileMutation.isPending}
                    leftIcon={<Save className="h-4 w-4" />}
                  >
                    Simpan Profil
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      {/* --- Password --- */}
      {tab === 'password' && (
        <Card>
          <CardHeader
            title="Ubah Password"
            description="Gunakan password yang kuat dan unik untuk melindungi akun Anda."
          />
          <CardBody>
            {passwordServerError && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 animate-slide-up dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{passwordServerError}</span>
              </div>
            )}

            <form onSubmit={submitPassword(onPasswordSubmit)} className="space-y-4" noValidate>
              <Input
                label="Password Saat Ini"
                type={showPasswords.current_password ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="Masukkan password saat ini"
                icon={<KeyRound className="h-4 w-4" />}
                error={passwordErrorFor('current_password')}
                {...registerPassword('current_password')}
              />

              <div>
                <Input
                  label="Password Baru"
                  type={showPasswords.new_password ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  placeholder="Minimal 8 karakter"
                  icon={<ShieldCheck className="h-4 w-4" />}
                  hint="Minimal 8 karakter, mengandung huruf dan angka"
                  error={passwordErrorFor('new_password')}
                  {...registerPassword('new_password')}
                />

                {/* Strength indicator */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">Kekuatan password</span>
                    <span
                      className="font-semibold"
                      style={{ color: strength.color }}
                    >
                      {strength.label}
                    </span>
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    {[1, 2, 3, 4].map((step) => (
                      <span
                        key={step}
                        className={cn(
                          'h-1.5 flex-1 rounded-full transition-colors',
                          strength.score >= step ? '' : 'bg-slate-200 dark:bg-slate-700'
                        )}
                        style={
                          strength.score >= step
                            ? { backgroundColor: strength.color }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              <Input
                label="Konfirmasi Password Baru"
                type={showPasswords.confirm_password ? 'text' : 'password'}
                autoComplete="new-password"
                required
                placeholder="Ulangi password baru"
                icon={<ShieldCheck className="h-4 w-4" />}
                error={passwordErrorFor('confirm_password')}
                {...registerPassword('confirm_password')}
              />

              <div className="flex flex-wrap items-center gap-4">
                {[
                  { key: 'current_password', label: 'Tampilkan password saat ini' },
                  { key: 'new_password', label: 'Tampilkan password baru' },
                  { key: 'confirm_password', label: 'Tampilkan konfirmasi password' },
                ].map((toggle) => (
                  <label
                    key={toggle.key}
                    className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                  >
                    <input
                      type="checkbox"
                      checked={showPasswords[toggle.key]}
                      onChange={(event) =>
                        setShowPasswords((prev) => ({ ...prev, [toggle.key]: event.target.checked }))
                      }
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800"
                    />
                    {toggle.label}
                  </label>
                ))}
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  loading={passwordMutation.isPending}
                  leftIcon={<KeyRound className="h-4 w-4" />}
                >
                  Ubah Password
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* --- Preferensi --- */}
      {tab === 'preferences' && (
        <Card>
          <CardHeader
            title="Preferensi Tampilan"
            description="Pilih tema tampilan yang Anda sukai."
          />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-3">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = theme === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setTheme(option.value);
                      toast.success(`Tema ${option.label.toLowerCase()} diterapkan`);
                    }}
                    aria-pressed={isActive}
                    className={cn(
                      'rounded-xl border p-4 text-left transition-colors focus-ring',
                      isActive
                        ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800/50'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-lg',
                          isActive
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      {isActive && (
                        <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          Aktif
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                      {option.label}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
              <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Pengaturan tema tersimpan otomatis di perangkat ini dan akan langsung diterapkan ke
                seluruh halaman aplikasi.
              </p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
