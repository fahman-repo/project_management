import { Link } from 'react-router-dom';
import { CalendarDays, MoreVertical, Users, Trash2, Pencil } from 'lucide-react';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';
import { AvatarGroup } from '../ui/Avatar';
import { Dropdown, DropdownItem, DropdownSeparator } from '../ui/Dropdown';
import { StatusBadge, PriorityBadge } from './Badges';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { cn } from '../../utils/cn';
import { PROJECT_STATUS } from '../../utils/constants';

/**
 * Project card used in the projects grid.
 */
export function ProjectCard({ project, onEdit, onDelete, canManage = false }) {
  const statusMeta = PROJECT_STATUS[project.status] || PROJECT_STATUS.planning;

  const members = project.members || [];

  return (
    <Card hover className="group flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: project.color || statusMeta.color }}
            />
            <span className="truncate font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {project.code}
            </span>
          </div>
          <Link
            to={`/projects/${project.id}`}
            className="mt-1.5 block truncate text-base font-semibold text-slate-900 transition-colors hover:text-brand-600 dark:text-white dark:hover:text-brand-400"
          >
            {project.name}
          </Link>
        </div>

        {canManage && (
          <Dropdown
            align="right"
            trigger={
              <button
                type="button"
                aria-label="Aksi project"
                className="rounded-lg p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 focus-ring group-hover:opacity-100 focus:opacity-100 dark:hover:bg-slate-800"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            }
          >
            <DropdownItem icon={Pencil} onClick={() => onEdit?.(project)}>
              Edit Project
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={Trash2} danger onClick={() => onDelete?.(project)}>
              Hapus Project
            </DropdownItem>
          </Dropdown>
        )}
      </div>

      {project.description && (
        <p className="line-clamp-2 px-5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {project.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 px-5">
        <StatusBadge status={project.status} size="sm" />
        <PriorityBadge priority={project.priority} size="sm" />
      </div>

      <div className="mt-4 px-5">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-500 dark:text-slate-400">Progress</span>
          <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
            {project.progress}%
          </span>
        </div>
        <ProgressBar value={project.progress} color={project.color} size="sm" />

        {(Number(project.budget) > 0 || Number(project.actual_cost) > 0) && (
          <div className="mt-2.5 flex items-center justify-between text-[11px]">
            <span className="font-medium text-slate-500 dark:text-slate-400">Realisasi / Budget</span>
            <span
              className={cn(
                'font-semibold tabular-nums',
                Number(project.budget) > 0 && Number(project.actual_cost) > Number(project.budget)
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-700 dark:text-slate-300'
              )}
            >
              {formatCurrency(project.actual_cost || 0)}
              {Number(project.budget) > 0 ? ` / ${formatCurrency(project.budget)}` : ''}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {project.member_count ?? members.length}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(project.end_date, 'dd MMM')}
          </span>
        </div>

        <AvatarGroup users={members.slice(0, 4)} max={3} size="xs" />
      </div>
    </Card>
  );
}
