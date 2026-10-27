import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  Grid3x3,
  List,
  Mail,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { dashboardApi, userApi } from '../api/index';
import { getErrorMessage } from '../api/client';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button, IconButton } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Dropdown, DropdownItem, DropdownSeparator } from '../components/ui/Dropdown';
import { EmptyState, ErrorState, LoadingState, NoResultsState } from '../components/ui/Feedback';
import { Input, Select } from '../components/ui/Input';
import { Drawer } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SegmentedControl } from '../components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import { RoleBadge } from '../components/shared/Badges';
import { PageHeader } from '../components/shared/StatCard';
import { UserFormModal } from '../components/shared/UserFormModal';
import { useAuthStore } from '../store/authStore';
import { formatDate, formatRelative } from '../utils/formatters';

const PER_PAGE = 12;

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrator' },
  { value: 'manager', label: 'Manajer' },
  { value: 'member', label: 'Anggota' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Nonaktif' },
];

const VIEW_OPTIONS = [
  { value: 'grid', label: 'Grid', icon: <Grid3x3 className="h-3.5 w-3.5" /> },
  { value: 'table', label: 'Table', icon: <List className="h-3.5 w-3.5" /> },
];

const WORKLOAD_ROWS = [
  { key: 'todo', label: 'Akan Dikerjakan', color: '#64748b' },
  { key: 'in_progress', label: 'Sedang Dikerjakan', color: '#3b82f6' },
  { key: 'review', label: 'Dalam Review', color: '#a855f7' },
  { key: 'done', label: 'Selesai', color: '#10b981' },
  { key: 'overdue', label: 'Terlambat', color: '#ef4444' },
];

/**
 * Active (not yet completed) task count for a member.
 * @param {object|undefined} entry
 */
function activeTaskCount(entry) {
  if (!entry) return 0;
  const total = Number(entry.total) || 0;
  const done = Number(entry.done) || 0;
  return Math.max(0, total - done);
}

/**
 * Status pill for a user account.
 * @param {boolean} isActive
 */
function ActiveBadge({ isActive }) {
  return (
    <Badge
      dot
      className={
        isActive
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300'
      }
    >
      {isActive ? 'Aktif' : 'Nonaktif'}
    </Badge>
  );
}

/**
 * Team directory - browse members in a grid or table and inspect their workload.
 */
