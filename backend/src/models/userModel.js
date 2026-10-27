'use strict';

const { query, queryOne, execute } = require('../config/database');
const { buildWhere, buildOrderBy, paginatedQuery } = require('./base');

const SORTABLE = {
  name: 'u.name',
  email: 'u.email',
  role: 'u.role',
  created_at: 'u.created_at',
};

const SELECT_FIELDS = `u.id, u.name, u.email, u.role, u.phone, u.avatar, u.job_title,
       u.bio, u.is_active, u.last_login_at, u.created_at, u.updated_at`;

/**
 * @param {object} options
 * @param {string} [options.search]
 * @param {string} [options.role]
 * @param {boolean} [options.isActive]
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 */
async function listUsers(options = {}) {
  const { search, role, isActive, limit, offset } = options;

  const conditions = [
    { sql: '(u.name LIKE ? OR u.email LIKE ?)', value: search ? `%${search}%` : undefined },
    { sql: 'u.role = ?', value: role },
    { sql: 'u.is_active = ?', value: isActive === undefined ? undefined : isActive ? 1 : 0 },
  ];

  const { whereSql, params } = buildWhere(conditions);

  return paginatedQuery(
    `SELECT ${SELECT_FIELDS} FROM users u ${whereSql}`,
    `SELECT COUNT(*) AS total FROM users u ${whereSql}`,
    params,
    { limit, offset }
  );
}

/**
 * @param {number} id
 */
async function findById(id) {
  return queryOne(`SELECT ${SELECT_FIELDS} FROM users u WHERE u.id = ? LIMIT 1`, [id]);
}

/**
 * @param {number} id
 */
async function findByIdWithPassword(id) {
  return queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
}

/**
 * @param {string} email
 */
async function findByEmail(email) {
  return queryOne('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
}

/**
 * @param {object} data
 */
async function createUser(data) {
  const {
    name,
    email,
    password,
    role = 'member',
    phone = null,
    job_title = null,
    bio = null,
    avatar = null,
  } = data;

  const result = await execute(
    `INSERT INTO users (name, email, password, role, phone, job_title, bio, avatar)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, email, password, role, phone, job_title, bio, avatar]
  );

  return result.insertId;
}

/**
 * @param {number} id
 * @param {object} data
 */
async function updateUser(id, data) {
  const fields = [];
  const params = [];

  const allowed = ['name', 'email', 'role', 'phone', 'job_title', 'bio', 'avatar', 'is_active', 'password'];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(data[key]);
    }
  }

  if (!fields.length) return 0;

  params.push(id);
  const result = await execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  return result.affectedRows;
}

/**
 * @param {number} id
 */
async function touchLastLogin(id) {
  await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [id]);
}

/**
 * @param {number} id
 */
async function softDelete(id) {
  const result = await execute('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

/**
 * Lightweight list used for assignee / member pickers.
 * @param {object} [options]
 * @param {string} [options.search]
 */
async function listActive(options = {}) {
  const { search } = options;
  const { whereSql, params } = buildWhere([
    { sql: 'u.is_active = 1', value: 1 },
    { sql: '(u.name LIKE ? OR u.email LIKE ?)', value: search ? `%${search}%` : undefined },
  ]);

  return query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.job_title
       FROM users u ${whereSql}
       ORDER BY u.name ASC`,
    params
  );
}

/**
 * @param {object} options
 */
async function listWithSort(options = {}) {
  const { sort = 'name', direction = 'asc' } = options;
  const sortKey = Object.prototype.hasOwnProperty.call(SORTABLE, sort) ? sort : 'name';
  const order = buildOrderBy(SORTABLE, `${sortKey} ${direction}`, 'name asc');

  return query(
    `SELECT ${SELECT_FIELDS} FROM users u ORDER BY ${order.sql.split(' ')[0]} ${
      direction === 'desc' ? 'DESC' : 'ASC'
    }`
  );
}

module.exports = {
  listUsers,
  listActive,
  listWithSort,
  findById,
  findByIdWithPassword,
  findByEmail,
  createUser,
  updateUser,
  touchLastLogin,
  softDelete,
};
