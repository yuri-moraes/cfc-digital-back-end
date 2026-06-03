// tests/helpers.js
import express from 'express';
import request from 'supertest';
import { User } from '../src/models/User.js';
import { generateToken } from '../src/utils/jwt.js';
import authRouter from '../src/routes/auth.js';

/**
 * Create a test Express app with auth routes mounted
 * @returns {Express.Application} Express app configured for testing
 */
export const createTestApp = () => {
  const app = express();

  // Middleware
  app.use(express.json());

  // Routes
  app.use('/api/auth', authRouter);

  return app;
};

/**
 * Create a test user in the database
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} name - User name
 * @param {string} role - User role (ADMIN, STUDENT, INSTRUCTOR)
 * @returns {Promise<Object>} Created user object
 */
export const createTestUser = async (
  email = 'test@example.com',
  password = 'password123',
  name = 'Test User',
  role = 'STUDENT'
) => {
  return await User.create(email, password, name, role);
};

/**
 * Generate a JWT token for testing
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {string} role - User role
 * @returns {string} JWT token
 */
export const getAuthToken = (userId, email, role = 'STUDENT') => {
  return generateToken({
    userId,
    email,
    role,
  });
};

/**
 * Make an authenticated request to the test app
 * @param {Express.Application} app - Express app
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - Request path
 * @param {string} token - JWT token
 * @returns {Object} Supertest request object
 */
export const requestWithAuth = (app, method, path, token) => {
  const req = request(app)[method.toLowerCase()](path);

  if (token) {
    req.set('Authorization', `Bearer ${token}`);
  }

  return req;
};
