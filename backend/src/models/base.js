'use strict';

const { query, queryOne } = require('../config/database');

/**
 * Shared helpers for the model layer.
 *
 * All model functions accept a plain options object and return plain rows.
 * Every query goes through `mysql2` prepared statements, so user input is
 * always bound as a parameter - never concatenated into SQL.
 */

/**
 * Build a WHERE clause from a list of conditions.
 * Each condition is `{ sql: 'a.status = ?', value: 'active' }`.
 * A condition with a null/undefined value is skipped, which is how optional
 * filters are expressed.
 *
 * @param {Array<{sql:string, value:any}>} conditions
 * @returns {{whereSql:string, params:any[]}}
 */
function buildWhere(conditions = []) {
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
 * @param {object} sortMap  { 'field.name': 'a.col' }
 * @param {string} requested
 * @param {string} fallback
 * @returns {{sql:string, params:any[]}}
 */
function buildOrderBy(sortMap, requested, fallback) {
  const key = Object.prototype.hasOwnProperty.call(sortMap, requested) ? requested : fallback;
  const [column, direction] = String(sortMap[key]).split(' ');
  const dir = direction && direction.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { sql: `ORDER BY ${column} ${dir}`, params: [] };
}

/**
 * Run a paginated list query.
 * @param {string} selectSql  SELECT ... FROM ... (without ORDER/LIMIT)
 * @param {string} countSql   SELECT COUNT(*) ... (same FROM/WHERE)
 * @param {any[]} params
 * @param {{limit:number, offset:number}} pagination
 */
async function paginatedQuery(selectSql, countSql, params, pagination) {
  const rows = await query(`${selectSql} LIMIT ? OFFSET ?`, [
    ...params,
    Number(pagination.limit),
    Number(pagination.offset),
  ]);
  const countRows = await query(countSql, params);
  return { rows, total: countRows[0]?.total || 0 };
}

/**
 * Fetch a single row by primary key.
 * @param {string} table
 * @param {number} id
 * @param {string} [selectSql]
 */
async function findById(table, id, selectSql = `SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`) {
  return queryOne(selectSql, [id]);
}

/**
 * Check whether a row exists in a table.
 * @param {string} table
 * @param {number} id
 */
async function exists(table, id) {
  const row = await queryOne(`SELECT id FROM \`${table}\` WHERE id = ? LIMIT 1`, [id]);
  return Boolean(row);
}

/**
 * Build `IN (?, ?, ?)` placeholder list.
 * @param {any[]} values
 * @returns {string}
 */
function inPlaceholders(values) {
  return values.map(() => '?').join(', ');
}

module.exports = { buildWhere, buildOrderBy, paginatedQuery, findById, exists, inPlaceholders };
