import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { lookup, PROJECT_STATUS, TASK_STATUS, PRIORITY, ROLES, MILESTONE_STATUS } from '../../utils/constants';

/**
 * Project status pill.
 */
export function StatusBadge({ status, size = 'md', className }) {
  const meta = lookup(PROJECT_STATUS, status);
  return (
    <Badge className={cn(meta.bg, className)} color={meta.color} dot size={size}>
      {meta.label}
    </Badge>
  );
}

/**
 * Task status pill.
 */
export function TaskStatusBadge({ status, label, color, size = 'md', className }) {
  if (label) {
    return (
      <Badge className={cn('bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', className)} color={color || '#64748b'} dot size={size}>
        {label}
      </Badge>
    );
  }
  const meta = lookup(TASK_STATUS, status);
  return (
    <Badge className={cn(meta.bg, className)} color={meta.color || '#64748b'} dot size={size}>
      {meta.label || status}
    </Badge>
  );
}

/**
 * Priority pill.
 */
export function PriorityBadge({ priority, size = 'md', className }) {
  const meta = lookup(PRIORITY, priority);
  return (
    <Badge className={cn(meta.bg, className)} color={meta.color} size={size}>
      {meta.label}
    </Badge>
  );
}

/**
 * Role pill.
 */
export function RoleBadge({ role, size = 'md', className }) {
  const meta = lookup(ROLES, role);
  return (
    <Badge className={cn(meta.bg, className)} size={size}>
      {meta.label}
    </Badge>
  );
}

/**
 * Milestone status pill.
 */
export function MilestoneBadge({ status, size = 'md', className }) {
  const meta = lookup(MILESTONE_STATUS, status);
  return (
    <Badge className={cn(meta.bg, className)} color={meta.color} dot size={size}>
      {meta.label}
    </Badge>
  );
}
