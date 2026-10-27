import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, UserPlus, Mail, Lock, User, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const registerSchema = z
  .object({
    name: z.string().min(1, 'Nama wajib diisi').min(3, 'Nama minimal 3 karakter'),
    email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
    password: z
      .string()
      .min(8, 'Password minimal 8 karakter')
      .regex(/[A-Za-z]/, 'Password harus mengandung huruf')
      .regex(/\d/, 'Password harus mengandung angka'),
    confirmPassword: z.string().min(1, 'Konfirmasi password wajib diisi'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Konfirmasi password tidak cocok',
    path: ['confirmPassword'],
  });

/**
 * Registration page.
 */
export default function Register() {
  const navigate = useNavigate();
  const registerUser = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (values) => {
    setServerError('');
    setFieldErrors({});
    try {
      await registerUser({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error));
      setFieldErrors(getFieldErrors(error) || {});
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Buat akun baru
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Bergabung dan mulai kelola proyek bersama tim Anda.
        </p>
      </div>

      {serverError && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 animate-slide-up dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label="Nama Lengkap"
          placeholder="Budi Santoso"
          autoComplete="name"
          icon={<User className="h-4 w-4" />}
          error={errors.name?.message || fieldErrors.name?.[0]}
          {...register('name')}
        />

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="nama@perusahaan.com"
          icon={<Mail className="h-4 w-4" />}
          error={errors.email?.message || fieldErrors.email?.[0]}
          {...register('email')}
        />

        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Minimal 8 karakter"
            icon={<Lock className="h-4 w-4" />}
            error={errors.password?.message || fieldErrors.password?.[0]}
            hint="Minimal 8 karakter, mengandung huruf dan angka"
            className="pr-10"
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-3 top-[30px] text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
            aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <Input
          label="Konfirmasi Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Ulangi password"
          icon={<Lock className="h-4 w-4" />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button
          type="submit"
          size="lg"
          loading={isLoading}
          leftIcon={<UserPlus className="h-4 w-4" />}
          className="w-full"
        >
          Daftar Sekarang
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Sudah punya akun?{' '}
        <Link
          to="/login"
          className="font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
        >
          Masuk di sini
        </Link>
      </p>
    </div>
  );
}
