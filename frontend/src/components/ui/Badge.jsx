import { cn } from '../../utils/cn';

const SIZES = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
};

/**
 * Coloured status / priority pill.
 */
export function Badge({ children, className, color, size = 'md', dot = false, style }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium',
        SIZES[size],
        className
      )}
      style={style}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color || 'currentColor' }}
        />
      )}
      {children}
    </span>
  );
}

/**
 * Neutral badge for counts and metadata.
 */
export function CountBadge({ children, className }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white',
        className
      )}
    >
      {children}
    </span>
  );
}
