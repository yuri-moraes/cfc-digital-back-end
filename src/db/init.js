// src/db/init.js
import fs from 'fs';
import path from 'path';
import { getPool } from './pool.js';

const migrationsDir = new URL('./migrations', import.meta.url).pathname;

export const runMigrations = async () => {
  const pool = getPool();
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
      console.log(`Running migration: ${file}`);
      await pool.query(sql);
      console.log(`✓ ${file} completed`);
    } catch (error) {
      console.error(`✗ ${file} failed:`, error.message);
      throw error;
    }
  }

  console.log('All migrations completed successfully');
};
