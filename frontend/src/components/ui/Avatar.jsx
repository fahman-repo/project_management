import { cn } from '../../utils/cn';
import { initials } from '../../utils/formatters';

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
  xl: 'h-16 w-16 text-lg',
  '2xl': 'h-24 w-24 text-2xl',
};

const PALETTE = [
  'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
];

/**
 * Deterministic colour so a given user always gets the same palette entry.
 */
function paletteFor(name) {
  const text = String(name || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100000;
  }
  return PALETTE[hash % PALETTE.length];
}

/**
 * User avatar with an image fallback to coloured initials.
 */
export function Avatar({ src, name, size = 'md', className, ring = false, square = false }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold',
        square ? 'rounded-lg' : 'rounded-full',
        SIZES[size],
        !src && paletteFor(name),
        ring && 'ring-2 ring-white dark:ring-slate-900',
        className
      )}
      title={name}
    >
      {src ? (
        <img src={src} alt={name || 'avatar'} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/**
 * Overlapping avatar stack.
 */
export function AvatarGroup({ users = [], max = 4, size = 'sm', className }) {
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;

  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {visible.map((user, index) => (
        <Avatar
          key={user.id || index}
          src={user.avatar}
          name={user.name}
          size={size}
          ring
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600 ring-2 ring-white dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-900',
            SIZES[size]
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
