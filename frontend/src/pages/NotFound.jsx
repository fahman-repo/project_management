import { useNavigate } from 'react-router-dom';
import { FolderKanban, LayoutDashboard, SearchX, Zap } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';

/**
 * 404 page shown for unknown routes.
 */
export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <Card className="w-full max-w-lg overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-500 via-violet-500 to-brand-400" />

        <CardBody className="px-6 py-10 text-center sm:px-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-500/10">
            <SearchX className="h-6 w-6 text-brand-600 dark:text-brand-400" />
          </div>

          <p className="mt-6 bg-gradient-to-r from-brand-600 to-violet-600 bg-clip-text text-6xl font-black tracking-tight text-transparent dark:from-brand-400 dark:to-violet-400">
            404
          </p>

          <h1 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
            Halaman tidak ditemukan
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Maaf, halaman yang Anda cari tidak ada atau sudah dipindahkan. Periksa kembali tautan
            Anda atau kembali ke beranda.
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              leftIcon={<LayoutDashboard className="h-4 w-4" />}
              onClick={() => navigate('/dashboard')}
            >
              Kembali ke Dashboard
            </Button>
            <Button
              variant="secondary"
              leftIcon={<FolderKanban className="h-4 w-4" />}
              onClick={() => navigate('/projects')}
            >
              Ke Projects
            </Button>
          </div>

          <div className="mt-8 flex items-center justify-center gap-2 border-t border-slate-100 pt-5 text-xs text-slate-400 dark:border-slate-800">
            <Zap className="h-3.5 w-3.5 text-brand-500" />
            <span>ProjectFlow - Project Management System</span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
