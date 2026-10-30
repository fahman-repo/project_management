'use strict';

const http = require('http');
const app = require('./app');
const env = require('./config/env');
const { pool, testConnection } = require('./config/database');
const { initSocket } = require('./sockets');
const reminderService = require('./services/reminderService');

const server = http.createServer(app);
const io = initSocket(server);

async function start() {
  const dbConnected = await testConnection();

  if (!dbConnected) {
    // eslint-disable-next-line no-console
    console.error(
      `[server] Cannot reach MySQL at ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}. ` +
        'Check the .env configuration and that the MySQL service is running.'
    );
    process.exit(1);
  }

  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] API      -> http://localhost:${env.PORT}/api/v1`);
    // eslint-disable-next-line no-console
    console.log(`[server] Health   -> http://localhost:${env.PORT}/api/v1/health`);
    // eslint-disable-next-line no-console
    console.log(`[server] Socket.IO ready on port ${env.PORT}`);
    // eslint-disable-next-line no-console
    console.log(`[server] Env      -> ${env.NODE_ENV}`);

    reminderService.startReminderScheduler();
  });
}

/** Graceful shutdown. */
function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[server] ${signal} received, shutting down...`);

  reminderService.stopReminderScheduler();

  io.close(() => {
    pool.end(() => {
      // eslint-disable-next-line no-console
      console.log('[server] Closed cleanly.');
      process.exit(0);
    });
  });

  // Force-exit if the pool refuses to drain.
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[server] Unhandled rejection:', reason);
});

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[server] Failed to start:', error);
  process.exit(1);
});
