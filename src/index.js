import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initPool } from './db/pool.js';
import { runMigrations } from './db/init.js';
import { mountRoutes } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authLimiter, apiLimiter } from './middleware/rateLimiter.js';
import { logger } from './utils/logger.js';

export async function createApp() {
  const app = express();

  app.use(cors({ origin: config.cors.origin, credentials: true }));
  app.use(express.json());
  app.use(requestLogger);
  app.use('/api/auth/login', authLimiter);
  app.use('/api', apiLimiter);

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  mountRoutes(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export async function startServer() {
  try {
    initPool();
    logger.info('Database pool initialized');

    await runMigrations();
    logger.info('Migrations completed');

    const app = await createApp();

    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Server listening');
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

if (config.node_env !== 'test') {
  startServer();
}
