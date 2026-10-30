import { query, queryOne } from '../config/database';
import { ProjectMemberRole } from '../types';

/**
 * The role a user holds inside a project.
 */
export async function getProjectRole(projectId: number, userId: number): Promise<ProjectMemberRole | null> {
  const row = await queryOne<{ role: ProjectMemberRole }>(
    `SELECT pm.role
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
      WHERE pm.project_id = ? AND pm.user_id = ? LIMIT 1`,
    [projectId, userId]
  );
  if (row) return row.role;

  // The project manager is always treated as an owner.
  const project = await queryOne<{ manager_id: number }>('SELECT manager_id FROM projects WHERE id = ? LIMIT 1', [projectId]);
  if (project && project.manager_id === userId) return 'owner';

  return null;
}

export async function isProjectMember(projectId: number, userId: number): Promise<boolean> {
  return (await getProjectRole(projectId, userId)) !== null;
}

/**
 * Can the user create/edit/delete this project?
 */
export async function canManageProject(user: { id: number; role: string }, projectId: number): Promise<boolean> {
  if (user.role === 'admin') return true;
  const projectRole = await getProjectRole(projectId, user.id);
  return projectRole === 'owner' || projectRole === 'manager';
}

/**
 * Can the user read this project?
 */
export async function canViewProject(user: { id: number; role: string }, projectId: number): Promise<boolean> {
  if (user.role === 'admin') return true;
  return isProjectMember(projectId, user.id);
}

/**
 * Can the user modify this task?
 */
export async function canEditTask(
  user: { id: number; role: string },
  task: { id?: number; project_id: number; assignee_id?: number | null; reporter_id?: number | null }
): Promise<boolean> {
  if (user.role === 'admin') return true;

  const projectRole = await getProjectRole(task.project_id, user.id);
  if (projectRole === 'owner' || projectRole === 'manager') return true;

  return task.assignee_id === user.id || task.reporter_id === user.id;
}

/**
 * Can the user view this task?
 */
export async function canViewTask(
  user: { id: number; role: string },
  task: { id?: number; project_id: number; assignee_id?: number | null; reporter_id?: number | null }
): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (task.assignee_id === user.id || task.reporter_id === user.id) return true;
  return isProjectMember(task.project_id, user.id);
}

/**
 * Project ids the user has access to (admin -> null, meaning no restriction).
 */
export async function accessibleProjectIds(user: { id: number; role: string }): Promise<number[] | null> {
  if (user.role === 'admin') return null;
  const rows = await query<{ project_id: number }>(
    `SELECT DISTINCT project_id FROM project_members WHERE user_id = ?`,
    [user.id]
  );
  return rows.map((row) => row.project_id);
}

export default {
  getProjectRole,
  isProjectMember,
  canManageProject,
  canViewProject,
  canEditTask,
  canViewTask,
  accessibleProjectIds,
};

