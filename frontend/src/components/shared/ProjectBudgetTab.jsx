import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Wallet,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  FileSpreadsheet,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  FileText,
  UploadCloud,
  Check,
  X,
} from 'lucide-react';
import { projectApi } from '../../api/project.api';
import { taskApi } from '../../api/task.api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Button, IconButton } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Input, Textarea, Select } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { cn } from '../../utils/cn';
import { getErrorMessage } from '../../api/client';
import { EXPENSE_STATUS } from '../../utils/constants';
import { useProjectSubscription } from '../../hooks/useSocket';

const EXPENSE_CATEGORIES = {
  material: { label: 'Material & Bahan', color: 'blue' },
  vendor: { label: 'Vendor / Subkontraktor', color: 'purple' },
  equipment: { label: 'Peralatan & Sewa', color: 'cyan' },
  operational: { label: 'Operasional', color: 'amber' },
  labor: { label: 'Tenaga Kerja / Honor', color: 'emerald' },
  other: { label: 'Lain-lain', color: 'slate' },
};

const ALLOWED_RECEIPT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export function ProjectBudgetTab({ projectId, canManage = false, currentUserId = null }) {
  const queryClient = useQueryClient();
  useProjectSubscription(projectId);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  // Approval / Rejection modal state
  const [approvalModal, setApprovalModal] = useState({
    open: false,
    expense: null,
    action: 'approved', // 'approved' | 'rejected'
  });
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalError, setApprovalError] = useState('');

  // Form states
  const [formData, setFormData] = useState({
    title: '',
    category: 'other',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    task_id: '',
    vendor_name: '',
    receipt_note: '',
  });
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [formError, setFormError] = useState('');

  // 1. Fetch expenses & financials
  const { data, isLoading } = useQuery({
    queryKey: ['project-expenses', projectId, selectedCategory, search, statusFilter],
    queryFn: () =>
      projectApi.expenses(projectId, {
        category: selectedCategory || undefined,
        search: search || undefined,
        status: statusFilter || undefined,
      }),
  });

  // 2. Fetch project tasks for task dropdown linking
  const { data: tasksData } = useQuery({
    queryKey: ['tasks', 'project', projectId],
    queryFn: () => taskApi.list({ project_id: projectId, perPage: 100 }),
    enabled: expenseModalOpen,
  });

  const expenses = data?.expenses ?? [];
  const categorySummary = data?.summary_by_category ?? [];
  const financials = data?.financials ?? {
    budget: 0,
    total_estimated_cost: 0,
    total_task_actual_cost: 0,
    total_direct_expenses: 0,
    total_expenses: 0,
    total_pending_expenses: 0,
    pending_expense_count: 0,
    actual_cost: 0,
    remaining_budget: 0,
    budget_usage_percent: 0,
  };

  const tasks = tasksData?.data ?? [];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['project-expenses', projectId] });
    queryClient.invalidateQueries({ queryKey: ['project', String(projectId)] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload) => projectApi.createExpense(projectId, payload),
    onSuccess: (res) => {
      invalidateAll();
      toast.success(
        res?.status === 'approved'
          ? 'Pengeluaran berhasil dicatat'
          : 'Pengajuan klaim berhasil dikirim dan menunggu persetujuan'
      );
      setExpenseModalOpen(false);
      resetForm();
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ expenseId, payload }) =>
      projectApi.updateExpense(projectId, expenseId, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success('Pengeluaran berhasil diperbarui');
      setExpenseModalOpen(false);
      resetForm();
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ expenseId, payload }) =>
      projectApi.updateExpenseStatus(projectId, expenseId, payload),
    onSuccess: (_, variables) => {
      invalidateAll();
      toast.success(
        variables.payload.status === 'approved'
          ? 'Pengeluaran telah disetujui'
          : 'Pengeluaran telah ditolak'
      );
      closeApprovalModal();
    },
    onError: (err) => setApprovalError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (expenseId) => projectApi.removeExpense(projectId, expenseId),
    onSuccess: () => {
      invalidateAll();
      toast.success('Pengeluaran berhasil dihapus');
      setDeleteId(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const resetForm = () => {
    setEditingExpense(null);
    setFormData({
      title: '',
      category: 'other',
      amount: '',
      expense_date: new Date().toISOString().slice(0, 10),
      task_id: '',
      vendor_name: '',
      receipt_note: '',
    });
    setReceiptFile(null);
    setReceiptPreview(null);
    setFormError('');
  };

  const handleOpenCreate = () => {
    resetForm();
    setExpenseModalOpen(true);
  };

  const handleOpenEdit = (expense) => {
    setEditingExpense(expense);
    setFormData({
      title: expense.title,
      category: expense.category,
      amount: String(expense.amount),
      expense_date: expense.expense_date?.slice(0, 10) || '',
      task_id: expense.task_id ? String(expense.task_id) : '',
      vendor_name: expense.vendor_name || '',
      receipt_note: expense.receipt_note || '',
    });
    setReceiptFile(null);
    setReceiptPreview(null);
    setFormError('');
    setExpenseModalOpen(true);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptFile(null);
      setReceiptPreview(null);
      return;
    }

    if (!ALLOWED_RECEIPT_TYPES.includes(file.type)) {
      toast.error('Format bukti tidak didukung. Harap unggah foto JPG/PNG/WebP atau dokumen PDF.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error('Ukuran file bukti melebihi batas maksimal 10MB.');
      e.target.value = '';
      return;
    }

    setReceiptFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setReceiptPreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setReceiptPreview(null);
    }
  };

  const handleSubmitExpense = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setFormError('Nama pengeluaran wajib diisi');
      return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      setFormError('Nominal pengeluaran harus lebih besar dari 0');
      return;
    }

    // Attachment validation: Non-managers must attach receipt when submitting new expense
    if (!canManage && !editingExpense && !receiptFile) {
      setFormError('Bukti pengeluaran (foto nota/PDF) wajib diunggah untuk pengajuan klaim');
      return;
    }

    const payload = new FormData();
    payload.append('title', formData.title.trim());
    payload.append('category', formData.category);
    payload.append('amount', String(Number(formData.amount)));
    payload.append('expense_date', formData.expense_date);
    if (formData.task_id) {
      payload.append('task_id', formData.task_id);
    }
    if (formData.vendor_name?.trim()) {
      payload.append('vendor_name', formData.vendor_name.trim());
    }
    if (formData.receipt_note?.trim()) {
      payload.append('receipt_note', formData.receipt_note.trim());
    }
    if (receiptFile) {
      payload.append('receipt', receiptFile);
    }

    if (editingExpense) {
      updateMutation.mutate({ expenseId: editingExpense.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openApproveModal = (expense) => {
    setApprovalError('');
    setRejectionReason('');
    setApprovalModal({
      open: true,
      expense,
      action: 'approved',
    });
  };

  const openRejectModal = (expense) => {
    setApprovalError('');
    setRejectionReason('');
    setApprovalModal({
      open: true,
      expense,
      action: 'rejected',
    });
  };

  const closeApprovalModal = () => {
    setApprovalModal({ open: false, expense: null, action: 'approved' });
    setRejectionReason('');
    setApprovalError('');
  };

  const handleConfirmApproval = () => {
    const { expense, action } = approvalModal;
    if (!expense) return;

    if (action === 'rejected' && !rejectionReason.trim()) {
      setApprovalError('Alasan penolakan wajib diisi agar pengaju dapat mengetahui kendala');
      return;
    }

    statusMutation.mutate({
      expenseId: expense.id,
      payload: {
        status: action,
        rejection_reason: action === 'rejected' ? rejectionReason.trim() : undefined,
      },
    });
  };

  const isOverBudget = financials.budget > 0 && financials.actual_cost > financials.budget;
  const budgetUsage = financials.budget > 0 ? financials.budget_usage_percent : 0;

  return (
    <div className="space-y-6">
      {/* Over Budget Alert */}
      {isOverBudget && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <p className="font-semibold">Peringatan: Realisasi Biaya Melebihi Total Anggaran!</p>
            <p className="text-xs text-rose-700 dark:text-rose-400 mt-0.5">
              Total pengeluaran disetujui ({formatCurrency(financials.actual_cost)}) telah melampaui pagu anggaran proyek ({formatCurrency(financials.budget)}) sebesar {formatCurrency(financials.actual_cost - financials.budget)}.
            </p>
          </div>
        </div>
      )}

      {/* KPI Financial Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Pagu Anggaran</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {formatCurrency(financials.budget)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Total alokasi pagu proyek
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Rencana RAB Task</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {formatCurrency(financials.total_estimated_cost)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Akumulasi estimasi seluruh task
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Realisasi Disetujui</span>
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl',
                isOverBudget
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
                  : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
              )}
            >
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <p
            className={cn(
              'mt-3 text-2xl font-bold tracking-tight',
              isOverBudget ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
            )}
          >
            {formatCurrency(financials.actual_cost)}
          </p>
          <div className="mt-2">
            <div className="flex justify-between text-[11px] text-slate-500 mb-1">
              <span>Pemakaian Anggaran</span>
              <span className="font-semibold">{budgetUsage}%</span>
            </div>
            <ProgressBar
              value={Math.min(100, budgetUsage)}
              color={isOverBudget ? '#e11d48' : '#10b981'}
              size="sm"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Sisa Anggaran</span>
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl',
                financials.remaining_budget < 0
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
                  : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
              )}
            >
              <TrendingDown className="h-5 w-5" />
            </div>
          </div>
          <p
            className={cn(
              'mt-3 text-2xl font-bold tracking-tight',
              financials.remaining_budget < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
            )}
          >
            {formatCurrency(financials.remaining_budget)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {financials.remaining_budget < 0 ? 'Defisit anggaran' : 'Saldo anggaran tersedia'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Menunggu Approval</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
            {formatCurrency(financials.total_pending_expenses ?? 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {financials.pending_expense_count ?? 0} klaim belum diproses
          </p>
        </div>
      </div>

      {/* Breakdown by Category Section */}
      {categorySummary.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Distribusi Realisasi per Kategori (Disetujui)
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {categorySummary.map((item) => {
              const meta = EXPENSE_CATEGORIES[item.category] || { label: item.category, color: 'slate' };
              const percent =
                financials.actual_cost > 0
                  ? Math.round((item.total_amount / financials.actual_cost) * 100)
                  : 0;

              return (
                <div
                  key={item.category}
                  className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800/80 dark:bg-slate-900/50"
                >
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                    {meta.label}
                  </p>
                  <p className="mt-1 text-base font-bold text-slate-800 dark:text-slate-100">
                    {formatCurrency(item.total_amount)}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{item.count} item</span>
                    <span>{percent}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ledger Header & Actions */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Buku Pengeluaran & Klaim Biaya
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Daftar pencatatan pengeluaran aktual dan pengajuan klaim biaya anggota tim.
            </p>
          </div>
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={handleOpenCreate}
          >
            {canManage ? 'Catat Pengeluaran' : 'Ajukan Klaim'}
          </Button>
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari pengeluaran, vendor, nota..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">Semua Status</option>
            <option value="pending">Menunggu Persetujuan</option>
            <option value="approved">Disetujui</option>
            <option value="rejected">Ditolak</option>
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">Semua Kategori</option>
            {Object.entries(EXPENSE_CATEGORIES).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">Memuat data pengeluaran...</div>
          ) : expenses.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">
              Belum ada data pengeluaran yang dicatat.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-semibold">Tanggal</th>
                  <th className="py-3 px-4 font-semibold">Item & Pengaju</th>
                  <th className="py-3 px-4 font-semibold">Kategori</th>
                  <th className="py-3 px-4 font-semibold">Task Terkait</th>
                  <th className="py-3 px-4 font-semibold">Vendor / Pihak Ketiga</th>
                  <th className="py-3 px-4 font-semibold text-right">Nominal (Rp)</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-center">Bukti Lampiran</th>
                  <th className="py-3 px-4 font-semibold text-center w-28">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {expenses.map((exp) => {
                  const meta = EXPENSE_CATEGORIES[exp.category] || { label: exp.category, color: 'slate' };
                  const statusMeta = EXPENSE_STATUS[exp.status] || {
                    label: exp.status,
                    color: '#94a3b8',
                  };

                  const isCreator = currentUserId && Number(exp.created_by) === Number(currentUserId);
                  const canEditOrDelete =
                    canManage || (isCreator && ['pending', 'rejected'].includes(exp.status));
                  const isPending = exp.status === 'pending';

                  return (
                    <tr key={exp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {formatDate(exp.expense_date)}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{exp.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                          {exp.creator_name && (
                            <span>Oleh: {exp.creator_name}</span>
                          )}
                          {exp.receipt_note && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-xs">{exp.receipt_note}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {exp.task_title ? (
                          <span className="font-medium text-slate-700 dark:text-slate-200 truncate block max-w-xs">
                            {exp.task_title}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Langsung Proyek</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {exp.vendor_name || '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold font-mono text-slate-900 dark:text-white whitespace-nowrap">
                        {formatCurrency(exp.amount)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <Badge
                          size="sm"
                          dot
                          color={statusMeta.color}
                          style={{
                            backgroundColor: `${statusMeta.color}15`,
                            color: statusMeta.color,
                          }}
                        >
                          {statusMeta.label}
                        </Badge>
                        {exp.status === 'rejected' && exp.rejection_reason && (
                          <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-400 max-w-[180px] mx-auto truncate" title={exp.rejection_reason}>
                            Alasan: {exp.rejection_reason}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {exp.receipt_file ? (
                          <a
                            href={exp.receipt_url || `/uploads/${exp.receipt_file}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 hover:underline"
                            title={exp.receipt_original_name || 'Lihat bukti transaksi'}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span className="truncate max-w-[120px]">
                              {exp.receipt_original_name || 'Lihat Bukti'}
                            </span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {/* Approval actions for managers on pending rows */}
                          {canManage && isPending && (
                            <>
                              <IconButton
                                size="icon-xs"
                                variant="ghost"
                                label="Setujui pengeluaran"
                                onClick={() => openApproveModal(exp)}
                              >
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              </IconButton>
                              <IconButton
                                size="icon-xs"
                                variant="ghost"
                                label="Tolak pengeluaran"
                                onClick={() => openRejectModal(exp)}
                              >
                                <XCircle className="h-4 w-4 text-rose-600" />
                              </IconButton>
                            </>
                          )}

                          {/* Edit / Delete actions */}
                          {canEditOrDelete && (
                            <>
                              <IconButton
                                size="icon-xs"
                                variant="ghost"
                                label="Edit pengeluaran"
                                onClick={() => handleOpenEdit(exp)}
                              >
                                <Pencil className="h-3.5 w-3.5 text-slate-500 hover:text-slate-700" />
                              </IconButton>
                              <IconButton
                                size="icon-xs"
                                variant="ghost"
                                label="Hapus pengeluaran"
                                onClick={() => setDeleteId(exp.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-rose-500 hover:text-rose-700" />
                              </IconButton>
                            </>
                          )}

                          {!canManage && !canEditOrDelete && (
                            <span className="text-slate-400 text-[11px]">-</span>
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

      {/* Modal Catat / Edit Pengeluaran */}
      <Modal
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        title={
          editingExpense
            ? 'Edit Pengeluaran'
            : canManage
            ? 'Catat Pengeluaran Proyek'
            : 'Ajukan Klaim Pengeluaran'
        }
        description={
          canManage
            ? 'Catat pengeluaran aktual untuk melacak penggunaan anggaran proyek secara langsung.'
            : 'Ajukan klaim pengeluaran berserta bukti nota/invoice untuk disetujui Manajer Proyek.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setExpenseModalOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleSubmitExpense}
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingExpense
                ? 'Simpan Perubahan'
                : canManage
                ? 'Catat Pengeluaran'
                : 'Kirim Pengajuan'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitExpense} className="space-y-4">
          {formError && (
            <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {formError}
            </div>
          )}

          <Input
            label="Keterangan Pengeluaran"
            placeholder="Contoh: Pembelian lisensi staging, Honor konsultan, dll."
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Kategori Biaya"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              options={Object.entries(EXPENSE_CATEGORIES).map(([key, meta]) => ({
                value: key,
                label: meta.label,
              }))}
            />

            <Input
              label="Nominal (Rp)"
              type="number"
              min="1"
              step="1000"
              placeholder="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Tanggal Pengeluaran"
              type="date"
              value={formData.expense_date}
              onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
              required
            />

            <Input
              label="Vendor / Pihak Ketiga (Opsional)"
              placeholder="Contoh: PT Sumber Rejeki, AWS"
              value={formData.vendor_name}
              onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
            />
          </div>

          <Select
            label="Terkait Task Tertentu (Opsional)"
            value={formData.task_id}
            onChange={(e) => setFormData({ ...formData, task_id: e.target.value })}
            options={[
              { value: '', label: '-- Langsung Proyek (Non-Task) --' },
              ...tasks.map((t) => ({ value: String(t.id), label: t.title })),
            ]}
          />

          <Textarea
            label="Catatan / Nomor Invoice & Kwitansi"
            rows={2}
            placeholder="Nomor invoice, catatan kwitansi, atau keterangan pelengkap..."
            value={formData.receipt_note}
            onChange={(e) => setFormData({ ...formData, receipt_note: e.target.value })}
          />

          {/* Lampiran Bukti File */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Bukti Kwitansi / Nota Lampiran
              {!canManage && !editingExpense && (
                <span className="text-rose-500 font-bold ml-1">*Wajib</span>
              )}
              {canManage && (
                <span className="text-slate-400 font-normal ml-1">(Opsional)</span>
              )}
            </label>

            {editingExpense?.receipt_file && !receiptFile && (
              <div className="flex items-center justify-between p-2.5 mb-2 rounded-lg border border-slate-200 bg-slate-50 text-xs dark:border-slate-700 dark:bg-slate-800/50">
                <div className="flex items-center gap-2 truncate">
                  <FileText className="h-4 w-4 text-brand-600 shrink-0" />
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {editingExpense.receipt_original_name || editingExpense.receipt_file}
                  </span>
                </div>
                <a
                  href={editingExpense.receipt_url || `/uploads/${editingExpense.receipt_file}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline shrink-0 text-[11px]"
                >
                  Lihat File
                </a>
              </div>
            )}

            <div className="flex items-center gap-3">
              <label className="flex items-center justify-center gap-2 cursor-pointer h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                <UploadCloud className="h-4 w-4" />
                <span>
                  {receiptFile
                    ? 'Ganti File'
                    : editingExpense?.receipt_file
                    ? 'Unggah File Baru'
                    : 'Pilih File Bukti'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {receiptFile && (
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 truncate">
                  <span className="font-medium truncate max-w-[200px]">{receiptFile.name}</span>
                  <span className="text-slate-400 text-[11px]">
                    ({(receiptFile.size / 1024).toFixed(0)} KB)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptFile(null);
                      setReceiptPreview(null);
                    }}
                    className="text-rose-500 hover:text-rose-700"
                    title="Batalkan pilihan file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {receiptPreview && (
              <div className="mt-2">
                <img
                  src={receiptPreview}
                  alt="Preview bukti"
                  className="max-h-36 rounded-lg border border-slate-200 object-contain dark:border-slate-700"
                />
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              Format yang didukung: JPG, PNG, WebP, atau PDF (Maksimal 10MB).
            </p>
          </div>
        </form>
      </Modal>

      {/* Modal Konfirmasi Approval / Reject */}
      <Modal
        open={approvalModal.open}
        onClose={closeApprovalModal}
        title={
          approvalModal.action === 'approved'
            ? 'Setujui Pengeluaran'
            : 'Tolak Pengajuan Pengeluaran'
        }
        description={
          approvalModal.action === 'approved'
            ? 'Menyetujui pengeluaran akan langsung memasukkan nominal ke dalam realisasi biaya proyek.'
            : 'Berikan alasan penolakan agar pengaju dapat memperbaiki atau mengetahui alasan klaim ditolak.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeApprovalModal}>
              Batal
            </Button>
            <Button
              variant={approvalModal.action === 'approved' ? 'primary' : 'danger'}
              onClick={handleConfirmApproval}
              loading={statusMutation.isPending}
            >
              {approvalModal.action === 'approved' ? 'Setujui Pengeluaran' : 'Tolak Pengeluaran'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {approvalError && (
            <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {approvalError}
            </div>
          )}

          {approvalModal.expense && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Item Pengeluaran:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {approvalModal.expense.title}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nominal:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {formatCurrency(approvalModal.expense.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pengaju:</span>
                <span>{approvalModal.expense.creator_name || '-'}</span>
              </div>
              {approvalModal.expense.receipt_file && (
                <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500">Bukti Lampiran:</span>
                  <a
                    href={
                      approvalModal.expense.receipt_url ||
                      `/uploads/${approvalModal.expense.receipt_file}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Lihat Bukti Lampiran</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {approvalModal.action === 'rejected' && (
            <Textarea
              label="Alasan Penolakan"
              required
              rows={3}
              placeholder="Contoh: Nota tidak terbaca jelas, nominal melebihi plafon operasional yang disepakati, dll."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Hapus Pengeluaran"
        message="Apakah Anda yakin ingin menghapus catatan pengeluaran ini? Realisasi biaya proyek akan diperbarui secara otomatis."
        confirmVariant="danger"
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

export default ProjectBudgetTab;
