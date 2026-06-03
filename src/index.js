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

  // Middleware: Parse JSON request bodies
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Mount all API routes
  mountRoutes(app);

  // 404 handler for undefined routes (must be before errorHandler)
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Initialize database and start the server
 * Initializes database pool, runs migrations, creates app, and listens on configured port
 */
export async function startServer() {
  try {
    // Initialize database pool
    initPool();
    console.log('Database pool initialized');

    // Run migrations
    await runMigrations();
    console.log('Migrations completed');

    // Create app
    const app = await createApp();

    // Start listening
    app.listen(config.port, () => {
      console.log(`Server listening on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if not in test environment
if (config.node_env !== 'test') {
  startServer();
}
