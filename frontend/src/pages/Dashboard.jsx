import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  ListTodo,
  Plus,
  TrendingUp,
} from 'lucide-react';
import { dashboardApi } from '../api';import { useAuthStore } from '../store/authStore';
import { PageHeader, StatCard } from '../components/shared/StatCard';
import { ProjectFormModal } from '../components/shared/ProjectFormModal';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { PriorityBadge } from '../components/shared/Badges';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { cn } from '../utils/cn';
import { formatDate, formatRelative, daysUntil } from '../utils/formatters';

/**
 * Tooltip styled for both light and dark themes.
 */
function ChartTooltip({ active, payload, label, valueLabel = 'Nilai' }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-dropdown dark:border-slate-700 dark:bg-slate-800">
      {label && (
        <p className="mb-1 font-semibold text-slate-900 dark:text-white">{label}</p>
      )}
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
            {valueLabel ? ` ${valueLabel}` : ''}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * A single "Tugas Saya" row.
 */
function MyTaskRow({ task, variant }) {
  const days = daysUntil(task.due_date);

  return (
    <li>
      <Link
        to={`/tasks?task=${task.id}`}
        className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        <span
          className={cn(
            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
            variant === 'overdue' ? 'bg-rose-500' : 'bg-brand-500'
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
            {task.title}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {task.project_name}
            {task.due_date && (
              <>
                {' · '}
                <span
                  className={cn(
                    variant === 'overdue' && 'font-medium text-rose-600 dark:text-rose-400'
                  )}
                >
                  {variant === 'overdue' && days !== null && days < 0
                    ? `Terlambat ${Math.abs(days)} hari`
                    : formatDate(task.due_date, 'dd MMM')}
                </span>
              </>
            )}
          </p>
        </div>
        <PriorityBadge priority={task.priority} size="sm" />
      </Link>
    </li>
  );
}

/**
 * Dashboard - KPI overview, charts, personal tasks and activity feed.
 */
export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [formOpen, setFormOpen] = useState(false);

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardApi.stats(),
  });

  const myTasksQuery = useQuery({
    queryKey: ['dashboard', 'my-tasks'],
    queryFn: () => dashboardApi.myTasks(),
  });

  const stats = statsQuery.data;
  const myTasks = myTasksQuery.data;

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    []
  );

  const projectProgress = stats?.projectProgress ?? [];
  const statusDistribution = stats?.statusDistribution ?? [];
  const recentActivity = stats?.recentActivity ?? [];
  const upcomingDeadlines = stats?.upcomingDeadlines ?? [];

  // Overdue and due-today tasks are surfaced first.
  const highlightedTasks = useMemo(() => {
    if (!myTasks) return [];
    const overdue = myTasks.overdue ?? [];
    const dueToday = myTasks.dueToday ?? [];
    const seen = new Set();
    const merged = [];

    for (const task of [...overdue, ...dueToday]) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      merged.push({ task, variant: overdue.includes(task) ? 'overdue' : 'due' });
    }

    return merged;
  }, [myTasks]);
  const activeTasks = useMemo(() => {
    if (!myTasks) return [];
    const buckets = [
      ...(myTasks.in_progress ?? []).map((task) => ({ task, variant: 'active' })),
      ...(myTasks.todo ?? []).map((task) => ({ task, variant: 'active' })),
      ...(myTasks.review ?? []).map((task) => ({ task, variant: 'active' })),
      ...(myTasks.blocked ?? []).map((task) => ({ task, variant: 'blocked' })),
    ];

    const seen = new Set(highlightedTasks.map((entry) => entry.task.id));
    return buckets.filter((entry) => !seen.has(entry.task.id)).slice(0, 6);
  }, [myTasks, highlightedTasks]);

  const isLoading = statsQuery.isLoading || myTasksQuery.isLoading;
  const error = statsQuery.error || myTasksQuery.error;

  if (error) {
    return (
      <div>
        <PageHeader title={`Halo, ${user?.name ?? ''} 👋`} description={todayLabel} />
        <Card>
          <ErrorState
            title="Gagal memuat dashboard"
            description="Terjadi masalah saat mengambil data ringkasan. Silakan coba lagi."
            onRetry={() => {
              statsQuery.refetch();
              myTasksQuery.refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title={`Halo, ${user?.name ?? ''} 👋`} description={todayLabel} />
        <LoadingState label="Memuat ringkasan dashboard..." />
      </div>
    );
  }

  const taskStats = stats?.tasks ?? {};
  const projectStats = stats?.projects ?? {};
  const activeTaskCount = Math.max(
    0,
    (taskStats.total ?? 0) - (taskStats.done ?? 0)
  );

  return (
    <div>
      <PageHeader
        title={`Halo, ${user?.name ?? ''} 👋`}
        description={todayLabel}
        action={
          canManage ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>
              Project Baru
            </Button>
          ) : null
        }
      />

      {/* KPI row */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Project"
          value={projectStats.total ?? 0}
          icon={FolderKanban}
          color="#4f46e5"
        />
        <StatCard
          label="Task Aktif"
          value={activeTaskCount}
          icon={ListTodo}
          color="#3b82f6"
        />
        <StatCard
          label="Task Terlambat"
          value={taskStats.overdue ?? 0}
          icon={AlertTriangle}
          color="#ef4444"
        />
        <StatCard
          label="Completion Rate"
          value={`${stats?.completionRate ?? 0}%`}
          icon={TrendingUp}
          color="#10b981"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Left column - charts */}
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Progress Project"
              description="Persentase penyelesaian tiap project"
              action={
                <Link
                  to="/projects"
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  Buka Projects &rarr;
                </Link>
              }
            />
            <CardBody>
              {projectProgress.length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title="Belum ada project"
                  description="Progress project akan tampil setelah ada project dibuat."
                />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={projectProgress}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                    >
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={140}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                        content={<ChartTooltip valueLabel="%" />}
                      />
                      <Bar
                        dataKey="progress"
                        name="Progress"
                        radius={[0, 6, 6, 0]}
                        barSize={18}
                      >
                        {projectProgress.map((entry) => (
                          <Cell key={entry.id} fill={entry.color || '#4f46e5'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Distribusi Status Task"
              description="Sebaran seluruh task berdasarkan status"
            />
            <CardBody>
              {statusDistribution.length === 0 ? (
                <EmptyState
                  icon={ListTodo}
                  title="Belum ada data task"
                  description="Distribusi status akan tampil setelah task dibuat."
                />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusDistribution}
                        dataKey="count"
                        nameKey="label"
                        innerRadius="55%"
                        outerRadius="80%"
                        paddingAngle={2}
                        stroke="none"
                      >
                        {statusDistribution.map((entry) => (
                          <Cell key={entry.status} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip valueLabel="task" />} />
                      <Legend
                        verticalAlign="bottom"
                        height={24}
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => (
                          <span className="text-[11px] text-slate-600 dark:text-slate-300">
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right column - personal widgets */}
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Tugas Saya"
              description="Task yang terlambat dan jatuh tempo hari ini"
            />
            <CardBody className="p-2">
              {highlightedTasks.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Tidak ada tugas mendesak"
                  description="Tidak ada task terlambat atau jatuh tempo hari ini."
                />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {highlightedTasks.map((entry) => (
                    <MyTaskRow key={entry.task.id} task={entry.task} variant={entry.variant} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {activeTasks.length > 0 && (
            <Card>
              <CardHeader title="Tugas Berjalan" description="Task yang sedang Anda kerjakan" />
              <CardBody className="p-2">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeTasks.map((entry) => (
                    <MyTaskRow key={entry.task.id} task={entry.task} variant="active" />
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Tenggat Terdekat" description="Task dengan deadline terdekat" />
            <CardBody className="p-2">
              {upcomingDeadlines.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="Tidak ada tenggat"
                  description="Belum ada task dengan tenggat yang akan datang."
                />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {upcomingDeadlines.slice(0, 6).map((item) => {
                    const days = daysUntil(item.due_date);
                    return (
                      <li key={item.id} className="px-2 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                            {item.title}
                          </p>
                          <PriorityBadge priority={item.priority} size="sm" />
                        </div>
                        <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {item.project_name}
                        </p>
                        <p
                          className={cn(
                            'mt-0.5 text-[11px]',
                            days !== null && days < 0
                              ? 'font-medium text-rose-600 dark:text-rose-400'
                              : 'text-slate-500 dark:text-slate-400'
                          )}
                        >
                          {formatDate(item.due_date, 'dd MMM yyyy')}
                          {days !== null && days >= 0 && ` · ${days} hari lagi`}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Aktivitas Terkini" description="Aktivitas terbaru di workspace" />
            <CardBody className="p-2">
              {recentActivity.length === 0 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="Belum ada aktivitas"
                  description="Aktivitas terbaru akan tampil di sini."
                />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentActivity.slice(0, 8).map((activity) => (
                    <li key={activity.id} className="flex gap-2.5 px-2 py-2.5">
                      <Avatar src={activity.user_avatar} name={activity.user_name} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                          <span className="font-medium text-slate-800 dark:text-slate-100">
                            {activity.user_name ?? 'Seseorang'}
                          </span>{' '}
                          {activity.description ?? activity.action}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {formatRelative(activity.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <ProjectFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => setFormOpen(false)}
      />
    </div>
  );
}
