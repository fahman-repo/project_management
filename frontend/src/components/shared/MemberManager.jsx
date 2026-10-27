import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MoreVertical, UserPlus, Trash2 } from 'lucide-react';
import { userApi } from '../../api';
import projectApi from '../../api/project.api';
import { getErrorMessage } from '../../api/client';
import { Button } from '../ui/Button';
import { Select } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '../ui/Dropdown';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { RoleBadge } from './Badges';
import { EmptyState } from '../ui/Feedback';
import { ROLES } from '../../utils/constants';
import { formatDate } from '../../utils/formatters';

/**
 * Roles a project member can hold. Mirrors the `project_members.role` enum.
 * @type {{value:string,label:string}[]}
 */
const MEMBER_ROLES = [
  { value: 'member', label: ROLES.member.label },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'manager', label: ROLES.manager.label },
  { value: 'owner', label: 'Pemilik Project' },
];

/**
 * Render a role pill, falling back to a neutral badge for project-only roles.
 * @param {string} role
 */
function MemberRoleBadge({ role }) {
  if (role && ROLES[role]) {
    return <RoleBadge role={role} size="sm" />;
  }

  const label = MEMBER_ROLES.find((item) => item.value === role)?.label ?? role;
  return (
    <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300" size="sm">
      {label}
    </Badge>
  );
}

/**
 * Project member list with add / change-role / remove actions.
 *
 * @param {object} props
 * @param {number|string} props.projectId
 * @param {object[]} props.members
 * @param {boolean} [props.canManage] enables the mutating actions
 * @param {() => void} [props.onChange] called after every successful mutation
 */
export function MemberManager({ projectId, members = [], canManage = false, onChange }) {
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('member');
  const [removeTarget, setRemoveTarget] = useState(null);

  // Every active user except those already in the project.
  const { data: activeUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => userApi.active(),
    enabled: addOpen,
    staleTime: 5 * 60 * 1000,
  });

  const memberIds = useMemo(
    () => new Set(members.map((member) => Number(member.id))),
    [members]
  );

  const availableUsers = useMemo(
    () => activeUsers.filter((user) => !memberIds.has(Number(user.id))),
    [activeUsers, memberIds]
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    onChange?.();
  };

  const addMutation = useMutation({
    mutationFn: (payload) => projectApi.addMember(projectId, payload),
    onSuccess: () => {
      toast.success('Anggota berhasil ditambahkan');
      invalidate();
      setAddOpen(false);
      setSelectedUserId('');
      setSelectedRole('member');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }) => projectApi.updateMember(projectId, userId, { role }),
    onSuccess: () => {
      toast.success('Peran anggota diperbarui');
      invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId) => projectApi.removeMember(projectId, userId),
    onSuccess: () => {
      toast.success('Anggota dikeluarkan dari project');
      invalidate();
      setRemoveTarget(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleAdd = () => {
    if (!selectedUserId) {
      toast.error('Pilih anggota terlebih dahulu');
      return;
    }
    addMutation.mutate({ user_id: Number(selectedUserId), role: selectedRole });
  };

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button
            size="sm"
            leftIcon={<UserPlus className="h-4 w-4" />}
            onClick={() => setAddOpen(true)}
            disabled={usersLoading && availableUsers.length === 0}
          >
            Tambah Anggota
          </Button>
        </div>
      )}

      {members.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Belum ada anggota"
          description="Tambahkan anggota tim agar project dapat dikerjakan bersama."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                Tambah Anggota
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <Avatar src={member.avatar} name={member.name} size="md" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                  {member.name}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{member.email}</p>
              </div>

              <div className="hidden sm:block">
                <MemberRoleBadge role={member.role} />
              </div>

              <span className="hidden text-xs text-slate-400 lg:block">
                Bergabung {formatDate(member.joined_at)}
              </span>

              {canManage && (
                <Dropdown
                  align="right"
                  trigger={
                    <button
                      type="button"
                      aria-label={`Aksi anggota ${member.name}`}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-ring dark:hover:bg-slate-800"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  }
                >
                  <DropdownLabel>Ubah Peran</DropdownLabel>
                  {MEMBER_ROLES.map((role) => (
                    <DropdownItem
                      key={role.value}
                      disabled={role.value === member.role}
                      onClick={() =>
                        roleMutation.mutate({ userId: member.id, role: role.value })
                      }
                    >
                      {role.label}
                    </DropdownItem>
                  ))}
                  <DropdownSeparator />
                  <DropdownItem icon={Trash2} danger onClick={() => setRemoveTarget(member)}>
                    Hapus Anggota
                  </DropdownItem>
                </Dropdown>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add member dialog */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        size="sm"
        title="Tambah Anggota"
        description="Pilih pengguna aktif dan tentukan perannya dalam project."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setAddOpen(false)}
              disabled={addMutation.isPending}
            >
              Batal
            </Button>
            <Button onClick={handleAdd} loading={addMutation.isPending}>
              Tambahkan
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Anggota"
            placeholder={
              availableUsers.length ? 'Pilih pengguna' : 'Semua pengguna sudah menjadi anggota'
            }
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            options={availableUsers.map((user) => ({
              value: String(user.id),
              label: `${user.name} - ${user.email}`,
            }))}
            disabled={!availableUsers.length}
          />

          <Select
            label="Peran"
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value)}
            options={MEMBER_ROLES}
          />
        </div>
      </Modal>

      {/* Remove member confirmation */}
      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget.id)}
        title="Hapus anggota?"
        description={
          removeTarget
            ? `${removeTarget.name} akan dikeluarkan dari project ini. Riwayat task yang pernah ditugaskan tidak ikut terhapus.`
            : ''
        }
        confirmLabel="Ya, hapus"
        loading={removeMutation.isPending}
      />
    </div>
  );
}

export default MemberManager;
