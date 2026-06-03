// api/index.js
import { initPool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/init.js';
import { createApp } from '../src/index.js';

let app;
let dbInitialized = false;

/**
 * Vercel serverless handler
 * Initializes database on first request and handles all subsequent requests
 */
export default async (req, res) => {
  try {
    // Initialize database on first request
    if (!dbInitialized) {
      initPool();
      await runMigrations();
      dbInitialized = true;
      console.log('Database initialized for Vercel serverless');
    }

    // Create app if not already created
    if (!app) {
      app = await createApp();
    }

    // Handle request with Express app
    app(req, res);
  } catch (error) {
    console.error('Serverless handler error:', error);
    res.status(500).json({
      error: 'Internal server error',
    });
  }
};
