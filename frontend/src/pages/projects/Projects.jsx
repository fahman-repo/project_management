import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LayoutGrid, List, MoreVertical, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import projectApi from '../../api/project.api';
import { getErrorMessage } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { PageHeader } from '../../components/shared/StatCard';
import { ProjectCard } from '../../components/shared/ProjectCard';
import { ProjectFormModal } from '../../components/shared/ProjectFormModal';
import { StatusBadge, PriorityBadge } from '../../components/shared/Badges';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui/Table';
import { SegmentedControl } from '../../components/ui/Tabs';
import { Pagination } from '../../components/ui/Pagination';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Avatar } from '../../components/ui/Avatar';
import { Dropdown, DropdownItem, DropdownSeparator } from '../../components/ui/Dropdown';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, NoResultsState, TableSkeleton } from '../../components/ui/Feedback';
import { PRIORITY, PROJECT_STATUS } from '../../utils/constants';
import { formatDate } from '../../utils/formatters';

const PER_PAGE_OPTIONS = [
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
];

const SORT_OPTIONS = [
  { value: 'name', label: 'Nama Project' },
  { value: 'code', label: 'Kode' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Prioritas' },
  { value: 'progress', label: 'Progress' },
  { value: 'start_date', label: 'Tanggal Mulai' },
  { value: 'end_date', label: 'Tanggal Selesai' },
  { value: 'created_at', label: 'Dibuat' },
];

/**
 * Columns that the API can sort on.
 */
const SORTABLE_COLUMNS = {
  code: 'code',
  name: 'name',
  status: 'status',
  priority: 'priority',
  progress: 'progress',
  end_date: 'end_date',
};

/**
 * Projects listing with grid/table views, filters and server pagination.
 */
export default function Projects() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const [view, setView] = useState('grid');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [sort, setSort] = useState('name');
  const [direction, setDirection] = useState('asc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Debounce the search term before it reaches the API.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Any filter change resets the pagination.
  useEffect(() => {
    setPage(1);
  }, [status, priority, perPage]);

  const queryParams = useMemo(
    () => ({
      page,
      perPage,
      search: search || undefined,
      status: status || undefined,
      priority: priority || undefined,
      sort,
      direction,
    }),
    [page, perPage, search, status, priority, sort, direction]
  );

  const projectsQuery = useQuery({
    queryKey: ['projects', 'list', queryParams],
    queryFn: () => projectApi.list(queryParams),
  });

  const projects = projectsQuery.data?.data ?? [];
  const meta = projectsQuery.data?.meta ?? {
    page,
    perPage,
    total: 0,
    totalPages: 1,
  };

  const hasFilters = Boolean(search || status || priority);

  const deleteMutation = useMutation({
    mutationFn: (id) => projectApi.remove(id),
    onSuccess: () => {
      toast.success('Project berhasil dihapus');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleSort = (column) => {
    if (SORTABLE_COLUMNS[column] !== sort) {
      setSort(SORTABLE_COLUMNS[column]);
      setDirection('asc');
    } else {
      setDirection((value) => (value === 'asc' ? 'desc' : 'asc'));
    }
    setPage(1);
  };

  const handleEdit = (project) => {
    setEditingProject(project);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditingProject(null);
    setFormOpen(true);
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setPriority('');
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Kelola seluruh project beserta tim dan progresnya."
        action={
          canManage ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={handleCreate}>
              Tambah Project
            </Button>
          ) : null
        }
      />

      {/* Filter bar */}
      <Card className="mb-5">
        <CardBody className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Input
              containerClassName="lg:max-w-xs"
              placeholder="Cari nama atau kode project..."
              icon={<Search className="h-4 w-4" />}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="Cari project"
            />

            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                placeholder="Semua status"
                aria-label="Filter status"
                options={Object.entries(PROJECT_STATUS).map(([value, meta]) => ({
                  value,
                  label: meta.label,
                }))}
              />

              <Select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                placeholder="Semua prioritas"
                aria-label="Filter prioritas"
                options={Object.entries(PRIORITY).map(([value, meta]) => ({
                  value,
                  label: meta.label,
                }))}
              />

              <Select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(1);
                }}
                aria-label="Urutkan"
                options={SORT_OPTIONS}
              />
            </div>

            <div className="flex items-center justify-between gap-3 lg:justify-end">
              <SegmentedControl
                value={view}
                onChange={setView}
                options={[
                  { value: 'grid', label: 'Grid', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
                  { value: 'table', label: 'Tabel', icon: <List className="h-3.5 w-3.5" /> },
                ]}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Content */}
      {projectsQuery.isLoading ? (
        <Card>
          <TableSkeleton rows={6} columns={5} />
        </Card>
      ) : projectsQuery.isError ? (
        <Card>
          <ErrorState
            title="Gagal memuat project"
            description="Tidak dapat mengambil daftar project dari server."
            onRetry={() => projectsQuery.refetch()}
          />
        </Card>
      ) : projects.length === 0 ? (
        <Card>
          {hasFilters ? (
            <NoResultsState
              description="Tidak ada project yang cocok dengan filter Anda."
              onReset={resetFilters}
            />
          ) : (
            <EmptyState
              icon={LayoutGrid}
              title="Belum ada project"
              description="Mulai dengan membuat project pertama untuk mulai mengelola pekerjaan tim."
              action={
                canManage ? (
                  <Button leftIcon={<Plus className="h-4 w-4" />} onClick={handleCreate}>
                    Buat project pertama
                  </Button>
                ) : null
              }
            />
          )}
        </Card>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              canManage={canManage}
              onEdit={handleEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH sortable sorted={sort === 'code' ? direction : null} onSort={() => handleSort('code')}>
                  Kode
                </TH>
                <TH sortable sorted={sort === 'name' ? direction : null} onSort={() => handleSort('name')}>
                  Nama Project
                </TH>
                <TH sortable sorted={sort === 'status' ? direction : null} onSort={() => handleSort('status')}>
                  Status
                </TH>
                <TH sortable sorted={sort === 'priority' ? direction : null} onSort={() => handleSort('priority')}>
                  Prioritas
                </TH>
                <TH sortable sorted={sort === 'progress' ? direction : null} onSort={() => handleSort('progress')}>
                  Progress
                </TH>
                <TH>Manager</TH>
                <TH align="center">Member</TH>
                <TH align="center">Task</TH>
                <TH sortable sorted={sort === 'end_date' ? direction : null} onSort={() => handleSort('end_date')}>
                  Periode
                </TH>
                <TH align="right">Aksi</TH>
              </TR>
            </THead>
            <TBody>
              {projects.map((project) => (
                <TR
                  key={project.id}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <TD className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {project.code}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: project.color || '#4f46e5' }}
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium text-slate-900 dark:text-white">
                        {project.name}
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <StatusBadge status={project.status} size="sm" />
                  </TD>
                  <TD>
                    <PriorityBadge priority={project.priority} size="sm" />
                  </TD>
                  <TD className="min-w-[130px]">
                    <ProgressBar value={project.progress} color={project.color} size="sm" showLabel />
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Avatar src={project.manager_avatar} name={project.manager_name} size="xs" />
                      <span className="truncate text-xs">{project.manager_name ?? '-'}</span>
                    </div>
                  </TD>
                  <TD align="center">
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      {project.member_count ?? 0}
                    </span>
                  </TD>
                  <TD align="center">
                    <span className="text-xs tabular-nums">
                      {project.completed_task_count ?? 0}/{project.task_count ?? 0}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(project.start_date, 'dd MMM yy')} -{' '}
                    {formatDate(project.end_date, 'dd MMM yy')}
                  </TD>
                  <TD align="right">
                    <div onClick={(event) => event.stopPropagation()}>
                      <Dropdown
                        align="right"
                        trigger={
                          <button
                            type="button"
                            aria-label={`Aksi ${project.name}`}
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-ring dark:hover:bg-slate-800"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        }
                      >
                        <DropdownItem icon={Pencil} onClick={() => handleEdit(project)}>
                          Edit Project
                        </DropdownItem>
                        <DropdownSeparator />
                        <DropdownItem icon={Trash2} danger onClick={() => setDeleteTarget(project)}>
                          Hapus Project
                        </DropdownItem>
                      </Dropdown>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {/* Pagination */}
      {projects.length > 0 && (
        <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Tampilkan</span>
            <Select
              containerClassName="w-20"
              value={String(perPage)}
              onChange={(event) => setPerPage(Number(event.target.value))}
              options={PER_PAGE_OPTIONS}
              aria-label="Jumlah per halaman"
            />
          </div>

          <Pagination
            page={meta.page ?? page}
            perPage={meta.perPage ?? perPage}
            total={meta.total ?? 0}
            totalPages={meta.totalPages ?? 1}
            onPageChange={setPage}
            className="w-full sm:w-auto"
          />
        </div>
      )}

      {/* Create / edit modal */}
      <ProjectFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        project={editingProject}
        onSaved={() => setFormOpen(false)}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Hapus project?"
        description={
          deleteTarget
            ? `Project "${deleteTarget.name}" beserta task, milestone, dan data anggotanya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`
            : ''
        }
        confirmLabel="Ya, hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
