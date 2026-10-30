import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Printer,
  X,
  FileSpreadsheet,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Building,
  User,
  Wallet,
  TrendingUp,
  Percent,
} from 'lucide-react';
import { reportApi } from '../../api';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters';
import { StatusBadge, PriorityBadge } from './Badges';
import { ProgressBar } from '../ui/ProgressBar';
import { Button } from '../ui/Button';
import { LoadingState, ErrorState } from '../ui/Feedback';
import { cn } from '../../utils/cn';

export function ExecutiveReportModal({ open, onClose, projectId, from, to }) {
  const printAreaRef = useRef(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'executive', projectId || 'all', from || '', to || ''],
    queryFn: () =>
      reportApi.executive({
        project_id: projectId || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    enabled: open,
    staleTime: 60 * 1000,
  });

  if (!open) return null;

  const handlePrint = () => {
    if (!printAreaRef.current) return;
    const content = printAreaRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=1000,height=800');

    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="id">
        <head>
          <meta charset="utf-8" />
          <title>Laporan Eksekutif Status Proyek - ${new Date().toISOString().slice(0, 10)}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .page-break-inside-avoid {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            @media print {
              .no-print { display: none !important; }
              body { padding: 0 !important; }
            }
          </style>
        </head>
        <body class="p-6">
          ${content}
          <script>
            window.onload = function() {
              window.focus();
              setTimeout(() => {
                window.print();
                window.close();
              }, 400);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const kpi = data?.kpi || {};
  const fin = data?.financials || {};
  const evm = data?.evm?.summary || {};
  const scope = data?.scope || {};
  const milestones = data?.milestones || [];
  const overdueTasks = data?.overdueTasks || [];
  const projects = data?.projectBreakdown || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900 dark:border dark:border-slate-800">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Pratinjau Laporan Status Proyek Eksekutif
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dokumen siap cetak dan ekspor format PDF
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              leftIcon={<Printer className="h-4 w-4" />}
              onClick={handlePrint}
              disabled={isLoading || isError}
            >
              Cetak / Simpan PDF
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Report Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <LoadingState label="Menyiapkan data laporan eksekutif..." />
          ) : isError ? (
            <ErrorState
              title="Gagal memuat laporan eksekutif"
              description="Terjadi kendala saat menyusun data ringkasan proyek."
              onRetry={() => refetch()}
            />
          ) : (
            <div
              ref={printAreaRef}
              className="mx-auto max-w-[850px] bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100"
            >
              {/* Header Dokumen Laporan */}
              <div className="border-b-2 border-slate-900 pb-4 dark:border-slate-100">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      Project Management System • Executive Report
                    </span>
                    <h1 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                      LAPORAN STATUS PROYEK EKSEKUTIF
                    </h1>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Lingkup:{' '}
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {scope.isSingleProject && scope.project
                          ? `${scope.project.code ? `${scope.project.code} - ` : ''}${scope.project.name}`
                          : 'Semua Proyek (Portofolio)'}
                      </span>
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                    <p>
                      Tanggal Cetak:{' '}
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {data?.generatedAt ? formatDate(data.generatedAt, 'dd MMMM yyyy HH:mm') : '-'}
                      </span>
                    </p>
                    <p>
                      Pencetak:{' '}
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {data?.generatedBy?.name || 'Administrator'} ({data?.generatedBy?.role})
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 1: RINGKASAN KPI */}
              <div className="mt-5 page-break-inside-avoid">
                <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  1. Indikator Performa Utama (KPI)
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Total Proyek Aktif</span>
                    <p className="mt-1 text-xl font-bold text-indigo-600 dark:text-indigo-400">
                      {formatNumber(kpi.activeProjects || 0)}{' '}
                      <span className="text-xs font-normal text-slate-500">/ {formatNumber(kpi.totalProjects || 0)} total</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Rata-rata Progres</span>
                    <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                      {Math.round(Number(kpi.avgProgress || 0))}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Completion Rate</span>
                    <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">
                      {Math.round(Number(kpi.completionRate || 0))}%
                    </p>
                    <span className="text-[10px] text-slate-500">
                      {formatNumber(kpi.doneTasks || 0)} dari {formatNumber(kpi.totalTasks || 0)} task
                    </span>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Task Terlambat</span>
                    <p className={cn(
                      "mt-1 text-xl font-bold",
                      Number(kpi.overdueTasks || 0) > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"
                    )}>
                      {formatNumber(kpi.overdueTasks || 0)}
                    </p>
                    <span className="text-[10px] text-slate-500">Memerlukan mitigasi segera</span>
                  </div>
                </div>
              </div>

              {/* SECTION 2: RINGKASAN ANGGARAN & EVM */}
              <div className="mt-6 page-break-inside-avoid">
                <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  2. Ringkasan Anggaran & Earned Value Management (EVM)
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Pagu Anggaran</span>
                    <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                      {formatCurrency(fin.totalBudget || 0)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Total RAB (BAC)</span>
                    <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                      {formatCurrency(fin.totalEstimatedCost || 0)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Realisasi Biaya (AC)</span>
                    <p className={cn(
                      "mt-1 text-sm font-bold",
                      Number(fin.totalActualCost || 0) > Number(fin.totalBudget || 0) && Number(fin.totalBudget || 0) > 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-amber-600 dark:text-amber-400"
                    )}>
                      {formatCurrency(fin.totalActualCost || 0)}
                    </p>
                    <span className="text-[10px] text-slate-500">
                      Serapan: {fin.budgetUtilizationRate}%
                    </span>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Sisa Anggaran</span>
                    <p className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(fin.remainingBudget || 0)}
                    </p>
                  </div>
                </div>

                {/* Baris EVM Snapshot */}
                {evm && evm.bac !== undefined && (
                  <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3.5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200/60 pb-2 dark:border-indigo-800/40">
                      <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                        Indeks Kinerja Proyek ({data?.evm?.projectCode ? `${data.evm.projectCode} - ${data.evm.projectName}` : 'EVM Proyek'})
                      </span>
                      <span className="text-[11px] text-indigo-700 dark:text-indigo-300">
                        Target Selesai (EAC): <strong className="font-bold">{formatCurrency(evm.eac || 0)}</strong>
                      </span>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Planned Value (PV):</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(evm.pv || 0)} ({evm.plannedProgress}%)</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Earned Value (EV):</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(evm.ev || 0)} ({evm.earnedProgress}%)</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Cost Performance (CPI):</span>
                        <p className={cn(
                          "font-bold",
                          evm.cpi >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        )}>
                          {evm.cpi !== null ? Number(evm.cpi).toFixed(2) : '-'} {evm.cpi >= 1 ? '(Efisien)' : '(Over Budget)'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Schedule Performance (SPI):</span>
                        <p className={cn(
                          "font-bold",
                          evm.spi >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                        )}>
                          {evm.spi !== null ? Number(evm.spi).toFixed(2) : '-'} {evm.spi >= 1 ? '(Tepat/Cepat)' : '(Terlambat)'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: STATUS MILESTONE */}
              <div className="mt-6 page-break-inside-avoid">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  3. Tonggak Capaian (Milestones)
                </h3>
                {milestones.length ? (
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-100 font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-2">Milestone</th>
                          {!scope.isSingleProject && <th className="px-3 py-2">Proyek</th>}
                          <th className="px-3 py-2">Tenggat Waktu</th>
                          <th className="px-3 py-2">Progres</th>
                          <th className="px-3 py-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {milestones.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                              {m.name}
                            </td>
                            {!scope.isSingleProject && (
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                {m.projectCode || m.projectName}
                              </td>
                            )}
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                              {m.dueDate ? formatDate(m.dueDate, 'dd MMM yyyy') : '-'}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                  <div
                                    className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400"
                                    style={{ width: `${m.progress}%` }}
                                  />
                                </div>
                                <span className="text-[11px] font-medium tabular-nums">{m.progress}%</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={cn(
                                "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                m.status === 'achieved'
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : m.status === 'missed'
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                                    : "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                              )}>
                                {m.status === 'achieved' ? 'Tercapai' : m.status === 'missed' ? 'Terlewati' : 'Sesuai Jadwal'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400 dark:border-slate-800">
                    Tidak ada milestone pada periode ini
                  </p>
                )}
              </div>

              {/* SECTION 4: TASK TERLAMBAT */}
              <div className="mt-6 page-break-inside-avoid">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    4. Daftar Pekerjaan Terlambat (Overdue Tasks)
                  </h3>
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {overdueTasks.length} task memerlukan tindak lanjut
                  </span>
                </div>
                {overdueTasks.length ? (
                  <div className="overflow-hidden rounded-lg border border-rose-200 dark:border-rose-900/40">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-rose-200 bg-rose-50 font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                        <tr>
                          <th className="px-3 py-2">Judul Task</th>
                          <th className="px-3 py-2">Proyek</th>
                          <th className="px-3 py-2">Assignee</th>
                          <th className="px-3 py-2">Tenggat</th>
                          <th className="px-3 py-2">Keterlambatan</th>
                          <th className="px-3 py-2 text-right">Biaya Aktual</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100 dark:divide-rose-900/20">
                        {overdueTasks.slice(0, 15).map((t) => (
                          <tr key={t.id} className="hover:bg-rose-50/30 dark:hover:bg-rose-950/10">
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                              {t.title}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                              {t.projectCode || t.projectName}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                              {t.assigneeName || 'Unassigned'}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                              {t.dueDate ? formatDate(t.dueDate, 'dd MMM yyyy') : '-'}
                            </td>
                            <td className="px-3 py-2">
                              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                                +{t.daysOverdue} hari
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                              {formatCurrency(t.actualCost || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Tidak ada pekerjaan yang terlambat pada proyek ini.</span>
                  </div>
                )}
              </div>

              {/* SECTION 5: RINCIAN PORTOFOLIO PROYEK (Jika semua proyek) */}
              {!scope.isSingleProject && projects.length > 0 && (
                <div className="mt-6 page-break-inside-avoid">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    5. Rincian Kinerja Portofolio Proyek
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-100 font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-2">Proyek</th>
                          <th className="px-3 py-2">Manajer</th>
                          <th className="px-3 py-2">Pagu Anggaran</th>
                          <th className="px-3 py-2">Realisasi (AC)</th>
                          <th className="px-3 py-2">Progres</th>
                          <th className="px-3 py-2 text-right">Indeks CPI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {projects.slice(0, 10).map((p) => (
                          <tr key={p.id}>
                            <td className="px-3 py-2">
                              <span className="font-semibold text-slate-900 dark:text-white">{p.name}</span>
                              {p.code && <span className="ml-1 text-[10px] text-slate-500">({p.code})</span>}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                              {p.managerName || '-'}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              {formatCurrency(p.budget || 0)}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                              {formatCurrency(p.actualCost || 0)}
                            </td>
                            <td className="px-3 py-2 font-medium">
                              {p.progress}%
                            </td>
                            <td className="px-3 py-2 text-right font-bold">
                              {p.cpi !== null ? (
                                <span className={p.cpi >= 1 ? "text-emerald-600" : "text-rose-600"}>
                                  {Number(p.cpi).toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tanda Tangan / Lembar Pengesahan */}
              <div className="mt-12 page-break-inside-avoid border-t border-slate-200 pt-6 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-8 text-center text-xs text-slate-600 dark:text-slate-400">
                  <div>
                    <p className="font-medium">Disiapkan Oleh:</p>
                    <div className="h-16" />
                    <p className="font-bold underline text-slate-900 dark:text-white">
                      {data?.generatedBy?.name || 'Project Manager'}
                    </p>
                    <p className="text-[11px]">Project Manager</p>
                  </div>
                  <div>
                    <p className="font-medium">Disetujui Oleh:</p>
                    <div className="h-16" />
                    <p className="font-bold underline text-slate-900 dark:text-white">
                      Direktur Operasional / Eksekutif
                    </p>
                    <p className="text-[11px]">Pimpinan / Stakeholder</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExecutiveReportModal;

