import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Flame,
  Info,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { dashboardApi, projectApi } from '../../api/index';
import { getErrorMessage } from '../../api/client';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import { Card, CardBody } from '../ui/Card';
import { Drawer } from '../ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../ui/Feedback';
import { Input, Select, Switch } from '../ui/Input';
import { ProgressBar } from '../ui/ProgressBar';
import { PriorityBadge, RoleBadge, TaskStatusBadge } from './Badges';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { cn } from '../../utils/cn';
import { formatDate } from '../../utils/formatters';

const WEEK_COUNT_OPTIONS = [
  { value: 4, label: '4 Minggu' },
  { value: 8, label: '8 Minggu' },
  { value: 12, label: '12 Minggu' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'Semua Peran' },
  { value: 'admin', label: 'Administrator' },
  { value: 'manager', label: 'Manajer' },
  { value: 'member', label: 'Anggota' },
];

/**
 * Color classes and style configuration for heatmap utilization levels.
 */
const UTILIZATION_STYLES = {
  empty: {
    bg: 'bg-slate-50/70 dark:bg-slate-900/30',
    border: 'border-slate-200/80 dark:border-slate-800',
    text: 'text-slate-400 dark:text-slate-500',
    barColor: '#94a3b8',
    label: 'Kosong (0%)',
    badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  underload: {
    bg: 'bg-sky-50/80 hover:bg-sky-100/90 dark:bg-sky-500/10 dark:hover:bg-sky-500/15',
    border: 'border-sky-200 dark:border-sky-500/30',
    text: 'text-sky-700 dark:text-sky-300',
    barColor: '#0284c7',
    label: 'Rendah (<50%)',
    badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  },
  optimal: {
    bg: 'bg-emerald-50/80 hover:bg-emerald-100/90 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15',
    border: 'border-emerald-200 dark:border-emerald-500/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    barColor: '#10b981',
    label: 'Optimal (50–85%)',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  },
  warning: {
    bg: 'bg-amber-50/90 hover:bg-amber-100 dark:bg-amber-500/15 dark:hover:bg-amber-500/20',
    border: 'border-amber-300 dark:border-amber-500/40',
    text: 'text-amber-800 dark:text-amber-300',
    barColor: '#f59e0b',
    label: 'Hampir Penuh (86–100%)',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200',
  },
  overallocated: {
    bg: 'bg-rose-50 hover:bg-rose-100/90 dark:bg-rose-500/20 dark:hover:bg-rose-500/25 ring-1 ring-rose-400/50',
    border: 'border-rose-300 dark:border-rose-500/50',
    text: 'text-rose-800 dark:text-rose-200 font-semibold',
    barColor: '#ef4444',
    label: 'Overallocated (>100%)',
    badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-500/25 dark:text-rose-200',
  },
};

function getMondayOfCurrentWeek() {
  const d = new Date();
  const day = d.getDay(); // 0 is Sun, 1 is Mon...
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function shiftWeeks(dateStr, weekDelta) {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + weekDelta * 7);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

/**
 * Interactive Resource Capacity & Workload Heatmap component for Team page.
 */
export function WorkloadHeatmapView() {
  const [baseMonday, setBaseMonday] = useState(getMondayOfCurrentWeek);
  const [weekCount, setWeekCount] = useState(8);
  const [projectId, setProjectId] = useState('');
  const [role, setRole] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [onlyOverallocated, setOnlyOverallocated] = useState(false);
  const [includeCompleted, setIncludeCompleted] = useState(false);

  // Drawer states
  const [selectedCell, setSelectedCell] = useState(null); // { member, cell }
  const [drilldownTaskId, setDrilldownTaskId] = useState(null);

  // Fetch projects list for filter dropdown
  const projectsQuery = useQuery({
    queryKey: ['projects', 'dropdown-list'],
    queryFn: async () => {
      const res = await projectApi.list({ perPage: 100 });
      return res.data || [];
    },
    staleTime: 60000,
  });

  // Fetch heatmap data
  const heatmapQuery = useQuery({
    queryKey: [
      'dashboard',
      'capacity-heatmap',
      {
        startDate: baseMonday,
        weeks: weekCount,
        projectId,
        role,
        search: searchInput.trim(),
        includeCompleted,
      },
    ],
    queryFn: () =>
      dashboardApi.capacityHeatmap({
        start_date: baseMonday,
        weeks: weekCount,
        project_id: projectId || undefined,
        role: role || undefined,
        search: searchInput.trim() || undefined,
        include_completed: includeCompleted ? true : undefined,
      }),
  });

  const data = heatmapQuery.data || {};
  const weeks = data.weeks || [];
  const rawMembers = data.members || [];
  const summary = data.summary || {};

  // Filter members if "onlyOverallocated" is checked
  const members = useMemo(() => {
    if (!onlyOverallocated) return rawMembers;
    return rawMembers.filter((m) => (m.overallocatedWeeksCount || 0) > 0);
  }, [rawMembers, onlyOverallocated]);

  // Project select options
  const projectOptions = useMemo(() => {
    const list = [{ value: '', label: 'Semua Proyek' }];
    for (const p of projectsQuery.data || []) {
      list.push({ value: String(p.id), label: `${p.code} - ${p.name}` });
    }
    return list;
  }, [projectsQuery.data]);

  // Navigation handlers
  const handlePrevWeeks = () => {
    setBaseMonday((prev) => shiftWeeks(prev, -Math.max(4, Math.floor(weekCount / 2))));
  };

  const handleNextWeeks = () => {
    setBaseMonday((prev) => shiftWeeks(prev, Math.max(4, Math.floor(weekCount / 2))));
  };

  const handleResetToCurrent = () => {
    setBaseMonday(getMondayOfCurrentWeek());
  };

  const isCurrentBaseMonday = baseMonday === getMondayOfCurrentWeek();

  return (
    <div className="space-y-5">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
              <Activity className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">Rata-rata Utilisasi</p>
              <p className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {summary.avgUtilizationPercent ?? 0}%
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {summary.totalAllocatedHours ?? 0}j / {summary.totalCapacityHours ?? 0}j teralokasi
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">Terdeteksi Overallocation</p>
              <p className="text-xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                {summary.overallocatedMembersCount ?? 0} Anggota
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {summary.overallocatedCellsCount ?? 0} minggu melebihi 100% kapasitas
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">Kapasitas Tersedia</p>
              <p className="text-xl font-bold tracking-tight text-sky-600 dark:text-sky-400">
                {summary.underutilizedMembersCount ?? 0} Anggota
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                Beban &lt; 50%, siap menerima delegasi
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Users className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Tim Dipantau</p>
              <p className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {summary.totalMembers ?? 0} Orang
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                Rentang {weekCount} minggu ({weeks[0]?.shortLabel || ''} s/d{' '}
                {weeks[weeks.length - 1]?.shortLabel || ''})
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Controls & Filter Card */}
      <Card>
        <CardBody className="space-y-3.5">
          {/* Top row: search + project + role + weeks */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="lg:w-64">
              <Input
                type="search"
                placeholder="Cari anggota tim..."
                icon={<Search className="h-4 w-4" />}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Cari nama anggota tim di heatmap"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:items-center">
              <Select
                options={projectOptions}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                containerClassName="lg:w-56"
                aria-label="Filter proyek"
              />
              <Select
                options={ROLE_OPTIONS}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                containerClassName="lg:w-40"
                aria-label="Filter peran"
              />
              <Select
                options={WEEK_COUNT_OPTIONS}
                value={String(weekCount)}
                onChange={(e) => setWeekCount(Number(e.target.value))}
                containerClassName="lg:w-36"
                aria-label="Jumlah minggu"
              />
            </div>

            {/* Week navigation buttons */}
            <div className="flex items-center gap-1.5 lg:ml-auto">
              <IconButton
                label="Rentang sebelumnya"
                size="icon-sm"
                onClick={handlePrevWeeks}
                disabled={heatmapQuery.isFetching}
              >
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <Button
                variant={isCurrentBaseMonday ? 'primary' : 'secondary'}
                size="sm"
                leftIcon={<Calendar className="h-3.5 w-3.5" />}
                onClick={handleResetToCurrent}
              >
                Minggu Ini
              </Button>
              <IconButton
                label="Rentang berikutnya"
                size="icon-sm"
                onClick={handleNextWeeks}
                disabled={heatmapQuery.isFetching}
              >
                <ChevronRight className="h-4 w-4" />
              </IconButton>
              <IconButton
                label="Muat ulang data"
                size="icon-sm"
                onClick={() => heatmapQuery.refetch()}
                disabled={heatmapQuery.isFetching}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', heatmapQuery.isFetching && 'animate-spin')} />
              </IconButton>
            </div>
          </div>

          {/* Bottom row: toggles & legend */}
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={onlyOverallocated}
                  onChange={(e) => setOnlyOverallocated(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500/30 dark:border-slate-700 dark:bg-slate-800"
                />
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                  Hanya anggota overallocated ({summary.overallocatedMembersCount ?? 0})
                </span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={includeCompleted}
                  onChange={(e) => setIncludeCompleted(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800"
                />
                <span>Sertakan task selesai (done)</span>
              </label>
            </div>

            {/* Visual Legend */}
            <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Keterangan:</span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
                0%
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm border border-sky-300 bg-sky-100 dark:bg-sky-500/30" />
                &lt;50%
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-100 dark:bg-emerald-500/30" />
                50–85%
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-100 dark:bg-amber-500/30" />
                86–100%
              </span>
              <span className="flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                <span className="h-2.5 w-2.5 rounded-sm border border-rose-400 bg-rose-200 dark:bg-rose-500/40" />
                &gt;100% Overload
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Heatmap Matrix Table */}
      {heatmapQuery.isLoading ? (
        <Card>
          <LoadingState label="Menghitung kapasitas jam kerja dan distribusi task..." />
        </Card>
      ) : heatmapQuery.isError ? (
        <Card>
          <ErrorState
            description={getErrorMessage(heatmapQuery.error)}
            onRetry={() => heatmapQuery.refetch()}
          />
        </Card>
      ) : !members.length ? (
        <Card>
          <EmptyState
            icon={onlyOverallocated ? CheckCircle2 : Users}
            title={onlyOverallocated ? 'Tidak Ada Anggota yang Overallocated' : 'Tidak Ada Data Anggota'}
            description={
              onlyOverallocated
                ? 'Semua anggota tim memiliki beban kerja dalam batas kapasitas kerja mereka.'
                : 'Tidak ada anggota tim yang cocok dengan filter yang Anda tentukan.'
            }
            action={
              onlyOverallocated ? (
                <Button variant="secondary" size="sm" onClick={() => setOnlyOverallocated(false)}>
                  Tampilkan Semua Anggota
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 dark:border-slate-800 dark:bg-slate-900/50">
                  {/* Sticky Member Column */}
                  <th
                    scope="col"
                    className="sticky left-0 z-20 w-64 min-w-[16rem] border-r border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-700 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <div className="flex items-center justify-between">
                      <span>Anggota Tim</span>
                      <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        Kapasitas
                      </span>
                    </div>
                  </th>

                  {/* Week Columns */}
                  {weeks.map((week, idx) => (
                    <th
                      key={week.key}
                      scope="col"
                      className={cn(
                        'min-w-[105px] px-2.5 py-3 text-center transition-colors',
                        week.isCurrentWeek
                          ? 'bg-brand-50/70 font-bold text-brand-900 dark:bg-brand-500/10 dark:text-brand-300'
                          : 'font-semibold text-slate-700 dark:text-slate-200'
                      )}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {week.label}
                        </span>
                        <span className="whitespace-nowrap font-medium text-slate-900 dark:text-white">
                          {week.shortLabel}
                        </span>
                        {week.isCurrentWeek && (
                          <span className="mt-0.5 rounded-full bg-brand-600 px-1.5 py-0.2 text-[9px] font-semibold text-white dark:bg-brand-500">
                            Minggu Ini
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {members.map((member) => {
                  const hasOverload = (member.overallocatedWeeksCount || 0) > 0;

                  return (
                    <tr
                      key={member.userId}
                      className="group transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                    >
                      {/* Sticky Member Cell */}
                      <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] group-hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950 dark:group-hover:bg-slate-900/80">
                        <div className="flex items-center gap-3">
                          <Avatar src={member.avatar} name={member.name} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-semibold text-slate-900 dark:text-white">
                                {member.name}
                              </p>
                              {hasOverload && (
                                <AlertTriangle
                                  className="h-3.5 w-3.5 shrink-0 text-rose-500"
                                  title={`${member.overallocatedWeeksCount} minggu melebihi kapasitas`}
                                />
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                              <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                {member.jobTitle || member.role}
                              </span>
                              <span className="text-slate-300 dark:text-slate-700">•</span>
                              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                {member.weeklyCapacityHours}j/mgg
                              </span>
                            </div>
                            {member.unscheduledTaskCount > 0 && (
                              <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span>{member.unscheduledTaskCount} task belum ada tanggal</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Heatmap Week Cells */}
                      {member.cells.map((cell) => {
                        const style = UTILIZATION_STYLES[cell.status] || UTILIZATION_STYLES.empty;
                        const isOverload = cell.status === 'overallocated';

                        return (
                          <td
                            key={cell.weekKey}
                            onClick={() => setSelectedCell({ member, cell })}
                            className={cn(
                              'cursor-pointer p-1.5 transition-all select-none',
                              cell.isCurrentWeek && 'bg-brand-50/15'
                            )}
                            title={`Klik untuk rincian: ${member.name} (${cell.allocatedHours}j / ${cell.capacityHours}j)`}
                          >
                            <div
                              className={cn(
                                'flex h-16 flex-col justify-between rounded-lg border p-1.5 transition-transform active:scale-95',
                                style.bg,
                                style.border
                              )}
                            >
                              {/* Top row: hours and % */}
                              <div className="flex items-start justify-between gap-1 leading-tight">
                                <span
                                  className={cn('text-xs tabular-nums', style.text, isOverload && 'font-bold')}
                                >
                                  {cell.allocatedHours > 0 ? `${cell.allocatedHours}j` : '0j'}
                                </span>
                                <div className="flex items-center gap-0.5">
                                  {isOverload && <AlertTriangle className="h-3 w-3 text-rose-600" />}
                                  <span
                                    className={cn(
                                      'text-[10px] tabular-nums',
                                      isOverload
                                        ? 'font-bold text-rose-700 dark:text-rose-300'
                                        : 'text-slate-500 dark:text-slate-400'
                                    )}
                                  >
                                    {cell.utilizationPercent}%
                                  </span>
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="w-full">
                                <ProgressBar
                                  value={Math.min(100, cell.utilizationPercent)}
                                  color={style.barColor}
                                  size="xs"
                                  className="h-1 bg-slate-200/80 dark:bg-slate-700/80"
                                />
                              </div>

                              {/* Bottom row: task count */}
                              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                                <span>{cell.taskCount > 0 ? `${cell.taskCount} task` : '-'}</span>
                                {isOverload && (
                                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                                    +{cell.overloadHours}j
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Cell Drill-Down Drawer */}
      <Drawer
        open={Boolean(selectedCell)}
        onClose={() => setSelectedCell(null)}
        title={selectedCell ? `Rincian Beban Kerja: ${selectedCell.member.name}` : ''}
        description={
          selectedCell
            ? `Periode ${selectedCell.cell.startDate} s/d ${selectedCell.cell.endDate}`
            : ''
        }
        width="max-w-xl"
      >
        {selectedCell && (
          <div className="space-y-5">
            {/* Header Member & Week Summary */}
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <Avatar
                src={selectedCell.member.avatar}
                name={selectedCell.member.name}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedCell.member.name}
                  </p>
                  <RoleBadge role={selectedCell.member.role} size="sm" />
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {selectedCell.member.jobTitle || 'Jabatan belum diisi'} • Kapasitas:{' '}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {selectedCell.cell.capacityHours} jam/minggu
                  </strong>
                </p>

                {/* Utilization meter */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Teralokasi: {selectedCell.cell.allocatedHours} jam ({selectedCell.cell.utilizationPercent}%)
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        UTILIZATION_STYLES[selectedCell.cell.status]?.badgeClass
                      )}
                    >
                      {UTILIZATION_STYLES[selectedCell.cell.status]?.label}
                    </span>
                  </div>
                  <ProgressBar
                    value={Math.min(100, selectedCell.cell.utilizationPercent)}
                    color={UTILIZATION_STYLES[selectedCell.cell.status]?.barColor}
                    size="sm"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedCell.cell.status === 'overallocated' ? (
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        Kelebihan beban: {selectedCell.cell.overloadHours} jam di atas kapasitas
                      </span>
                    ) : (
                      <span>
                        Sisa jam tersedia: {selectedCell.cell.availableHours} jam
                      </span>
                    )}
                    <span>Target: {selectedCell.cell.capacityHours}j</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tasks list contributing to this week */}
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Daftar Task pada Minggu Ini ({selectedCell.cell.tasks.length})
                </h4>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Jam dibagikan pro-rata hari kerja
                </span>
              </div>

              {!selectedCell.cell.tasks.length ? (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  Tidak ada task terjadwal pada minggu ini.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {selectedCell.cell.tasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setDrilldownTaskId(task.id)}
                      className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-3.5 transition-all hover:border-brand-500/50 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-400/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            {task.projectCode && (
                              <Badge
                                variant="outline"
                                size="sm"
                                style={{
                                  borderColor: task.projectColor || '#4f46e5',
                                  color: task.projectColor || '#4f46e5',
                                }}
                              >
                                {task.projectCode}
                              </Badge>
                            )}
                            <PriorityBadge priority={task.priority} size="sm" />
                            <TaskStatusBadge status={task.status} size="sm" />
                          </div>

                          <p className="mt-1.5 text-sm font-medium text-slate-900 group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-400">
                            {task.title}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {task.startDate ? formatDate(task.startDate) : 'Tanpa tgl mulai'} →{' '}
                              {task.dueDate ? formatDate(task.dueDate) : 'Tanpa tenggat'}
                            </span>
                            <span>•</span>
                            <span>
                              Total Estimasi: <strong>{task.estimatedHours} jam</strong>
                            </span>
                          </div>
                        </div>

                        {/* Allocated hours pill */}
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="rounded-lg bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                            {task.allocatedHours} jam
                          </span>
                          <span className="flex items-center gap-0.5 text-[10px] text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-400">
                            Detail <ExternalLink className="h-2.5 w-2.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unscheduled tasks alert if any */}
            {selectedCell.member.unscheduledTaskCount > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="font-semibold">
                      {selectedCell.member.unscheduledTaskCount} task aktif belum memiliki jadwal
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                      Task tersebut memiliki total estimasi {selectedCell.member.unscheduledHours} jam,
                      tetapi belum memiliki tanggal mulai/tenggat sehingga belum dapat dialokasikan ke
                      dalam minggu kalender.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Task Detail Drawer when clicking a task inside drilldown */}
      {drilldownTaskId && (
        <TaskDetailDrawer
          taskId={drilldownTaskId}
          onClose={() => setDrilldownTaskId(null)}
        />
      )}
    </div>
  );
}

export default WorkloadHeatmapView;
