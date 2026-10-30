import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CalendarDays,
  Clock,
  Link2,
  MessageSquare,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  Upload,
  User,
  Download,
  ListChecks,
  Flag,
  CircleAlert,
  CheckSquare,
  Square,
  Plus,
  AtSign,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { taskApi } from '../../api/task.api';
import { projectApi } from '../../api/project.api';
import { getErrorMessage } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Button, IconButton } from '../ui/Button';
import { Drawer, Modal } from '../ui/Modal';
import { Avatar } from '../ui/Avatar';
import { ProgressBar } from '../ui/ProgressBar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Spinner } from '../ui/Feedback';
import { Dropdown, DropdownItem, DropdownLabel } from '../ui/Dropdown';
import { TaskStatusBadge, PriorityBadge } from './Badges';
import { CommentMarkdown } from './CommentMarkdown';
import { DEPENDENCY_TYPES, TASK_STATUS, PRIORITY, lookup } from '../../utils/constants';
import { formatDate, formatDateTime, formatRelative, formatCurrency, isOverdue } from '../../utils/formatters';

const ACCEPTED_UPLOAD_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
].join(',');

/**
 * Human readable file size.
 * @param {number} bytes
 */
function formatSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/**
 * Right-hand drawer showing everything about a single task.
 *
 * @param {object} props
 * @param {number|string|null} props.taskId
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(task:object) => void} props.onEdit opens the edit modal
 * @param {'drawer'|'modal'} [props.variant='drawer'] whether to render as slide-over drawer or center modal
 */
