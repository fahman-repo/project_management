import { Outlet, Link } from 'react-router-dom';
import { Zap, CheckCircle2 } from 'lucide-react';

/**
 * Split-screen layout for the login and register pages.
 */
export function AuthLayout() {
  const highlights = [
    'Pantau progress proyek secara real-time',
    'Kanban board dengan drag & drop',
    'Laporan analitik dan grafik tren',
    'Manajemen anggota tim dan tenggat',
  ];

  return (
    <div className="flex min-h-full bg-white dark:bg-slate-950">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-violet-800 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35) 0, transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.25) 0, transparent 40%)',
          }}
        />

        <Link to="/" className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-base font-bold text-white">ProjectFlow</p>
            <p className="text-xs text-white/70">Project Management System</p>
          </div>
        </Link>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight text-white xl:text-4xl">
            Kelola proyek dan tugas dalam satu tempat
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/80">
            Monitor perkembangan proyek secara langsung, delegasikan tugas ke tim, dan dapatkan
            laporan analitik yang akurat kapan pun Anda butuh.
          </p>

          <ul className="mt-8 space-y-3">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-white/90">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">
          &copy; {new Date().getFullYear()} ProjectFlow. Sistem Manajemen Proyek.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900 dark:text-white">ProjectFlow</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Project Management System</p>
            </div>
          </div>

          <Outlet />
        </div>
      </div>
    </div>
  );
}
