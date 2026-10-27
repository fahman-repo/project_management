import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  MoreVertical,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { userApi } from '../../api/index';
import { getErrorMessage } from '../../api/client';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardBody, CardFooter } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dropdown, DropdownItem, DropdownSeparator } from '../../components/ui/Dropdown';
import { EmptyState, ErrorState, LoadingState, NoResultsState } from '../../components/ui/Feedback';
import { Input, Select } from '../../components/ui/Input';
import { Pagination } from '../../components/ui/Pagination';
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui/Table';
import { RoleBadge } from '../../components/shared/Badges';
import { PageHeader } from '../../components/shared/StatCard';
import { UserFormModal } from '../../components/shared/UserFormModal';
import { useAuthStore } from '../../store/authStore';
import { formatDate } from '../../utils/formatters';

const PER_PAGE = 10;

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrator' },
  { value: 'manager', label: 'Manajer' },
  { value: 'member', label: 'Anggota' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Nonaktif' },
];

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
 * Admin-only user management console.
 */
export default function UserManagement() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === 'admin';

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState([]);

  const [formState, setFormState] = useState({ open: false, user: null });
  const [confirmState, setConfirmState] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, role, status]);

  const listQuery = useQuery({
    queryKey: ['users', 'management', { page, perPage: PER_PAGE, search, role, status }],
    queryFn: async () => {
      const params = { page, perPage: PER_PAGE };
      if (search) params.search = search;
      if (role) params.role = role;
      if (status) params.isActive = status === 'active';

      const res = await userApi.list(params);
      return { users: res.data || [], meta: res.meta || {} };
    },
    enabled: isAdmin,
    placeholderData: (previous) => previous,
  });

  const users = listQuery.data?.users || [];
  const meta = listQuery.data?.meta || {};
  const total = meta.total || 0;
  const hasFilters = Boolean(search || role || status);

  const pageIds = useMemo(() => users.map((user) => user.id), [users]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    setSelected([]);
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }) => userApi.update(id, { is_active: isActive }),
    onSuccess: (result, variables) => {
      toast.success(
        variables.isActive ? 'Pengguna berhasil diaktifkan' : 'Pengguna berhasil dinonaktifkan'
      );
      invalidate();
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
      setConfirmState(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setConfirmState(null);
    },
  });

  const bulkDeactivateMutation = useMutation({
    mutationFn: async (ids) => {
      // The API has no bulk endpoint, so the requests run in parallel.
      const results = await Promise.allSettled(ids.map((id) => userApi.update(id, { is_active: false })));
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length) {
        throw new Error(
          failed.length === 1
            ? getErrorMessage(failed[0].reason)
            : `${failed.length} pengguna gagal dinonaktifkan`
        );
      }
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} pengguna berhasil dinonaktifkan`);
      invalidate();
      setConfirmState(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setConfirmState(null);
    },
  });

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

  const requestBulkDeactivate = () => {
    setConfirmState({
      type: 'bulk',
      title: 'Nonaktifkan Pengguna Terpilih?',
      description: `${selected.length} akun akan dinonaktifkan dan tidak dapat masuk ke sistem.`,
      confirmLabel: 'Ya, nonaktifkan',
    });
  };

  const confirmAction = () => {
    if (!confirmState) return;

    if (confirmState.type === 'delete') {
      deleteMutation.mutate(confirmState.user.id);
      return;
    }
    if (confirmState.type === 'bulk') {
      bulkDeactivateMutation.mutate(selected);
      return;
    }
    toggleMutation.mutate({
      id: confirmState.user.id,
      isActive: !confirmState.user.is_active,
    });
  };

  const toggleSelection = (id) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const toggleSelectAll = () => {
    setSelected((current) =>
      allSelected ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])]
    );
  };

  const resetFilters = () => {
    setSearchInput('');
    setRole('');
    setStatus('');
  };

  if (!isAdmin) {
    return (
      <Card className="mx-auto max-w-xl">
        <EmptyState
          icon={ShieldAlert}
          title="Akses ditolak"
          description="Hanya administrator yang dapat mengakses manajemen pengguna."
          action={
            <Button variant="secondary" onClick={() => window.history.back()}>
              Kembali
            </Button>
          }
        />
      </Card>
    );
  }

  const renderBody = () => {
    if (listQuery.isLoading) return <LoadingState label="Memuat data pengguna..." />;

    if (listQuery.isError) {
      return (
        <ErrorState
          description={getErrorMessage(listQuery.error)}
          onRetry={() => listQuery.refetch()}
        />
      );
    }

    if (!users.length) {
      return hasFilters ? (
        <NoResultsState onReset={resetFilters} />
      ) : (
        <EmptyState
          icon={Users}
          title="Belum ada pengguna"
          description="Tambahkan pengguna pertama untuk mulai bekerja sama."
          action={
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormState({ open: true, user: null })}>
              Tambah Pengguna
            </Button>
          }
        />
      );
    }

    return (
      <Table>
        <THead>
          <TR>
            <TH className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                aria-label="Pilih semua pengguna di halaman ini"
                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800"
              />
            </TH>
            <TH>Nama</TH>
            <TH>Email</TH>
            <TH>Peran</TH>
            <TH>Jabatan</TH>
            <TH>Status</TH>
            <TH>Dibuat</TH>
            <TH align="right">Aksi</TH>
          </TR>
        </THead>
        <TBody>
          {users.map((member) => (
            <TR key={member.id}>
              <TD>
                <input
                  type="checkbox"
                  checked={selected.includes(member.id)}
                  onChange={() => toggleSelection(member.id)}
                  aria-label={`Pilih ${member.name}`}
                  className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800"
                />
              </TD>
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
                <span className="block max-w-[160px] truncate text-slate-600 dark:text-slate-300">
                  {member.job_title || '-'}
                </span>
              </TD>
              <TD>
                <ActiveBadge isActive={member.is_active} />
              </TD>
              <TD>
                <span className="whitespace-nowrap text-slate-600 dark:text-slate-300">
                  {formatDate(member.created_at)}
                </span>
              </TD>
              <TD align="right">
                <Dropdown
                  align="right"
                  trigger={
                    <IconButton label="Aksi" size="icon-sm">
                      <MoreVertical className="h-4 w-4" />
                    </IconButton>
                  }
                >
                  <DropdownItem
                    icon={Pencil}
                    onClick={() => setFormState({ open: true, user: member })}
                  >
                    Edit / Reset Password
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
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    );
  };

  return (
    <div>
      <PageHeader
        title="Manajemen Pengguna"
        description={`${total} pengguna terdaftar. Kelola peran, status, dan akses tim.`}
        action={
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setFormState({ open: true, user: null })}
          >
            Tambah Pengguna
          </Button>
        }
      />

      {/* Filters */}
      <Card className="mb-5">
        <CardBody className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="lg:w-72">
            <Input
              type="search"
              placeholder="Cari nama atau email..."
              icon={<Search className="h-4 w-4" />}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="Cari pengguna"
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

          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {selected.length} pengguna dipilih
              </span>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<UserX className="h-4 w-4" />}
                onClick={requestBulkDeactivate}
              >
                Nonaktifkan
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                Batalkan pilihan
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Table */}
      <Card>
        {renderBody()}
        {total > 0 && (
          <CardFooter>
            <Pagination
              page={meta.page || page}
              perPage={meta.perPage || PER_PAGE}
              total={total}
              totalPages={meta.totalPages || 1}
              onPageChange={setPage}
              className="w-full"
            />
          </CardFooter>
        )}
      </Card>

      {/* Create / edit modal */}
      <UserFormModal
        open={formState.open}
        user={formState.user}
        onClose={() => setFormState({ open: false, user: null })}
      />

      {/* Confirmation dialog */}
      <ConfirmDialog
        open={Boolean(confirmState)}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmAction}
        title={confirmState?.title}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel}
        loading={
          toggleMutation.isPending || deleteMutation.isPending || bulkDeactivateMutation.isPending
        }
      />
    </div>
  );
}
