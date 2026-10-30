import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME', 'JWT_SECRET'] as const;

export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  FRONTEND_URL: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_CONNECTION_LIMIT: number;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  UPLOAD_DIR: string;
  MAX_UPLOAD_SIZE: number;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
  REMINDER_ENABLED: boolean;
  REMINDER_INTERVAL_MINUTES: number;
  ROOT_DIR: string;
  UPLOAD_PATH: string;
  [key: string]: any;
}

const env: EnvConfig = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 5000,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: Number(process.env.DB_PORT) || 3306,
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || 'project_management_db',
  DB_CONNECTION_LIMIT: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  MAX_UPLOAD_SIZE: Number(process.env.MAX_UPLOAD_SIZE) || 10 * 1024 * 1024,
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_SECURE: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'ProjectFlow <no-reply@projectflow.local>',
  REMINDER_ENABLED: process.env.REMINDER_ENABLED !== 'false',
  REMINDER_INTERVAL_MINUTES: Number(process.env.REMINDER_INTERVAL_MINUTES) || 60,
  ROOT_DIR: ROOT,
  UPLOAD_PATH: '',
};

env.UPLOAD_PATH = path.isAbsolute(env.UPLOAD_DIR)
  ? env.UPLOAD_DIR
  : path.join(ROOT, env.UPLOAD_DIR);

const missing = required.filter((key) => !env[key]);
if (missing.length) {
  // eslint-disable-next-line no-console
  console.error(`[config] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (env.JWT_SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.warn('[config] JWT_SECRET is shorter than 32 characters - use a stronger secret in production.');
}

if (!fs.existsSync(env.UPLOAD_PATH)) {
  fs.mkdirSync(env.UPLOAD_PATH, { recursive: true });
}

export default env;
export { env };
if (typeof module !== 'undefined' && (module as any).exports) {
  (module as any).exports = env;
  (module as any).exports.default = env;
  (module as any).exports.env = env;
}


