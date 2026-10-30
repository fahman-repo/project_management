import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  Search,
  Pin,
  Lock,
  Unlock,
  History,
  Download,
  ExternalLink,
  Eye,
  FileCode,
  FileCheck,
  Paperclip,
  Check,
  X,
  RotateCcw,
  BookOpen,
  CalendarDays,
  User,
  Sparkles,
  Layers,
  Heading1,
  Heading2,
  Bold,
  Italic,
  Code,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  AtSign,
  AlertCircle,
  FileArchive,
  Image as ImageIcon,
  FileSpreadsheet,
} from 'lucide-react';
import { projectApi } from '../../api/project.api';
import { getErrorMessage } from '../../api/client';
import { formatDate, formatDateTime, formatRelative } from '../../utils/formatters';
import { cn } from '../../utils/cn';
import { Button, IconButton } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Input, Textarea, Select } from '../ui/Input';
import { Avatar } from '../ui/Avatar';
import { EmptyState, LoadingState, TableSkeleton } from '../ui/Feedback';
import { CommentMarkdown } from './CommentMarkdown';
import { useProjectSubscription } from '../../hooks/useSocket';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUS,
  DOCUMENT_TEMPLATES,
} from '../../utils/constants';

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function getFileIcon(rawMime = '', fileName = '') {
  const mimeType = String(rawMime || '').toLowerCase();
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    return ImageIcon;
  }
  if (mimeType.includes('pdf') || ext === 'pdf') {
    return FileCheck;
  }
  if (
    mimeType.includes('sheet') ||
    mimeType.includes('excel') ||
    ['xlsx', 'xls', 'csv'].includes(ext)
  ) {
    return FileSpreadsheet;
  }
  if (
    mimeType.includes('zip') ||
    mimeType.includes('compressed') ||
    ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)
  ) {
    return FileArchive;
  }
  return FileText;
}

/**
 * Main Project Document, Wiki & Versioning Tab Component
 */
