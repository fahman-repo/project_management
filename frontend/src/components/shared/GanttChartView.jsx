import { useState, useMemo, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Calendar,
  ChevronRight,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Flag,
  Clock,
  Layers,
  ArrowRight,
  Pencil,
  CheckCircle2,
  CalendarDays,
  Search,
} from 'lucide-react';
import { taskApi } from '../../api/task.api';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { Button, IconButton } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { TaskStatusBadge, PriorityBadge } from './Badges';
import { cn } from '../../utils/cn';
import { getErrorMessage } from '../../api/client';

const DAY_WIDTH_MAP = {
  day: 48,
  week: 22,
  month: 8,
};

const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 56;
const TASK_COLUMN_WIDTH = 320;

export function GanttChartView({
  projectId,
  tasks = [],
  milestones = [],
  dependencies = [],
  onTaskClick,
  canManage = false,
}) {
  const queryClient = useQueryClient();
  const [zoom, setZoom] = useState('week'); // 'day' | 'week' | 'month'
  const [collapsedParents, setCollapsedParents] = useState(new Set());
  const [search, setSearch] = useState('');
  const [filterMilestoneOnly, setFilterMilestoneOnly] = useState(false);

  // Quick schedule edit modal
  const [editingTask, setEditingTask] = useState(null);
  const [editSchedule, setEditSchedule] = useState({ start_date: '', due_date: '' });

  const chartScrollRef = useRef(null);
  const dayWidth = DAY_WIDTH_MAP[zoom] || 22;

  // 1. Organize tasks into parent/subtask hierarchy and filter
  const { visibleTasks, allParents } = useMemo(() => {
    const parentMap = new Map();
    const childrenMap = new Map();
    const rootTasks = [];

    // Filter by search / milestone
    const filteredTasks = tasks.filter((t) => {
      if (filterMilestoneOnly && !t.is_milestone) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    tasks.forEach((t) => {
      if (t.parent_id) {
        if (!childrenMap.has(t.parent_id)) childrenMap.set(t.parent_id, []);
        childrenMap.get(t.parent_id).push(t);
      } else {
        rootTasks.push(t);
      }
      parentMap.set(t.id, t);
    });

    const list = [];
    const parentsSet = new Set();

    function traverse(task, depth = 0) {
      list.push({ ...task, depth });
      const children = childrenMap.get(task.id) || [];
      if (children.length > 0) {
        parentsSet.add(task.id);
        if (!collapsedParents.has(task.id)) {
          children.forEach((c) => traverse(c, depth + 1));
        }
      }
    }

    // Traverse root tasks
    rootTasks.forEach((root) => {
      // If search is active, show only matched or parents of matched
      if (search) {
        const hasMatchedChild = (childrenMap.get(root.id) || []).some((c) =>
          c.title.toLowerCase().includes(search.toLowerCase())
        );
        if (root.title.toLowerCase().includes(search.toLowerCase()) || hasMatchedChild) {
          traverse(root, 0);
        }
      } else {
        traverse(root, 0);
      }
    });

    return { visibleTasks: list, allParents: parentsSet };
  }, [tasks, search, filterMilestoneOnly, collapsedParents]);

  // 2. Calculate project date boundary
  const { startDate, endDate, totalDays, datesList } = useMemo(() => {
    let minTime = Infinity;
    let maxTime = -Infinity;

    const allDates = [];
    tasks.forEach((t) => {
      if (t.start_date) allDates.push(new Date(t.start_date).getTime());
      if (t.due_date) allDates.push(new Date(t.due_date).getTime());
      if (t.created_at) allDates.push(new Date(t.created_at).getTime());
    });
    milestones.forEach((m) => {
      if (m.due_date) allDates.push(new Date(m.due_date).getTime());
    });

    if (allDates.length > 0) {
      minTime = Math.min(...allDates);
      maxTime = Math.max(...allDates);
    } else {
      minTime = Date.now() - 7 * 86400000;
      maxTime = Date.now() + 30 * 86400000;
    }

    // Add padding days
    const start = new Date(minTime);
    start.setDate(start.getDate() - 5);
    start.setHours(0, 0, 0, 0);

    const end = new Date(maxTime);
    end.setDate(end.getDate() + 10);
    end.setHours(0, 0, 0, 0);

    const days = Math.max(15, Math.round((end.getTime() - start.getTime()) / 86400000));

    const list = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      list.push(d);
    }

    return { startDate: start, endDate: end, totalDays: days, datesList: list };
  }, [tasks, milestones]);

  // Calculate task X and width
  const getTaskCoords = (task) => {
    const rawStart = task.start_date ? new Date(task.start_date) : new Date(task.created_at);
    const rawEnd = task.due_date ? new Date(task.due_date) : new Date(rawStart);

    rawStart.setHours(0, 0, 0, 0);
    rawEnd.setHours(0, 0, 0, 0);

    const startDiff = Math.max(0, (rawStart.getTime() - startDate.getTime()) / 86400000);
    const durationDays = Math.max(1, (rawEnd.getTime() - rawStart.getTime()) / 86400000 + 1);

    const x = startDiff * dayWidth;
    const width = Math.max(16, durationDays * dayWidth);

    return { x, width, rawStart, rawEnd };
  };

  // Map task id to row index for drawing dependency lines
  const taskRowIndexMap = useMemo(() => {
    const map = new Map();
    visibleTasks.forEach((t, idx) => map.set(t.id, idx));
    return map;
  }, [visibleTasks]);

  // Schedule Update Mutation
  const updateScheduleMutation = useMutation({
    mutationFn: ({ taskId, payload }) => taskApi.updateSchedule(taskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task'] });
      queryClient.invalidateQueries({ queryKey: ['gantt', projectId] });
      toast.success('Jadwal task berhasil diperbarui');
      setEditingTask(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const toggleCollapse = (taskId) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleOpenEditSchedule = (task, e) => {
    e.stopPropagation();
    setEditingTask(task);
    setEditSchedule({
      start_date: task.start_date ? task.start_date.slice(0, 10) : '',
      due_date: task.due_date ? task.due_date.slice(0, 10) : '',
    });
  };

  const handleSaveSchedule = (e) => {
    e.preventDefault();
    if (!editingTask) return;
    updateScheduleMutation.mutate({
      taskId: editingTask.id,
      payload: {
        start_date: editSchedule.start_date || null,
        due_date: editSchedule.due_date || null,
      },
    });
  };

  // Today marker coordinate
  const todayX = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = (today.getTime() - startDate.getTime()) / 86400000;
    return diff * dayWidth;
  }, [startDate, dayWidth]);

  // Center on Today once mounted
  useEffect(() => {
    if (chartScrollRef.current && todayX > 200) {
      chartScrollRef.current.scrollLeft = todayX - 250;
    }
  }, [zoom]);

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 p-4 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari task di Gantt..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={() => setFilterMilestoneOnly(!filterMilestoneOnly)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
              filterMilestoneOnly
                ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
          >
            <Flag className="h-3.5 w-3.5 text-violet-500" />
            Hanya Milestone
          </button>
        </div>

        {/* Zoom Controls & Legend */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded bg-brand-500" /> Task
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rotate-45 bg-violet-600" /> Milestone
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-5 bg-emerald-500 rounded-full" /> Selesai
            </span>
          </div>

          <div className="flex items-center rounded-lg border border-slate-200 p-0.5 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setZoom('day')}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                zoom === 'day' ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Hari
            </button>
            <button
              type="button"
              onClick={() => setZoom('week')}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                zoom === 'week' ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Minggu
            </button>
            <button
              type="button"
              onClick={() => setZoom('month')}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                zoom === 'month' ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Bulan
            </button>
          </div>
        </div>
      </div>

      {/* Main Gantt Split View */}
      <div className="flex flex-1 overflow-hidden min-h-[460px]">
        {/* Left Column: Task Titles & WBS Tree */}
        <div
          className="shrink-0 border-r border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40"
          style={{ width: TASK_COLUMN_WIDTH }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between border-b border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-300"
            style={{ height: HEADER_HEIGHT }}
          >
            <span>Daftar Task / WBS ({visibleTasks.length})</span>
            <span className="text-[10px] text-slate-400">Jadwal & Biaya</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {visibleTasks.map((task) => {
              const isParent = allParents.has(task.id);
              const isCollapsed = collapsedParents.has(task.id);

              return (
                <div
                  key={task.id}
                  onClick={() => onTaskClick?.(task)}
                  className="flex items-center justify-between px-3 text-xs hover:bg-slate-100/60 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  style={{
                    height: ROW_HEIGHT,
                    paddingLeft: `${12 + task.depth * 16}px`,
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0 pr-2">
                    {isParent ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapse(task.id);
                        }}
                        className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : (
                      <span className="w-4 shrink-0 text-center text-slate-300 dark:text-slate-600">•</span>
                    )}

                    {task.is_milestone ? (
                      <Flag className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                    ) : null}

                    <span
                      className={cn(
                        "truncate",
                        task.status === 'done' ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-100",
                        task.depth === 0 ? "font-semibold" : "font-normal"
                      )}
                      title={task.title}
                    >
                      {task.title}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {task.estimated_cost > 0 && (
                      <span className="font-mono text-[10px] text-slate-500 hidden sm:inline">
                        {formatCurrency(task.estimated_cost)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        task.progress === 100 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      )}
                    >
                      {task.progress}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Interactive Timeline & SVG Canvas */}
        <div ref={chartScrollRef} className="flex-1 overflow-x-auto relative select-none">
          <div
            style={{
              width: totalDays * dayWidth,
              minHeight: '100%',
            }}
            className="relative"
          >
            {/* Timeline Header (Months & Days) */}
            <div
              className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
              style={{ height: HEADER_HEIGHT }}
            >
              <div className="flex h-1/2 border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {/* Header Months labels */}
                {datesList.map((d, i) => {
                  if (d.getDate() === 1 || i === 0) {
                    return (
                      <div
                        key={`m-${i}`}
                        className="pl-2 border-l border-slate-200 dark:border-slate-700 flex items-center text-brand-600 dark:text-brand-400 font-bold"
                        style={{ width: 15 * dayWidth }}
                      >
                        {formatDate(d, 'MMMM yyyy')}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>

              {/* Day numbers */}
              <div className="flex h-1/2">
                {datesList.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isToday =
                    d.toDateString() === new Date().toDateString();

                  return (
                    <div
                      key={`d-${i}`}
                      style={{ width: dayWidth }}
                      className={cn(
                        "flex items-center justify-center border-r border-slate-100 text-[10px] font-medium transition-colors dark:border-slate-800/60",
                        isToday
                          ? "bg-brand-50 font-bold text-brand-600 dark:bg-brand-950/50 dark:text-brand-400"
                          : isWeekend
                          ? "bg-slate-50/60 text-slate-400 dark:bg-slate-950/30"
                          : "text-slate-600 dark:text-slate-400"
                      )}
                    >
                      {zoom === 'month' ? (d.getDate() % 5 === 0 ? d.getDate() : '') : d.getDate()}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Background Grid Lines */}
            <div className="absolute inset-0 top-[56px] pointer-events-none flex">
              {datesList.map((d, i) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={`grid-${i}`}
                    style={{ width: dayWidth }}
                    className={cn(
                      "h-full border-r border-slate-100/80 dark:border-slate-800/40",
                      isWeekend ? "bg-slate-50/40 dark:bg-slate-950/20" : ""
                    )}
                  />
                );
              })}
            </div>

            {/* Today vertical line marker */}
            {todayX >= 0 && (
              <div
                className="absolute top-0 bottom-0 z-10 w-0.5 bg-brand-500 shadow-sm pointer-events-none"
                style={{ left: todayX + dayWidth / 2 }}
              >
                <div className="sticky top-1 -translate-x-1/2 rounded bg-brand-600 px-1 py-0.5 text-[9px] font-bold text-white shadow">
                  Hari Ini
                </div>
              </div>
            )}

            {/* SVG Connecting Dependencies Lines */}
            <svg
              className="absolute inset-0 top-[56px] pointer-events-none z-10"
              style={{
                width: totalDays * dayWidth,
                height: visibleTasks.length * ROW_HEIGHT,
              }}
            >
              <defs>
                <marker
                  id="gantt-arrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 8 5 L 0 9 z" fill="#6366f1" />
                </marker>
              </defs>

              {dependencies.map((dep) => {
                const sourceRow = taskRowIndexMap.get(dep.depends_on_id);
                const targetRow = taskRowIndexMap.get(dep.task_id);

                if (sourceRow === undefined || targetRow === undefined) return null;

                const sourceTask = visibleTasks[sourceRow];
                const targetTask = visibleTasks[targetRow];

                const sCoords = getTaskCoords(sourceTask);
                const tCoords = getTaskCoords(targetTask);

                // From end of predecessor to start of successor
                const startX = sCoords.x + sCoords.width;
                const startY = sourceRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                const endX = tCoords.x;
                const endY = targetRow * ROW_HEIGHT + ROW_HEIGHT / 2;

                const midX = startX + 16;

                const pathData = `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;

                return (
                  <g key={`dep-${dep.id}`}>
                    <path
                      d={pathData}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="1.5"
                      strokeDasharray={dep.type === 'relates_to' ? '4 2' : 'none'}
                      markerEnd="url(#gantt-arrow)"
                      opacity="0.75"
                    />
                    {dep.lag_days !== 0 && (
                      <text
                        x={midX + 4}
                        y={(startY + endY) / 2}
                        fill="#f59e0b"
                        fontSize="9"
                        fontWeight="bold"
                      >
                        {dep.lag_days > 0 ? `+${dep.lag_days}d` : `${dep.lag_days}d`}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Task Bars Overlay */}
            <div className="relative z-10">
              {visibleTasks.map((task, rowIndex) => {
                const { x, width, rawStart, rawEnd } = getTaskCoords(task);
                const isDone = task.status === 'done';

                return (
                  <div
                    key={task.id}
                    style={{ height: ROW_HEIGHT }}
                    className="flex items-center relative hover:bg-slate-50/30 dark:hover:bg-slate-800/10"
                  >
                    {/* Bar representation */}
                    {task.is_milestone ? (
                      /* Milestone diamond shape */
                      <div
                        onClick={() => onTaskClick?.(task)}
                        style={{ left: x }}
                        className="group absolute -translate-x-1/2 flex items-center gap-1.5 cursor-pointer"
                      >
                        <div className="h-5 w-5 rotate-45 rounded bg-violet-600 shadow-md flex items-center justify-center transition-transform hover:scale-125 dark:bg-violet-500">
                          <Flag className="h-2.5 w-2.5 -rotate-45 text-white" />
                        </div>
                        <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 whitespace-nowrap drop-shadow-sm">
                          {task.title}
                        </span>
                      </div>
                    ) : (
                      /* Standard task bar */
                      <div
                        onClick={() => onTaskClick?.(task)}
                        style={{ left: x, width }}
                        className={cn(
                          "group absolute h-7 rounded-lg shadow-sm border transition-all cursor-pointer flex items-center overflow-hidden",
                          isDone
                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-300"
                            : task.depth === 0
                            ? "bg-brand-600 border-brand-700 text-white font-semibold"
                            : "bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-200"
                        )}
                        title={`${task.title}\n${formatDate(rawStart)} - ${formatDate(rawEnd)} (${task.progress}%)`}
                      >
                        {/* Progress Fill Indicator */}
                        {task.progress > 0 && (
                          <div
                            style={{ width: `${task.progress}%` }}
                            className={cn(
                              "absolute inset-y-0 left-0 transition-all opacity-40",
                              isDone ? "bg-emerald-500" : task.depth === 0 ? "bg-white" : "bg-indigo-500"
                            )}
                          />
                        )}

                        {/* Task Bar Content */}
                        <div className="relative z-10 flex w-full items-center justify-between px-2 text-[11px]">
                          <span className="truncate pr-1 font-medium">{task.title}</span>
                          <span className="shrink-0 font-mono text-[10px] opacity-80">
                            {task.progress}%
                          </span>
                        </div>

                        {/* Quick edit schedule button on hover */}
                        {canManage && (
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditSchedule(task, e)}
                            className="absolute right-1 z-20 hidden rounded p-1 hover:bg-black/20 group-hover:block text-white"
                            title="Ubah Jadwal"
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Edit Schedule Modal */}
      <Modal
        open={Boolean(editingTask)}
        onClose={() => setEditingTask(null)}
        title="Ubah Jadwal Task (Timeline)"
        description={`Sesuaikan tanggal mulai dan batas waktu untuk "${editingTask?.title}".`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingTask(null)}>
              Batal
            </Button>
            <Button
              onClick={handleSaveSchedule}
              loading={updateScheduleMutation.isPending}
            >
              Simpan Jadwal
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveSchedule} className="space-y-4">
          <Input
            label="Tanggal Mulai"
            type="date"
            value={editSchedule.start_date}
            onChange={(e) =>
              setEditSchedule({ ...editSchedule, start_date: e.target.value })
            }
          />
          <Input
            label="Batas Waktu (Due Date)"
            type="date"
            value={editSchedule.due_date}
            onChange={(e) =>
              setEditSchedule({ ...editSchedule, due_date: e.target.value })
            }
          />
        </form>
      </Modal>
    </div>
  );
}

export default GanttChartView;

