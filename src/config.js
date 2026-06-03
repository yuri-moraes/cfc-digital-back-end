// src/config.js
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export const config = {
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost/cfc_digital_dev',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-key',
    expiresIn: '24h',
  },
  node_env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3001,
};

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}
