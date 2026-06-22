import { Server } from 'node:http';

import { app } from './app';
import { dbPool } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { startScheduler } from './config/scheduler';

const server: Server = app.listen(env.PORT, () => {
  logger.info(`${env.APP_NAME} listening on http://localhost:${env.PORT}`);
  startScheduler();
});

const shutdown = (signal: NodeJS.Signals): void => {
  logger.warn(`Received ${signal}. Shutting down gracefully...`);

  server.close(async () => {
    try {
      await dbPool.end();
      logger.info('Database pool closed.');
      process.exit(0);
    } catch (error) {
      logger.error('Error while closing database pool', error);
      process.exit(1);
    }
  });
};

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
