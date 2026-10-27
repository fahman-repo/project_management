import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

/**
 * Confirmation dialog for destructive actions.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Konfirmasi',
  description,
  confirmLabel = 'Ya, lanjutkan',
  cancelLabel = 'Batal',
  variant = 'danger',
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      closeOnOverlay={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        <div
          className={
            variant === 'danger'
              ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-500/10'
              : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/10'
          }
        >
          <AlertTriangle
            className={
              variant === 'danger'
                ? 'h-5 w-5 text-rose-500'
                : 'h-5 w-5 text-amber-500'
            }
          />
        </div>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          {description && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {description}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
