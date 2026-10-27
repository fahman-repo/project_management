'use strict';

const { query, queryOne } = require('../config/database');

/**
 * Shared access-control helpers.
 *
 * Role model:
 *  - `admin`  : full access to everything.
 *  - `manager`: full access to projects they manage or are a member of.
 *  - `member` : access to projects they belong to; may edit tasks they created
 *               or that are assigned to them.
 */

/**
 * The role a user holds inside a project.
 * @param {number} projectId
 * @param {number} userId
 * @returns {Promise<'owner'|'manager'|'member'|'reviewer'|null>}
 */
async function getProjectRole(projectId, userId) {
  const row = await queryOne(
    `SELECT pm.role
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
      WHERE pm.project_id = ? AND pm.user_id = ? LIMIT 1`,
    [projectId, userId]
  );
  if (row) return row.role;

  // The project manager is always treated as an owner.
  const project = await queryOne('SELECT manager_id FROM projects WHERE id = ? LIMIT 1', [projectId]);
  if (project && project.manager_id === userId) return 'owner';

  return null;
}

/**
 * @param {number} projectId
 * @param {number} userId
 */
async function isProjectMember(projectId, userId) {
  return (await getProjectRole(projectId, userId)) !== null;
}

/**
 * Can the user create/edit/delete this project?
 * @param {{id:number, role:string}} user
 * @param {number} projectId
 */
async function canManageProject(user, projectId) {
  if (user.role === 'admin') return true;
  const projectRole = await getProjectRole(projectId, user.id);
  return projectRole === 'owner' || projectRole === 'manager';
}

/**
 * Can the user read this project?
 * @param {{id:number, role:string}} user
 * @param {number} projectId
 */
async function canViewProject(user, projectId) {
  if (user.role === 'admin') return true;
  return isProjectMember(projectId, user.id);
}

/**
 * Can the user modify this task?
 *
 * Admins and project owners/managers always can. A member can modify a task
 * when they created it or when it is assigned to them.
 *
 * @param {{id:number, role:string}} user
 * @param {object} task  must contain id, project_id, assignee_id, reporter_id
 */
async function canEditTask(user, task) {
  if (user.role === 'admin') return true;

  const projectRole = await getProjectRole(task.project_id, user.id);
  if (projectRole === 'owner' || projectRole === 'manager') return true;

  return task.assignee_id === user.id || task.reporter_id === user.id;
}

/**
 * Can the user view this task?
 * @param {{id:number, role:string}} user
 * @param {object} task
 */
async function canViewTask(user, task) {
  if (user.role === 'admin') return true;
  if (task.assignee_id === user.id || task.reporter_id === user.id) return true;
  return isProjectMember(task.project_id, user.id);
}

/**
 * Project ids the user has access to (admin -> all).
 * @param {{id:number, role:string}} user
 * @returns {Promise<number[]|null>} null means "no restriction"
 */
async function accessibleProjectIds(user) {
  if (user.role === 'admin') return null;
  const rows = await query(
    `SELECT DISTINCT project_id FROM project_members WHERE user_id = ?`,
    [user.id]
  );
  return rows.map((row) => row.project_id);
}

module.exports = {
  getProjectRole,
  isProjectMember,
  canManageProject,
  canViewProject,
  canEditTask,
  canViewTask,
  accessibleProjectIds,
};
