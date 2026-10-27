import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Flag,
  Pencil,
  Plus,
  Trash2,
  Users,
  Sliders,
  Bookmark,
} from 'lucide-react';
import { ProjectStatusModal } from '../../components/shared/ProjectStatusModal';
import { SaveAsTemplateModal } from '../../components/shared/SaveAsTemplateModal';
import { GanttChartView } from '../../components/shared/GanttChartView';
import { ProjectBudgetTab } from '../../components/shared/ProjectBudgetTab';
import { TaskDetailDrawer } from '../../components/shared/TaskDetailDrawer';
import { milestoneApi } from '../../api';
import { taskApi } from '../../api/task.api';
import projectApi from '../../api/project.api';
import { getErrorMessage } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useProjectSubscription } from '../../hooks/useSocket';
import { ProjectFormModal } from '../../components/shared/ProjectFormModal';
import { MemberManager } from '../../components/shared/MemberManager';
import { StatusBadge, PriorityBadge, TaskStatusBadge, MilestoneBadge } from '../../components/shared/Badges';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import { Avatar } from '../../components/ui/Avatar';
import { ProgressBar, ProgressRing } from '../../components/ui/ProgressBar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, TableSkeleton } from '../../components/ui/Feedback';
import { TASK_STATUS } from '../../utils/constants';
import { cn } from '../../utils/cn';
import { formatDate, formatRelative, daysUntil, formatCurrency } from '../../utils/formatters';