export function ProjectDocumentTab({
  projectId,
  members = [],
  canManage = false,
  currentUserId,
}) {
  const queryClient = useQueryClient();
  useProjectSubscription(projectId);

  // Filters state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Selected document for reader view
  const [selectedDocId, setSelectedDocId] = useState(null);

  // Modals state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // 1. Fetch document list & KPI summary
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['project-documents', projectId, selectedCategory, selectedStatus, search],
    queryFn: () =>
      projectApi.documents(projectId, {
        category: selectedCategory || undefined,
        status: selectedStatus || undefined,
        search: search || undefined,
      }),
    enabled: Boolean(projectId),
  });

  const documents = data?.documents ?? [];
  const summary = data?.summary ?? {
    total_count: 0,
    pinned_count: 0,
    locked_count: 0,
    with_file_count: 0,
    total_versions_count: 0,
    by_category: {},
    by_status: {},
  };

  // Determine active document to display in reader
  const activeDoc = useMemo(() => {
    if (!documents.length) return null;
    if (selectedDocId) {
      const found = documents.find((d) => d.id === selectedDocId);
      if (found) return found;
    }
    return documents[0];
  }, [documents, selectedDocId]);

  // 2. Fetch single active document detail with versions (when viewing or opening history)
  const { data: activeDocDetail, refetch: refetchActiveDoc } = useQuery({
    queryKey: ['project-document-detail', projectId, activeDoc?.id],
    queryFn: () => projectApi.getDocument(projectId, activeDoc.id),
    enabled: Boolean(projectId && activeDoc?.id),
  });

  const activeDocWithContent = activeDocDetail?.document ?? activeDoc;
  const versionsList = activeDocDetail?.versions ?? [];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] });
    queryClient.invalidateQueries({ queryKey: ['project-document-detail', projectId] });
    queryClient.invalidateQueries({ queryKey: ['project', String(projectId)] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload) => projectApi.createDocument(projectId, payload),
    onSuccess: (res) => {
      invalidateAll();
      toast.success('Dokumen proyek berhasil dibuat');
      setEditorOpen(false);
      if (res?.id) setSelectedDocId(res.id);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ docId, payload }) => projectApi.updateDocument(projectId, docId, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success('Dokumen berhasil diperbarui');
      setEditorOpen(false);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const restoreMutation = useMutation({
    mutationFn: ({ docId, versionId, payload }) =>
      projectApi.restoreDocumentVersion(projectId, docId, versionId, payload),
    onSuccess: (res) => {
      invalidateAll();
      toast.success(res?.message || 'Versi dokumen berhasil dipulihkan');
      setVersionHistoryOpen(false);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const quickTogglePinMutation = useMutation({
    mutationFn: ({ docId, is_pinned }) =>
      projectApi.updateDocument(projectId, docId, { is_pinned }),
    onSuccess: (_, vars) => {
      invalidateAll();
      toast.success(vars.is_pinned ? 'Dokumen disematkan ke atas' : 'Sematkan dokumen dilepas');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const quickToggleLockMutation = useMutation({
    mutationFn: ({ docId, is_locked }) =>
      projectApi.updateDocument(projectId, docId, { is_locked }),
    onSuccess: (_, vars) => {
      invalidateAll();
      toast.success(vars.is_locked ? 'Dokumen resmi dikunci' : 'Kunci dokumen dibuka');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId) => projectApi.removeDocument(projectId, docId),
    onSuccess: () => {
      invalidateAll();
      toast.success('Dokumen berhasil dihapus');
      setDeleteTarget(null);
      setSelectedDocId(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleOpenCreate = () => {
    setEditingDoc(null);
    setEditorOpen(true);
  };

  const handleOpenEdit = (doc) => {
    setEditingDoc(doc || activeDocWithContent);
    setEditorOpen(true);
  };

  const isLocked = Boolean(activeDocWithContent?.is_locked);
  const isCreator = Number(activeDocWithContent?.created_by) === Number(currentUserId);
  const canEditActive = canManage || (!isLocked);
  const canDeleteActive = canManage || (!isLocked && isCreator);

  return (
    <div className="space-y-5">
      {/* 1. KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
              <FileText className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Dokumen & Wiki
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {summary.total_count}
                </span>
                {summary.pinned_count > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    <Pin className="h-3 w-3 fill-amber-500" />
                    {summary.pinned_count} pin
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
              <Lock className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                Dokumen Resmi / Final
              </p>
              <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {summary.locked_count}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
              <Paperclip className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                Berkas Lampiran Proyek
              </p>
              <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {summary.with_file_count}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400">
              <History className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Riwayat Versi
              </p>
              <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {summary.total_versions_count}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Filter & Action Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              placeholder="Cari judul, DOC-xxx, isi, file..."
              className="pl-9 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Status Filter */}
          <Select
            containerClassName="w-36"
            className="text-xs"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: '', label: 'Semua Status' },
              ...Object.entries(DOCUMENT_STATUS).map(([key, item]) => ({
                value: key,
                label: item.label,
              })),
            ]}
          />
        </div>

        {/* Action button */}
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={handleOpenCreate}
          >
            Buat Dokumen / Wiki
          </Button>
        </div>
      </div>

      {/* 3. Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setSelectedCategory('')}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors',
            selectedCategory === ''
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          )}
        >
          Semua
          <span className="rounded-full bg-black/10 px-1.5 py-0.2 text-[10px] dark:bg-white/20">
            {summary.total_count}
          </span>
        </button>

        {Object.entries(DOCUMENT_CATEGORIES).map(([key, cat]) => {
          const count = summary.by_category?.[key] || 0;
          const isSelected = selectedCategory === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedCategory(key)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors',
                isSelected
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              )}
            >
              {cat.label}
              {count > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[10px]',
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200/70 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 4. Workspace Split-View: List (Left) & Reader (Right) */}
      {isLoading ? (
        <TableSkeleton rows={4} columns={3} />
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
          <EmptyState
            icon={FileText}
            title={search || selectedCategory || selectedStatus ? 'Dokumen tidak ditemukan' : 'Belum ada dokumen atau wiki'}
            description={
              search || selectedCategory || selectedStatus
                ? 'Tidak ada dokumen yang cocok dengan filter atau kata kunci pencarian.'
                : 'Simpan Project Charter, Kontrak/MoU, Notulensi Rapat (MOM), SOP, dan catatan wiki proyek di sini.'
            }
            action={
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={handleOpenCreate}>
                Buat Dokumen Sekarang
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Document List Column (4 cols on desktop) */}
          <div className="space-y-3 lg:col-span-5 xl:col-span-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{documents.length} dokumen ditemukan</span>
              <span>Terakhir diperbarui</span>
            </div>

            <div className="space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
              {documents.map((doc) => {
                const isSelected = activeDoc?.id === doc.id;
                const catMeta = DOCUMENT_CATEGORIES[doc.category] || DOCUMENT_CATEGORIES.other;
                const statusMeta = DOCUMENT_STATUS[doc.status] || DOCUMENT_STATUS.published;
                const FileIconComponent = getFileIcon(doc.file_mime_type, doc.file_original_name);

                return (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDocId(doc.id)}
                    className={cn(
                      'group relative cursor-pointer rounded-xl border p-4 transition-all',
                      isSelected
                        ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500/30 dark:border-brand-500/80 dark:bg-brand-500/10'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    )}
                  >
                    {/* Top Row: Code, Badges, Pin & Lock */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {doc.code}
                        </span>
                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                            catMeta.badge
                          )}
                        >
                          {catMeta.label}
                        </span>
                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                            statusMeta.bg
                          )}
                        >
                          {statusMeta.label}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1 text-slate-400">
                        {doc.is_pinned && (
                          <span title="Disematkan ke atas" className="text-amber-500">
                            <Pin className="h-3.5 w-3.5 fill-amber-500" />
                          </span>
                        )}
                        {doc.is_locked && (
                          <span title="Dokumen terkunci" className="text-blue-500">
                            <Lock className="h-3.5 w-3.5" />
                          </span>
                        )}
                        <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          v{doc.current_version}
                        </span>
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="mt-2 line-clamp-1 text-sm font-semibold text-slate-900 group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-400">
                      {doc.title}
                    </h3>

                    {/* Summary / Snippet */}
                    {doc.summary && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                        {doc.summary}
                      </p>
                    )}

                    {/* Attachment pill if exists */}
                    {doc.file_original_name && (
                      <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                        <FileIconComponent className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{doc.file_original_name}</span>
                        {doc.file_size && (
                          <span className="ml-auto shrink-0 text-slate-400">
                            {formatFileSize(doc.file_size)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Footer: User & Time */}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Avatar
                          src={doc.updater_avatar || doc.creator_avatar}
                          name={doc.updater_name || doc.creator_name}
                          size="xs"
                        />
                        <span className="truncate max-w-[130px]">
                          {doc.updater_name || doc.creator_name || 'Tim'}
                        </span>
                      </div>
                      <span>{formatRelative(doc.updated_at || doc.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Document Reader / Wiki Detail Column (8 cols on desktop) */}
          <div className="lg:col-span-7 xl:col-span-8">
            {activeDocWithContent ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {/* Header & Action Toolbar */}
                <div className="border-b border-slate-100 pb-5 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                        {activeDocWithContent.code}
                      </span>
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-semibold',
                          DOCUMENT_CATEGORIES[activeDocWithContent.category]?.badge
                        )}
                      >
                        {DOCUMENT_CATEGORIES[activeDocWithContent.category]?.label}
                      </span>
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-medium',
                          DOCUMENT_STATUS[activeDocWithContent.status]?.bg
                        )}
                      >
                        {DOCUMENT_STATUS[activeDocWithContent.status]?.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setVersionHistoryOpen(true)}
                        className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-100 dark:bg-purple-500/15 dark:text-purple-300"
                        title="Klik untuk membuka riwayat versi"
                      >
                        <History className="h-3 w-3" />
                        Versi {activeDocWithContent.current_version}
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {canManage && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={
                              <Pin
                                className={cn(
                                  'h-3.5 w-3.5',
                                  activeDocWithContent.is_pinned && 'fill-amber-500 text-amber-500'
                                )}
                              />
                            }
                            onClick={() =>
                              quickTogglePinMutation.mutate({
                                docId: activeDocWithContent.id,
                                is_pinned: !activeDocWithContent.is_pinned,
                              })
                            }
                          >
                            {activeDocWithContent.is_pinned ? 'Lepas Pin' : 'Pin'}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={
                              activeDocWithContent.is_locked ? (
                                <Unlock className="h-3.5 w-3.5 text-blue-500" />
                              ) : (
                                <Lock className="h-3.5 w-3.5" />
                              )
                            }
                            onClick={() =>
                              quickToggleLockMutation.mutate({
                                docId: activeDocWithContent.id,
                                is_locked: !activeDocWithContent.is_locked,
                              })
                            }
                          >
                            {activeDocWithContent.is_locked ? 'Buka Kunci' : 'Kunci'}
                          </Button>
                        </>
                      )}

                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<History className="h-3.5 w-3.5" />}
                        onClick={() => setVersionHistoryOpen(true)}
                      >
                        Riwayat
                      </Button>

                      {canEditActive && (
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<Pencil className="h-3.5 w-3.5" />}
                          onClick={() => handleOpenEdit(activeDocWithContent)}
                        >
                          Edit
                        </Button>
                      )}

                      {canDeleteActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10"
                          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={() => setDeleteTarget(activeDocWithContent)}
                        >
                          Hapus
                        </Button>
                      )}
                    </div>
                  </div>

                  <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {activeDocWithContent.title}
                  </h1>

                  {activeDocWithContent.summary && (
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {activeDocWithContent.summary}
                    </p>
                  )}

                  {/* Metadata Row */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      Dibuat oleh {activeDocWithContent.creator_name || 'Tim'} pada{' '}
                      {formatDate(activeDocWithContent.created_at)}
                    </span>
                    {activeDocWithContent.updater_name && (
                      <span className="flex items-center gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Terakhir diubah oleh {activeDocWithContent.updater_name} (
                        {formatRelative(activeDocWithContent.updated_at)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Physical File Attachment Card (if attached) */}
                {activeDocWithContent.file_name && (
                  <div className="my-5 flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                        {(() => {
                          const IconComp = getFileIcon(
                            activeDocWithContent.file_mime_type,
                            activeDocWithContent.file_original_name
                          );
                          return <IconComp className="h-5 w-5" />;
                        })()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {activeDocWithContent.file_original_name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatFileSize(activeDocWithContent.file_size)} •{' '}
                          {activeDocWithContent.file_mime_type || 'Berkas Proyek'}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={`/uploads/${activeDocWithContent.file_name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Buka Pratinjau
                      </a>
                      <a
                        href={`/uploads/${activeDocWithContent.file_name}`}
                        download={activeDocWithContent.file_original_name}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Unduh
                      </a>
                    </div>
                  </div>
                )}

                {/* Wiki Markdown Content Body */}
                <div className="mt-6 prose prose-slate max-w-none dark:prose-invert">
                  {activeDocWithContent.content ? (
                    <CommentMarkdown
                      content={activeDocWithContent.content}
                      className="text-base text-slate-800 dark:text-slate-200"
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 dark:border-slate-800">
                      Dokumen ini tidak memiliki isi teks wiki Markdown (hanya lampiran berkas fisik).
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 5. Document Editor Modal (Create / Edit Document) */}
      <DocumentEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        document={editingDoc}
        canManage={canManage}
        members={members}
        onSave={(formDataPayload) => {
          if (editingDoc?.id) {
            updateMutation.mutate({ docId: editingDoc.id, payload: formDataPayload });
          } else {
            createMutation.mutate(formDataPayload);
          }
        }}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />

      {/* 6. Version History & Restore Modal */}
      <VersionHistoryModal
        open={versionHistoryOpen}
        onClose={() => setVersionHistoryOpen(false)}
        document={activeDocWithContent}
        versions={versionsList}
        canManage={canManage}
        onRestore={(versionId, changeNote) =>
          restoreMutation.mutate({
            docId: activeDocWithContent.id,
            versionId,
            payload: { change_note: changeNote },
          })
        }
        isRestoring={restoreMutation.isPending}
      />

      {/* 7. Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Hapus dokumen proyek?"
        description={
          deleteTarget
            ? `Dokumen "${deleteTarget.title}" beserta seluruh riwayat versinya (${deleteTarget.version_count || 1} versi) dan lampiran fisiknya akan dihapus secara permanen.`
            : ''
        }
        confirmLabel="Ya, hapus dokumen"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

/**
 * Modal Editor for Creating / Updating Documents with Markdown Toolbar & Live Preview
 */
function DocumentEditorModal({
  open,
  onClose,
  document,
  canManage,
  members = [],
  onSave,
  isSaving,
}) {
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const isEdit = Boolean(document?.id);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('wiki');
  const [status, setStatus] = useState('published');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // File upload state
  const [file, setFile] = useState(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);

  // Editor mode tab: 'write' | 'preview' | 'split'
  const [viewMode, setViewMode] = useState('write');
  const [formError, setFormError] = useState('');

  // Sync state when opening modal
  useMemo(() => {
    if (open) {
      if (document) {
        setTitle(document.title || '');
        setCategory(document.category || 'wiki');
        setStatus(document.status || 'published');
        setSummary(document.summary || '');
        setContent(document.content || '');
        setChangeNote('');
        setIsPinned(Boolean(document.is_pinned));
        setIsLocked(Boolean(document.is_locked));
        setFile(null);
        setRemoveExistingFile(false);
      } else {
        setTitle('');
        setCategory('wiki');
        setStatus('published');
        setSummary('');
        setContent('');
        setChangeNote('Versi awal dokumen');
        setIsPinned(false);
        setIsLocked(false);
        setFile(null);
        setRemoveExistingFile(false);
      }
      setViewMode('write');
      setFormError('');
    }
  }, [open, document]);

  // Quick template selection handler
  const handleApplyTemplate = (templateId) => {
    const tpl = DOCUMENT_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;

    if (content && content.trim().length > 20) {
      if (!window.confirm('Terapkan template? Isi konten markdown saat ini akan ditimpa.')) {
        return;
      }
    }

    setTitle(tpl.title);
    setCategory(tpl.category);
    setSummary(tpl.summary);
    setContent(tpl.content);
  };

  // Markdown toolbar action injector
  const insertMarkdown = (prefix, suffix = '', defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end) || defaultText;
    const replacement = `${prefix}${selected}${suffix}`;

    const newContent = content.slice(0, start) + replacement + content.slice(end);
    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selected.length
      );
    }, 0);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    if (!title.trim()) {
      setFormError('Judul dokumen wajib diisi');
      return;
    }

    if (!content.trim() && !file && (!document?.file_name || removeExistingFile)) {
      setFormError('Dokumen harus memiliki isi konten (Markdown) atau lampiran berkas fisik.');
      return;
    }

    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('category', category);
    formData.append('status', status);
    formData.append('summary', summary.trim());
    formData.append('content', content);
    formData.append('is_pinned', isPinned ? '1' : '0');
    formData.append('is_locked', isLocked ? '1' : '0');

    if (changeNote.trim()) {
      formData.append('change_note', changeNote.trim());
    }

    if (file) {
      formData.append('file', file);
    } else if (removeExistingFile) {
      formData.append('remove_file', '1');
    }

    onSave(formData);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={isEdit ? `Edit Dokumen: ${document.title}` : 'Buat Dokumen / Wiki Proyek'}
      description="Kelola artikel wiki, piagam proyek, notulensi rapat, dan berkas tingkat proyek."
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            {isEdit && (
              <span>
                Pembaruan isi/file akan membuat <strong>v{document.current_version + 1}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
              Batal
            </Button>
            <Button onClick={handleSubmit} loading={isSaving}>
              {isEdit ? 'Simpan Revisi' : 'Buat Dokumen'}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {formError}
          </div>
        )}

        {/* Quick Template Picker (when creating or empty) */}
        {!isEdit && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Template Cepat:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {DOCUMENT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl.id)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium transition-colors hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:text-brand-400"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Top inputs: Title & Category & Status */}
        <div className="grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-6">
            <Input
              label="Judul Dokumen"
              placeholder="Contoh: Project Charter & Visi Sistem"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="sm:col-span-3">
            <Select
              label="Kategori"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={Object.entries(DOCUMENT_CATEGORIES).map(([key, item]) => ({
                value: key,
                label: item.label,
              }))}
            />
          </div>

          <div className="sm:col-span-3">
            <Select
              label="Status Dokumen"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={Object.entries(DOCUMENT_STATUS).map(([key, item]) => ({
                value: key,
                label: item.label,
              }))}
            />
          </div>
        </div>

        {/* Summary */}
        <Input
          label="Ringkasan Singkat (Opsional)"
          placeholder="Ringkasan 1-2 kalimat mengenai tujuan atau isi dokumen ini"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />

        {/* Options for Project Managers: Pin & Lock */}
        {canManage && (
          <div className="flex flex-wrap items-center gap-6 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/30">
            <label className="flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="flex items-center gap-1 font-medium">
                <Pin className="h-3.5 w-3.5 text-amber-500" />
                Sematkan ke paling atas (Pin)
              </span>
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={isLocked}
                onChange={(e) => setIsLocked(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="flex items-center gap-1 font-medium">
                <Lock className="h-3.5 w-3.5 text-blue-500" />
                Kunci Dokumen Resmi (Hanya Manajer/Admin yang dapat mengubah)
              </span>
            </label>
          </div>
        )}

        {/* Markdown Editor Toolbar & View Mode Toggle */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-800/50">
            {/* Formatting Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5">
              <button
                type="button"
                onClick={() => insertMarkdown('# ', '', 'Judul H1')}
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Heading 1"
              >
                <Heading1 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('## ', '', 'Judul H2')}
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Heading 2"
              >
                <Heading2 className="h-4 w-4" />
              </button>
              <div className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-700" />
              <button
                type="button"
                onClick={() => insertMarkdown('**', '**', 'teks tebal')}
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Tebal (Bold)"
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('*', '*', 'teks miring')}
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Miring (Italic)"
              >
                <Italic className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('`', '`', 'kode')}
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Kode Inline"
              >
                <Code className="h-4 w-4" />
              </button>
              <div className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-700" />
              <button
                type="button"
                onClick={() => insertMarkdown('- ', '', 'Poin daftar')}
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Bullet List"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('1. ', '', 'Item bernomor')}
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Numbered List"
              >
                <ListOrdered className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('- [ ] ', '', 'Tugas')}
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Checklist"
              >
                <CheckSquare className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('> ', '', 'Kutipan / Catatan')}
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Blockquote"
              >
                <Quote className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('\n---\n')}
                className="rounded p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Garis Pemisah"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>

            {/* View Mode: Write / Preview / Split */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-0.5 text-xs dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('write')}
                className={cn(
                  'rounded px-2.5 py-1 font-medium transition-colors',
                  viewMode === 'write'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                )}
              >
                Tulis
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={cn(
                  'rounded px-2.5 py-1 font-medium transition-colors',
                  viewMode === 'preview'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                )}
              >
                Pratinjau
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={cn(
                  'rounded px-2.5 py-1 font-medium transition-colors hidden sm:block',
                  viewMode === 'split'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                )}
              >
                Split
              </button>
            </div>
          </div>

          {/* Editor Body */}
          <div
            className={cn(
              'p-3',
              viewMode === 'split' && 'grid sm:grid-cols-2 divide-x divide-slate-200 dark:divide-slate-800'
            )}
          >
            {/* Markdown Input Area */}
            {(viewMode === 'write' || viewMode === 'split') && (
              <div className={cn(viewMode === 'split' && 'pr-3')}>
                <textarea
                  ref={textareaRef}
                  rows={13}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Tuliskan isi dokumen, spesifikasi, atau notulensi dalam format Markdown..."
                  className="w-full resize-y rounded-lg border-0 bg-transparent font-mono text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:ring-0 dark:text-slate-100"
                />
              </div>
            )}

            {/* Live Markdown Preview Area */}
            {(viewMode === 'preview' || viewMode === 'split') && (
              <div
                className={cn(
                  'max-h-[360px] overflow-y-auto',
                  viewMode === 'split' ? 'pl-3' : 'min-h-[280px]'
                )}
              >
                {content.trim() ? (
                  <CommentMarkdown content={content} />
                ) : (
                  <p className="text-xs italic text-slate-400">Pratinjau markdown akan muncul di sini.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Physical File Attachment Upload */}
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <label className="block text-xs font-semibold text-slate-900 dark:text-white">
            Lampiran Berkas Fisik (PDF, DOCX, XLSX, Gambar, ZIP maks 10MB)
          </label>

          {/* Existing file when editing */}
          {document?.file_name && !removeExistingFile && !file && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                <span className="font-medium text-slate-900 dark:text-white">
                  {document.file_original_name}
                </span>
                <span className="text-slate-400">({formatFileSize(document.file_size)})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Ganti File
                </button>
                <button
                  type="button"
                  onClick={() => setRemoveExistingFile(true)}
                  className="rounded px-2 py-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                >
                  Hapus File
                </button>
              </div>
            </div>
          )}

          {/* Newly selected file */}
          {file && (
            <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50/50 p-2.5 text-xs text-brand-900 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
              <div className="flex items-center gap-2 truncate">
                <Paperclip className="h-4 w-4 shrink-0" />
                <span className="truncate font-semibold">{file.name}</span>
                <span className="shrink-0 text-slate-500">({formatFileSize(file.size)})</span>
              </div>
              <IconButton
                type="button"
                icon={<X className="h-4 w-4" />}
                size="xs"
                variant="ghost"
                onClick={() => setFile(null)}
              />
            </div>
          )}

          {/* File picker button / dropzone */}
          {(!document?.file_name || removeExistingFile) && !file && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) {
                    if (selected.size > 10 * 1024 * 1024) {
                      toast.error('Ukuran file melebihi batas 10MB');
                      return;
                    }
                    setFile(selected);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white py-3 text-xs font-medium text-slate-600 transition-colors hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-brand-400"
              >
                <Paperclip className="h-4 w-4" />
                Pilih Berkas Lampiran untuk Diunggah
              </button>
            </div>
          )}
        </div>

        {/* Change Note for Versioning (especially when updating) */}
        {isEdit && (
          <div>
            <Input
              label="Catatan Revisi Versi (Opsional)"
              placeholder="Contoh: Penambahan pasal SLA dan lampiran MoU bertanda tangan"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Catatan ini akan tersimpan di riwayat versi untuk mempermudah pelacakan perubahan.
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}

/**
 * Modal to Inspect Document Version History, Preview Past Versions, Diff, and Restore
 */
function VersionHistoryModal({
  open,
  onClose,
  document,
  versions = [],
  canManage,
  onRestore,
  isRestoring,
}) {
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [restoreConfirmTarget, setRestoreConfirmTarget] = useState(null);
  const [restoreNote, setRestoreNote] = useState('');
  const [diffMode, setDiffMode] = useState(false);

  // Active version inspected in the modal
  const activeVersion = useMemo(() => {
    if (!versions.length) return null;
    if (selectedVersionId) {
      const found = versions.find((v) => v.id === selectedVersionId);
      if (found) return found;
    }
    return versions[0];
  }, [versions, selectedVersionId]);

  if (!open || !document) return null;

  const isCurrentVersion = activeVersion?.version_number === document.current_version;

  const handleOpenRestore = (ver) => {
    setRestoreConfirmTarget(ver);
    setRestoreNote(`Dipulihkan dari versi v${ver.version_number}`);
  };

  const handleConfirmRestore = () => {
    if (restoreConfirmTarget) {
      onRestore(restoreConfirmTarget.id, restoreNote);
      setRestoreConfirmTarget(null);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="xl"
        title={`Riwayat Versi: ${document.title}`}
        description={`Daftar ${versions.length} versi terekam untuk dokumen ini (${document.code}).`}
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-xs text-slate-500">
              Versi saat ini: <strong>v{document.current_version}</strong>
            </span>
            <Button variant="secondary" onClick={onClose}>
              Tutup
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-12 min-h-[420px]">
          {/* Versions List (Left column - 4 cols) */}
          <div className="space-y-2 md:col-span-4 border-r border-slate-100 pr-3 dark:border-slate-800 max-h-[500px] overflow-y-auto">
            <p className="text-xs font-semibold text-slate-500">Pilih Versi Dokumen</p>
            {versions.map((ver) => {
              const isSelected = activeVersion?.id === ver.id;
              const isLatest = ver.version_number === document.current_version;

              return (
                <div
                  key={ver.id}
                  onClick={() => setSelectedVersionId(ver.id)}
                  className={cn(
                    'cursor-pointer rounded-xl border p-3 transition-all',
                    isSelected
                      ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500/20 dark:border-brand-500/80 dark:bg-brand-500/10'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 font-mono text-xs font-bold text-purple-800 dark:bg-purple-900/60 dark:text-purple-300">
                      v{ver.version_number}
                    </span>
                    {isLatest && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                        Aktif
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 line-clamp-2 text-xs font-medium text-slate-900 dark:text-white">
                    {ver.change_note || 'Pembaruan dokumen'}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate max-w-[120px]">
                      {ver.created_by_name || 'Tim'}
                    </span>
                    <span>{formatDate(ver.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Version Detail & Preview (Right column - 8 cols) */}
          <div className="space-y-4 md:col-span-8 max-h-[500px] overflow-y-auto pl-1">
            {activeVersion ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-purple-700 dark:text-purple-300">
                        Versi {activeVersion.version_number}
                      </span>
                      {isCurrentVersion && (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          Versi Aktif Saat Ini
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Diperbarui oleh {activeVersion.created_by_name || 'Tim'} pada{' '}
                      {formatDateTime(activeVersion.created_at)}
                    </p>
                  </div>

                  {/* Actions for this version */}
                  <div className="flex items-center gap-2">
                    {!isCurrentVersion && (
                      <Button
                        size="sm"
                        leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                        onClick={() => handleOpenRestore(activeVersion)}
                      >
                        Pulihkan ke Versi Ini
                      </Button>
                    )}
                  </div>
                </div>

                {/* Change note callout */}
                {activeVersion.change_note && (
                  <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    <strong>Catatan Perubahan:</strong> {activeVersion.change_note}
                  </div>
                )}

                {/* File attached in this version */}
                {activeVersion.file_name && (
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip className="h-4 w-4 shrink-0 text-brand-600" />
                      <span className="font-medium text-slate-900 dark:text-white truncate">
                        {activeVersion.file_original_name}
                      </span>
                      <span className="text-slate-400 shrink-0">
                        ({formatFileSize(activeVersion.file_size)})
                      </span>
                    </div>
                    <a
                      href={`/uploads/${activeVersion.file_name}`}
                      download={activeVersion.file_original_name}
                      className="inline-flex shrink-0 items-center gap-1 rounded bg-white px-2 py-1 font-medium text-brand-600 shadow-sm hover:bg-slate-50 dark:bg-slate-700 dark:text-brand-300"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Unduh Berkas v{activeVersion.version_number}
                    </a>
                  </div>
                )}

                {/* Content title in this version */}
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  {activeVersion.title}
                </h4>

                {/* Markdown content preview */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  {activeVersion.content ? (
                    <CommentMarkdown content={activeVersion.content} />
                  ) : (
                    <p className="text-xs italic text-slate-400">
                      Versi ini tidak memiliki teks konten markdown (hanya berkas lampiran).
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </Modal>

      {/* Restore Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(restoreConfirmTarget)}
        onClose={() => setRestoreConfirmTarget(null)}
        onConfirm={handleConfirmRestore}
        title={`Pulihkan dokumen ke Versi ${restoreConfirmTarget?.version_number}?`}
        description={`Seluruh isi teks markdown dan berkas lampiran akan dikembalikan sesuai kondisi pada Versi ${restoreConfirmTarget?.version_number}. Tindakan ini akan otomatis membuat Versi ${document.current_version + 1} baru sebagai hasil pemulihan.`}
        confirmLabel="Ya, pulihkan ke versi ini"
        loading={isRestoring}
      />
    </>
  );
}

export default ProjectDocumentTab;
