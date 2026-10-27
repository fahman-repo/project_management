import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Check,
  ChevronDown,
  Eye,
  Filter,
  Flag,
  ListTodo,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { taskApi } from '../../api/task.api';
import { projectApi } from '../../api/project.api';
import { userApi, labelApi } from '../../api';
import { getErrorMessage } from '../../api/client';
import { cn } from '../../utils/cn';
import { TASK_STATUS, PRIORITY, lookup } from '../../utils/constants';
import { formatDate, isOverdue, clampPercent } from '../../utils/formatters';
import { PageHeader } from '../../components/shared/StatCard';
import { TaskStatusBadge, PriorityBadge } from '../../components/shared/Badges';
import { TaskFormModal } from '../../components/shared/TaskFormModal';
import { TaskDetailDrawer } from '../../components/shared/TaskDetailDrawer';
import { Button, IconButton } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Checkbox, Select, Switch, Input } from '../../components/ui/Input';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/Table';
import { Pagination } from '../../components/ui/Pagination';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Avatar } from '../../components/ui/Avatar';
import {
  Dropdown,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
} from '../../components/ui/Dropdown';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  EmptyState,
  ErrorState,
  NoResultsState,
  TableSkeleton,
} from '../../components/ui/Feedback';
import { parseLabelIds } from '../../components/shared/TaskCard';

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Terakhir dibuat' },
  { value: 'updated_at', label: 'Terakhir diperbarui' },
  { value: 'title', label: 'Judul (A-Z)' },
  { value: 'due_date', label: 'Tanggal jatuh tempo' },
  { value: 'priority', label: 'Prioritas' },
  { value: 'status', label: 'Status' },
  { value: 'progress', label: 'Progress' },
];

const PER_PAGE_OPTIONS = [
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
];

const DEFAULT_FILTERS = {
  search: '',
  projectId: '',
  assigneeId: '',
  statuses: [],
  priority: '',
  overdue: false,
  sort: 'created_at',
  direction: 'desc',
  perPage: 10,
};

/**
 * Task list page: server-side filtering, sorting, pagination and bulk actions.
 */
