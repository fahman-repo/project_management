import { Radio, WifiOff } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Live connection indicator.
 */
export function LiveIndicator({ connected = false, className, showLabel = true }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        connected
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
        className
      )}
      title={
        connected
          ? 'Terhubung - perubahan langsung tersinkron antar pengguna'
          : 'Terputus - data dimuat ulang secara berkala'
      }
    >
      {connected ? (
        <Radio className="h-3.5 w-3.5 animate-pulse" />
      ) : (
        <WifiOff className="h-3.5 w-3.5" />
      )}
      {showLabel && <span>{connected ? 'Live' : 'Offline'}</span>}
    </div>
  );
}

/**
 * Small coloured dot used to show a user's online presence.
 */
export function PresenceDot({ online = false, className }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full ring-2 ring-white dark:ring-slate-900',
        online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
        className
      )}
    />
  );
}
