'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];

const env = {
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
  ROOT_DIR: ROOT,
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

module.exports = env;
