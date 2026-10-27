'use strict';

const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  dateStrings: ['DATE', 'DATETIME'],
  timezone: 'local',
  namedPlaceholders: false,
});

/**
 * Execute a query with prepared-statement binding.
 * @param {string} sql
 * @param {Array<any>} [params]
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Same as `query` but returns the raw result (insertId, affectedRows). */
async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/** Run a SELECT and return the first row, or null. */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** Run several statements inside a transaction. */
async function transaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function testConnection() {
  try {
    const rows = await query('SELECT 1 AS ok');
    return rows[0].ok === 1;
  } catch (error) {
    return false;
  }
}

module.exports = { pool, query, execute, queryOne, transaction, testConnection };
