import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
  Search,
  Filter,
  Check,
  CalendarDays,
  User,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Flame,
  Info,
} from 'lucide-react';
import { projectApi } from '../../api/project.api';
import { taskApi } from '../../api/task.api';
import { formatDate, daysUntil } from '../../utils/formatters';
import { Button, IconButton } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Input, Textarea, Select } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { EmptyState, LoadingState } from '../ui/Feedback';
import { cn } from '../../utils/cn';
import { getErrorMessage } from '../../api/client';
import {
  RISK_TYPES,
  RISK_CATEGORIES,
  RISK_STATUS,
  RISK_SEVERITY,
  PROBABILITY_SCALE,
  IMPACT_SCALE,
  calculateRiskSeverity,
} from '../../utils/constants';

export function ProjectRiskTab({ projectId, members = [], canManage = false, currentUserId }) {
  const queryClient = useQueryClient();

  // Filters state
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('');
  const [matrixFilter, setMatrixFilter] = useState(null); // { probability: number, impact: number }
  const [expandedRiskId, setExpandedRiskId] = useState(null);

  // Modal states
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    type: 'risk',
    title: '',
    description: '',
    category: 'technical',
    probability: 3,
    impact: 3,
    mitigation_plan: '',
    contingency_plan: '',
    status: 'identified',
    owner_id: '',
    linked_task_id: '',
    target_date: '',
  });
  const [formError, setFormError] = useState('');

  // 1. Fetch risks & summary
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      'project-risks',
      projectId,
      selectedType,
      selectedCategory,
      selectedSeverity,
      selectedStatus,
      selectedOwner,
      matrixFilter?.probability,
      matrixFilter?.impact,
      search,
    ],
    queryFn: () =>
      projectApi.risks(projectId, {
        type: selectedType || undefined,
        category: selectedCategory || undefined,
        severity: selectedSeverity || undefined,
        status: selectedStatus || undefined,
        owner_id: selectedOwner || undefined,
        probability: matrixFilter?.probability || undefined,
        impact: matrixFilter?.impact || undefined,
        search: search || undefined,
      }),
    enabled: Boolean(projectId),
  });

  // 2. Fetch project tasks for linking (only when modal opens)
  const { data: tasksData } = useQuery({
    queryKey: ['tasks', 'project', projectId],
    queryFn: () => taskApi.list({ project_id: projectId, perPage: 100 }),
    enabled: riskModalOpen,
  });

  const risks = data?.risks ?? [];
  const summary = data?.summary ?? {
    total_count: 0,
    open_count: 0,
    resolved_count: 0,
    critical_high_open_count: 0,
    risk_count: 0,
    issue_count: 0,
    by_severity: { low: 0, medium: 0, high: 0, critical: 0 },
    by_status: {},
    by_category: [],
    matrix: [],
  };
  const tasks = tasksData?.data ?? [];

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload) => projectApi.createRisk(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-risks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', String(projectId)] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Risiko/masalah berhasil dicatat');
      setRiskModalOpen(false);
      resetForm();
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ riskId, payload }) => projectApi.updateRisk(projectId, riskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-risks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', String(projectId)] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Risiko/masalah berhasil diperbarui');
      setRiskModalOpen(false);
      resetForm();
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const quickStatusMutation = useMutation({
    mutationFn: ({ riskId, status }) => projectApi.updateRisk(projectId, riskId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-risks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', String(projectId)] });
      toast.success('Status risiko diperbarui');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (riskId) => projectApi.removeRisk(projectId, riskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-risks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', String(projectId)] });
      toast.success('Risiko berhasil dihapus');
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const resetForm = () => {
    setEditingRisk(null);
    setFormData({
      type: 'risk',
      title: '',
      description: '',
      category: 'technical',
      probability: 3,
      impact: 3,
      mitigation_plan: '',
      contingency_plan: '',
      status: 'identified',
      owner_id: '',
      linked_task_id: '',
      target_date: '',
    });
    setFormError('');
  };

  const handleOpenCreate = () => {
    resetForm();
    setRiskModalOpen(true);
  };

  const handleOpenEdit = (risk) => {
    setEditingRisk(risk);
    setFormData({
      type: risk.type || 'risk',
      title: risk.title || '',
      description: risk.description || '',
      category: risk.category || 'technical',
      probability: Number(risk.probability) || 3,
      impact: Number(risk.impact) || 3,
      mitigation_plan: risk.mitigation_plan || '',
      contingency_plan: risk.contingency_plan || '',
      status: risk.status || 'identified',
      owner_id: risk.owner_id ? String(risk.owner_id) : '',
      linked_task_id: risk.linked_task_id ? String(risk.linked_task_id) : '',
      target_date: risk.target_date ? String(risk.target_date).slice(0, 10) : '',
    });
    setFormError('');
    setRiskModalOpen(true);
  };

  const handleSubmitRisk = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setFormError('Judul risiko / masalah wajib diisi');
      return;
    }

    const payload = {
      type: formData.type,
      title: formData.title.trim(),
      description: formData.description?.trim() || null,
      category: formData.category,
      probability: Number(formData.probability),
      impact: Number(formData.impact),
      mitigation_plan: formData.mitigation_plan?.trim() || null,
      contingency_plan: formData.contingency_plan?.trim() || null,
      status: formData.status,
      owner_id: formData.owner_id ? Number(formData.owner_id) : null,
      linked_task_id: formData.linked_task_id ? Number(formData.linked_task_id) : null,
      target_date: formData.target_date || null,
    };

    if (editingRisk) {
      updateMutation.mutate({ riskId: editingRisk.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Matrix cell lookup helper
  const matrixCells = useMemo(() => {
    const map = new Map();
    (summary.matrix || []).forEach((c) => {
      map.set(`${c.probability}-${c.impact}`, c);
    });
    return map;
  }, [summary.matrix]);

  // Live preview for form
  const formPreview = useMemo(() => {
    return calculateRiskSeverity(formData.probability, formData.impact);
  }, [formData.probability, formData.impact]);

  const hasActiveFilters =
    Boolean(search) ||
    Boolean(selectedType) ||
    Boolean(selectedCategory) ||
    Boolean(selectedSeverity) ||
    Boolean(selectedStatus) ||
    Boolean(selectedOwner) ||
    Boolean(matrixFilter);

  const handleClearFilters = () => {
    setSearch('');
    setSelectedType('');
    setSelectedCategory('');
    setSelectedSeverity('');
    setSelectedStatus('');
    setSelectedOwner('');
    setMatrixFilter(null);
  };

  return (
    <div className="space-y-6">
      {/* 1. Critical Risks Banner */}
      {summary.critical_high_open_count > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-900 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm dark:bg-rose-700">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-rose-950 dark:text-rose-100">
                Peringatan: {summary.critical_high_open_count} Risiko / Masalah Berstatus Tinggi & Kritis Aktif!
              </p>
              <p className="mt-0.5 text-xs text-rose-800 dark:text-rose-300">
                Segera tindak lanjuti rencana mitigasi atau eskalasikan ke penanggung jawab terkait untuk mencegah dampak keterlambatan atau pembengkakan biaya.
              </p>
            </div>
          </div>
          <Button
            size="xs"
            variant="danger"
            onClick={() => {
              setSelectedSeverity('critical');
              setSelectedStatus('identified');
            }}
          >
            Lihat Risiko Kritis
          </Button>
        </div>
      )}

      {/* 2. KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Item */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Register</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {summary.total_count}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary.risk_count} Potensi Risiko · {summary.issue_count} Masalah Aktual
          </p>
        </div>

        {/* Open Risks */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Risiko Terbuka (Open)</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
            {summary.open_count}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Sedang dalam analisis, mitigasi, & pemantauan
          </p>
        </div>

        {/* High & Critical */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tinggi & Kritis Terbuka</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
              <Flame className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
            {summary.critical_high_open_count}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Risiko dengan skor &ge; 10 yang butuh penanganan prioritas
          </p>
        </div>

        {/* Resolved / Closed */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Teratasi / Ditutup</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            {summary.resolved_count}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary.total_count > 0
              ? `${Math.round((summary.resolved_count / summary.total_count) * 100)}% mitigasi berhasil diselesaikan`
              : 'Belum ada catatan risiko'}
          </p>
        </div>
      </div>

      {/* 3. Interactive 5x5 Risk Matrix & Categories */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* 5x5 Matrix Grid */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Matriks Risiko 5×5 (Probability × Impact)</span>
                {matrixFilter && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                    Filter: P={matrixFilter.probability}, I={matrixFilter.impact}
                    <button
                      type="button"
                      onClick={() => setMatrixFilter(null)}
                      className="hover:text-brand-900 dark:hover:text-brand-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Klik pada sel matriks untuk memfilter daftar risiko di bawah.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Rendah (1-4)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Sedang (5-9)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Tinggi (10-15)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Kritis (16-25)
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            {/* Y-Axis Label (Probability) */}
            <div className="flex flex-col items-center justify-center pr-1 text-slate-400">
              <span className="-rotate-90 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                &larr; Kemungkinan (Probability) &rarr;
              </span>
            </div>

            {/* Matrix 5x5 container */}
            <div className="flex-1">
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((prob) => (
                  <div key={prob} className="flex items-center gap-1.5">
                    {/* Prob indicator */}
                    <span className="w-5 text-right font-mono text-xs font-semibold text-slate-400">
                      P{prob}
                    </span>

                    {/* 5 Impact Cells for this prob */}
                    <div className="grid flex-1 grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map((imp) => {
                        const cell = matrixCells.get(`${prob}-${imp}`);
                        const count = cell?.count || 0;
                        const openCount = cell?.open_count || 0;
                        const { score, severity } = calculateRiskSeverity(prob, imp);
                        const isSelected =
                          matrixFilter?.probability === prob && matrixFilter?.impact === imp;

                        // Theme colors for cell
                        let cellBg = 'bg-slate-50 border-slate-200 dark:bg-slate-800/40 dark:border-slate-700/60';
                        if (severity === 'critical') {
                          cellBg = count > 0
                            ? 'bg-rose-500/20 border-rose-300 dark:bg-rose-950/60 dark:border-rose-800'
                            : 'bg-rose-50/50 border-rose-100 hover:bg-rose-100/50 dark:bg-rose-950/20 dark:border-rose-900/30';
                        } else if (severity === 'high') {
                          cellBg = count > 0
                            ? 'bg-orange-500/20 border-orange-300 dark:bg-orange-950/60 dark:border-orange-800'
                            : 'bg-orange-50/50 border-orange-100 hover:bg-orange-100/50 dark:bg-orange-950/20 dark:border-orange-900/30';
                        } else if (severity === 'medium') {
                          cellBg = count > 0
                            ? 'bg-amber-500/20 border-amber-300 dark:bg-amber-950/60 dark:border-amber-800'
                            : 'bg-amber-50/50 border-amber-100 hover:bg-amber-100/50 dark:bg-amber-950/20 dark:border-amber-900/30';
                        } else {
                          cellBg = count > 0
                            ? 'bg-emerald-500/20 border-emerald-300 dark:bg-emerald-950/60 dark:border-emerald-800'
                            : 'bg-emerald-50/50 border-emerald-100 hover:bg-emerald-100/50 dark:bg-emerald-950/20 dark:border-emerald-900/30';
                        }

                        return (
                          <button
                            key={imp}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setMatrixFilter(null);
                              } else {
                                setMatrixFilter({ probability: prob, impact: imp });
                              }
                            }}
                            className={cn(
                              'relative flex h-14 flex-col items-center justify-center rounded-xl border p-1 transition-all',
                              cellBg,
                              isSelected && 'ring-2 ring-brand-600 ring-offset-2 dark:ring-offset-slate-900 shadow-md',
                              'hover:scale-[1.02]'
                            )}
                            title={`P=${prob}, I=${imp} (Skor: ${score} - ${severity.toUpperCase()}) : ${count} item`}
                          >
                            <span className="font-mono text-[10px] text-slate-400">
                              {score}
                            </span>
                            {count > 0 ? (
                              <span
                                className={cn(
                                  'mt-0.5 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                                  severity === 'critical' && 'bg-rose-600 text-white',
                                  severity === 'high' && 'bg-orange-500 text-white',
                                  severity === 'medium' && 'bg-amber-500 text-white',
                                  severity === 'low' && 'bg-emerald-600 text-white'
                                )}
                              >
                                {count}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300 dark:text-slate-600">-</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* X-Axis labels (Impact) */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="w-5" />
                  <div className="grid flex-1 grid-cols-5 gap-1.5 text-center">
                    {[1, 2, 3, 4, 5].map((imp) => (
                      <span key={imp} className="font-mono text-xs font-semibold text-slate-400">
                        I{imp}
                      </span>
                    ))}
                  </div>
                </div>

                <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 pt-0.5">
                  &larr; Dampak (Impact) &rarr;
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Categories & Status Breakdown */}
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Distribusi per Kategori
            </h4>
            <div className="space-y-2.5">
              {Object.entries(RISK_CATEGORIES).map(([catKey, catMeta]) => {
                const count = (summary.by_category || []).find((c) => c.category === catKey)?.count || 0;
                const percent = summary.total_count > 0 ? Math.round((count / summary.total_count) * 100) : 0;
                return (
                  <div key={catKey} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300 truncate max-w-[170px]">
                      {catMeta.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">{percent}%</span>
                      <span className="w-6 text-right font-semibold text-slate-900 dark:text-white">
                        {count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Status Penanganan
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(RISK_STATUS).map(([stKey, stMeta]) => {
                const count = summary.by_status?.[stKey] || 0;
                return (
                  <div
                    key={stKey}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <span className="text-slate-600 dark:text-slate-400 text-[11px] truncate">
                      {stMeta.label}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Filter Bar & Actions */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Daftar Risiko & Masalah Proyek (Risk Register)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pencatatan potensi risiko, isu aktual, rencana pencegahan/mitigasi, dan status penanganan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={handleOpenCreate}
            >
              Catat Risiko / Masalah
            </Button>
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2.5 p-4 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari judul, kode, mitigasi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">Semua Tipe</option>
            <option value="risk">Potensi Risiko (Risk)</option>
            <option value="issue">Masalah Aktual (Issue)</option>
          </select>

          {/* Severity Filter */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">Semua Tingkat Keparahan</option>
            <option value="critical">Kritis (Skor 16-25)</option>
            <option value="high">Tinggi (Skor 10-15)</option>
            <option value="medium">Sedang (Skor 5-9)</option>
            <option value="low">Rendah (Skor 1-4)</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">Semua Kategori</option>
            {Object.entries(RISK_CATEGORIES).map(([k, meta]) => (
              <option key={k} value={k}>
                {meta.label}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">Semua Status</option>
            {Object.entries(RISK_STATUS).map(([k, meta]) => (
              <option key={k} value={k}>
                {meta.label}
              </option>
            ))}
          </select>

          {/* Owner PIC Filter */}
          <select
            value={selectedOwner}
            onChange={(e) => setSelectedOwner(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">Semua PIC</option>
            <option value="unassigned">-- Belum Ditugaskan --</option>
            {members.map((m) => (
              <option key={m.id || m.user_id} value={m.id || m.user_id}>
                {m.name}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              leftIcon={<X className="h-3.5 w-3.5" />}
              className="text-slate-500"
            >
              Reset Filter
            </Button>
          )}
        </div>

        {/* 5. Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <LoadingState label="Memuat register risiko proyek..." />
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-rose-500">
              Gagal memuat data risiko proyek. Silakan coba lagi.
            </div>
          ) : risks.length === 0 ? (
            <div className="p-12 text-center">
              <EmptyState
                icon={ShieldAlert}
                title={hasActiveFilters ? 'Tidak ada risiko yang sesuai filter' : 'Belum ada risiko / masalah'}
                description={
                  hasActiveFilters
                    ? 'Coba sesuaikan filter pencarian atau matriks risiko Anda.'
                    : 'Mulai identifikasi dan catat potensi risiko proyek untuk persiapan rencana mitigasi.'
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="secondary" size="sm" onClick={handleClearFilters}>
                      Hapus Filter
                    </Button>
                  ) : (
                    <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={handleOpenCreate}>
                      Catat Risiko Pertama
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-semibold w-24">Kode</th>
                  <th className="py-3 px-4 font-semibold min-w-[220px]">Risiko & Deskripsi</th>
                  <th className="py-3 px-4 font-semibold">Kategori</th>
                  <th className="py-3 px-4 font-semibold text-center w-28">P × I = Skor</th>
                  <th className="py-3 px-4 font-semibold min-w-[200px]">Rencana Mitigasi</th>
                  <th className="py-3 px-4 font-semibold min-w-[150px]">PIC & Target</th>
                  <th className="py-3 px-4 font-semibold w-36">Status</th>
                  <th className="py-3 px-4 font-semibold text-center w-20">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {risks.map((risk) => {
                  const typeMeta = RISK_TYPES[risk.type] || RISK_TYPES.risk;
                  const catMeta = RISK_CATEGORIES[risk.category] || RISK_CATEGORIES.technical;
                  const sevMeta = RISK_SEVERITY[risk.severity] || RISK_SEVERITY.medium;
                  const stMeta = RISK_STATUS[risk.status] || RISK_STATUS.identified;
                  const targetDays = daysUntil(risk.target_date);
                  const isExpanded = expandedRiskId === risk.id;

                  const canEdit =
                    canManage ||
                    Number(risk.owner_id) === Number(currentUserId) ||
                    Number(risk.created_by) === Number(currentUserId);

                  return (
                    <tr
                      key={risk.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors"
                    >
                      {/* Code & Type */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block">
                          {risk.code}
                        </span>
                        <span
                          className={cn(
                            'mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold',
                            typeMeta.bg
                          )}
                        >
                          {typeMeta.label}
                        </span>
                      </td>

                      {/* Title & Description & Linked Task */}
                      <td className="py-3.5 px-4 align-top">
                        <p className="font-semibold text-slate-900 dark:text-white leading-snug">
                          {risk.title}
                        </p>
                        {risk.description && (
                          <p className="mt-1 text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed line-clamp-2">
                            {risk.description}
                          </p>
                        )}
                        {risk.linked_task_title && (
                          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-brand-600 dark:text-brand-400 font-medium">
                            <span className="text-slate-400">Terkait Task:</span>
                            <span className="truncate max-w-xs">{risk.linked_task_title}</span>
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {catMeta.label}
                        </span>
                      </td>

                      {/* Probability x Impact = Score & Severity */}
                      <td className="py-3.5 px-4 align-top text-center whitespace-nowrap">
                        <div className="inline-flex flex-col items-center">
                          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                            P{risk.probability} × I{risk.impact} ={' '}
                            <span className="font-bold text-sm text-slate-900 dark:text-white">
                              {risk.risk_score}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide',
                              sevMeta.bg
                            )}
                          >
                            {sevMeta.label}
                          </span>
                        </div>
                      </td>

                      {/* Mitigation & Contingency */}
                      <td className="py-3.5 px-4 align-top">
                        {risk.mitigation_plan ? (
                          <div>
                            <p className="text-[11px] text-slate-700 dark:text-slate-300 line-clamp-2">
                              <span className="font-semibold text-slate-900 dark:text-white">Mitigasi: </span>
                              {risk.mitigation_plan}
                            </p>
                            {risk.contingency_plan && (
                              <button
                                type="button"
                                onClick={() => setExpandedRiskId(isExpanded ? null : risk.id)}
                                className="mt-1 text-[10px] font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-0.5"
                              >
                                {isExpanded ? 'Sembunyikan Kontingensi' : 'Lihat Rencana Kontingensi'}
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                            )}
                            {isExpanded && risk.contingency_plan && (
                              <div className="mt-2 rounded-lg bg-amber-50/60 p-2 text-[11px] text-amber-900 border border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-200">
                                <span className="font-semibold">Kontingensi: </span>
                                {risk.contingency_plan}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Belum dirumuskan</span>
                        )}
                      </td>

                      {/* PIC & Target Date */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        {risk.owner_name ? (
                          <div className="flex items-center gap-2">
                            <Avatar src={risk.owner_avatar} name={risk.owner_name} size="xs" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-900 dark:text-white truncate max-w-[120px]">
                                {risk.owner_name}
                              </p>
                              {risk.owner_job_title && (
                                <p className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                  {risk.owner_job_title}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Belum ada PIC</span>
                        )}

                        {risk.target_date && (
                          <p
                            className={cn(
                              'mt-1 text-[10px] flex items-center gap-1 font-mono',
                              targetDays !== null && targetDays < 0 && risk.status !== 'resolved' && risk.status !== 'closed'
                                ? 'text-rose-600 font-semibold dark:text-rose-400'
                                : 'text-slate-500 dark:text-slate-400'
                            )}
                          >
                            <CalendarDays className="h-3 w-3" />
                            {formatDate(risk.target_date)}
                            {targetDays !== null && risk.status !== 'resolved' && risk.status !== 'closed' && (
                              <span>({targetDays < 0 ? `${Math.abs(targetDays)}h lalu` : `${targetDays}h lagi`})</span>
                            )}
                          </p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 align-top">
                        {canEdit ? (
                          <select
                            value={risk.status}
                            onChange={(e) =>
                              quickStatusMutation.mutate({ riskId: risk.id, status: e.target.value })
                            }
                            disabled={quickStatusMutation.isPending}
                            className={cn(
                              'h-7 rounded-lg border px-2 text-[11px] font-semibold focus:outline-none cursor-pointer',
                              stMeta.bg,
                              'border-transparent'
                            )}
                          >
                            {Object.entries(RISK_STATUS).map(([k, s]) => (
                              <option key={k} value={k}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold',
                              stMeta.bg
                            )}
                          >
                            {stMeta.label}
                          </span>
                        )}
                        {risk.resolved_at && (
                          <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                            Selesai {formatDate(risk.resolved_at)}
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 align-top text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <IconButton
                              size="icon-xs"
                              variant="ghost"
                              label="Edit risiko"
                              onClick={() => handleOpenEdit(risk)}
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-500" />
                            </IconButton>
                          )}
                          {canManage && (
                            <IconButton
                              size="icon-xs"
                              variant="ghost"
                              label="Hapus risiko"
                              onClick={() => setDeleteTarget(risk)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 6. Modal Tambah / Edit Risiko */}
      <Modal
        open={riskModalOpen}
        onClose={() => setRiskModalOpen(false)}
        size="lg"
        title={editingRisk ? `Edit Register [${editingRisk.code}]` : 'Catat Risiko / Masalah Proyek'}
        description="Identifikasi potensi risiko atau masalah aktual beserta rencana mitigasi dan penanggung jawab."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRiskModalOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleSubmitRisk}
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingRisk ? 'Simpan Perubahan' : 'Catat Risiko'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitRisk} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
              {formError}
            </div>
          )}

          {/* Type & Category */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Tipe Entri"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              options={[
                { value: 'risk', label: 'Potensi Risiko (Belum Terjadi)' },
                { value: 'issue', label: 'Masalah Aktual (Sedang / Sudah Terjadi)' },
              ]}
              required
            />

            <Select
              label="Kategori Risiko"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              options={Object.entries(RISK_CATEGORIES).map(([k, meta]) => ({
                value: k,
                label: meta.label,
              }))}
              required
            />
          </div>

          {/* Title */}
          <Input
            label="Judul Risiko / Masalah"
            placeholder="Contoh: Keterlambatan pengiriman lisensi server dari vendor"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />

          {/* Description */}
          <Textarea
            label="Deskripsi & Analisis Penyebab"
            rows={2}
            placeholder="Jelaskan pemicu risiko, kondisi di lapangan, dan estimasi dampaknya terhadap deliverable proyek..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />

          {/* Probability & Impact Matrix Selector with Live Severity Card */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Tingkat Matriks Risiko (Probability × Impact)
              </span>

              {/* Live Preview Pill */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  Skor: <strong className="font-mono text-slate-900 dark:text-white">{formPreview.score}</strong>
                </span>
                <span
                  className={cn(
                    'px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase',
                    RISK_SEVERITY[formPreview.severity].bg
                  )}
                >
                  {RISK_SEVERITY[formPreview.severity].label}
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Kemungkinan Terjadi (Probability)
                </label>
                <select
                  value={formData.probability}
                  onChange={(e) => setFormData({ ...formData, probability: Number(e.target.value) })}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {Object.entries(PROBABILITY_SCALE).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Dampak Terhadap Proyek (Impact)
                </label>
                <select
                  value={formData.impact}
                  onChange={(e) => setFormData({ ...formData, impact: Number(e.target.value) })}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {Object.entries(IMPACT_SCALE).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Mitigation Plan */}
          <Textarea
            label="Rencana Mitigasi (Pencegahan Sebelum Terjadi)"
            rows={2}
            placeholder="Tindakan pencegahan untuk menurunkan kemungkinan terjadinya risiko..."
            value={formData.mitigation_plan}
            onChange={(e) => setFormData({ ...formData, mitigation_plan: e.target.value })}
          />

          {/* Contingency Plan */}
          <Textarea
            label="Rencana Kontingensi (Penanganan Saat / Jika Terjadi)"
            rows={2}
            placeholder="Langkah antisipasi darurat yang dieksekusi bila risiko benar-benar terjadi..."
            value={formData.contingency_plan}
            onChange={(e) => setFormData({ ...formData, contingency_plan: e.target.value })}
          />

          {/* PIC & Linked Task */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Penanggung Jawab (PIC)"
              value={formData.owner_id}
              onChange={(e) => setFormData({ ...formData, owner_id: e.target.value })}
              options={[
                { value: '', label: '-- Belum Ditugaskan --' },
                ...members.map((m) => ({
                  value: String(m.id || m.user_id),
                  label: `${m.name} (${m.role})`,
                })),
              ]}
            />

            <Select
              label="Terkait Task Tertentu (Opsional)"
              value={formData.linked_task_id}
              onChange={(e) => setFormData({ ...formData, linked_task_id: e.target.value })}
              options={[
                { value: '', label: '-- Tidak Terkait Task Spesifik --' },
                ...tasks.map((t) => ({ value: String(t.id), label: t.title })),
              ]}
            />
          </div>

          {/* Target Date & Status */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Target Tanggal Selesai / Review"
              type="date"
              value={formData.target_date}
              onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
            />

            <Select
              label="Status Penanganan"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={Object.entries(RISK_STATUS).map(([k, meta]) => ({
                value: k,
                label: meta.label,
              }))}
            />
          </div>
        </form>
      </Modal>

      {/* 7. Confirm Delete Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Hapus Catatan Risiko?"
        description={
          deleteTarget
            ? `Risiko / masalah [${deleteTarget.code}] "${deleteTarget.title}" akan dihapus secara permanen dari register proyek.`
            : ''
        }
        confirmVariant="danger"
        confirmLabel="Ya, Hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

export default ProjectRiskTab;

