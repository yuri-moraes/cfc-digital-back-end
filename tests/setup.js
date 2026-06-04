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
    // Delete data from all tables in reverse order of foreign key dependencies
    await query('DELETE FROM attendance_records');
    await query('DELETE FROM grades');
    await query('DELETE FROM assignments');
    await query('DELETE FROM enrollments');
    await query('DELETE FROM schedules');
    await query('DELETE FROM classes');
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
