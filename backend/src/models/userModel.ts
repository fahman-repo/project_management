import { query, queryOne, execute } from '../config/database';
import { buildWhere, buildOrderBy, paginatedQuery } from './base';

const SORTABLE: Record<string, string> = {
  name: 'u.name',
  email: 'u.email',
  role: 'u.role',
  created_at: 'u.created_at',
};

const SELECT_FIELDS = `u.id, u.name, u.email, u.role, u.phone, u.avatar, u.job_title,
       u.bio, u.weekly_capacity_hours, u.is_active, u.last_login_at, u.created_at, u.updated_at`;

export function normalizeUser<T extends Record<string, any>>(row: T | null): T | null {
  if (!row) return null;
  return {
    ...row,
    weekly_capacity_hours:
      row.weekly_capacity_hours !== null && row.weekly_capacity_hours !== undefined
        ? Number(row.weekly_capacity_hours)
        : 40,
  };
}

export async function listUsers(options: {
  search?: string;
  role?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: any[]; total: number }> {
  const { search, role, isActive, limit = 10, offset = 0 } = options;

  const conditions = [
    { sql: '(u.name LIKE ? OR u.email LIKE ?)', value: search ? `%${search}%` : undefined },
    { sql: 'u.role = ?', value: role },
    { sql: 'u.is_active = ?', value: isActive === undefined ? undefined : isActive ? 1 : 0 },
  ];

  const { whereSql, params } = buildWhere(conditions);

  const { rows, total } = await paginatedQuery(
    `SELECT ${SELECT_FIELDS} FROM users u ${whereSql}`,
    `SELECT COUNT(*) AS total FROM users u ${whereSql}`,
    params,
    { limit, offset }
  );

  return { rows: rows.map(normalizeUser), total };
}

export async function findById(id: number): Promise<any> {
  const row = await queryOne(`SELECT ${SELECT_FIELDS} FROM users u WHERE u.id = ? LIMIT 1`, [id]);
  return normalizeUser(row);
}

export async function findByIdWithPassword(id: number): Promise<any> {
  return queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
}

export async function findByEmail(email: string): Promise<any> {
  return queryOne('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
}

export async function createUser(data: {
  name: string;
  email: string;
  password?: string;
  role?: string;
  phone?: string | null;
  job_title?: string | null;
  bio?: string | null;
  avatar?: string | null;
  weekly_capacity_hours?: number;
}): Promise<number> {
  const {
    name,
    email,
    password = '',
    role = 'member',
    phone = null,
    job_title = null,
    bio = null,
    avatar = null,
    weekly_capacity_hours = 40,
  } = data;

  const result = await execute(
    `INSERT INTO users (name, email, password, role, phone, job_title, bio, avatar, weekly_capacity_hours)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, email, password, role, phone, job_title, bio, avatar, weekly_capacity_hours]
  );

  return result.insertId;
}

export async function updateUser(id: number, data: Record<string, any>): Promise<number> {
  const fields: string[] = [];
  const params: any[] = [];

  const allowed = [
    'name',
    'email',
    'role',
    'phone',
    'job_title',
    'bio',
    'avatar',
    'weekly_capacity_hours',
    'is_active',
    'password',
  ];

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

export async function touchLastLogin(id: number): Promise<void> {
  await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [id]);
}

export async function softDelete(id: number): Promise<boolean> {
  const result = await execute('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

export async function listActive(options: { search?: string } = {}): Promise<any[]> {
  const { search } = options;
  const { whereSql, params } = buildWhere([
    { sql: 'u.is_active = 1', value: 1 },
    { sql: '(u.name LIKE ? OR u.email LIKE ?)', value: search ? `%${search}%` : undefined },
  ]);

  const rows = await query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.job_title, u.weekly_capacity_hours
       FROM users u ${whereSql}
       ORDER BY u.name ASC`,
    params
  );
  return rows.map(normalizeUser);
}

export async function listWithSort(options: { sort?: string; direction?: string } = {}): Promise<any[]> {
  const { sort = 'name', direction = 'asc' } = options;
  const sortKey = Object.prototype.hasOwnProperty.call(SORTABLE, sort) ? sort : 'name';
  const order = buildOrderBy(SORTABLE, `${sortKey} ${direction}`, 'name asc');

  return query(
    `SELECT ${SELECT_FIELDS} FROM users u ORDER BY ${order.sql.split(' ')[0]} ${
      direction === 'desc' ? 'DESC' : 'ASC'
    }`
  );
}

export default {
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
  normalizeUser,
};

