import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Card } from '../ui/Card';

/**
 * KPI card for the dashboard.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendLabel,
  color = '#4f46e5',
  className,
  onClick,
}) {
  const TrendIcon = trend >= 0 ? TrendingUp : TrendingDown;

  return (
    <Card
      hover={Boolean(onClick)}
      onClick={onClick}
      className={cn('relative overflow-hidden p-5', className)}
    >
      <div
        className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.08]"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
            {value}
          </p>
        </div>

        {Icon && (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}18`, color }}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>

      {trend !== undefined && trend !== null && (
        <div className="mt-3 flex items-center gap-1.5 text-[11px]">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-semibold',
              trend >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            )}
          >
            <TrendIcon className="h-3.5 w-3.5" />
            {Math.abs(trend)}%
          </span>
          {trendLabel && <span className="text-slate-500 dark:text-slate-400">{trendLabel}</span>}
        </div>
      )}
    </Card>
  );
}

/**
 * Page-level heading with an optional action slot.
 */
export function PageHeader({ title, description, action, children, className }) {
  return (
    <div className={cn('mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        )}
        {children}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
