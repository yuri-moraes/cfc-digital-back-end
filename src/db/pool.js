// src/db/pool.js
import pkg from 'pg';
const { Pool } = pkg;
import { config } from '../config.js';

let pool;

export const initPool = () => {
  pool = new Pool({
    connectionString: config.database.url,
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });

  return pool;
};

export const getPool = () => {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initPool() first.');
  }
  return pool;
};

export const query = (text, params) => {
  return getPool().query(text, params);
};

export const closePool = async () => {
  if (pool) {
    await pool.end();
  }
};
