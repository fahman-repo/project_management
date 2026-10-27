import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const loginSchema = z.object({
  email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

const DEMO_ACCOUNTS = [
  { role: 'Administrator', email: 'admin@pm.test', password: 'Password123!' },
  { role: 'Manajer', email: 'budi@pm.test', password: 'Password123!' },
  { role: 'Anggota', email: 'andi@pm.test', password: 'Password123!' },
];

/**
 * Login page.
 */
export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values) => {
    setServerError('');
    setFieldErrors({});
    try {
      await login(values);
      const redirect = searchParams.get('redirect');
      navigate(redirect || '/dashboard', { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error));
      setFieldErrors(getFieldErrors(error) || {});
    }
  };

  const useDemoAccount = (account) => {
    setValue('email', account.email, { shouldValidate: true });
    setValue('password', account.password, { shouldValidate: true });
    setServerError('');
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Selamat datang kembali
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Masuk untuk melanjutkan mengelola proyek Anda.
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
            autoComplete="current-password"
            placeholder="Masukkan password"
            icon={<Lock className="h-4 w-4" />}
            error={errors.password?.message || fieldErrors.password?.[0]}
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

        <Button
          type="submit"
          size="lg"
          loading={isLoading}
          leftIcon={<LogIn className="h-4 w-4" />}
          className="w-full"
        >
          Masuk
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Belum punya akun?{' '}
        <Link
          to="/register"
          className="font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
        >
          Daftar sekarang
        </Link>
      </p>

      {/* Demo accounts */}
      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/50">
        <p className="mb-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
          Akun demo - klik untuk isi otomatis
        </p>
        <div className="space-y-1.5">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => useDemoAccount(account)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white dark:hover:bg-slate-800"
            >
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {account.role}
              </span>
              <span className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {account.email}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
