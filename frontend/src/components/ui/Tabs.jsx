import { cn } from '../../utils/cn';

/**
 * Tab bar.
 */
export function Tabs({ tabs, value, onChange, className, variant = 'underline' }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 overflow-x-auto no-scrollbar',
        variant === 'underline' && 'border-b border-slate-200 dark:border-slate-800',
        className
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const key = tab.key ?? tab.value;
        const isActive = key === value;

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange?.(key)}
            className={cn(
              'relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors focus-ring',
              variant === 'underline'
                ? cn(
                    '-mb-px border-b-2',
                    isActive
                      ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  )
                : cn(
                    'rounded-lg',
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                  )
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count !== null && (
              <span
                className={cn(
                  'ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Segmented control for switching between two or more views.
 */
export function SegmentedControl({ options, value, onChange, className }) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-900',
        className
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange?.(option.value)}
            aria-pressed={isActive}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-ring',
              isActive
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