export function TaskDetailDrawer({ taskId, open, onClose, onEdit, variant = 'drawer' }) {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const fileInputRef = useRef(null);
  const commentTextareaRef = useRef(null);

  const [commentBody, setCommentBody] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dependencyTarget, setDependencyTarget] = useState('');
  const [dependencyType, setDependencyType] = useState('blocked_by');

  // Checklist local state
  const [newChecklistTitle, setNewChecklistTitle] = useState('');

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => taskApi.get(taskId),
    enabled: Boolean(taskId) && open,
  });

  // Project members for @mention autocomplete
  const { data: membersResponse } = useQuery({
    queryKey: ['project-members', data?.task?.project_id],
    queryFn: () => projectApi.members(data.task.project_id),
    enabled: Boolean(data?.task?.project_id) && open,
    staleTime: 60 * 1000,
  });

  const projectMembers = membersResponse ?? [];

  // Filter members matching the @mention query
  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return projectMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.email && m.email.toLowerCase().includes(q)) ||
        (m.job_title && m.job_title.toLowerCase().includes(q))
    );
  }, [projectMembers, mentionQuery]);

  // Candidate tasks for the dependency picker - only the current project.
  const { data: taskResponse } = useQuery({
    queryKey: ['tasks', 'project', data?.task?.project_id],
    queryFn: () =>
      taskApi.list({ project_id: Number(data.task.project_id), perPage: 100 }),
    enabled: Boolean(data?.task?.project_id) && open,
    staleTime: 30 * 1000,
  });

  const task = data?.task;
  const project = data?.project;
  const assignee = data?.assignee;
  const reporter = data?.reporter;
  const labels = data?.labels ?? [];
  const subtasks = data?.subtasks ?? [];
  const checklists = data?.checklists ?? [];
  const dependencies = data?.dependencies ?? [];
  const comments = data?.comments ?? [];
  const attachments = data?.attachments ?? [];
  const parent = data?.parent;

  // Reset the local input state whenever a different task is opened.
  useEffect(() => {
    if (!open) return;
    setCommentBody('');
    setDependencyTarget('');
    setDependencyType('blocked_by');
    setNewChecklistTitle('');
    setMentionQuery(null);
    setMentionIndex(0);
  }, [open, taskId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
  };

  // --- Mutations -----------------------------------------------------------
  const addChecklistMutation = useMutation({
    mutationFn: (title) => taskApi.addChecklist(taskId, { title }),
    onSuccess: () => {
      setNewChecklistTitle('');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const toggleChecklistMutation = useMutation({
    mutationFn: ({ checklistId, is_checked }) =>
      taskApi.updateChecklist(taskId, checklistId, { is_checked }),
    onSuccess: () => {
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const removeChecklistMutation = useMutation({
    mutationFn: (checklistId) => taskApi.removeChecklist(taskId, checklistId),
    onSuccess: () => {
      toast.success('Item checklist dihapus');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const addCommentMutation = useMutation({
    mutationFn: (body) => taskApi.addComment(taskId, body),
    onSuccess: () => {
      setCommentBody('');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const removeCommentMutation = useMutation({
    mutationFn: (commentId) => taskApi.removeComment(taskId, commentId),
    onSuccess: () => {
      toast.success('Komentar dihapus');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const uploadMutation = useMutation({
    mutationFn: (file) => taskApi.uploadAttachment(taskId, file),
    onSuccess: () => {
      toast.success('Lampiran berhasil diunggah');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const removeAttachmentMutation = useMutation({
    mutationFn: (attachmentId) => taskApi.removeAttachment(taskId, attachmentId),
    onSuccess: () => {
      toast.success('Lampiran dihapus');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const addDependencyMutation = useMutation({
    mutationFn: (payload) => taskApi.addDependency(taskId, payload),
    onSuccess: () => {
      toast.success('Dependensi ditambahkan');
      setDependencyTarget('');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const removeDependencyMutation = useMutation({
    mutationFn: (dependencyId) => taskApi.removeDependency(taskId, dependencyId),
    onSuccess: () => {
      toast.success('Dependensi dihapus');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => taskApi.remove(taskId),
    onSuccess: () => {
      toast.success('Task berhasil dihapus');
      setConfirmDelete(false);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      onClose?.();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      setConfirmDelete(false);
    },
  });

  // --- Derived data --------------------------------------------------------
  const subtaskDone = subtasks.filter((item) => item.status === 'done').length;
  const subtaskPercent = subtasks.length ? Math.round((subtaskDone / subtasks.length) * 100) : 0;
  const checklistDone = checklists.filter((item) => item.is_checked).length;
  const checklistPercent = checklists.length
    ? Math.round((checklistDone / checklists.length) * 100)
    : 0;
  const overdue = isOverdue(task);
  const statusMeta = lookup(TASK_STATUS, task?.status);
  const priorityMeta = lookup(PRIORITY, task?.priority);

  const dependencyOptions = useMemo(
    () => (taskResponse?.data ?? []).filter((item) => Number(item.id) !== Number(taskId)),
    [taskResponse, taskId]
  );

  const insertMention = (member) => {
    const textarea = commentTextareaRef.current;
    if (!textarea) return;
    const text = commentBody;
    const pos = textarea.selectionStart;
    const beforePos = text.slice(0, pos);
    const afterPos = text.slice(pos);
    const atIndex = beforePos.lastIndexOf('@');
    if (atIndex !== -1) {
      const inserted = `@[${member.name}] `;
      const newText = beforePos.slice(0, atIndex) + inserted + afterPos;
      setCommentBody(newText);
      setMentionQuery(null);
      setTimeout(() => {
        const newPos = atIndex + inserted.length;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
      }, 10);
    }
  };

  const handleCommentChange = (event) => {
    const val = event.target.value;
    setCommentBody(val);
    const pos = event.target.selectionStart;
    const beforePos = val.slice(0, pos);
    const match = beforePos.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const handleCommentKeyDown = (event) => {
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredMembers.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        insertMention(filteredMembers[mentionIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
  };

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    // Reset so the same file can be picked again.
    event.target.value = '';
  };

  const handleAddComment = (event) => {
    event.preventDefault();
    const body = commentBody.trim();
    if (!body) return;
    addCommentMutation.mutate(body);
  };

  const Container = variant === 'modal' ? Modal : Drawer;
  const containerProps = variant === 'modal' ? { size: 'lg' } : { width: 'max-w-2xl' };

  return (
    <>
      <Container
        open={open}
        onClose={onClose}
        {...containerProps}
        title={task?.title || 'Detail Task'}
        description={project ? `${project.code} - ${project.name}` : undefined}
        footer={
          <>
            <Button
              variant="danger"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => setConfirmDelete(true)}
              disabled={deleteMutation.isPending}
            >
              Hapus
            </Button>
            <Button
              leftIcon={<Pencil className="h-4 w-4" />}
              onClick={() => task && onEdit?.(task)}
              disabled={!task}
            >
              Edit Task
            </Button>
          </>
        }
      >
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {getErrorMessage(error)}
          </div>
        )}

        {task && (
          <div className="space-y-6">
            {/* --- Header --- */}
            <section>
              <div className="flex flex-wrap items-center gap-2">
                <TaskStatusBadge status={task.status} label={task.status_label} color={task.status_color} />
                <PriorityBadge priority={task.priority} />
                {task.is_milestone ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                    <Flag className="h-3.5 w-3.5" />
                    Milestone
                  </span>
                ) : null}
                {overdue && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                    <CircleAlert className="h-3.5 w-3.5" />
                    Terlambat
                  </span>
                )}
              </div>

              <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 px-3.5 py-3 dark:border-slate-800">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Project
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: project?.color || statusMeta.color }}
                    />
                    <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {project?.name || '-'}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {project?.code}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 px-3.5 py-3 dark:border-slate-800">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Assignee
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {assignee ? (
                      <>
                        <Avatar src={assignee.avatar} name={assignee.name} size="xs" />
                        <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                          {assignee.name}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        Belum ditugaskan
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 px-3.5 py-3 dark:border-slate-800">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Jatuh Tempo
                  </p>
                  <div
                    className={cn(
                      'mt-1 flex items-center gap-2 text-sm font-medium',
                      overdue
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-800 dark:text-slate-100'
                    )}
                  >
                    <CalendarDays className="h-4 w-4" />
                    {formatDate(task.due_date)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 px-3.5 py-3 dark:border-slate-800">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Progress
                  </p>
                  <div className="mt-1.5">
                    <ProgressBar
                      value={task.progress}
                      color={statusMeta.color}
                      size="sm"
                      showLabel
                    />
                  </div>
                </div>
              </div>

              {labels.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {labels.map((label) => (
                    <span
                      key={label.id}
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-white"
                      style={{ backgroundColor: label.color }}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              )}

              {parent && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Sub-task dari{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {parent.title}
                  </span>
                </p>
              )}
            </section>

            {/* --- Deskripsi --- */}
            <section>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Deskripsi</h4>
              {task.description ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {task.description}
                </p>
              ) : (
                <p className="mt-2 text-sm italic text-slate-400 dark:text-slate-500">
                  Belum ada deskripsi.
                </p>
              )}
            </section>

            {/* --- Detail list --- */}
            <section>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Detail</h4>
              <dl className="mt-2 grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
                <DetailRow label="Estimasi jam">
                  {task.estimated_hours !== null && task.estimated_hours !== undefined
                    ? `${Number(task.estimated_hours)} jam`
                    : '-'}
                </DetailRow>
                <DetailRow label="Jam aktual">
                  {task.actual_hours !== null && task.actual_hours !== undefined
                    ? `${Number(task.actual_hours)} jam`
                    : '-'}
                </DetailRow>
                <DetailRow label="Dibuat oleh">{reporter?.name || task.reporter_name || '-'}</DetailRow>
                <DetailRow label="Dibuat pada">{formatDateTime(task.created_at)}</DetailRow>
                <DetailRow label="Diperbarui">{formatDateTime(task.updated_at)}</DetailRow>
                <DetailRow label="Selesai pada">
                  {task.completed_at ? formatDateTime(task.completed_at) : '-'}
                </DetailRow>
                <DetailRow label="Mulai">{formatDate(task.start_date)}</DetailRow>
                <DetailRow label="Prioritas">{priorityMeta.label}</DetailRow>
                <DetailRow label="Rencana Biaya (RAB)">
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {formatCurrency(task.estimated_cost)}
                  </span>
                </DetailRow>
                <DetailRow label="Biaya Aktual">
                  <span
                    className={cn(
                      'font-medium',
                      Number(task.actual_cost || 0) > Number(task.estimated_cost || 0) && Number(task.estimated_cost || 0) > 0
                        ? 'text-rose-600 dark:text-rose-400 font-semibold'
                        : 'text-slate-800 dark:text-slate-100'
                    )}
                  >
                    {formatCurrency(task.actual_cost)}
                  </span>
                </DetailRow>
              </dl>
            </section>

            {/* --- Checklist Sub-item --- */}
            <section>
              <div className="flex items-center justify-between gap-3">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <CheckSquare className="h-4 w-4 text-brand-500" />
                  Checklist
                </h4>
                {checklists.length > 0 && (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {checklistDone}/{checklists.length} selesai ({checklistPercent}%)
                  </span>
                )}
              </div>

              {checklists.length > 0 && (
                <ProgressBar value={checklistPercent} size="xs" className="mt-2" />
              )}

              {checklists.length > 0 && (
                <ul className="mt-2.5 space-y-1.5">
                  {checklists.map((item) => (
                    <li
                      key={item.id}
                      className={cn(
                        'group flex items-center justify-between gap-2.5 rounded-lg border px-3 py-2 transition-colors',
                        item.is_checked
                          ? 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/80'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          toggleChecklistMutation.mutate({
                            checklistId: item.id,
                            is_checked: !item.is_checked,
                          })
                        }
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        {item.is_checked ? (
                          <CheckSquare className="h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <Square className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                        )}
                        <span
                          className={cn(
                            'truncate text-sm transition-colors',
                            item.is_checked
                              ? 'text-slate-400 line-through dark:text-slate-500'
                              : 'text-slate-700 dark:text-slate-200'
                          )}
                        >
                          {item.title}
                        </span>
                      </button>

                      <IconButton
                        label="Hapus item checklist"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => removeChecklistMutation.mutate(item.id)}
                        disabled={removeChecklistMutation.isPending}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}

              {/* Quick-add checklist item form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const title = newChecklistTitle.trim();
                  if (!title) return;
                  addChecklistMutation.mutate(title);
                }}
                className="mt-2.5 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  placeholder="Tambah item checklist baru..."
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={!newChecklistTitle.trim()}
                  loading={addChecklistMutation.isPending}
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                >
                  Tambah
                </Button>
              </form>
            </section>

            {/* --- Sub-tasks --- */}
            <section>
              <div className="flex items-center justify-between gap-3">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <ListChecks className="h-4 w-4 text-slate-400" />
                  Sub-tasks
                </h4>
                {subtasks.length > 0 && (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {subtaskDone}/{subtasks.length} selesai ({subtaskPercent}%)
                  </span>
                )}
              </div>

              {subtasks.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                  Belum ada sub-task.
                </p>
              ) : (
                <>
                  <ProgressBar value={subtaskPercent} size="xs" className="mt-2" />
                  <ul className="mt-3 space-y-1.5">
                    {subtasks.map((subtask) => (
                      <li
                        key={subtask.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                          {subtask.title}
                        </span>
                        <TaskStatusBadge status={subtask.status} size="sm" />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            {/* --- Dependencies --- */}
            <section>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Link2 className="h-4 w-4 text-slate-400" />
                Dependensi
              </h4>

              {dependencies.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                  Belum ada dependensi.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {dependencies.map((dependency) => (
                    <li
                      key={dependency.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                          {dependency.depends_on?.title}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{dependency.type_label || DEPENDENCY_TYPES[dependency.type] || dependency.type}</span>
                          {dependency.lag_days !== undefined && Number(dependency.lag_days) !== 0 && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                              Jeda: {Number(dependency.lag_days) > 0 ? `+${dependency.lag_days}` : dependency.lag_days} hari
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {dependency.depends_on?.status && (
                          <TaskStatusBadge status={dependency.depends_on.status} size="sm" />
                        )}
                        <IconButton
                          label="Hapus dependensi"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => removeDependencyMutation.mutate(dependency.id)}
                          disabled={removeDependencyMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <DependencyPicker
                value={dependencyTarget}
                options={dependencyOptions}
                onValueChange={setDependencyTarget}
                type={dependencyType}
                onTypeChange={setDependencyType}
                onSubmit={() => {
                  if (!dependencyTarget) return;
                  addDependencyMutation.mutate({
                    depends_on_id: Number(dependencyTarget),
                    type: dependencyType,
                  });
                }}
                loading={addDependencyMutation.isPending}
                disabled={!task?.project_id}
              />
            </section>

            {/* --- Komentar --- */}
            <section>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <MessageSquare className="h-4 w-4 text-slate-400" />
                Komentar
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  ({comments.length})
                </span>
              </h4>

              {comments.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                  Belum ada komentar.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {comments.map((comment) => {
                    const isOwn = Number(comment.user_id) === Number(currentUser?.id);
                    return (
                      <li key={comment.id} className="flex gap-3">
                        <Avatar src={comment.user_avatar} name={comment.user_name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                              {comment.user_name}
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                              {formatRelative(comment.created_at)}
                            </span>
                            {isOwn && (
                              <IconButton
                                label="Hapus komentar"
                                size="icon-sm"
                                variant="ghost"
                                className="ml-auto"
                                onClick={() => removeCommentMutation.mutate(comment.id)}
                                disabled={removeCommentMutation.isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </IconButton>
                            )}
                          </div>
                          <div className="mt-1">
                            <CommentMarkdown content={comment.body} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="relative mt-4">
                {/* Autocomplete mention popover */}
                {mentionQuery !== null && filteredMembers.length > 0 && (
                  <div className="absolute bottom-full left-0 z-20 mb-2 max-h-48 w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Sebut Anggota Proyek
                    </div>
                    {filteredMembers.map((member, i) => (
                      <button
                        key={member.user_id || member.id}
                        type="button"
                        onClick={() => insertMention(member)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
                          i === mentionIndex
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                        )}
                      >
                        <Avatar src={member.avatar} name={member.name} size="xs" />
                        <div className="min-w-0 flex-1 truncate">
                          <p className="truncate font-medium">{member.name}</p>
                          {member.email && (
                            <p className="truncate text-[10px] text-slate-400">{member.email}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <form onSubmit={handleAddComment} className="flex items-start gap-2">
                  <div className="relative flex-1">
                    <textarea
                      ref={commentTextareaRef}
                      value={commentBody}
                      onChange={handleCommentChange}
                      onKeyDown={handleCommentKeyDown}
                      rows={2}
                      placeholder="Tulis komentar... (Ketik @ untuk mention anggota)"
                      className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
                    />
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                      <span>Ketik <strong>@</strong> untuk mention tim &bull; Mendukung **tebal**, *miring*, `kode`</span>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    size="icon"
                    aria-label="Kirim komentar"
                    loading={addCommentMutation.isPending}
                    disabled={!commentBody.trim()}
                    className="mt-0.5"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </section>

            {/* --- Lampiran --- */}
            <section>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Paperclip className="h-4 w-4 text-slate-400" />
                Lampiran
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  ({attachments.length})
                </span>
              </h4>

              {attachments.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                  Belum ada lampiran.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {attachments.map((attachment) => (
                    <li
                      key={attachment.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
                    >
                      <div className="min-w-0 flex-1">
                        <a
                          href={`/uploads/${attachment.stored_name}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          {attachment.original_name}
                        </a>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatSize(attachment.size)} - {formatDate(attachment.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <IconButton
                          label="Unduh lampiran"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() =>
                            window.open(`/uploads/${attachment.stored_name}`, '_blank', 'noopener')
                          }
                        >
                          <Download className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label="Hapus lampiran"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => removeAttachmentMutation.mutate(attachment.id)}
                          disabled={removeAttachmentMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_UPLOAD_TYPES}
                onChange={handleUpload}
                className="hidden"
              />
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                leftIcon={<Upload className="h-4 w-4" />}
                loading={uploadMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                Unggah Lampiran
              </Button>
            </section>
          </div>
        )}
      </Container>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
        title="Hapus task?"
        description="Task akan dihapus permanen. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Ya, hapus"
      />
    </>
  );
}

/**
 * A single label/value pair inside the detail list.
 */
function DetailRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-slate-100 pb-2 last:border-0 dark:border-slate-800">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{children}</dd>
    </div>
  );
}

/**
 * Control for adding a dependency to the current task.
 */
function DependencyPicker({
  value,
  options = [],
  onValueChange,
  type,
  onTypeChange,
  onSubmit,
  loading,
  disabled,
}) {
  const selected = options.find((item) => String(item.id) === String(value));

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Dropdown
        align="left"
        width="w-72"
        trigger={
          <button
            type="button"
            disabled={disabled}
            className="flex h-9 w-full max-w-[16rem] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 transition-colors hover:border-slate-300 focus-ring disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200"
          >
            <span className="truncate">{selected?.title || 'Pilih task terkait'}</span>
            <span className="text-slate-400">&#9662;</span>
          </button>
        }
      >
        <DropdownLabel>Task untuk dihubungkan</DropdownLabel>
        {options.length === 0 ? (
          <p className="px-3.5 py-2 text-xs text-slate-500 dark:text-slate-400">
            Tidak ada task lain di project ini.
          </p>
        ) : (
          options.map((item) => (
            <DropdownItem key={item.id} onClick={() => onValueChange(String(item.id))}>
              <span className="truncate">{item.title}</span>
            </DropdownItem>
          ))
        )}
      </Dropdown>

      <Dropdown
        align="left"
        width="w-48"
        trigger={
          <button
            type="button"
            className="flex h-9 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 transition-colors hover:border-slate-300 focus-ring dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200"
          >
            {DEPENDENCY_TYPES[type] || type}
            <span className="text-slate-400">&#9662;</span>
          </button>
        }
      >
        {Object.entries(DEPENDENCY_TYPES).map(([key, label]) => (
          <DropdownItem key={key} onClick={() => onTypeChange(key)}>
            {label}
          </DropdownItem>
        ))}
      </Dropdown>

      <Button
        size="sm"
        onClick={onSubmit}
        loading={loading}
        disabled={!value || disabled}
        leftIcon={<Link2 className="h-4 w-4" />}
      >
        Tambahkan
      </Button>
    </div>
  );
}

export default TaskDetailDrawer;
