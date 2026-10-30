import http from 'http';
import app from './app';
import env from './config/env';
import { pool, testConnection } from './config/database';
import { initSocket } from './sockets';
import reminderService from './services/reminderService';

const server = http.createServer(app);
const io = initSocket(server);

async function start(): Promise<void> {
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
function shutdown(signal: string): void {
  // eslint-disable-next-line no-console
  console.log(`[server] ${signal} received, shutting down...`);

  reminderService.stopReminderScheduler();

  (io as any).close(() => {
    pool.end().then(() => {
      // eslint-disable-next-line no-console
      console.log('[server] Closed cleanly.');
      process.exit(0);
    }).catch(() => {
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