/**
 * Chart tooltip that respects the current theme.
 */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-dropdown dark:border-slate-700 dark:bg-slate-800">
      {label && <p className="mb-1 font-semibold text-slate-900 dark:text-white">{label}</p>}
      {payload.map((entry) => (
        <p
          key={entry.dataKey}
          className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color || entry.payload?.color }}
          />
          <span>
            {entry.name}: {entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * A small KPI tile used in the summary tab.
 */
function StatTile({ label, value, color, icon: Icon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}18`, color }}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Milestone create / edit dialog.
 */
function MilestoneModal({ open, onClose, projectId, milestone, onSaved }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState('');

  const mutation = useMutation({
    mutationFn: (values) => {
      const payload = {
        project_id: Number(projectId),
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        due_date: values.due_date || undefined,
        status: values.status,
        progress: values.progress === '' ? undefined : Number(values.progress),
      };

      return milestone?.id
        ? milestoneApi.update(milestone.id, payload)
        : milestoneApi.create(payload);
    },
    onSuccess: () => {
      toast.success(milestone?.id ? 'Milestone diperbarui' : 'Milestone ditambahkan');
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['milestones'] });
      onSaved?.();
      onClose?.();
    },
    onError: (error) => {
      setServerError(getErrorMessage(error));
      toast.error('Gagal menyimpan milestone');
    },
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    setServerError('');

    const form = new FormData(event.currentTarget);
    const values = {
      name: form.get('name') || '',
      description: form.get('description') || '',
      due_date: form.get('due_date') || '',
      status: form.get('status') || 'planned',
      progress: form.get('progress') ?? '',
    };

    if (!values.name.trim()) {
      setServerError('Nama milestone wajib diisi');
      return;
    }

    mutation.mutate(values);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={milestone?.id ? 'Edit Milestone' : 'Tambah Milestone'}
      description="Tonggak waktu penting dalam project."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button onClick={handleSubmit} loading={mutation.isPending}>
            Simpan
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {serverError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {serverError}
          </div>
        )}

        <Input
          label="Nama Milestone"
          placeholder="Contoh: Pelepasan Versi 1.0"
          defaultValue={milestone?.name ?? ''}
          name="name"
        />

        <Textarea
          label="Deskripsi"
          rows={3}
          placeholder="Rincian singkat milestone"
          defaultValue={milestone?.description ?? ''}
          name="description"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Target Tanggal"
            type="date"
            defaultValue={milestone?.due_date ? String(milestone.due_date).slice(0, 10) : ''}
            name="due_date"
          />

          <Select
            label="Status"
            name="status"
            defaultValue={milestone?.status ?? 'planned'}
            options={[
              { value: 'planned', label: 'Direncanakan' },
              { value: 'in_progress', label: 'Berjalan' },
              { value: 'achieved', label: 'Tercapai' },
              { value: 'missed', label: 'Terlewat' },
            ]}
          />
        </div>

        <Input
          label="Progress (%)"
          type="number"
          name="progress"
          min="0"
          max="100"
          step="5"
          defaultValue={milestone?.progress ?? 0}
        />
      </form>
    </Modal>
  );
}

/**
 * Project detail page with overview, tasks, members, milestones and activity tabs.
 */
export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState(() => searchParams.get('tab') || 'overview');
  const [taskStatusFilter, setTaskStatusFilter] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState(null);
  const [deleteMilestoneTarget, setDeleteMilestoneTarget] = useState(null);
  const [drawerTaskId, setDrawerTaskId] = useState(null);
  const highlightedMilestoneRef = useRef(null);

  // Deep link: /projects/7?tab=milestones&milestone=3
  const highlightedMilestoneId = searchParams.get('milestone');

  // Adopt the tab requested in the URL (e.g. from the calendar deep link).
  useEffect(() => {
    const requested = searchParams.get('tab');
    if (requested && requested !== tab) {
      setTab(requested);
    }
  }, [searchParams, tab]);

  // Keep the active tab in the URL so the view can be shared / bookmarked.
  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (nextTab === 'overview') {
          next.delete('tab');
        } else {
          next.set('tab', nextTab);
        }
        if (nextTab !== 'milestones') {
          next.delete('milestone');
        }
        return next;
      },
      { replace: true }
    );
  };

  // Live updates for this project room.
  useProjectSubscription(id);

  const projectQuery = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectApi.get(id),
    enabled: Boolean(id),
  });

  const overviewQuery = useQuery({
    queryKey: ['project', id, 'overview'],
    queryFn: () => projectApi.overview(id),
    enabled: Boolean(id),
  });

  const tasksQuery = useQuery({
    queryKey: ['project', id, 'tasks'],
    queryFn: () => taskApi.list({ project_id: id, perPage: 100 }),
    enabled: Boolean(id) && tab === 'tasks',
  });

  const milestonesQuery = useQuery({
    queryKey: ['project', id, 'milestones'],
    queryFn: () => projectApi.milestones(id),
    enabled: Boolean(id) && tab === 'milestones',
  });

  const ganttQuery = useQuery({
    queryKey: ['gantt', id],
    queryFn: () => taskApi.gantt(id),
    enabled: Boolean(id) && tab === 'gantt',
  });

  const statusesQuery = useQuery({
    queryKey: ['project-statuses', id],
    queryFn: () => projectApi.statuses(id),
    enabled: Boolean(id),
  });
  const projectStatuses = statusesQuery.data ?? [];

  const project = projectQuery.data?.project ?? projectQuery.data ?? null;
  const manager = projectQuery.data?.project?.manager ?? projectQuery.data?.manager ?? null;
  const members = useMemo(() => projectQuery.data?.members ?? [], [projectQuery.data]);
  const stats = projectQuery.data?.stats ?? {};
  const overview = overviewQuery.data ?? null;

  // The overview endpoint answers with snake_case keys.
  const statusDistribution = useMemo(
    () =>
      (overview?.status_distribution ?? []).map((entry) => ({
        ...entry,
        label: TASK_STATUS[entry.status]?.label ?? entry.status,
        color: TASK_STATUS[entry.status]?.color ?? '#4f46e5',
        count: entry.count ?? entry.total ?? 0,
      })),
    [overview]
  );

  const completionTrend = overview?.weekly_trend ?? [];

  const topAssignees = useMemo(
    () =>
      (overview?.top_assignees ?? []).map((entry) => ({
        ...entry,
        task_count: entry.total_tasks ?? entry.task_count ?? 0,
        completed_count: entry.completed_tasks ?? entry.completed_count ?? 0,
      })),
    [overview]
  );

  const recentActivity = overview?.recent_activity ?? [];

  const isOwner = Boolean(project && Number(project.manager_id) === Number(user?.id));
  const canManage =
    user?.role === 'admin' || user?.role === 'manager' || isOwner;

  const deleteMutation = useMutation({
    mutationFn: () => projectApi.remove(id),
    onSuccess: () => {
      toast.success('Project berhasil dihapus');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate('/projects', { replace: true });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: (milestoneId) => milestoneApi.remove(milestoneId),
    onSuccess: () => {
      toast.success('Milestone dihapus');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['milestones'] });
      setDeleteMilestoneTarget(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Scroll the deep-linked milestone into view once the list has rendered.
  useEffect(() => {
    if (!highlightedMilestoneId || tab !== 'milestones') return;
    if (!milestonesQuery.isLoading && highlightedMilestoneRef.current) {
      highlightedMilestoneRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedMilestoneId, tab, milestonesQuery.isLoading, milestonesQuery.data]);

  // --- Loading / error states ---------------------------------------------
  if (projectQuery.isLoading) {
    return <LoadingState label="Memuat detail project..." />;
  }

  if (projectQuery.isError) {
    const status = projectQuery.error?.response?.status;
    const notFound = status === 404;

    return (
      <div className="mx-auto max-w-xl py-10">
        <Card>
          <EmptyState
            icon={Flag}
            title={notFound ? 'Project tidak ditemukan' : 'Gagal memuat project'}
            description={
              notFound
                ? 'Project yang Anda cari sudah dihapus atau tidak pernah ada.'
                : 'Terjadi masalah saat mengambil data project. Silakan coba lagi.'
            }
            action={
              notFound ? (
                <Button
                  leftIcon={<ArrowLeft className="h-4 w-4" />}
                  onClick={() => navigate('/projects')}
                >
                  Kembali ke daftar project
                </Button>
              ) : (
                <Button onClick={() => projectQuery.refetch()}>Coba lagi</Button>
              )
            }
          />
        </Card>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card>
          <EmptyState
            icon={Flag}
            title="Project tidak ditemukan"
            description="Project yang Anda cari sudah dihapus atau tidak pernah ada."
            action={
              <Link
                to="/projects"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-700"
              >
                <ArrowLeft className="h-4 w-4" />
                Kembali ke daftar project
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  // --- Derived data --------------------------------------------------------
  const taskRows = tasksQuery.data?.data ?? tasksQuery.data ?? [];
  const filteredTasks = taskStatusFilter
    ? taskRows.filter((task) => task.status === taskStatusFilter)
    : taskRows;

  const milestoneRows = milestonesQuery.data ?? [];
  const projectColor = project.color || '#4f46e5';

  return (
    <div>
      {/* Back link */}
      <Link
        to="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke Projects
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <ProgressRing
            value={project.progress}
            size={72}
            strokeWidth={6}
            color={projectColor}
          />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {project.code}
              </span>
              <StatusBadge status={project.status} size="sm" />
              <PriorityBadge priority={project.priority} size="sm" />
            </div>

            <h1 className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {project.name}
            </h1>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              {manager && (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar src={manager.avatar} name={manager.name} size="xs" />
                  {manager.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {stats.member_count ?? members.length} anggota
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDate(project.start_date)} - {formatDate(project.end_date)}
              </span>
            </div>
          </div>
        </div>

        {canManage && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Sliders className="h-4 w-4" />}
              onClick={() => setStatusModalOpen(true)}
            >
              Atur Workflow
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Bookmark className="h-4 w-4" />}
              onClick={() => setTemplateModalOpen(true)}
            >
              Simpan Template
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Pencil className="h-4 w-4" />}
              onClick={() => setEditOpen(true)}
            >
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => setDeleteOpen(true)}
            >
              Hapus
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-5 overflow-x-auto">
        <Tabs
          value={tab}
          onChange={handleTabChange}
          tabs={[
            { key: 'overview', label: 'Ringkasan' },
            { key: 'tasks', label: 'Task', count: stats.task_count },
            { key: 'gantt', label: 'Timeline / Gantt' },
            { key: 'budget', label: 'Anggaran & Biaya' },
            { key: 'members', label: 'Anggota', count: stats.member_count },
            { key: 'milestones', label: 'Milestone', count: stats.milestone_count },
            { key: 'activity', label: 'Aktivitas' },
          ]}
        />
      </div>

      {/* ---------------- Ringkasan ---------------- */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-8">
            <StatTile label="Total Task" value={stats.task_count ?? 0} color="#4f46e5" icon={Flag} />
            <StatTile
              label="Selesai"
              value={stats.completed_task_count ?? 0}
              color="#10b981"
              icon={CheckCircle2}
            />
            <StatTile
              label="Terlambat"
              value={stats.overdue_count ?? 0}
              color="#ef4444"
              icon={Flag}
            />
            <StatTile
              label="Sedang Dikerjakan"
              value={stats.in_progress_count ?? 0}
              color="#3b82f6"
              icon={Flag}
            />
            <StatTile label="Anggota" value={stats.member_count ?? 0} color="#a855f7" icon={Users} />
            <StatTile
              label="Milestone"
              value={stats.milestone_count ?? 0}
              color="#f59e0b"
              icon={Flag}
            />
            <StatTile
              label="Anggaran"
              value={formatCurrency(stats.budget ?? 0)}
              color="#0ea5e9"
            />
            <StatTile
              label="Realisasi Biaya"
              value={formatCurrency(stats.actual_cost ?? 0)}
              color={stats.budget > 0 && stats.actual_cost > stats.budget ? '#e11d48' : '#10b981'}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader title="Distribusi Status Task" description="Jumlah task per status" />
              <CardBody>
                {statusDistribution.length === 0 ? (
                  <EmptyState
                    icon={Flag}
                    title="Belum ada task"
                    description="Distribusi status akan tampil setelah task dibuat."
                  />
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={statusDistribution} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                        />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={<ChartTooltip />} />
                        <Bar dataKey="count" name="Task" radius={[6, 6, 0, 0]} maxBarSize={44}>
                          {statusDistribution.map((entry) => (
                            <Cell key={entry.status ?? entry.label} fill={entry.color || '#4f46e5'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Tren Penyelesaian" description="Task selesai per minggu" />
              <CardBody>
                {completionTrend.length === 0 ? (
                  <EmptyState
                    icon={Flag}
                    title="Belum ada data"
                    description="Tren penyelesaian akan tampil setelah ada task yang selesai."
                  />
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={completionTrend} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="completed"
                          name="Selesai"
                          stroke={projectColor}
                          strokeWidth={2}
                          dot={{ r: 3, fill: projectColor }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Top Kontributor" description="Anggota dengan task terbanyak" />
            <CardBody className="p-2">
              {topAssignees.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Belum ada data"
                  description="Kontributor akan tampil setelah task ditugaskan."
                />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {topAssignees.map((assignee, index) => (
                    <li key={assignee.id ?? assignee.name} className="flex items-center gap-3 px-2 py-2.5">
                      <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-400">
                        {index + 1}
                      </span>
                      <Avatar src={assignee.avatar} name={assignee.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                          {assignee.name}
                        </p>
                        {assignee.role && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {assignee.role}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                        {assignee.task_count ?? assignee.count ?? assignee.total ?? 0} task
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* ---------------- Task ---------------- */}
      {tab === 'tasks' && (
        <Card>
          <CardHeader
            title="Task Project"
            description="Seluruh task yang tercatat pada project ini"
            action={
              <Select
                containerClassName="w-44"
                value={taskStatusFilter}
                onChange={(event) => setTaskStatusFilter(event.target.value)}
                placeholder="Semua status"
                aria-label="Filter status task"
                options={
                  projectStatuses.length > 0
                    ? projectStatuses.map((s) => ({ value: s.key_name, label: s.label }))
                    : Object.entries(TASK_STATUS).map(([value, meta]) => ({
                        value,
                        label: meta.label,
                      }))
                }
              />
            }
          />
          {tasksQuery.isLoading ? (
            <TableSkeleton rows={5} columns={6} />
          ) : tasksQuery.isError ? (
            <ErrorState
              title="Gagal memuat task"
              description="Daftar task project tidak dapat diambil."
              onRetry={() => tasksQuery.refetch()}
            />
          ) : filteredTasks.length === 0 ? (
            <EmptyState
              icon={Flag}
              title={taskStatusFilter ? 'Tidak ada task pada status ini' : 'Belum ada task'}
              description={
                taskStatusFilter
                  ? 'Coba pilih status lain untuk melihat task project ini.'
                  : 'Task yang ditambahkan ke project ini akan tampil di sini.'
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Task</TH>
                  <TH>Status</TH>
                  <TH>Prioritas</TH>
                  <TH>Assignee</TH>
                  <TH>Tenggat</TH>
                  <TH className="min-w-[130px]">Progress</TH>
                </TR>
              </THead>
              <TBody>
                {filteredTasks.map((task) => {
                  const days = daysUntil(task.due_date);
                  return (
                    <TR key={task.id}>
                      <TD>
                        <Link
                          to={`/tasks?task=${task.id}`}
                          className="line-clamp-1 font-medium text-slate-900 transition-colors hover:text-brand-600 dark:text-white dark:hover:text-brand-400"
                        >
                          {task.title}
                        </Link>
                      </TD>
                      <TD>
                        <TaskStatusBadge status={task.status} label={task.status_label} color={task.status_color} size="sm" />
                      </TD>
                      <TD>
                        <PriorityBadge priority={task.priority} size="sm" />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Avatar src={task.assignee_avatar} name={task.assignee_name} size="xs" />
                          <span className="truncate text-xs">
                            {task.assignee_name ?? 'Belum ditugaskan'}
                          </span>
                        </div>
                      </TD>
                      <TD
                        className={cn(
                          'whitespace-nowrap text-xs',
                          days !== null && days < 0 && task.status !== 'done'
                            ? 'font-medium text-rose-600 dark:text-rose-400'
                            : 'text-slate-500 dark:text-slate-400'
                        )}
                      >
                        {formatDate(task.due_date)}
                      </TD>
                      <TD className="min-w-[130px]">
                        <ProgressBar value={task.progress ?? 0} size="sm" showLabel />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {/* ---------------- Timeline / Gantt ---------------- */}
      {tab === 'gantt' && (
        <div>
          {ganttQuery.isLoading ? (
            <LoadingState label="Memuat timeline Gantt chart..." />
          ) : (
            <GanttChartView
              projectId={id}
              tasks={ganttQuery.data?.tasks || []}
              milestones={ganttQuery.data?.milestones || []}
              dependencies={ganttQuery.data?.dependencies || []}
              onTaskClick={(task) => setDrawerTaskId(task.id)}
              canManage={canManage}
            />
          )}
        </div>
      )}

      {/* ---------------- Anggaran & Biaya ---------------- */}
      {tab === 'budget' && (
        <ProjectBudgetTab projectId={id} canManage={canManage} />
      )}

      {/* ---------------- Anggota ---------------- */}
      {tab === 'members' && (
        <Card>
          <CardHeader title="Anggota Project" description="Tim yang mengerjakan project ini" />
          <CardBody>
            <MemberManager
              projectId={id}
              members={members}
              canManage={canManage}
              onChange={() => {
                projectQuery.refetch();
                overviewQuery.refetch();
              }}
            />
          </CardBody>
        </Card>
      )}

      {/* ---------------- Milestone ---------------- */}
      {tab === 'milestones' && (
        <Card>
          <CardHeader
            title="Milestone"
            description="Tonggak waktu penting dalam project"
            action={
              canManage ? (
                <Button
                  size="sm"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    setEditingMilestone(null);
                    setMilestoneOpen(true);
                  }}
                >
                  Tambah Milestone
                </Button>
              ) : null
            }
          />
          <CardBody>
            {milestonesQuery.isLoading ? (
              <LoadingState label="Memuat milestone..." />
            ) : milestonesQuery.isError ? (
              <ErrorState
                title="Gagal memuat milestone"
                description="Daftar milestone tidak dapat diambil."
                onRetry={() => milestonesQuery.refetch()}
              />
            ) : milestoneRows.length === 0 ? (
              <EmptyState
                icon={Flag}
                title="Belum ada milestone"
                description="Tambahkan milestone untuk menandai tonggak waktu penting project."
                action={
                  canManage ? (
                    <Button
                      size="sm"
                      leftIcon={<Plus className="h-4 w-4" />}
                      onClick={() => {
                        setEditingMilestone(null);
                        setMilestoneOpen(true);
                      }}
                    >
                      Tambah Milestone
                    </Button>
                  ) : null
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {milestoneRows.map((milestone) => {
                  const days = daysUntil(milestone.due_date);
                  const isHighlighted =
                    highlightedMilestoneId !== null &&
                    String(milestone.id) === String(highlightedMilestoneId);
                  return (
                    <li
                      key={milestone.id}
                      ref={isHighlighted ? highlightedMilestoneRef : undefined}
                      className={cn(
                        'py-3.5 first:pt-0 last:pb-0',
                        isHighlighted &&
                          'rounded-lg bg-brand-50/70 px-3 -mx-3 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/40'
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {milestone.name}
                            </p>
                            <MilestoneBadge status={milestone.status} size="sm" />
                          </div>
                          {milestone.description && (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                              {milestone.description}
                            </p>
                          )}
                          <p
                            className={cn(
                              'mt-1 text-[11px]',
                              days !== null && days < 0 && milestone.status !== 'achieved'
                                ? 'font-medium text-rose-600 dark:text-rose-400'
                                : 'text-slate-500 dark:text-slate-400'
                            )}
                          >
                            Target {formatDate(milestone.due_date)}
                            {days !== null && days >= 0 && ` · ${days} hari lagi`}
                          </p>
                        </div>

                        {canManage && (
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Edit milestone"
                              onClick={() => {
                                setEditingMilestone(milestone);
                                setMilestoneOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Hapus milestone"
                              onClick={() => setDeleteMilestoneTarget(milestone)}
                            >
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="mt-2.5">
                        <ProgressBar value={milestone.progress ?? 0} color={projectColor} size="sm" showLabel />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {/* ---------------- Aktivitas ---------------- */}
      {tab === 'activity' && (
        <Card>
          <CardHeader title="Aktivitas Project" description="Riwayat perubahan terbaru" />
          <CardBody>
            {overviewQuery.isLoading ? (
              <LoadingState label="Memuat aktivitas..." />
            ) : overviewQuery.isError ? (
              <ErrorState
                title="Gagal memuat aktivitas"
                description="Riwayat aktivitas tidak dapat diambil."
                onRetry={() => overviewQuery.refetch()}
              />
            ) : recentActivity.length === 0 ? (
              <EmptyState
                icon={Flag}
                title="Belum ada aktivitas"
                description="Riwayat aktivitas project akan tampil di sini."
              />
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-5 dark:border-slate-800">
                {recentActivity.map((activity) => (
                  <li key={activity.id} className="relative">
                    <span
                      className="absolute -left-[1.6rem] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-brand-500 dark:border-slate-900"
                      aria-hidden="true"
                    />
                    <div className="flex items-start gap-2.5">
                      <Avatar src={activity.user_avatar} name={activity.user_name} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                          <span className="font-medium text-slate-900 dark:text-white">
                            {activity.user_name ?? 'Seseorang'}
                          </span>{' '}
                          {activity.description ?? activity.action}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {formatRelative(activity.created_at)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      )}

      {/* ---------------- Dialogs ---------------- */}
      <ProjectFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={project}
        onSaved={() => setEditOpen(false)}
      />

      <MilestoneModal
        open={milestoneOpen}
        onClose={() => setMilestoneOpen(false)}
        projectId={id}
        milestone={editingMilestone}
        onSaved={() => milestonesQuery.refetch()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Hapus project?"
        description={`Project "${project.name}" beserta task, milestone, dan data anggotanya akan dihapus permanen.`}
        confirmLabel="Ya, hapus"
        loading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={Boolean(deleteMilestoneTarget)}
        onClose={() => setDeleteMilestoneTarget(null)}
        onConfirm={() =>
          deleteMilestoneTarget && deleteMilestoneMutation.mutate(deleteMilestoneTarget.id)
        }
        title="Hapus milestone?"
        description={
          deleteMilestoneTarget
            ? `Milestone "${deleteMilestoneTarget.name}" akan dihapus dan tidak dapat dikembalikan.`
            : ''
        }
        confirmLabel="Ya, hapus"
        loading={deleteMilestoneMutation.isPending}
      />

      <ProjectStatusModal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        projectId={Number(id)}
        projectName={project?.name}
      />

      <SaveAsTemplateModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        project={project}
      />

      <TaskDetailDrawer
        open={Boolean(drawerTaskId)}
        onClose={() => setDrawerTaskId(null)}
        taskId={drawerTaskId}
        projectId={id}
      />
    </div>
  );
}
