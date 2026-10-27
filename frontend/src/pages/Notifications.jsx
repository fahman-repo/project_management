import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AtSign,
  Bell,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  Info,
  ListTodo,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { notificationApi } from '../api';
import { getErrorMessage } from '../api/client';
import { PageHeader } from '../components/shared/StatCard';
import { Button, IconButton } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { Pagination } from '../components/ui/Pagination';
import { formatRelative } from '../utils/formatters';
import { resolveInternalLink } from '../utils/links';
import { cn } from '../utils/cn';

const PER_PAGE = 15;

/**
 * Visual treatment per notification type.
 * @param {string} type
 * @returns {{icon:any, color:string, bg:string}}
 */
function typeMeta(type) {
  switch (type) {
    case 'success':
      return {
        icon: CircleCheck,
        color: '#10b981',
        bg: 'bg-emerald-50 dark:bg-emerald-500/15',
      };
    case 'warning':
      return {
        icon: TriangleAlert,
        color: '#f59e0b',
        bg: 'bg-amber-50 dark:bg-amber-500/15',
      };
    case 'danger':
      return {
        icon: CircleAlert,
        color: '#ef4444',
        bg: 'bg-rose-50 dark:bg-rose-500/15',
      };
    case 'task':
      return { icon: ListTodo, color: '#4f46e5', bg: 'bg-brand-50 dark:bg-brand-500/15' };
    case 'mention':
      return {
        icon: AtSign,
        color: '#a855f7',
        bg: 'bg-purple-50 dark:bg-purple-500/15',
      };
    case 'info':
    default:
      return { icon: Info, color: '#0ea5e9', bg: 'bg-sky-50 dark:bg-sky-500/15' };
  }
}

/**
 * Notifications page - a filterable list of the user's notifications.
 */
export default function Notifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const params = useMemo(
    () => ({
      page,
      perPage: PER_PAGE,
      unread: tab === 'unread' ? true : undefined,
    }),
    [page, tab]
  );

  const notificationQuery = useQuery({
    queryKey: ['notifications', 'list', params],
    queryFn: () => notificationApi.list(params),
  });

  // Shares the cache entry with the layout badge so the count stays in sync.
  const countQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationApi.list({ page: 1, perPage: 1 }),
    staleTime: 30000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
  const markReadMutation = useMutation({
    mutationFn: (id) => notificationApi.markRead(id),
    onSuccess: invalidateAll,
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => {
      invalidateAll();
      toast.success('Semua notifikasi ditandai sudah dibaca');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const removeMutation = useMutation({
    mutationFn: (id) => notificationApi.remove(id),
    onSuccess: (_, id) => {
      invalidateAll();
      setPendingDelete(null);
      toast.success('Notifikasi dihapus');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setPendingDelete(null);
    },
  });

  const clearReadMutation = useMutation({
    mutationFn: () => notificationApi.clearRead(),
    onSuccess: () => {
      invalidateAll();
      setConfirmClear(false);
      toast.success('Notifikasi yang sudah dibaca dihapus');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setConfirmClear(false);
    },
  });

  const items = useMemo(() => {
    const payload = notificationQuery.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }, [notificationQuery.data]);

  const unreadCount = Number(
    countQuery.data?.unreadCount ?? notificationQuery.data?.unreadCount ?? 0
  );

  const total = Number(
    notificationQuery.data?.total ?? notificationQuery.data?.meta?.total ?? items.length
  );
  const totalPages = Number(
    notificationQuery.data?.totalPages ?? notificationQuery.data?.meta?.totalPages ?? 1
  );

  const handleOpen = (notification) => {
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id);
    }
    // Legacy links (e.g. `/tasks/42`) are normalised so they never 404.
    const target = resolveInternalLink(notification.link);
    if (target) {
      navigate(target);
    }
  };

  const tabs = [
    { key: 'all', label: 'Semua' },
    { key: 'unread', label: 'Belum Dibaca', count: unreadCount },
    { key: 'read', label: 'Sudah Dibaca' },
  ];

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Pemberitahuan terbaru terkait aktivitas Anda"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<CheckCheck className="h-4 w-4" />}
              onClick={() => setConfirmClear(true)}
              disabled={unreadCount === 0 && total === 0}
            >
              Hapus yang sudah dibaca
            </Button>
            <Button
              size="sm"
              leftIcon={<CheckCheck className="h-4 w-4" />}
              loading={markAllReadMutation.isPending}
              onClick={() => markAllReadMutation.mutate()}
              disabled={unreadCount === 0}
            >
              Tandai semua dibaca
            </Button>
          </div>
        }
      />

      <Card className="mb-5">
        <CardBody className="px-0 py-0 sm:px-5 sm:py-1">
          <Tabs
            tabs={tabs}
            value={tab}
            onChange={(key) => {
              setTab(key);
              setPage(1);
            }}
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          {notificationQuery.isLoading ? (
            <LoadingState label="Memuat notifikasi..." />
          ) : notificationQuery.isError ? (
            <ErrorState
              description={getErrorMessage(notificationQuery.error)}
              onRetry={() => notificationQuery.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Tidak ada notifikasi"
              description={
                tab === 'unread'
                  ? 'Semua notifikasi sudah Anda baca.'
                  : 'Belum ada notifikasi yang masuk.'
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {items.map((notification) => {
                const appearance = typeMeta(notification.type);
                const Icon = appearance.icon;
                const unread = !notification.is_read;

                return (
                  <li key={notification.id}>
                    <div
                      className={cn(
                        'flex items-start gap-3 rounded-xl border p-3.5 transition-colors',
                        unread
                          ? 'border-l-4 border-brand-500 bg-brand-50/40 dark:bg-brand-500/[0.07]'
                          : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/40'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                          appearance.bg
                        )}
                        style={{ color: appearance.color }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>

                      <button
                        type="button"
                        onClick={() => handleOpen(notification)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p
                          className={cn(
                            'text-sm',
                            unread
                              ? 'font-semibold text-slate-900 dark:text-white'
                              : 'font-medium text-slate-700 dark:text-slate-200'
                          )}
                        >
                          {notification.title}
                        </p>
                        {notification.message && (
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                            {notification.message}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                          {formatRelative(notification.created_at)}
                        </p>
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        {unread && (
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => markReadMutation.mutate(notification.id)}
                            loading={
                              markReadMutation.isPending &&
                              markReadMutation.variables === notification.id
                            }
                          >
                            Tandai dibaca
                          </Button>
                        )}
                        <IconButton
                          label="Hapus notifikasi"
                          size="icon-sm"
                          onClick={() => setPendingDelete(notification)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <Pagination
            className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800"
            page={page}
            perPage={PER_PAGE}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </CardBody>
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && removeMutation.mutate(pendingDelete.id)}
        title="Hapus notifikasi?"
        description="Notifikasi ini akan dihapus permanen dan tidak dapat dikembalikan."
        confirmLabel="Ya, hapus"
        loading={removeMutation.isPending}
      />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => clearReadMutation.mutate()}
        title="Hapus notifikasi yang sudah dibaca?"
        description="Seluruh notifikasi yang sudah ditandai dibaca akan dihapus permanen."
        confirmLabel="Ya, hapus"
        loading={clearReadMutation.isPending}
      />
    </div>
  );
}
