import { forwardRef, useId } from 'react';
import { cn } from '../../utils/cn';

const FIELD_STYLES =
  'block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900';

const ERROR_STYLES = 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 dark:border-rose-500/60';

/**
 * Text input with label, hint and error message.
 */
export const Input = forwardRef(function Input(
  { label, hint, error, className, containerClassName, icon, id, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
          {props.required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}

      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            FIELD_STYLES,
            icon && 'pl-9',
            error && ERROR_STYLES,
            className
          )}
          aria-invalid={Boolean(error)}
          {...props}
        />
      </div>

      {error ? (
        <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
});

/**
 * Multi-line text input.
 */
export const Textarea = forwardRef(function Textarea(
  { label, hint, error, className, containerClassName, rows = 4, id, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
          {props.required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        className={cn(FIELD_STYLES, 'resize-y', error && ERROR_STYLES, className)}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? (
        <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
});

/**
 * Native select styled to match the inputs.
 */
export const Select = forwardRef(function Select(
  { label, hint, error, className, containerClassName, options = [], placeholder, id, children, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
          {props.required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      <select
        ref={ref}
        id={inputId}
        className={cn(
          FIELD_STYLES,
          'cursor-pointer appearance-none bg-[length:16px] bg-[right_0.65rem_center] bg-no-repeat pr-9',
          error && ERROR_STYLES,
          className
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19 9-7 7-7-7'/%3E%3C/svg%3E\")",
        }}
        aria-invalid={Boolean(error)}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      {error ? (
        <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
});

/**
 * Checkbox with an optional label.
 */
export const Checkbox = forwardRef(function Checkbox(
  { label, className, id, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <label
      htmlFor={inputId}
      className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300', className)}
    >
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-brand-600 transition-colors focus:ring-2 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800"
        {...props}
      />
      {label}
    </label>
  );
});

/**
 * Toggle switch.
 */
export const Switch = forwardRef(function Switch(
  { label, checked, onChange, className, id, disabled },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <label
      htmlFor={inputId}
      className={cn('inline-flex cursor-pointer items-center gap-2.5', className)}
    >
      <button
        ref={ref}
        id={inputId}
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          )}
          style={{ transform: checked ? 'translateX(16px)' : 'translateX(2px)' }}
        />
      </button>
      {label && <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>}
    </label>
  );
});
