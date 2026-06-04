// tests/users.test.js
import express from 'express';
import request from 'supertest';
import { User } from '../src/models/User.js';
import { createTestUser, getAuthToken } from './helpers.js';
import usersRouter from '../src/routes/users.js';
import { USER_ROLES } from '../src/constants.js';

/**
 * Create a test app with users routes mounted
 */
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
  return app;
};

describe('User CRUD Routes', () => {
  let app;
  let adminUser;
  let studentUser;
  let instructorUser;
  let adminToken;
  let studentToken;

  beforeEach(async () => {
    app = createTestApp();

    // Create test users
    adminUser = await createTestUser('admin@example.com', 'password123', 'Admin User', USER_ROLES.ADMIN);
    studentUser = await createTestUser('student@example.com', 'password123', 'Student User', USER_ROLES.STUDENT);
    instructorUser = await createTestUser('instructor@example.com', 'password123', 'Instructor User', USER_ROLES.INSTRUCTOR);

    // Generate tokens
    adminToken = getAuthToken(adminUser.id, adminUser.email, USER_ROLES.ADMIN);
    studentToken = getAuthToken(studentUser.id, studentUser.email, USER_ROLES.STUDENT);
  });

  describe('GET /api/users', () => {
    test('Should list all users as admin', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(3);

      response.body.data.forEach((user) => {
        expect(user.password_hash).toBeUndefined();
      });
    });

    test('returns paginated shape', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1,
      });
    });

    test('respects page and limit params', async () => {
      const response = await request(app)
        .get('/api/users?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(2);
      expect(response.body.meta.limit).toBe(2);
      expect(response.body.meta.total).toBe(3);
      expect(response.body.meta.totalPages).toBe(2);
    });

    test('Should reject list by non-admin', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });

    test('Should reject list without authentication', async () => {
      const response = await request(app)
        .get('/api/users');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/users/:id', () => {
    test('Should get own profile as user', async () => {
      const response = await request(app)
        .get(`/api/users/${studentUser.id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(studentUser.id);
      expect(response.body.email).toBe(studentUser.email);
      expect(response.body.name).toBe(studentUser.name);
      expect(response.body.role).toBe(USER_ROLES.STUDENT);
      expect(response.body.password_hash).toBeUndefined();
    });

    test('Should reject getting other user profile as student', async () => {
      const response = await request(app)
        .get(`/api/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });

    test('Should allow admin to get any profile', async () => {
      const response = await request(app)
        .get(`/api/users/${studentUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(studentUser.id);
      expect(response.body.email).toBe(studentUser.email);
    });

    test('Should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/users/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    test('Should reject without authentication', async () => {
      const response = await request(app)
        .get(`/api/users/${studentUser.id}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('POST /api/users', () => {
    test('Should create user as admin', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@example.com',
          password: 'password123',
          name: 'New User',
          role: USER_ROLES.STUDENT,
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.email).toBe('newuser@example.com');
      expect(response.body.name).toBe('New User');
      expect(response.body.role).toBe(USER_ROLES.STUDENT);
      expect(response.body.password_hash).toBeUndefined();

      // Verify user was created in database
      const user = await User.findById(response.body.id);
      expect(user.email).toBe('newuser@example.com');
    });

    test('Should reject create by non-admin', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          email: 'newuser@example.com',
          password: 'password123',
          name: 'New User',
          role: USER_ROLES.STUDENT,
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });

    test('Should reject duplicate email', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'student@example.com', // Already exists
          password: 'password123',
          name: 'Another User',
          role: USER_ROLES.STUDENT,
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Email already exists');
    });

    test('Should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'invalid-email',
          password: 'password123',
          name: 'New User',
          role: USER_ROLES.STUDENT,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid email format');
    });

    test('Should reject invalid role', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@example.com',
          password: 'password123',
          name: 'New User',
          role: 'INVALID_ROLE',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Role must be one of');
    });

    test('Should reject missing email', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          password: 'password123',
          name: 'New User',
          role: USER_ROLES.STUDENT,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('email is required');
    });

    test('Should reject missing password', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@example.com',
          name: 'New User',
          role: USER_ROLES.STUDENT,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('password is required');
    });

    test('Should reject password too short', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@example.com',
          password: 'short',
          name: 'New User',
          role: USER_ROLES.STUDENT,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Password must be at least 6 characters');
    });

    test('Should reject without authentication', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'newuser@example.com',
          password: 'password123',
          name: 'New User',
          role: USER_ROLES.STUDENT,
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('PUT /api/users/:id', () => {
    test('Should update own profile as user', async () => {
      const response = await request(app)
        .put(`/api/users/${studentUser.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          name: 'Updated Student Name',
        });

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(studentUser.id);
      expect(response.body.name).toBe('Updated Student Name');
      expect(response.body.email).toBe(studentUser.email);

      // Verify update persisted
      const updated = await User.findById(studentUser.id);
      expect(updated.name).toBe('Updated Student Name');
    });

    test('Should reject update of other user by student', async () => {
      const response = await request(app)
        .put(`/api/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          name: 'Hacked Admin Name',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });

    test('Should allow admin to update any user', async () => {
      const response = await request(app)
        .put(`/api/users/${studentUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Admin Updated Name',
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Admin Updated Name');

      // Verify update persisted
      const updated = await User.findById(studentUser.id);
      expect(updated.name).toBe('Admin Updated Name');
    });

    test('Should allow updating email', async () => {
      const response = await request(app)
        .put(`/api/users/${studentUser.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          email: 'newemail@example.com',
        });

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('newemail@example.com');
    });

    test('Should reject invalid email format', async () => {
      const response = await request(app)
        .put(`/api/users/${studentUser.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          email: 'invalid-email',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid email format');
    });

    test('Should return 404 for non-existent user', async () => {
      const response = await request(app)
        .put('/api/users/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Name',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    test('Should reject without authentication', async () => {
      const response = await request(app)
        .put(`/api/users/${studentUser.id}`)
        .send({
          name: 'Updated Name',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('DELETE /api/users/:id', () => {
    test('Should delete user as admin', async () => {
      const response = await request(app)
        .delete(`/api/users/${studentUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User deleted successfully');

      // Verify user was deleted
      try {
        await User.findById(studentUser.id);
        // If we get here, the user still exists - test should fail
        expect(true).toBe(false);
      } catch (error) {
        // Expected - user should not be found
        expect(error.message).toBe('User not found');
      }
    });

    test('Should reject delete by non-admin', async () => {
      const response = await request(app)
        .delete(`/api/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });

    test('Should return 404 for non-existent user', async () => {
      const response = await request(app)
        .delete('/api/users/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    test('Should reject without authentication', async () => {
      const response = await request(app)
        .delete(`/api/users/${studentUser.id}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });
  });
});
