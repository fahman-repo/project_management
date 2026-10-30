import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import env from './env';

export const pool: Pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  dateStrings: ['DATE', 'DATETIME'] as any,
  timezone: 'local',
  namedPlaceholders: false,
});

/**
 * Execute a query with prepared-statement binding.
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

/** Same as `query` but returns the raw result (insertId, affectedRows). */
export async function execute(sql: string, params: any[] = []): Promise<ResultSetHeader> {
  const [result] = await pool.execute(sql, params);
  return result as ResultSetHeader;
}

/** Run a SELECT and return the first row, or null. */
export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length ? rows[0] : null;
}

/** Run several statements inside a transaction. */
export async function transaction<T = any>(callback: (connection: PoolConnection) => Promise<T>): Promise<T> {
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

export async function testConnection(): Promise<boolean> {
  try {
    const rows = await query<RowDataPacket>('SELECT 1 AS ok');
    return rows[0]?.ok === 1;
  } catch (error) {
    return false;
  }
}

export default { pool, query, execute, queryOne, transaction, testConnection };

