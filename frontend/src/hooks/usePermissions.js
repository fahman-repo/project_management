import { useMemo } from 'react';
import { useAuthStore } from '../store/authStore';

/**
 * Role-based permission helpers for the current user.
 *
 * @returns {{
 *   role: string,
 *   isAdmin: boolean,
 *   isManager: boolean,
 *   isMember: boolean,
 *   canManageUsers: boolean,
 *   canManageProjects: boolean,
 *   canCreateProject: boolean,
 *   canManageTasks: boolean,
 *   canViewReports: boolean
 * }}
 */
export function usePermissions() {
  const user = useAuthStore((state) => state.user);

  return useMemo(() => {
    const role = user?.role || 'member';
    const isAdmin = role === 'admin';
    const isManager = role === 'manager';

    return {
      role,
      isAdmin,
      isManager,
      isMember: role === 'member',
      canManageUsers: isAdmin,
      canManageProjects: isAdmin || isManager,
      canCreateProject: isAdmin || isManager,
      canManageTasks: true,
      canViewReports: true,
    };
  }, [user?.role]);
}
