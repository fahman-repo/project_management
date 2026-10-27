import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  MessageSquare,
  MoveRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { activityApi } from '../api';
import { projectApi } from '../api/project.api';
import { userApi } from '../api';
import { getErrorMessage } from '../api/client';
import { PageHeader } from '../components/shared/StatCard';
import { Avatar } from '../components/ui/Avatar';
import { Card, CardBody } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { formatDateTime, formatRelative } from '../utils/formatters';
import { cn } from '../utils/cn';

const PER_PAGE = 15;

/**
 * Map an activity action to an icon and a colour.
 * The action name is prefixed with the entity, e.g. `task.created`.
 *
 * @param {string} action
 * @returns {{icon:any, color:string, bg:string}}
 */
function actionMeta(action) {
  const value = String(action || '').toLowerCase();

  if (value.includes('comment')) {
    return { icon: MessageSquare, color: '#0ea5e9', bg: 'bg-sky-50 dark:bg-sky-500/15' };
  }
  if (value.includes('assign')) {
    return { icon: UserCheck, color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-500/15' };
  }
  if (value.includes('delete') || value.includes('remove')) {
    return { icon: Trash2, color: '#ef4444', bg: 'bg-rose-50 dark:bg-rose-500/15' };
  }
  if (value.includes('status') || value.includes('move') || value.includes('moved')) {
    return { icon: MoveRight, color: '#a855f7', bg: 'bg-purple-50 dark:bg-purple-500/15' };
  }
  if (value.includes('update') || value.includes('edited')) {
    return { icon: Pencil, color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-500/15' };
  }
  if (value.includes('create') || value.includes('added')) {
    return { icon: Plus, color: '#4f46e5', bg: 'bg-brand-50 dark:bg-brand-500/15' };
  }
  return { icon: ArrowRight, color: '#64748b', bg: 'bg-slate-100 dark:bg-slate-700/40' };
}

/**
 * Activity log page - a vertical timeline of audit-trail entries.
 */
export default function ActivityLog() {
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  // Reset to the first page whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [userId, projectId, action, from, to, search]);

  const { data: userList } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => userApi.active(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: projectList } = useQuery({
    queryKey: ['projects', 'list', 'options'],
    queryFn: () => projectApi.list({ perPage: 100, sort: 'name', direction: 'asc' }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: actionList } = useQuery({
    queryKey: ['activities', 'actions'],
    queryFn: () => activityApi.actions(),
    staleTime: 10 * 60 * 1000,
  });

  const params = useMemo(
    () => ({
      page,
      perPage: PER_PAGE,
      user_id: userId || undefined,
      project_id: projectId || undefined,
      action: action || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [page, userId, projectId, action, from, to]
  );

  const activityQuery = useQuery({
    queryKey: ['activities', 'list', params],
    queryFn: () => activityApi.list(params),
  });

  const rows = activityQuery.data?.data || [];
  const meta = activityQuery.data?.meta || { page: 1, perPage: PER_PAGE, total: 0, totalPages: 1 };

  // The search box filters the current page client-side.
  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.description, row.user_name, row.project_name, row.task_title, row.action]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    );
  }, [rows, search]);

  const userOptions = (userList?.data || userList || []).map((user) => ({
    value: String(user.id),
    label: user.name,
  }));

  const projectOptions = (projectList?.data || []).map((project) => ({
    value: String(project.id),
    label: `${project.code ? `${project.code} - ` : ''}${project.name}`,
  }));

  const actionOptions = (actionList?.data || actionList || []).map((item) => ({
    value: item,
    label: item,
  }));

  const hasFilters = Boolean(userId || projectId || action || from || to || search);

  const resetFilters = () => {
    setUserId('');
    setProjectId('');
    setAction('');
    setFrom('');
    setTo('');
    setSearch('');
  };

  return (
    <div>
      <PageHeader title="Activity Log" description="Riwayat audit seluruh aktivitas pada workspace" />

      {/* Filters */}
      <Card className="mb-5">
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Input
            label="Cari"
            placeholder="Kata kunci..."
            icon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            label="Pelaku"
            options={userOptions}
            placeholder="Semua pelaku"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          />
          <Select
            label="Aksi"
            options={actionOptions}
            placeholder="Semua aksi"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          />
          <Input
            label="Dari Tanggal"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
          />
          <Input
            label="Sampai Tanggal"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </CardBody>
      </Card>

      {hasFilters && (
        <button
          type="button"
          onClick={resetFilters}
          className="mb-4 text-xs font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
        >
          Reset filter
        </button>
      )}

      <Card>
        <CardBody>
          {activityQuery.isLoading ? (
            <LoadingState label="Memuat riwayat aktivitas..." />
          ) : activityQuery.isError ? (
            <ErrorState
              description={getErrorMessage(activityQuery.error)}
              onRetry={() => activityQuery.refetch()}
            />
          ) : visibleRows.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Tidak ada aktivitas"
              description={
                hasFilters
                  ? 'Tidak ada catatan yang cocok dengan filter Anda.'
                  : 'Belum ada aktivitas yang tercatat.'
              }
            />
          ) : (
            <ol className="relative">
              {/* Vertical connector */}
              <span
                className="absolute bottom-3 left-[19px] top-3 w-px bg-slate-200 dark:bg-slate-800"
                aria-hidden="true"
              />

              {visibleRows.map((activity) => {
                const appearance = actionMeta(activity.action);
                const Icon = appearance.icon;
                const isOpen = expanded === activity.id;

                return (
                  <li key={activity.id} className="relative pb-5 pl-12 last:pb-0">
                    {/* Icon circle */}
                    <span
                      className={cn(
                        'absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900',
                        appearance.bg
                      )}
                      style={{ color: appearance.color }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Avatar src={activity.user_avatar} name={activity.user_name} size="xs" />
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {activity.user_name || 'Pengguna dihapus'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {activity.action}
                        </span>
                        <span
                          className="text-[11px] text-slate-400 dark:text-slate-500"
                          title={formatDateTime(activity.created_at)}
                        >
                          {formatRelative(activity.created_at)}
                        </span>
                      </div>

                      <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                        {activity.description}
                      </p>

                      {(activity.project_name || activity.task_title) && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : activity.id)}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
                        >
                          {isOpen ? 'Sembunyikan detail' : 'Lihat detail'}
                          <ArrowRight
                            className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-90')}
                          />
                        </button>
                      )}

                      {isOpen && (
                        <dl className="mt-2 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2 dark:bg-slate-950/50">
                          <div>
                            <dt className="text-slate-500 dark:text-slate-400">Project</dt>
                            <dd className="mt-0.5 font-medium text-slate-900 dark:text-white">
                              {activity.project_name || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500 dark:text-slate-400">Task</dt>
                            <dd className="mt-0.5 font-medium text-slate-900 dark:text-white">
                              {activity.task_title || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500 dark:text-slate-400">Entitas</dt>
                            <dd className="mt-0.5 font-medium text-slate-900 dark:text-white">
                              {activity.entity_type || '-'}
                              {activity.entity_id ? ` #${activity.entity_id}` : ''}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500 dark:text-slate-400">Waktu</dt>
                            <dd className="mt-0.5 font-medium text-slate-900 dark:text-white">
                              {formatDateTime(activity.created_at)}
                            </dd>
                          </div>
                        </dl>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <Pagination
            className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800"
            page={meta.page}
            perPage={meta.perPage}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
          />
        </CardBody>
      </Card>
    </div>
  );
}
