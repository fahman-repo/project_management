import { useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';

/**
 * Click-outside aware dropdown menu.
 */
export function Dropdown({ trigger, children, align = 'right', className, width = 'w-56' }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <div onClick={() => setOpen((value) => !value)}>{trigger}</div>

      {open && (
        <div
          className={cn(
            'absolute z-40 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-dropdown animate-scale-in dark:border-slate-800 dark:bg-slate-900',
            width,
            align === 'right' ? 'right-0' : 'left-0',
            className
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * A single item inside a dropdown.
 */
export function DropdownItem({ children, onClick, icon: Icon, danger = false, disabled = false, className }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        danger
          ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
        className
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {children}
    </button>
  );
}

/**
 * Visual separator inside a dropdown.
 */
export function DropdownSeparator() {
  return <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />;
}

/**
 * Small heading inside a dropdown.
 */
export function DropdownLabel({ children }) {
  return (
    <div className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </div>
  );
}
