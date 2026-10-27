import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

const VARIANTS = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:ring-brand-500 disabled:bg-brand-600/50',
  secondary:
    'bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-slate-400 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
  danger:
    'bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:ring-rose-500 disabled:bg-rose-600/50',
  success:
    'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-500 disabled:bg-emerald-600/50',
  subtle:
    'bg-brand-50 text-brand-700 hover:bg-brand-100 focus-visible:ring-brand-400 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20',
  outline:
    'border border-brand-200 bg-transparent text-brand-700 hover:bg-brand-50 focus-visible:ring-brand-400 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-500/10',
};

const SIZES = {
  xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-lg',
  sm: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2.5 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
  'icon-sm': 'h-8 w-8 rounded-lg',
};

/**
 * Primary action button.
 */
export const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    className,
    leftIcon,
    rightIcon,
    type = 'button',
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      {children}
      {rightIcon && !loading && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
});

/**
 * Small icon-only button.
 */
export const IconButton = forwardRef(function IconButton(
  { children, label, variant = 'ghost', size = 'icon', className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
