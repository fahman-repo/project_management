import { cn } from '../../utils/cn';

/**
 * Surface card - the standard container for grouped content.
 */
export function Card({ children, className, hover = false, ...props }) {
  return (
    <div
      className={cn(
        'surface-card',
        hover && 'hover:shadow-card-hover',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Card header with title, description and an action slot.
 */
export function CardHeader({ title, description, action, className, children }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800',
        className
      )}
    >
      <div className="min-w-0">
        {title && (
          <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        )}
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        )}
        {children}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * Card body.
 */
export function CardBody({ children, className, ...props }) {
  return (
    <div className={cn('p-5', className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Card footer.
 */
export function CardFooter({ children, className, ...props }) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-3.5 dark:border-slate-800',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Section title used inside cards and pages.
 */
export function SectionTitle({ children, className, action }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{children}</h3>
      {action}
    </div>
  );
}
