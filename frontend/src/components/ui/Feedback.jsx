import { cn } from '../../utils/cn';
import { Loader2, AlertCircle, Inbox, SearchX } from 'lucide-react';

/**
 * Loading spinner.
 */
export function Spinner({ size = 'md', className }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };
  return (
    <Loader2
      className={cn('animate-spin text-brand-600 dark:text-brand-400', sizes[size], className)}
      aria-label="Memuat"
    />
  );
}

/**
 * Full-width loading state.
 */
export function LoadingState({ label = 'Memuat data...', className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12', className)}>
      <Spinner size="lg" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

/**
 * Placeholder shown while table data loads.
 */
export function TableSkeleton({ rows = 5, columns = 5 }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <div
              key={colIndex}
              className="skeleton h-8 flex-1"
              style={{ opacity: 1 - rowIndex * 0.12 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state - no data at all.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = 'Belum ada data',
  description,
  action,
  className,
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Empty state for a failed search.
 */
export function NoResultsState({ description = 'Coba ubah kata kunci atau filter Anda.', onReset }) {
  return (
    <EmptyState
      icon={SearchX}
      title="Tidak ada hasil"
      description={description}
      action={
        onReset && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            Reset filter
          </button>
        )
      }
    />
  );
}

/**
 * Error state.
 */
export function ErrorState({ title = 'Gagal memuat data', description, onRetry, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-500/10">
        <AlertCircle className="h-6 w-6 text-rose-500" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-700"
        >
          Coba lagi
        </button>
      )}
    </div>
  );
}
