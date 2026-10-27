import { cn } from '../../utils/cn';

/**
 * Table wrapper providing horizontal scroll on small screens.
 */
export function Table({ children, className, containerClassName }) {
  return (
    <div className={cn('w-full overflow-x-auto', containerClassName)}>
      <table className={cn('w-full min-w-full border-collapse text-left text-sm', className)}>
        {children}
      </table>
    </div>
  );
}

/**
 * Table head.
 */
export function THead({ children, className }) {
  return (
    <thead
      className={cn(
        'border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/40',
        className
      )}
    >
      {children}
    </thead>
  );
}

/**
 * Table body.
 */
export function TBody({ children, className }) {
  return <tbody className={cn('divide-y divide-slate-100 dark:divide-slate-800', className)}>{children}</tbody>;
}

/**
 * Table row.
 */
export function TR({ children, className, onClick, ...props }) {
  return (
    <tr
      className={cn(
        'transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </tr>
  );
}

/**
 * Table header cell.
 */
export function TH({ children, className, sortable, sorted, onSort, align = 'left', ...props }) {
  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400',
        alignClass,
        className
      )}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            'inline-flex items-center gap-1 transition-colors hover:text-slate-800 dark:hover:text-slate-200',
            sorted && 'text-brand-600 dark:text-brand-400'
          )}
        >
          {children}
          {sorted && <span aria-hidden="true">{sorted === 'asc' ? '↑' : '↓'}</span>}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

/**
 * Table body cell.
 */
export function TD({ children, className, align = 'left', ...props }) {
  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <td
      className={cn('px-4 py-3 align-middle text-slate-700 dark:text-slate-300', alignClass, className)}
      {...props}
    >
      {children}
    </td>
  );
}
