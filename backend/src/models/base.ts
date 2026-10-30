import { query, queryOne } from '../config/database';

export interface WhereCondition {
  sql: string;
  value: any;
}

/**
 * Build a WHERE clause from a list of conditions.
 * A condition with a null/undefined value is skipped, which is how optional
 * filters are expressed.
 */
export function buildWhere(conditions: WhereCondition[] = []): { whereSql: string; params: any[] } {
  const active = conditions.filter(
    (condition) => condition.value !== undefined && condition.value !== null && condition.value !== ''
  );
  if (!active.length) return { whereSql: '', params: [] };
  return {
    whereSql: `WHERE ${active.map((condition) => condition.sql).join(' AND ')}`,
    params: active.map((condition) => condition.value),
  };
}

/**
 * A whitelist-driven sort helper - never interpolates user strings into ORDER BY.
 */
export function buildOrderBy(sortMap: Record<string, string>, requested: string, fallback: string): { sql: string; params: any[] } {
  const key = Object.prototype.hasOwnProperty.call(sortMap, requested) ? requested : fallback;
  const [column, direction] = String(sortMap[key]).split(' ');
  const dir = direction && direction.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { sql: `ORDER BY ${column} ${dir}`, params: [] };
}

/**
 * Run a paginated list query.
 */
export async function paginatedQuery<T = any>(
  selectSql: string,
  countSql: string,
  params: any[],
  pagination: { limit: number; offset: number }
): Promise<{ rows: T[]; total: number }> {
  const rows = await query<T>(`${selectSql} LIMIT ? OFFSET ?`, [
    ...params,
    Number(pagination.limit),
    Number(pagination.offset),
  ]);
  const countRows = await query<{ total: number }>(countSql, params);
  return { rows, total: countRows[0]?.total || 0 };
}

/**
 * Fetch a single row by primary key.
 */
export async function findById<T = any>(table: string, id: number, selectSql = `SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`): Promise<T | null> {
  return queryOne<T>(selectSql, [id]);
}

/**
 * Check whether a row exists in a table.
 */
export async function exists(table: string, id: number): Promise<boolean> {
  const row = await queryOne(`SELECT id FROM \`${table}\` WHERE id = ? LIMIT 1`, [id]);
  return Boolean(row);
}

/**
 * Build `IN (?, ?, ?)` placeholder list.
 */
export function inPlaceholders(values: any[]): string {
  return values.map(() => '?').join(', ');
}

export default { buildWhere, buildOrderBy, paginatedQuery, findById, exists, inPlaceholders };

