import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Layers,
  Flag,
  ArrowRight,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import { projectApi } from '../../api/project.api';
import { taskApi } from '../../api/task.api';
import { GanttChartView } from '../../components/shared/GanttChartView';
import { TaskDetailDrawer } from '../../components/shared/TaskDetailDrawer';
import { TaskFormModal } from '../../components/shared/TaskFormModal';
import { LoadingState, EmptyState } from '../../components/ui/Feedback';
import { formatCurrency } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';

export function Gantt() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);

  // 1. Fetch available projects
  const { data: projectsData, isLoading: loadingProjects } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => projectApi.list({ perPage: 100, sort: 'name', direction: 'asc' }),
  });

  const projects = projectsData?.data ?? [];

  // Selected project ID from URL query or first available
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => searchParams.get('project') || ''
  );

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      const defaultId = String(projects[0].id);
      setSelectedProjectId(defaultId);
      setSearchParams({ project: defaultId }, { replace: true });
    }
  }, [projects, selectedProjectId, setSearchParams]);

  const handleSelectProject = (id) => {
    setSelectedProjectId(id);
    setSearchParams({ project: id });
  };

  // 2. Fetch Gantt data for selected project
  const { data: ganttData, isLoading: loadingGantt } = useQuery({
    queryKey: ['gantt', selectedProjectId],
    queryFn: () => taskApi.gantt(selectedProjectId),
    enabled: Boolean(selectedProjectId),
  });

  // Detail modal state
  const [drawerTaskId, setDrawerTaskId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  const activeProject = projects.find((p) => String(p.id) === String(selectedProjectId));
  const canManage =
    user?.role === 'admin' ||
    user?.role === 'manager' ||
    (activeProject && Number(activeProject.manager_id) === Number(user?.id));

  return (
    <div className="space-y-6">
      {/* Header & Project Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Gantt Timeline
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Visualisasi roadmap proyek, hierarki WBS task, milestone, dan relasi dependensi.
          </p>
        </div>

        {/* Project Selector dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
            Pilih Proyek:
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => handleSelectProject(e.target.value)}
            className="h-9 w-64 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.code} - {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Selected Project Quick Metrics Bar */}
      {activeProject && (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <span
              className="h-3.5 w-3.5 rounded-full shrink-0"
              style={{ backgroundColor: activeProject.color || '#4f46e5' }}
            />
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">Proyek Aktif</p>
              <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                {activeProject.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Total Task</p>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                {ganttData?.tasks?.length ?? 0} task
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
              <Flag className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Milestone</p>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                {ganttData?.milestones?.length ?? 0} milestone
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">Realisasi Biaya Task</p>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                {formatCurrency(activeProject.actual_cost || 0)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Gantt Interactive Area */}
      {loadingProjects || loadingGantt ? (
        <LoadingState label="Menyiapkan data diagram Gantt..." />
      ) : !selectedProjectId ? (
        <EmptyState
          icon={Calendar}
          title="Pilih proyek terlebih dahulu"
          description="Silakan pilih salah satu proyek di atas untuk menampilkan Gantt timeline."
        />
      ) : (
        <GanttChartView
          projectId={selectedProjectId}
          tasks={ganttData?.tasks ?? []}
          milestones={ganttData?.milestones ?? []}
          dependencies={ganttData?.dependencies ?? []}
          onTaskClick={(task) => setDrawerTaskId(task.id)}
          canManage={canManage}
        />
      )}

      {/* Task Detail Modal */}
      <TaskDetailDrawer
        open={Boolean(drawerTaskId) && !formOpen}
        variant="modal"
        onClose={() => setDrawerTaskId(null)}
        taskId={drawerTaskId}
        projectId={selectedProjectId}
        onEdit={(task) => {
          setEditingTask(task);
          setFormOpen(true);
        }}
      />

      <TaskFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        projectId={selectedProjectId || null}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['gantt', selectedProjectId] });
          queryClient.invalidateQueries({ queryKey: ['task', drawerTaskId] });
        }}
      />
    </div>
  );
}

export default Gantt;