export default function Tasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    search: searchParams.get('search') || '',
  }));
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [selectedIds, setSelectedIds] = useState([]);
  const [detailTaskId, setDetailTaskId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkAssignee, setBulkAssignee] = useState('');

  // --- Seed the search filter from `?search=` (topbar global search) ------
  useEffect(() => {
    const value = searchParams.get('search');
    if (value) {
      setFilters((current) => ({ ...current, search: value }));
      setSearchInput(value);
    }
  }, [searchParams]);

  // Debounce the search input so we do not hammer the API on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) =>
        current.search === searchInput ? current : { ...current, search: searchInput }
      );
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Keep the URL in sync so the view can be shared / bookmarked.
  // A functional update is used so the `task` deep-link param survives.
  useEffect(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (filters.search) {
          next.set('search', filters.search);
        } else {
          next.delete('search');
        }
        return next;
      },
      { replace: true }
    );
  }, [filters.search, setSearchParams]);

  // --- Deep link: /tasks?task=42 opens the detail drawer ------------------
  useEffect(() => {
    const value = searchParams.get('task');
    if (!value) return;

    const parsed = Number(value);
    setDetailTaskId(Number.isFinite(parsed) && parsed > 0 ? parsed : value);
  }, [searchParams]);

  // Clear the deep-link param once the drawer is closed.
  const closeDetail = useCallback(() => {
    setDetailTaskId(null);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('task');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  // --- Reference data ------------------------------------------------------
  const { data: projectResponse } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => projectApi.list({ perPage: 100, sort: 'name', direction: 'asc' }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: userResponse } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => userApi.active(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: labelResponse } = useQuery({
    queryKey: ['labels'],
    queryFn: () => labelApi.list(),
    staleTime: 5 * 60 * 1000,
  });

  const projects = projectResponse?.data ?? [];
  const users = Array.isArray(userResponse) ? userResponse : userResponse?.users ?? [];
  const labels = Array.isArray(labelResponse) ? labelResponse : labelResponse?.labels ?? [];

  const labelMap = useMemo(
    () => new Map(labels.map((label) => [Number(label.id), label])),
    [labels]
  );

  // --- Task list query -----------------------------------------------------
  const listParams = useMemo(
    () => ({
      page,
      perPage: filters.perPage,
      project_id: filters.projectId || undefined,
      assignee_id: filters.assigneeId || undefined,
      status: filters.statuses.length ? filters.statuses.join(',') : undefined,
      priority: filters.priority || undefined,
      search: filters.search || undefined,
      overdue: filters.overdue ? true : undefined,
      sort: filters.sort,
      direction: filters.direction,
    }),
    [page, filters]
  );

  const {
    data: listData,
    isLoading,
    isError,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['tasks', 'list', listParams],
    queryFn: () => taskApi.list(listParams),
    placeholderData: (previous) => previous,
  });

  const tasks = listData?.data ?? [];
  const meta = listData?.meta ?? { page: 1, perPage: filters.perPage, total: 0, totalPages: 1 };

  // --- Mutations -----------------------------------------------------------
  const invalidateLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
    queryClient.invalidateQueries({ queryKey: ['task'] });
  }, [queryClient]);

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }) => {
      await Promise.all(ids.map((id) => taskApi.updateStatus(id, status)));
    },
    onSuccess: (_data, { ids, status }) => {
      toast.success(`${ids.length} task diubah ke ${lookup(TASK_STATUS, status).label}`);
      setSelectedIds([]);
      invalidateLists();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ ids, assigneeId }) => {
      await Promise.all(ids.map((id) => taskApi.assign(id, assigneeId ? Number(assigneeId) : null)));
    },
    onSuccess: (_data, { ids, assigneeId }) => {
      const name = users.find((user) => String(user.id) === String(assigneeId))?.name;
      toast.success(
        assigneeId
          ? `${ids.length} task ditugaskan ke ${name}`
          : `${ids.length} task Assignment dihapus`
      );
      setSelectedIds([]);
      invalidateLists();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => {
      await Promise.all(ids.map((id) => taskApi.remove(id)));
    },
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} task dihapus`);
      setSelectedIds([]);
      setConfirmBulkDelete(false);
      invalidateLists();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      setConfirmBulkDelete(false);
    },
  });

  const singleDeleteMutation = useMutation({
    mutationFn: (id) => taskApi.remove(id),
    onSuccess: () => {
      toast.success('Task dihapus');
      invalidateLists();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // --- Selection -----------------------------------------------------------
  const allSelected = tasks.length > 0 && tasks.every((task) => selectedIds.includes(task.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !tasks.some((task) => task.id === id)));
    } else {
      setSelectedIds((current) => [
        ...new Set([...current, ...tasks.map((task) => task.id)]),
      ]);
    }
  };

  const toggleOne = (id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  // --- Filters -------------------------------------------------------------
  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const toggleStatus = (status) => {
    setFilters((current) => ({
      ...current,
      statuses: current.statuses.includes(status)
        ? current.statuses.filter((item) => item !== status)
        : [...current.statuses, status],
    }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setSearchInput('');
    setPage(1);
  };

  const hasFilters =
    Boolean(filters.search) ||
    Boolean(filters.projectId) ||
    Boolean(filters.assigneeId) ||
    filters.statuses.length > 0 ||
    Boolean(filters.priority) ||
    filters.overdue;

  const projectOptions = projects.map((project) => ({
    value: String(project.id),
    label: `${project.code} - ${project.name}`,
  }));

  const assigneeOptions = users.map((user) => ({
    value: String(user.id),
    label: user.name,
  }));

  const priorityOptions = Object.entries(PRIORITY).map(([value, meta2]) => ({
    value,
    label: meta2.label,
  }));

  const statusOptions = Object.entries(TASK_STATUS).map(([value, meta2]) => ({
    value,
    label: meta2.label,
  }));

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Kelola seluruh task lintas project."
        action={
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditingTask(null);
              setFormOpen(true);
            }}
          >
            Tambah Task
          </Button>
        }
      />

      {/* --- Filter bar --- */}
      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            placeholder="Cari judul atau deskripsi..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            icon={<Search className="h-4 w-4" />}
            aria-label="Cari task"
          />

          <Select
            label="Project"
            placeholder="Semua project"
            options={projectOptions}
            value={filters.projectId}
            onChange={(event) => updateFilter('projectId', event.target.value)}
          />

          <Select
            label="Assignee"
            placeholder="Semua assignee"
            options={assigneeOptions}
            value={filters.assigneeId}
            onChange={(event) => updateFilter('assigneeId', event.target.value)}
          />

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">Status</p>
            <Dropdown
              align="left"
              width="w-60"
              trigger={
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 transition-colors hover:border-slate-300 focus-ring dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200"
                >
                  <span className="truncate">
                    {filters.statuses.length
                      ? `${filters.statuses.length} status dipilih`
                      : 'Semua status'}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              }
            >
              <DropdownLabel>Pilih status</DropdownLabel>
              {Object.entries(TASK_STATUS).map(([value, meta2]) => (
                <DropdownItem key={value} onClick={() => toggleStatus(value)}>
                  <span className="flex w-full items-center gap-2">
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border',
                        filters.statuses.includes(value)
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      )}
                    >
                      {filters.statuses.includes(value) && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 truncate">{meta2.label}</span>
                  </span>
                </DropdownItem>
              ))}
            </Dropdown>
          </div>

          <Select
            label="Prioritas"
            placeholder="Semua prioritas"
            options={priorityOptions}
            value={filters.priority}
            onChange={(event) => updateFilter('priority', event.target.value)}
          />

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">Urutkan</p>
            <div className="flex gap-2">
              <Select
                containerClassName="flex-1"
                options={SORT_OPTIONS}
                value={filters.sort}
                onChange={(event) => updateFilter('sort', event.target.value)}
                aria-label="Urutkan berdasarkan"
              />
              <Select
                containerClassName="w-32"
                options={[
                  { value: 'desc', label: 'Turun' },
                  { value: 'asc', label: 'Naik' },
                ]}
                value={filters.direction}
                onChange={(event) => updateFilter('direction', event.target.value)}
                aria-label="Arah pengurutan"
              />
            </div>
          </div>

          <div className="flex items-end gap-4">
            <Switch
              label="Hanya terlambat"
              checked={filters.overdue}
              onChange={(checked) => updateFilter('overdue', checked)}
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" leftIcon={<X className="h-4 w-4" />} onClick={resetFilters}>
                Reset
              </Button>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              Data per halaman
            </p>
            <Select
              options={PER_PAGE_OPTIONS}
              value={String(filters.perPage)}
              onChange={(event) => updateFilter('perPage', Number(event.target.value))}
              aria-label="Jumlah data per halaman"
            />
          </div>
        </div>
      </Card>

      {/* --- Bulk action bar --- */}
      {selectedIds.length > 0 && (
        <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 shadow-sm dark:border-brand-500/30 dark:bg-brand-500/10">
          <span className="text-sm font-semibold text-brand-800 dark:text-brand-200">
            {selectedIds.length} task dipilih
          </span>

          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Select
              containerClassName="w-44"
              placeholder="Ubah status..."
              options={statusOptions}
              value={bulkStatus}
              onChange={(event) => {
                const status = event.target.value;
                setBulkStatus(status);
                if (status) {
                  bulkStatusMutation.mutate({ ids: selectedIds, status });
                }
              }}
              aria-label="Ubah status"
            />

            <Select
              containerClassName="w-48"
              placeholder="Assign ke..."
              options={assigneeOptions}
              value={bulkAssignee}
              onChange={(event) => {
                const assigneeId = event.target.value;
                setBulkAssignee(assigneeId);
                bulkAssignMutation.mutate({ ids: selectedIds, assigneeId });
              }}
              aria-label="Assign task"
            />

            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => setConfirmBulkDelete(true)}
            >
              Hapus
            </Button>
          </div>

          <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
            Batal pilih
          </Button>
        </div>
      )}

      {/* --- Table --- */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : isError ? (
          <ErrorState description={getErrorMessage(error)} onRetry={() => queryClient.invalidateQueries()} />
        ) : tasks.length === 0 ? (
          hasFilters ? (
            <NoResultsState onReset={resetFilters} />
          ) : (
            <EmptyState
              icon={ListTodo}
              title="Belum ada task"
              description="Buat task pertama Anda untuk mulai mengelola pekerjaan."
              action={
                <Button
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    setEditingTask(null);
                    setFormOpen(true);
                  }}
                >
                  Tambah Task
                </Button>
              }
            />
          )
        ) : (
          <>
            <Table className="min-w-[1100px]">
              <THead>
                <TR>
                  <TH className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Pilih semua task"
                    />
                  </TH>
                  <TH>Judul</TH>
                  <TH>Status</TH>
                  <TH>Prioritas</TH>
                  <TH>Assignee</TH>
                  <TH>Due Date</TH>
                  <TH>Label</TH>
                  <TH className="w-32">Progress</TH>
                  <TH className="w-12" />
                </TR>
              </THead>

              <TBody>
                {tasks.map((task) => {
                  const taskLabels = parseLabelIds(task.label_ids)
                    .map((id) => labelMap.get(id))
                    .filter(Boolean);
                  const overdue = isOverdue(task);
                  const isSelected = selectedIds.includes(task.id);

                  return (
                    <TR
                      key={task.id}
                      onClick={() => setDetailTaskId(task.id)}
                      className={isSelected ? 'bg-brand-50/60 dark:bg-brand-500/10' : undefined}
                    >
                      <TD onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleOne(task.id)}
                          aria-label={`Pilih ${task.title}`}
                        />
                      </TD>

                      <TD className="max-w-[22rem]">
                        <div className="flex items-start gap-2.5">
                          <span
                            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: task.project_color || '#94a3b8' }}
                            title={task.project_name}
                          />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate font-medium text-slate-900 dark:text-white">
                              {task.is_milestone ? (
                                <Flag className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                              ) : null}
                              {task.parent_id ? (
                                <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  Sub
                                </span>
                              ) : null}
                              <span className="truncate">{task.title}</span>
                            </p>
                            <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {task.project_code}
                            </p>
                          </div>
                        </div>
                      </TD>

                      <TD>
                        <TaskStatusBadge status={task.status} size="sm" />
                      </TD>

                      <TD>
                        <PriorityBadge priority={task.priority} size="sm" />
                      </TD>

                      <TD>
                        {task.assignee_name ? (
                          <div className="flex items-center gap-2">
                            <Avatar src={task.assignee_avatar} name={task.assignee_name} size="xs" />
                            <span className="max-w-[9rem] truncate text-xs">
                              {task.assignee_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                        )}
                      </TD>

                      <TD>
                        <span
                          className={cn(
                            'whitespace-nowrap text-xs',
                            overdue
                              ? 'font-semibold text-rose-600 dark:text-rose-400'
                              : 'text-slate-600 dark:text-slate-300'
                          )}
                        >
                          {formatDate(task.due_date)}
                        </span>
                        {overdue && (
                          <span className="ml-1.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                            Terlambat
                          </span>
                        )}
                      </TD>

                      <TD>
                        {taskLabels.length === 0 ? (
                          <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            {taskLabels.slice(0, 4).map((label) => (
                              <span
                                key={label.id}
                                title={label.name}
                                className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10"
                                style={{ backgroundColor: label.color }}
                              />
                            ))}
                            {taskLabels.length > 4 && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                +{taskLabels.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </TD>

                      <TD>
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={clampPercent(task.progress)}
                            size="xs"
                            className="w-20"
                          />
                          <span className="w-8 text-right text-[11px] font-medium tabular-nums text-slate-600 dark:text-slate-300">
                            {clampPercent(task.progress)}%
                          </span>
                        </div>
                      </TD>

                      <TD onClick={(event) => event.stopPropagation()}>
                        <Dropdown
                          align="right"
                          trigger={
                            <IconButton label="Aksi task" size="icon-sm">
                              <MoreVertical className="h-4 w-4" />
                            </IconButton>
                          }
                        >
                          <DropdownItem
                            icon={Eye}
                            onClick={() => setDetailTaskId(task.id)}
                          >
                            Detail
                          </DropdownItem>
                          <DropdownItem
                            icon={Pencil}
                            onClick={() => {
                              setEditingTask(task);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </DropdownItem>
                          <DropdownSeparator />
                          <DropdownItem
                            icon={Trash2}
                            danger
                            onClick={() => singleDeleteMutation.mutate(task.id)}
                          >
                            Hapus
                          </DropdownItem>
                        </Dropdown>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              <Pagination
                page={meta.page}
                perPage={meta.perPage}
                total={meta.total}
                totalPages={meta.totalPages}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </Card>

      {isFetching && !isLoading && (
        <p className="mt-2 text-right text-[11px] text-slate-400 dark:text-slate-500">
          Memuat data terbaru...
        </p>
      )}

      {/* --- Modals --- */}
      <TaskFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        projectId={filters.projectId || null}
        onSaved={invalidateLists}
      />

      <TaskDetailDrawer
        open={Boolean(detailTaskId)}
        taskId={detailTaskId}
        onClose={closeDetail}
        onEdit={(task) => {
          setEditingTask(task);
          setFormOpen(true);
        }}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => bulkDeleteMutation.mutate(selectedIds)}
        loading={bulkDeleteMutation.isPending}
        title={`Hapus ${selectedIds.length} task?`}
        description="Seluruh task yang dipilih akan dihapus permanen. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Ya, hapus"
      />
    </div>
  );
}
