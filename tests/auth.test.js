import express from 'express';
import request from 'supertest';
import { User } from '../src/models/User.js';
import { generateToken } from '../src/utils/jwt.js';
import authRouter from '../src/routes/auth.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
};

const createTestUser = (email, password, name, role) =>
  User.create(email, password, name, role);

const getAuthToken = (userId, email, role) =>
  generateToken({ userId, email, role });

const requestWithAuth = (app, method, path, token) => {
  const req = request(app)[method.toLowerCase()](path);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
};

describe('Authentication Endpoints', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials and return token and user', async () => {
      const testUser = await createTestUser(
        'user@example.com',
        'password123',
        'John Doe',
        'STUDENT'
      );

      const response = await requestWithAuth(app, 'POST', '/api/auth/login', null)
        .send({
          email: 'user@example.com',
          password: 'password123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.token).toBeTruthy();
      expect(typeof response.body.token).toBe('string');

      expect(response.body.user).toEqual({
        id: testUser.id,
        email: 'user@example.com',
        name: 'John Doe',
        role: 'STUDENT',
      });
    });

    it('should reject invalid password', async () => {
      await createTestUser('user@example.com', 'password123', 'John Doe', 'STUDENT');

      const response = await requestWithAuth(app, 'POST', '/api/auth/login', null)
        .send({
          email: 'user@example.com',
          password: 'wrongpassword',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(400);
    });

    it('should reject non-existent email', async () => {
      const response = await requestWithAuth(app, 'POST', '/api/auth/login', null)
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(400);
    });

    it('should reject missing email', async () => {
      const response = await requestWithAuth(app, 'POST', '/api/auth/login', null)
        .send({
          password: 'password123',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(400);
    });

    it('should reject missing password', async () => {
      const response = await requestWithAuth(app, 'POST', '/api/auth/login', null)
        .send({
          email: 'user@example.com',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(400);
    });

    it('should reject invalid email format', async () => {
      const response = await requestWithAuth(app, 'POST', '/api/auth/login', null)
        .send({
          email: 'notanemail',
          password: 'password123',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const testUser = await createTestUser(
        'user@example.com',
        'password123',
        'John Doe',
        'ADMIN'
      );

      const token = getAuthToken(testUser.id, 'user@example.com', 'ADMIN');

      const response = await requestWithAuth(app, 'GET', '/api/auth/me', token)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('role');
      expect(response.body.id).toBe(testUser.id);
      expect(response.body.email).toBe('user@example.com');
      expect(response.body.name).toBe('John Doe');
      expect(response.body.role).toBe('ADMIN');
    });

    it('should reject request without token', async () => {
      const response = await requestWithAuth(app, 'GET', '/api/auth/me', null)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const response = await requestWithAuth(app, 'GET', '/api/auth/me', 'invalid.token.here')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(401);
    });

    it('should reject request with malformed auth header', async () => {
      const response = await requestWithAuth(app, 'GET', '/api/auth/me', null)
        .set('Authorization', 'InvalidHeader')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout with valid token', async () => {
      const testUser = await createTestUser(
        'user@example.com',
        'password123',
        'John Doe',
        'STUDENT'
      );

      const token = getAuthToken(testUser.id, 'user@example.com', 'STUDENT');

      const response = await requestWithAuth(app, 'POST', '/api/auth/logout', token)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Logged out');
    });

    it('should reject logout without token', async () => {
      const response = await requestWithAuth(app, 'POST', '/api/auth/logout', null)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(401);
    });
  });
});
