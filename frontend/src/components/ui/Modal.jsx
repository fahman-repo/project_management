import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { IconButton } from './Button';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
};

/**
 * Centre-screen modal dialog.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  closeOnOverlay = true,
}) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm animate-fade-in dark:bg-slate-950/70"
      onMouseDown={(event) => {
        if (closeOnOverlay && event.target === overlayRef.current) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'w-full rounded-2xl border border-slate-200 bg-white shadow-dropdown animate-scale-in dark:border-slate-800 dark:bg-slate-900',
          SIZES[size],
          className
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
              )}
              {description && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
              )}
            </div>
            <IconButton label="Tutup" size="icon-sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        )}

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Right-hand slide-over drawer.
 */
export function Drawer({ open, onClose, title, description, children, footer, width = 'max-w-xl' }) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm animate-fade-in dark:bg-slate-950/70">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-dropdown animate-slide-in-right dark:border-slate-800 dark:bg-slate-900',
          width
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
            )}
          </div>
          <IconButton label="Tutup" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
