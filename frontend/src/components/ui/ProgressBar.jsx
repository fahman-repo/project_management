import { cn } from '../../utils/cn';
import { clampPercent } from '../../utils/formatters';

const SIZES = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-2.5',
};

/**
 * Determinate progress bar.
 */
export function ProgressBar({
  value = 0,
  color,
  size = 'sm',
  className,
  showLabel = false,
  trackClassName,
}) {
  const percent = clampPercent(value);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800',
          SIZES[size],
          trackClassName
        )}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${percent}%`,
            backgroundColor: color || undefined,
          }}
        />
      </div>
      {showLabel && (
        <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-slate-600 dark:text-slate-400">
          {percent}%
        </span>
      )}
    </div>
  );
}

/**
 * Circular progress indicator.
 */
export function ProgressRing({ value = 0, size = 56, strokeWidth = 5, color = '#4f46e5', label }) {
  const percent = clampPercent(value);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
        {label ?? `${percent}%`}
      </span>
    </div>
  );
}
