import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FolderKanban,
  Radio,
  RefreshCw,
  LayoutGrid,
  ListTodo,
  Sliders,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { taskApi } from '../../api/task.api';
import { projectApi } from '../../api/project.api';
import { getErrorMessage } from '../../api/client';
import { KANBAN_COLUMNS } from '../../utils/constants';
import { useSocket } from '../../hooks/useSocket';
import { PageHeader } from '../../components/shared/StatCard';
import { TaskCard } from '../../components/shared/TaskCard';
import { TaskDetailDrawer } from '../../components/shared/TaskDetailDrawer';
import { TaskFormModal } from '../../components/shared/TaskFormModal';
import { ProjectStatusModal } from '../../components/shared/ProjectStatusModal';
import { Button, IconButton } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Input';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { CountBadge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';

/**
 * Resolve the column a draggable item belongs to.
 * @param {object} board
 * @param {any} over
 * @returns {string|null}
 */
function findColumnKey(board, over) {
  if (!over) return null;

  const overId = over.id;

  // The drop target is a column itself.
  const direct = board.columns.find((column) => column.key === overId);
  if (direct) return direct.key;

  // Otherwise the drop target is a task - find the column that holds it.
  for (const column of board.columns) {
    if (column.tasks.some((task) => task.id === overId)) return column.key;
  }

  return null;
}

/**
 * A single draggable card on the board.
 */
function SortableTaskCard({ task, onTaskClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="touch-none"
    >
      <TaskCard task={task} onClick={() => onTaskClick(task)} />
    </div>
  );
}

/**
 * A droppable kanban column.
 */
function BoardColumn({ column, tasks, onTaskClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key, data: { columnKey: column.key } });

  return (
    <div
      className="flex w-[260px] shrink-0 flex-col sm:w-[288px] xl:w-[300px]"
      role="list"
      aria-label={column.title}
    >
      {/* Column header */}
      <div
        className={cn(
          'mb-2.5 flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors',
          isOver
            ? 'border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10'
            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
        )}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: column.color }}
          aria-hidden="true"
        />
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
          {column.title}
        </h3>
        {column.progress !== undefined && (
          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
            {column.progress}%
          </span>
        )}
        <CountBadge className="bg-slate-500 dark:bg-slate-600">{tasks.length}</CountBadge>
      </div>

      {/* Column body */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex max-h-[calc(100vh-19rem)] min-h-[10rem] flex-1 flex-col gap-2.5 overflow-y-auto rounded-xl border border-dashed p-2.5 transition-colors',
          isOver
            ? 'border-brand-400 bg-brand-50/70 dark:border-brand-500/50 dark:bg-brand-500/10'
            : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40'
        )}
      >
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-slate-400 dark:text-slate-500">
              Tarik task ke sini
            </p>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard key={task.id} task={task} onTaskClick={onTaskClick} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

/**
 * Kanban board page with drag & drop between the five workflow columns.
 */
