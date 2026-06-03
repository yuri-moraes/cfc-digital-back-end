// tests/auth.test.js
import {
  createTestApp,
  createTestUser,
  getAuthToken,
  requestWithAuth,
} from './helpers.js';

describe('Authentication Endpoints', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials and return token and user', async () => {
      // Create a test user
      const testUser = await createTestUser(
        'user@example.com',
        'password123',
        'John Doe',
        'STUDENT'
      );

      // Make login request
      const response = await requestWithAuth(app, 'POST', '/api/auth/login', null)
        .send({
          email: 'user@example.com',
          password: 'password123',
        })
        .expect(200);

      // Verify response structure
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.token).toBeTruthy();
      expect(typeof response.body.token).toBe('string');

      // Verify user data
      expect(response.body.user).toEqual({
        id: testUser.id,
        email: 'user@example.com',
        name: 'John Doe',
        role: 'STUDENT',
      });
    });

    it('should reject invalid password', async () => {
      // Create a test user
      await createTestUser('user@example.com', 'password123', 'John Doe', 'STUDENT');

      // Make login request with wrong password
      const response = await requestWithAuth(app, 'POST', '/api/auth/login', null)
        .send({
          email: 'user@example.com',
          password: 'wrongpassword',
        })
        .expect(400);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(400);
    });

    it('should reject non-existent email', async () => {
      // Make login request with non-existent email
      const response = await requestWithAuth(app, 'POST', '/api/auth/login', null)
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
        .expect(400);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(400);
    });

    it('should reject missing email', async () => {
      // Make login request without email
      const response = await requestWithAuth(app, 'POST', '/api/auth/login', null)
        .send({
          password: 'password123',
        })
        .expect(400);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(400);
    });

    it('should reject missing password', async () => {
      // Make login request without password
      const response = await requestWithAuth(app, 'POST', '/api/auth/login', null)
        .send({
          email: 'user@example.com',
        })
        .expect(400);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(400);
    });

    it('should reject invalid email format', async () => {
      // Make login request with invalid email format
      const response = await requestWithAuth(app, 'POST', '/api/auth/login', null)
        .send({
          email: 'notanemail',
          password: 'password123',
        })
        .expect(400);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      // Create a test user
      const testUser = await createTestUser(
        'user@example.com',
        'password123',
        'John Doe',
        'ADMIN'
      );

      // Generate token for the user
      const token = getAuthToken(testUser.id, 'user@example.com', 'ADMIN');

      // Make request to /me endpoint with token
      const response = await requestWithAuth(app, 'GET', '/api/auth/me', token)
        .expect(200);

      // Verify response contains user data
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
      // Make request to /me endpoint without token
      const response = await requestWithAuth(app, 'GET', '/api/auth/me', null)
        .expect(401);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      // Make request with invalid token
      const response = await requestWithAuth(app, 'GET', '/api/auth/me', 'invalid.token.here')
        .expect(401);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(401);
    });

    it('should reject request with malformed auth header', async () => {
      // Create a test app instance and make direct request with malformed header
      const response = await requestWithAuth(app, 'GET', '/api/auth/me', null)
        .set('Authorization', 'InvalidHeader')
        .expect(401);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout with valid token', async () => {
      // Create a test user
      const testUser = await createTestUser(
        'user@example.com',
        'password123',
        'John Doe',
        'STUDENT'
      );

      // Generate token for the user
      const token = getAuthToken(testUser.id, 'user@example.com', 'STUDENT');

      // Make logout request with valid token
      const response = await requestWithAuth(app, 'POST', '/api/auth/logout', token)
        .expect(200);

      // Verify response
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Logged out');
    });

    it('should reject logout without token', async () => {
      // Make logout request without token
      const response = await requestWithAuth(app, 'POST', '/api/auth/logout', null)
        .expect(401);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(401);
    });
  });
});
