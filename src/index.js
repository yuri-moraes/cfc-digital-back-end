// src/index.js
import express from 'express';
import { config } from './config.js';
import { initPool } from './db/pool.js';
import { runMigrations } from './db/init.js';
import { mountRoutes } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * Create and configure Express app
 * Sets up middleware, routes, and error handling
 * @returns {express.Application} Configured Express app
 */
export async function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  mountRoutes(app);

  app.use(notFoundHandler);

  app.use(errorHandler);

  return app;
}

/**
 * Initialize database and start the server
 * Initializes database pool, runs migrations, creates app, and listens on configured port
 */
export async function startServer() {
  try {
    initPool();
    console.log('Database pool initialized');

    await runMigrations();
    console.log('Migrations completed');

    const app = await createApp();

    app.listen(config.port, () => {
      console.log(`Server listening on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (config.node_env !== 'test') {
  startServer();
}