export default function Team() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === 'admin';

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState('grid');

  const [detailUser, setDetailUser] = useState(null);
  const [formState, setFormState] = useState({ open: false, user: null });
  const [confirmState, setConfirmState] = useState(null);

  // Debounce the search term so typing does not spam the API.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Any filter change resets pagination.
  useEffect(() => {
    setPage(1);
  }, [search, role, status]);

  const listQuery = useQuery({
    queryKey: ['users', { page, perPage: PER_PAGE, search, role, status }],
    queryFn: async () => {
      const params = { page, perPage: PER_PAGE };
      if (search) params.search = search;
      if (role) params.role = role;
      if (status) params.isActive = status === 'active';

      const res = await userApi.list(params);
      return { users: res.data || [], meta: res.meta || {} };
    },
    // Keep the previous page visible while the next one loads.
    placeholderData: (previous) => previous,
  });

  // Workload is supplementary - a failure here must not break the directory.
  const workloadQuery = useQuery({
    queryKey: ['dashboard', 'workload'],
    queryFn: () => dashboardApi.workload(),
    retry: false,
    staleTime: 60000,
  });

  const workloadMap = useMemo(() => {
    const map = new Map();
    for (const entry of workloadQuery.data || []) {
      map.set(entry.userId, entry);
    }
    return map;
  }, [workloadQuery.data]);

  const users = listQuery.data?.users || [];
  const meta = listQuery.data?.meta || {};
  const total = meta.total || 0;
  const hasFilters = Boolean(search || role || status);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'workload'] });
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }) => userApi.update(id, { is_active: isActive }),
    onSuccess: (result, variables) => {
      toast.success(variables.isActive ? 'Pengguna berhasil diaktifkan' : 'Pengguna berhasil dinonaktifkan');
      invalidate();
      setDetailUser((current) =>
        current && current.id === variables.id ? { ...current, is_active: variables.isActive } : current
      );
      setConfirmState(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setConfirmState(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => userApi.remove(id),
    onSuccess: () => {
      toast.success('Pengguna berhasil dihapus');
      invalidate();
      setDetailUser(null);
      setConfirmState(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setConfirmState(null);
    },
  });

  const openCreateModal = () => setFormState({ open: true, user: null });
  const openEditModal = (target) => {
    setDetailUser(null);
    setFormState({ open: true, user: target });
  };

  const requestToggle = (target) => {
    const nextActive = !target.is_active;
    setConfirmState({
      type: 'toggle',
      user: target,
      title: nextActive ? 'Aktifkan Pengguna?' : 'Nonaktifkan Pengguna?',
      description: nextActive
        ? `${target.name} akan dapat masuk kembali ke sistem.`
        : `${target.name} tidak dapat masuk ke sistem sampai akunnya diaktifkan kembali.`,
      confirmLabel: nextActive ? 'Ya, aktifkan' : 'Ya, nonaktifkan',
    });
  };

  const requestDelete = (target) => {
    setConfirmState({
      type: 'delete',
      user: target,
      title: 'Hapus Pengguna?',
      description: `Akun ${target.name} akan dinonaktifkan dan tidak dapat lagi masuk ke sistem.`,
      confirmLabel: 'Ya, hapus',
    });
  };

  const confirmAction = () => {
    if (!confirmState) return;
    const target = confirmState.user;
    if (confirmState.type === 'delete') {
      deleteMutation.mutate(target.id);
      return;
    }
    toggleMutation.mutate({ id: target.id, isActive: !target.is_active });
  };

  const isForbidden = listQuery.error?.response?.status === 403;

  const filters = (
    <Card className="mb-5">
      <CardBody className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="lg:w-72">
          <Input
            type="search"
            placeholder="Cari nama atau email..."
            icon={<Search className="h-4 w-4" />}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Cari anggota tim"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:items-center">
          <Select
            options={ROLE_OPTIONS}
            placeholder="Semua Peran"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            containerClassName="lg:w-44"
            aria-label="Filter peran"
          />
          <Select
            options={STATUS_OPTIONS}
            placeholder="Semua Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            containerClassName="lg:w-40"
            aria-label="Filter status"
          />
        </div>

        <div className="lg:ml-auto">
          <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} />
        </div>
      </CardBody>
    </Card>
  );

  const renderGrid = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {users.map((member) => {
        const workload = workloadMap.get(member.id);

        return (
          <Card
            key={member.id}
            hover
            className="cursor-pointer"
            onClick={() => setDetailUser(member)}
          >
            <CardBody className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar src={member.avatar} name={member.name} size="xl" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {member.name}
                    </p>
                    <div className="mt-1.5">
                      <RoleBadge role={member.role} size="sm" />
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div onClick={(event) => event.stopPropagation()}>
                    <Dropdown
                      align="right"
                      trigger={
                        <IconButton label="Aksi" size="icon-sm">
                          <MoreVertical className="h-4 w-4" />
                        </IconButton>
                      }
                    >
                      <DropdownItem icon={Pencil} onClick={() => openEditModal(member)}>
                        Edit
                      </DropdownItem>
                      <DropdownItem
                        icon={member.is_active ? UserX : UserCheck}
                        onClick={() => requestToggle(member)}
                      >
                        {member.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </DropdownItem>
                      <DropdownSeparator />
                      <DropdownItem icon={Trash2} danger onClick={() => requestDelete(member)}>
                        Hapus
                      </DropdownItem>
                    </Dropdown>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <p className="flex items-center gap-2 truncate">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{member.email}</span>
                </p>
                <p className="flex items-center gap-2 truncate">
                  <Briefcase className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{member.job_title || 'Jabatan belum diisi'}</span>
                </p>
                <p className="flex items-center gap-2 truncate">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    Login terakhir {formatRelative(member.last_login_at)}
                  </span>
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                    <BadgeCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Tugas Aktif</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                      {activeTaskCount(workload)}
                    </p>
                  </div>
                </div>
                <ActiveBadge isActive={member.is_active} />
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );

  const renderTable = () => (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Nama</TH>
            <TH>Email</TH>
            <TH>Peran</TH>
            <TH>Jabatan</TH>
            <TH>Status</TH>
            <TH>Login Terakhir</TH>
            <TH align="right">Tugas Aktif</TH>
            {isAdmin && <TH align="right">Aksi</TH>}
          </TR>
        </THead>
        <TBody>
          {users.map((member) => {
            const workload = workloadMap.get(member.id);

            return (
              <TR key={member.id} onClick={() => setDetailUser(member)}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar src={member.avatar} name={member.name} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {member.name}
                      </p>
                    </div>
                  </div>
                </TD>
                <TD>
                  <span className="block max-w-[220px] truncate text-slate-600 dark:text-slate-300">
                    {member.email}
                  </span>
                </TD>
                <TD>
                  <RoleBadge role={member.role} size="sm" />
                </TD>
                <TD>
                  <span className="block max-w-[180px] truncate text-slate-600 dark:text-slate-300">
                    {member.job_title || '-'}
                  </span>
                </TD>
                <TD>
                  <ActiveBadge isActive={member.is_active} />
                </TD>
                <TD>
                  <span className="whitespace-nowrap text-slate-600 dark:text-slate-300">
                    {formatRelative(member.last_login_at)}
                  </span>
                </TD>
                <TD align="right">
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                    {activeTaskCount(workload)}
                  </span>
                </TD>
                {isAdmin && (
                  <TD align="right">
                    <div onClick={(event) => event.stopPropagation()}>
                      <Dropdown
                        align="right"
                        trigger={
                          <IconButton label="Aksi" size="icon-sm">
                            <MoreVertical className="h-4 w-4" />
                          </IconButton>
                        }
                      >
                        <DropdownItem icon={Pencil} onClick={() => openEditModal(member)}>
                          Edit
                        </DropdownItem>
                        <DropdownItem
                          icon={member.is_active ? UserX : UserCheck}
                          onClick={() => requestToggle(member)}
                        >
                          {member.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </DropdownItem>
                        <DropdownSeparator />
                        <DropdownItem icon={Trash2} danger onClick={() => requestDelete(member)}>
                          Hapus
                        </DropdownItem>
                      </Dropdown>
                    </div>
                  </TD>
                )}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );

  const body = () => {
    if (listQuery.isLoading) return <LoadingState label="Memuat anggota tim..." />;

    if (listQuery.isError) {
      if (isForbidden) {
        return (
          <Card>
            <EmptyState
              icon={ShieldCheck}
              title="Akses ditolak"
              description="Hanya administrator dan manajer yang dapat melihat daftar anggota tim."
            />
          </Card>
        );
      }
      return (
        <Card>
          <ErrorState
            description={getErrorMessage(listQuery.error)}
            onRetry={() => listQuery.refetch()}
          />
        </Card>
      );
    }

    if (!users.length) {
      return (
        <Card>
          {hasFilters ? (
            <NoResultsState
              onReset={() => {
                setSearchInput('');
                setRole('');
                setStatus('');
              }}
            />
          ) : (
            <EmptyState
              icon={Users}
              title="Belum ada anggota tim"
              description="Tambahkan pengguna pertama untuk mulai bekerja sama."
              action={
                isAdmin ? (
                  <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreateModal}>
                    Tambah User
                  </Button>
                ) : null
              }
            />
          )}
        </Card>
      );
    }

    return view === 'grid' ? renderGrid() : renderTable();
  };

  const detailWorkload = detailUser ? workloadMap.get(detailUser.id) : null;
  const detailTotal = Number(detailWorkload?.total) || 0;

  return (
    <div>
      <PageHeader
        title="Team"
        description={`${total} anggota tim terdaftar di workspace ini.`}
        action={
          isAdmin ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreateModal}>
              Tambah User
            </Button>
          ) : null
        }
      />

      {filters}
      {body()}

      {total > 0 && (
        <Card className="mt-5">
          <CardBody>
            <Pagination
              page={meta.page || page}
              perPage={meta.perPage || PER_PAGE}
              total={total}
              totalPages={meta.totalPages || 1}
              onPageChange={setPage}
            />
          </CardBody>
        </Card>
      )}

      {/* Member detail drawer */}
      <Drawer
        open={Boolean(detailUser)}
        onClose={() => setDetailUser(null)}
        title={detailUser?.name}
        description={detailUser?.email}
        width="max-w-lg"
        footer={
          isAdmin && detailUser ? (
            <>
              <Button
                variant="secondary"
                leftIcon={<Pencil className="h-4 w-4" />}
                onClick={() => openEditModal(detailUser)}
              >
                Edit
              </Button>
              <Button
                variant={detailUser.is_active ? 'danger' : 'success'}
                leftIcon={detailUser.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                onClick={() => requestToggle(detailUser)}
              >
                {detailUser.is_active ? 'Nonaktifkan' : 'Aktifkan'}
              </Button>
            </>
          ) : null
        }
      >
        {detailUser && (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-center dark:border-slate-800 dark:bg-slate-950/40">
              <Avatar src={detailUser.avatar} name={detailUser.name} size="2xl" />
              <div>
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  {detailUser.name}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {detailUser.job_title || 'Jabatan belum diisi'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <RoleBadge role={detailUser.role} size="sm" />
                <ActiveBadge isActive={detailUser.is_active} />
              </div>
            </div>

            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Email</dt>
                  <dd className="truncate text-slate-700 dark:text-slate-300">{detailUser.email}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Telepon</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{detailUser.phone || '-'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Jabatan</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{detailUser.job_title || '-'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Bergabung</dt>
                  <dd className="text-slate-700 dark:text-slate-300">
                    {formatDate(detailUser.created_at)}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Login Terakhir</dt>
                  <dd className="text-slate-700 dark:text-slate-300">
                    {formatRelative(detailUser.last_login_at)}
                  </dd>
                </div>
              </div>
            </dl>

            {detailUser.bio && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">Bio</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {detailUser.bio}
                </p>
              </div>
            )}

            <div>
              <p className="mb-3 text-xs font-medium text-slate-700 dark:text-slate-300">
                Beban Tugas
              </p>
              {detailTotal ? (
                <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  {WORKLOAD_ROWS.map((row) => {
                    const value = Number(detailWorkload?.[row.key]) || 0;
                    return (
                      <div key={row.key}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-slate-500 dark:text-slate-400">{row.label}</span>
                          <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                            {value}
                          </span>
                        </div>
                        <ProgressBar
                          value={detailTotal ? (value / detailTotal) * 100 : 0}
                          color={row.color}
                          size="xs"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Belum ada tugas yang ditugaskan.
                </p>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Create / edit modal */}
      <UserFormModal
        open={formState.open}
        user={formState.user}
        onClose={() => setFormState({ open: false, user: null })}
      />

      {/* Confirm destructive action */}
      <ConfirmDialog
        open={Boolean(confirmState)}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmAction}
        title={confirmState?.title}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel}
        loading={toggleMutation.isPending || deleteMutation.isPending}
      />
    </div>
  );
}