export default function Kanban() {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [activeTask, setActiveTask] = useState(null);
  const [detailTaskId, setDetailTaskId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  const { connected } = useSocket([], () => {});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // --- Projects ------------------------------------------------------------
  const { data: projectResponse } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => projectApi.list({ perPage: 100, sort: 'name', direction: 'asc' }),
    staleTime: 5 * 60 * 1000,
  });

  const projects = projectResponse?.data ?? [];

  // Auto-select the first project so the board is never empty on arrival.
  useEffect(() => {
    if (!projectId && projects.length) {
      setProjectId(String(projects[0].id));
    }
  }, [projects, projectId]);

  // Close the detail drawer when the board switches to another project so it
  // never shows a task that belongs to the previously selected project.
  useEffect(() => {
    setDetailTaskId(null);
    setEditingTask(null);
    setFormOpen(false);
  }, [projectId]);

  // --- Board query ---------------------------------------------------------
  const { data: board, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['tasks', 'board', projectId],
    queryFn: () => taskApi.board(Number(projectId)),
    enabled: Boolean(projectId),
  });

  const columns = useMemo(() => {
    if (board?.columns?.length) return board.columns;

    // Fall back to empty columns so the layout stays stable while loading.
    return KANBAN_COLUMNS.map((column) => ({ ...column, tasks: [] }));
  }, [board]);

  const project = board?.project;

  // --- Move mutation -------------------------------------------------------
  const moveMutation = useMutation({
    mutationFn: async ({ taskId, status, position }) => {
      if (position === null || position === undefined) {
        await taskApi.updateStatus(taskId, status);
        return;
      }
      await taskApi.updateStatus(taskId, status);
      await taskApi.updatePosition(taskId, status, position);
    },
  });

  const handleDragStart = ({ active }) => {
    const column = columns.find((item) => item.tasks.some((task) => task.id === active.id));
    setActiveTask(column?.tasks.find((task) => task.id === active.id) ?? null);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveTask(null);
    if (!over) return;

    const boardKey = ['tasks', 'board', projectId];
    const previous = queryClient.getQueryData(boardKey);
    if (!previous) return;

    const sourceColumnKey = findColumnKey(previous, { id: active.id });
    const targetColumnKey = findColumnKey(previous, over);

    if (!sourceColumnKey || !targetColumnKey) return;

    const sourceColumn = previous.columns.find((column) => column.key === sourceColumnKey);
    const targetColumn = previous.columns.find((column) => column.key === targetColumnKey);

    const sourceIndex = sourceColumn.tasks.findIndex((task) => task.id === active.id);
    const activeTaskRow = sourceColumn.tasks[sourceIndex];
    if (!activeTaskRow) return;

    // Same column, same spot -> nothing to do.
    if (sourceColumnKey === targetColumnKey) {
      const overIndex = targetColumn.tasks.findIndex((task) => task.id === over.id);
      if (overIndex === -1 || overIndex === sourceIndex) return;
    }

    // Optimistically move the card inside the cached board.
    queryClient.setQueryData(boardKey, (current) => {
      if (!current) return current;

      const nextColumns = current.columns.map((column) => {
        const tasks = column.tasks.filter((task) => task.id !== active.id);
        return { ...column, tasks };
      });

      const target = nextColumns.find((column) => column.key === targetColumnKey);
      if (!target) return current;

      let newIndex = target.tasks.length;
      if (over.id !== targetColumnKey) {
        const overIndex = target.tasks.findIndex((task) => task.id === over.id);
        if (overIndex !== -1) newIndex = overIndex;
      }

      const moved = { ...activeTaskRow, status: targetColumnKey };
      const tasks = [...target.tasks];
      tasks.splice(newIndex, 0, moved);

      return {
        ...current,
        columns: nextColumns.map((column) =>
          column.key === targetColumnKey ? { ...column, tasks } : column
        ),
      };
    });

    // Compute the final index for the server call.
    const targetTasks = targetColumn.tasks.filter((task) => task.id !== active.id);
    let newIndex = targetTasks.length;
    if (over.id !== targetColumnKey) {
      const overIndex = targetTasks.findIndex((task) => task.id === over.id);
      if (overIndex !== -1) newIndex = overIndex;
    }

    const statusChanged = sourceColumnKey !== targetColumnKey;

    moveMutation.mutate(
      { taskId: active.id, status: targetColumnKey, position: newIndex },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['board'] });
        },
        onError: (err) => {
          // Roll the board back to the snapshot taken before the move.
          queryClient.setQueryData(boardKey, previous);
          toast.error(getErrorMessage(err) || 'Gagal memindahkan task');
        },
      }
    );

    if (statusChanged) {
      toast.success(`Task dipindahkan ke ${columns.find((c) => c.key === targetColumnKey)?.title || targetColumnKey}`);
    }
  };

  const handleDragCancel = () => {
    setActiveTask(null);
  };

  const projectOptions = projects.map((item) => ({
    value: String(item.id),
    label: `${item.code} - ${item.name}`,
  }));

  return (
    <div>
      <PageHeader
        title="Kanban Board"
        description="Pindahkan task antar kolom untuk memperbarui statusnya."
        action={
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium dark:border-slate-700"
              title={
                connected
                  ? 'Terhubung - perubahan tersinkron antar pengguna'
                  : 'Terputus - data dimuat ulang berkala'
              }
            >
              <Radio
                className={cn(
                  'h-3.5 w-3.5',
                  connected ? 'text-emerald-500' : 'text-slate-400'
                )}
              />
              <span
                className={
                  connected
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }
              >
                {connected ? 'Live' : 'Offline'}
              </span>
            </span>
            <span className="hidden text-[11px] text-slate-500 dark:text-slate-400 sm:inline">
              Perubahan langsung tersinkron antar pengguna
            </span>
            <IconButton
              label="Muat ulang papan"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ['tasks', 'board', projectId] })
              }
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </IconButton>
          </div>
        }
      />

      {/* --- Project picker --- */}
      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Project"
              containerClassName="w-full sm:w-80"
              placeholder="Pilih project"
              options={projectOptions}
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            />
            {projectId && (
              <Button
                variant="secondary"
                size="md"
                leftIcon={<Sliders className="h-4 w-4" />}
                onClick={() => setStatusModalOpen(true)}
              >
                Atur Alur Kerja
              </Button>
            )}
          </div>

          {project && (
            <div className="w-full lg:max-w-md">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: project.color }}
                    aria-hidden="true"
                  />
                  {project.name}
                </span>
                <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                  {project.progress}%
                </span>
              </div>
              <ProgressBar value={project.progress} color={project.color} size="sm" />
            </div>
          )}
        </div>
      </Card>

      {/* --- Board --- */}
      {!projectId ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="Pilih project terlebih dahulu"
            description="Papan kanban menampilkan task dari satu project. Pilih project di atas untuk memulai."
          />
        </Card>
      ) : isLoading ? (
        <Card>
          <LoadingState label="Memuat papan kanban..." />
        </Card>
      ) : isError ? (
        <Card>
          <ErrorState
            description={getErrorMessage(error)}
            onRetry={() =>
              queryClient.invalidateQueries({ queryKey: ['tasks', 'board', projectId] })
            }
          />
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
            {columns.map((column) => (
              <BoardColumn
                key={column.key}
                column={column}
                tasks={column.tasks}
                onTaskClick={(task) => setDetailTaskId(task.id)}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
            {activeTask ? <TaskCard task={activeTask} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* --- Drawer + modal --- */}
      <TaskDetailDrawer
        open={Boolean(detailTaskId)}
        taskId={detailTaskId}
        onClose={() => setDetailTaskId(null)}
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
        projectId={projectId || null}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['tasks', 'board', projectId] });
          queryClient.invalidateQueries({ queryKey: ['task'] });
        }}
      />

      <ProjectStatusModal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        projectId={Number(projectId)}
        projectName={project?.name}
      />
    </div>
  );
}
