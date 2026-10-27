import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

/**
 * Build the page-number list with ellipsis placeholders.
 * @param {number} current
 * @param {number} total
 * @returns {(number|'...')[]}
 */
function buildPageList(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);
  if (current - 2 > 1) pages.add(current - 2);
  if (current + 2 < total) pages.add(current + 2);

  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];

  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) result.push('...');
    result.push(page);
    previous = page;
  }

  return result;
}

/**
 * Server-side pagination control.
 */
export function Pagination({ page, perPage, total, totalPages, onPageChange, className }) {
  if (!total || total === 0) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const pages = buildPageList(page, totalPages || 1);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-between gap-3 sm:flex-row',
        className
      )}
    >
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Menampilkan <span className="font-medium text-slate-700 dark:text-slate-300">{from}</span>-
        <span className="font-medium text-slate-700 dark:text-slate-300">{to}</span> dari{' '}
        <span className="font-medium text-slate-700 dark:text-slate-300">{total}</span> data
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {pages.map((entry, index) =>
          entry === '...' ? (
            <span
              key={`gap-${index}`}
              className="flex h-8 w-8 items-center justify-center text-xs text-slate-400"
            >
              ...
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              aria-current={entry === page ? 'page' : undefined}
              className={cn(
                'flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors focus-ring',
                entry === page
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              )}
            >
              {entry}
            </button>
          )
        )}

        <Button
          variant="secondary"
          size="icon-sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
