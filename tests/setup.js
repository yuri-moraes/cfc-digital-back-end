// tests/setup.js
import { initPool, closePool, query } from '../src/db/pool.js';
import { runMigrations } from '../src/db/init.js';

/**
 * Global test setup/teardown
 * - Initializes database pool before all tests
 * - Runs migrations to set up schema
 * - Cleans up after each test
 * - Closes pool after all tests
 */

// Run before all tests
beforeAll(async () => {
  // Set test database URL
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://localhost/cfc_digital_test';
  process.env.NODE_ENV = 'test';

  // Initialize database pool
  initPool();

  // Run migrations to set up schema
  await runMigrations();
});

// Clean up database after each test
afterEach(async () => {
  try {
    await query('DELETE FROM notifications');
    await query('DELETE FROM notification_preferences');
    await query('DELETE FROM exam_results');
    await query('DELETE FROM lesson_slots');
    await query('DELETE FROM instructor_availability');
    await query('DELETE FROM instructor_vehicles');
    await query('DELETE FROM vehicles');
    await query('DELETE FROM users');
  } catch (error) {
    console.error('Error cleaning up test database:', error);
  }
});

// Run after all tests
afterAll(async () => {
  // Close database pool
  await closePool();
});
