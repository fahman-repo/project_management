import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  Download,
  FileSpreadsheet,
  FolderKanban,
  ListTodo,
  Percent,
  Wallet,
  TrendingUp,
  FileText,
} from 'lucide-react';
import { reportApi } from '../api';
import { projectApi } from '../api/project.api';
import { getErrorMessage } from '../api/client';
import { PageHeader, StatCard } from '../components/shared/StatCard';
import { StatusBadge } from '../components/shared/Badges';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '../components/ui/Dropdown';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { StatusPieChart } from '../components/charts/StatusPieChart';
import { ProductivityBarChart } from '../components/charts/ProductivityBarChart';
import { TrendAreaChart } from '../components/charts/TrendAreaChart';
import { BurndownChart } from '../components/charts/BurndownChart';
import { SCurveEvmChart } from '../components/charts/SCurveEvmChart';
import { ExecutiveReportModal } from '../components/shared/ExecutiveReportModal';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { PROJECT_STATUS, lookup } from '../utils/constants';
import { cn } from '../utils/cn';

/**
 * Page skeleton shown while the report queries are in flight.
 */
function ReportSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton h-80 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * Reports page - aggregate statistics, charts and CSV export.
 */
export default function Reports() {
  const queryClient = useQueryClient();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [projectId, setProjectId] = useState('');
  const [trendDays, setTrendDays] = useState(30);
  const [burndownProjectId, setBurndownProjectId] = useState('');
  const [evmProjectId, setEvmProjectId] = useState('');
  const [evmInterval, setEvmInterval] = useState('daily');
  const [executiveModalOpen, setExecutiveModalOpen] = useState(false);

  // Projects used by the filter dropdowns.
  const { data: projectList } = useQuery({
    queryKey: ['projects', 'list', 'options'],
    queryFn: () => projectApi.list({ perPage: 100, sort: 'name', direction: 'asc' }),
    staleTime: 5 * 60 * 1000,
  });

  const projects = projectList?.data || [];
  const projectOptions = projects.map((project) => ({
    value: String(project.id),
    label: `${project.code ? `${project.code} - ` : ''}${project.name}`,
  }));

  const defaultProjectId = projectId || (projects.length ? String(projects[0].id) : '');
  const activeEvmProjectId = evmProjectId || defaultProjectId;
  const activeBurndownProjectId = burndownProjectId || defaultProjectId;

  const scopeParams = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      project_id: projectId || undefined,
    }),
    [from, to, projectId]
  );

  const overviewQuery = useQuery({
    queryKey: ['reports', 'overview', scopeParams],
    queryFn: () => reportApi.overview(scopeParams),
  });

  const statusQuery = useQuery({
    queryKey: ['reports', 'status-distribution', projectId || 'all'],
    queryFn: () => reportApi.statusDistribution({ project_id: projectId || undefined }),
  });

  const productivityQuery = useQuery({
    queryKey: ['reports', 'productivity', scopeParams],
    queryFn: () => reportApi.productivity(scopeParams),
  });

  const trendQuery = useQuery({
    queryKey: ['reports', 'completion-trend', trendDays, projectId || 'all'],
    queryFn: () =>
      reportApi.completionTrend({
        days: trendDays,
        project_id: projectId || undefined,
      }),
  });

  const burndownQuery = useQuery({
    queryKey: ['reports', 'burndown', activeBurndownProjectId],
    queryFn: () => reportApi.burndown({ project_id: activeBurndownProjectId }),
    enabled: Boolean(activeBurndownProjectId),
  });

  const evmQuery = useQuery({
    queryKey: ['reports', 'evm', activeEvmProjectId, from, to, evmInterval],
    queryFn: () =>
      reportApi.evm({
        project_id: activeEvmProjectId,
        from: from || undefined,
        to: to || undefined,
        interval: evmInterval,
      }),
    enabled: Boolean(activeEvmProjectId),
  });

  const exportMutation = useMutation({
    mutationFn: (type) =>
      reportApi.exportCsv(type, {
        from: from || undefined,
        to: to || undefined,
        project_id: projectId || undefined,
      }),
    onSuccess: () => toast.success('Berkas CSV berhasil diunduh'),
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const overview = overviewQuery.data;
  const isLoading = overviewQuery.isLoading;
  const isError = overviewQuery.isError;

  const retryAll = () => {
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  };

  const projectBreakdown = overview?.projectBreakdown || [];
  const topLabels = overview?.topLabels || overview?.mostUsedLabels || [];

  const stats = [
    {
      label: 'Total Project',
      value: formatNumber(overview?.projects?.total || 0),
      icon: FolderKanban,
      color: '#4f46e5',
    },
    {
      label: 'Total Task',
      value: formatNumber(overview?.tasks?.total || 0),
      icon: ListTodo,
      color: '#0ea5e9',
    },
    {
      label: 'Total Anggaran',
      value: formatCurrency(overview?.financials?.totalBudget || 0),
      icon: Wallet,
      color: '#3b82f6',
    },
    {
      label: 'Realisasi Biaya',
      value: formatCurrency(overview?.financials?.totalActualCost || 0),
      icon: TrendingUp,
      color:
        overview?.financials?.budgetUtilizationRate > 100
          ? '#ef4444'
          : '#10b981',
    },
    {
      label: 'Completion Rate',
      value: `${Math.round(Number(overview?.completionRate || 0))}%`,
      icon: Percent,
      color: '#10b981',
    },
    {
      label: 'Task Terlambat',
      value: formatNumber(overview?.tasks?.overdue || 0),
      icon: AlertTriangle,
      color: '#ef4444',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Ringkasan performa proyek dan task beserta grafik analitik"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              leftIcon={<FileText className="h-4 w-4" />}
              onClick={() => setExecutiveModalOpen(true)}
            >
              Laporan Eksekutif (PDF)
            </Button>
            <Dropdown
              align="right"
              trigger={
                <Button
                  variant="secondary"
                  leftIcon={<Download className="h-4 w-4" />}
                  loading={exportMutation.isPending}
                >
                  Export CSV
                </Button>
              }
            >
              <DropdownLabel>Unduh laporan</DropdownLabel>
              <DropdownItem
                icon={FileSpreadsheet}
                onClick={() => exportMutation.mutate('tasks')}
              >
                Export Task
              </DropdownItem>
              <DropdownItem
                icon={FileSpreadsheet}
                onClick={() => exportMutation.mutate('projects')}
              >
                Export Project
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem
                icon={FileText}
                onClick={() => setExecutiveModalOpen(true)}
              >
                Laporan Eksekutif (PDF)
              </DropdownItem>
              <DropdownItem icon={CalendarRange} onClick={() => setTrendDays(30)}>
                Reset filter tanggal
              </DropdownItem>
            </Dropdown>
          </div>
        }
      />

      {/* Filters */}
      <Card className="mb-5">
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          <Select
            label="Project"
            options={projectOptions}
            placeholder="Semua Project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          />
          <Select
            label="Periode Tren"
            options={[
              { value: '7', label: '7 hari' },
              { value: '14', label: '14 hari' },
              { value: '30', label: '30 hari' },
              { value: '90', label: '90 hari' },
            ]}
            value={String(trendDays)}
            onChange={(event) => setTrendDays(Number(event.target.value))}
          />
        </CardBody>
      </Card>

      {isLoading ? (
        <ReportSkeleton />
      ) : isError ? (
        <Card>
          <ErrorState
            title="Gagal memuat laporan"
            description={getErrorMessage(overviewQuery.error)}
            onRetry={retryAll}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {stats.map((stat) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                icon={stat.icon}
                color={stat.color}
              />
            ))}
          </div>

          {/* Extra insight strip */}
          <Card>
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Anggota Ter busiest</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {overview?.busiestMember?.name || '-'}
                </p>
                {overview?.busiestMember?.total !== undefined && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatNumber(overview.busiestMember.total)} task
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Rata-rata Durasi Task</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {Number(overview?.avgTaskDuration || 0)} hari
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Penyelesaian Tepat Waktu</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {Math.round(Number(overview?.onTimeCompletionRate || 0))}%
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {formatNumber(overview?.projects?.active || 0)} project aktif,{' '}
                  {formatNumber(overview?.tasks?.done || 0)} task selesai
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">Label Terpopuler</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {topLabels.length ? (
                    topLabels.slice(0, 4).map((label) => (
                      <span
                        key={label.name}
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: `${label.color}1f`,
                          color: label.color,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: label.color }}
                        />
                        {label.name} ({label.count})
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-400">-</span>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* S-Curve & EVM Section */}
          <Card>
            <CardHeader
              title="Kurva-S & Earned Value Management (EVM)"
              description="Perbandingan nilai rencana (PV), progres bobot riil (EV), dan realisasi biaya (AC) beserta indeks performa CPI/SPI"
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    options={projectOptions}
                    placeholder="Pilih Project"
                    value={activeEvmProjectId}
                    onChange={(event) => setEvmProjectId(event.target.value)}
                    containerClassName="w-56"
                    className="h-9 py-1.5 text-xs"
                  />
                  <Select
                    options={[
                      { value: 'daily', label: 'Interval: Harian' },
                      { value: 'weekly', label: 'Interval: Mingguan' },
                    ]}
                    value={evmInterval}
                    onChange={(event) => setEvmInterval(event.target.value)}
                    containerClassName="w-36"
                    className="h-9 py-1.5 text-xs"
                  />
                </div>
              }
            />
            <CardBody>
              {!activeEvmProjectId ? (
                <EmptyState
                  icon={TrendingUp}
                  title="Pilih project untuk melihat Kurva-S & EVM"
                  description="Grafik Kurva-S dan indikator EVM membutuhkan satu project acuan."
                />
              ) : evmQuery.isLoading ? (
                <LoadingState label="Menghitung Kurva-S & EVM..." />
              ) : evmQuery.isError ? (
                <ErrorState
                  description={getErrorMessage(evmQuery.error)}
                  onRetry={() => evmQuery.refetch()}
                />
              ) : (
                <SCurveEvmChart data={evmQuery.data} />
              )}
            </CardBody>
          </Card>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Distribusi Status Task"
                description={projectId ? 'Dibatasi pada project terpilih' : 'Seluruh task'}
              />
              <CardBody>
                {statusQuery.isLoading ? (
                  <LoadingState label="Memuat distribusi status..." />
                ) : statusQuery.isError ? (
                  <ErrorState
                    description={getErrorMessage(statusQuery.error)}
                    onRetry={() => statusQuery.refetch()}
                  />
                ) : (
                  <StatusPieChart data={statusQuery.data || []} />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Produktivitas per Anggota"
                description="Task selesai dibanding task yang masih terbuka"
              />
              <CardBody>
                {productivityQuery.isLoading ? (
                  <LoadingState label="Memuat produktivitas..." />
                ) : productivityQuery.isError ? (
                  <ErrorState
                    description={getErrorMessage(productivityQuery.error)}
                    onRetry={() => productivityQuery.refetch()}
                  />
                ) : (
                  <ProductivityBarChart data={productivityQuery.data || []} />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Tren Penyelesaian"
                description={`Task dibuat dan diselesaikan dalam ${trendDays} hari terakhir`}
              />
              <CardBody>
                {trendQuery.isLoading ? (
                  <LoadingState label="Memuat tren..." />
                ) : trendQuery.isError ? (
                  <ErrorState
                    description={getErrorMessage(trendQuery.error)}
                    onRetry={() => trendQuery.refetch()}
                  />
                ) : (
                  <TrendAreaChart data={trendQuery.data || []} />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Burndown"
                description="Sisa pekerjaan dibanding garis ideal"
                action={
                  <Select
                    options={projectOptions}
                    placeholder="Pilih Project"
                    value={activeBurndownProjectId}
                    onChange={(event) => setBurndownProjectId(event.target.value)}
                    containerClassName="w-56"
                    className="h-9 py-1.5 text-xs"
                  />
                }
              />
              <CardBody>
                {!activeBurndownProjectId ? (
                  <EmptyState
                    icon={BarChart3}
                    title="Pilih project untuk melihat burndown"
                    description="Grafik burndown membutuhkan satu project tertentu sebagai acuan."
                  />
                ) : burndownQuery.isLoading ? (
                  <LoadingState label="Memuat burndown..." />
                ) : burndownQuery.isError ? (
                  <ErrorState
                    description={getErrorMessage(burndownQuery.error)}
                    onRetry={() => burndownQuery.refetch()}
                  />
                ) : (
                  <BurndownChart data={burndownQuery.data?.series || burndownQuery.data || []} />
                )}
              </CardBody>
            </Card>
          </div>

          {/* Project breakdown */}
          <Card>
            <CardHeader
              title="Rincian Project"
              description="Progres dan jumlah task per project"
            />
            {projectBreakdown.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Project</TH>
                    <TH>Status</TH>
                    <TH>Pagu Anggaran</TH>
                    <TH>Realisasi Biaya</TH>
                    <TH>Jumlah Task</TH>
                    <TH className="w-56">Progres</TH>
                  </TR>
                </THead>
                <TBody>
                  {projectBreakdown.map((project) => (
                    <TR key={project.id}>
                      <TD>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                            {project.name}
                          </p>
                          {project.code && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {project.code}
                            </p>
                          )}
                        </div>
                      </TD>
                      <TD>
                        <StatusBadge status={project.status} size="sm" />
                      </TD>
                      <TD className="tabular-nums font-mono text-xs text-slate-700 dark:text-slate-300">
                        {formatCurrency(project.budget || 0)}
                      </TD>
                      <TD className={cn(
                        "tabular-nums font-mono text-xs font-semibold",
                        Number(project.budget) > 0 && Number(project.actualCost) > Number(project.budget)
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-slate-800 dark:text-slate-100"
                      )}>
                        {formatCurrency(project.actualCost || 0)}
                      </TD>
                      <TD className="tabular-nums">{formatNumber(project.taskCount || 0)}</TD>
                      <TD>
                        <div className="flex items-center gap-3">
                          <ProgressBar
                            value={project.progress || 0}
                            className="flex-1"
                            color={lookup(PROJECT_STATUS, project.status).color}
                          />
                          <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
                            {Math.round(Number(project.progress || 0))}%
                          </span>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState
                icon={FolderKanban}
                title="Belum ada data project"
                description="Rincian project akan tampil setelah tersedia project pada workspace Anda."
              />
            )}
          </Card>
        </div>
      )}

      {/* Modal Cetak / Ekspor PDF Laporan Eksekutif */}
      <ExecutiveReportModal
        open={executiveModalOpen}
        onClose={() => setExecutiveModalOpen(false)}
        projectId={projectId || activeEvmProjectId}
        from={from}
        to={to}
      />
    </div>
  );
}
