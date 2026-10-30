import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, LogIn, Mail, Lock, AlertCircle, Copy, Check, KeyRound } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import { authApi } from '../../api/auth.api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { RoleBadge } from '../../components/shared/Badges';
import { cn } from '../../utils/cn';

const loginSchema = z.object({
  email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

const DEFAULT_PASSWORD = 'Password123!';

// Fallback accounts matching the current database
const FALLBACK_ACCOUNTS = [
  { id: 1, name: 'Administrator', email: 'admin@pm.test', role: 'admin', job_title: 'System Administrator' },
  { id: 2, name: 'Budi Santoso', email: 'budi@pm.test', role: 'manager', job_title: 'Head of IT' },
  { id: 3, name: 'Siti Rahayu', email: 'siti@pm.test', role: 'manager', job_title: 'HR Manager' },
  { id: 4, name: 'Andi Pratama', email: 'andi@pm.test', role: 'member', job_title: 'Frontend Developer' },
  { id: 5, name: 'Dewi Lestari', email: 'dewi@pm.test', role: 'member', job_title: 'Backend Developer' },
  { id: 6, name: 'Rizky Maulana', email: 'rizky@pm.test', role: 'member', job_title: 'UI/UX Designer' },
  { id: 7, name: 'Maya Sari', email: 'maya@pm.test', role: 'member', job_title: 'QA Engineer' },
  { id: 8, name: 'Fajar Nugroho', email: 'fajar@pm.test', role: 'member', job_title: 'DevOps Engineer' },
];

/**
 * Login page with complete database user accounts & password information.
 */
export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [demoAccounts, setDemoAccounts] = useState(FALLBACK_ACCOUNTS);
  const [defaultPassword, setDefaultPassword] = useState(DEFAULT_PASSWORD);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all');
  const [activeAccountEmail, setActiveAccountEmail] = useState('');
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    let isMounted = true;
    authApi
      .getDemoAccounts()
      .then((data) => {
        if (!isMounted || !data) return;
        if (Array.isArray(data.accounts) && data.accounts.length > 0) {
          setDemoAccounts(data.accounts);
        }
        if (data.defaultPassword) {
          setDefaultPassword(data.defaultPassword);
        }
      })
      .catch(() => {
        // Silently use predefined fallback accounts
      });
    return () => {
      isMounted = false;
    };
  }, []);

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
    setValue('password', defaultPassword, { shouldValidate: true });
    setActiveAccountEmail(account.email);
    setServerError('');
  };

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(defaultPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed fallback
    }
  };

  const filteredAccounts = demoAccounts.filter((account) => {
    if (selectedRoleFilter === 'all') return true;
    return account.role === selectedRoleFilter;
  });

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

      {/* Demo Accounts & Credentials Section */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <KeyRound className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <span>Akun Login & Kredensial DB</span>
          </div>
          <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {demoAccounts.length} Akun
          </span>
        </div>

        {/* Password Info Box */}
        <div className="mb-3 flex items-center justify-between rounded-lg border border-brand-200/80 bg-brand-50/80 px-3 py-2 text-xs text-brand-900 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-200">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 shrink-0 text-brand-600 dark:text-brand-400" />
            <span>Password DB:</span>
            <code className="rounded bg-brand-100/80 px-1.5 py-0.5 font-mono font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
              {defaultPassword}
            </code>
          </div>
          <button
            type="button"
            onClick={handleCopyPassword}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-brand-700 transition hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-500/20"
            title="Salin password ke clipboard"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400">Disalin!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Salin</span>
              </>
            )}
          </button>
        </div>

        {/* Role Filters */}
        <div className="mb-2.5 flex items-center gap-1 border-b border-slate-200/80 pb-2 dark:border-slate-800">
          {[
            { id: 'all', label: 'Semua', count: demoAccounts.length },
            { id: 'admin', label: 'Admin', count: demoAccounts.filter((a) => a.role === 'admin').length },
            { id: 'manager', label: 'Manajer', count: demoAccounts.filter((a) => a.role === 'manager').length },
            { id: 'member', label: 'Anggota', count: demoAccounts.filter((a) => a.role === 'member').length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedRoleFilter(tab.id)}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                selectedRoleFilter === tab.id
                  ? 'bg-white font-semibold text-brand-600 shadow-sm dark:bg-slate-800 dark:text-brand-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              )}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] opacity-75">({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Account List */}
        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5 scrollbar-thin">
          {filteredAccounts.map((account) => {
            const isSelected = activeAccountEmail === account.email;
            return (
              <button
                key={account.email}
                type="button"
                onClick={() => useDemoAccount(account)}
                className={cn(
                  'group flex w-full items-center justify-between gap-2.5 rounded-lg border p-2 text-left transition-all',
                  isSelected
                    ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30 dark:border-brand-500/50 dark:bg-brand-950/20'
                    : 'border-transparent bg-white/70 hover:border-slate-300 hover:bg-white dark:bg-slate-800/60 dark:hover:border-slate-700 dark:hover:bg-slate-800'
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-[11px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {account.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                        {account.name}
                      </span>
                      {account.job_title && (
                        <span className="hidden truncate text-[10px] text-slate-400 sm:inline-block dark:text-slate-500">
                          • {account.job_title}
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {account.email}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <RoleBadge role={account.role} size="sm" />
                  <span className="text-[10px] font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-brand-400">
                    Pilih
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
          Klik akun mana saja untuk mengisi email & password secara otomatis.
        </p>
      </div>
    </div>
  );
}
