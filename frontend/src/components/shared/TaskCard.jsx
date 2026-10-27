import { forwardRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  MessageSquare,
  Paperclip,
  ListChecks,
  Link2,
  Flag,
  CircleAlert,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { Avatar } from '../ui/Avatar';
import { PriorityBadge } from './Badges';
import { labelApi } from '../../api';
import { formatDate, daysUntil } from '../../utils/formatters';

/**
 * Turn the `label_ids` column of a task row into an array of ids.
 * The list endpoint returns a comma separated string, the detail endpoint an array.
 * @param {any} value
 * @returns {number[]}
 */
export function parseLabelIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((id) => Number(id)).filter(Boolean);
  return String(value)
    .split(',')
    .map((id) => Number(id.trim()))
    .filter(Boolean);
}

/**
 * The compact task card used on the kanban board.
 */
export const TaskCard = forwardRef(function TaskCard(
  { task, onClick, overlay = false, className, ...props },
  ref
) {
  const { data: labelResponse } = useQuery({
    queryKey: ['labels'],
    queryFn: () => labelApi.list(),
    staleTime: 5 * 60 * 1000,
  });

  const labelMap = useMemo(() => {
    const list = Array.isArray(labelResponse) ? labelResponse : labelResponse?.labels ?? [];
    return new Map(list.map((label) => [Number(label.id), label]));
  }, [labelResponse]);

  const labels = parseLabelIds(task.label_ids)
    .map((id) => labelMap.get(id))
    .filter(Boolean);

  const overdue =
    task.due_date && task.status !== 'done' && (daysUntil(task.due_date) ?? 0) < 0;

  const subtaskTotal = Number(task.subtask_count || 0);
  const subtaskDone = Number(task.subtask_done_count || 0);
  const commentCount = Number(task.comment_count || 0);
  const attachmentCount = Number(task.attachment_count || 0);
  const dependencyCount = Number(task.dependency_count || 0);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={cn(
        'w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-card transition-shadow hover:shadow-card-hover dark:border-slate-800 dark:bg-slate-900',
        overlay && 'rotate-2 cursor-grabbing shadow-dropdown',
        className
      )}
      {...props}
    >
      {/* Title */}
      <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-white">
        {task.title}
      </p>

      {/* Milestone flag */}
      {task.is_milestone ? (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
          <Flag className="h-3 w-3" />
          Milestone
        </span>
      ) : null}

      {/* Badges */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} size="sm" />
        {task.status === 'blocked' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <CircleAlert className="h-3 w-3" />
            Terblokir
          </span>
        )}
        {dependencyCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
            title={`${dependencyCount} dependensi`}
          >
            <Link2 className="h-3 w-3" />
            {dependencyCount}
          </span>
        )}
      </div>

      {/* Label dots */}
      {labels.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {labels.slice(0, 5).map((label) => (
            <span
              key={label.id}
              title={label.name}
              className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: label.color }}
            />
          ))}
          {labels.length > 5 && (
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
              +{labels.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Due date */}
      {task.due_date && (
        <div
          className={cn(
            'mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium',
            overdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          <span>{formatDate(task.due_date)}</span>
          {overdue && (
            <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              Terlambat
            </span>
          )}
        </div>
      )}

      {/* Sub-task progress */}
      {subtaskTotal > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <ListChecks className="h-3.5 w-3.5" />
          {subtaskDone}/{subtaskTotal}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
        <div className="flex items-center gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-1" title={`${commentCount} komentar`}>
              <MessageSquare className="h-3.5 w-3.5" />
              {commentCount}
            </span>
          )}
          {attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1" title={`${attachmentCount} lampiran`}>
              <Paperclip className="h-3.5 w-3.5" />
              {attachmentCount}
            </span>
          )}
          {!commentCount && !attachmentCount && (
            <span className="text-slate-400 dark:text-slate-500">Tanpa catatan</span>
          )}
        </div>

        {task.assignee_name ? (
          <Avatar src={task.assignee_avatar} name={task.assignee_name} size="xs" />
        ) : (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-300 text-[10px] text-slate-400 dark:border-slate-700">
            -
          </span>
        )}
      </div>
    </div>
  );
});

export default TaskCard;
