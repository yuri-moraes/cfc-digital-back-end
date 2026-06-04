// tests/classes.test.js
import express from 'express';
import request from 'supertest';
import { User } from '../src/models/User.js';
import { Class } from '../src/models/Class.js';
import classesRouter from '../src/routes/classes.js';
import { USER_ROLES } from '../src/constants.js';
import { generateToken } from '../src/utils/jwt.js';

// Create test app with necessary middleware
function createTestApp() {
  const app = express();

  app.use(express.json());
  app.use('/api/classes', classesRouter);

  return app;
}

describe('Classes Routes', () => {
  let app;
  let adminToken;
  let instructorToken;
  let studentToken;
  let adminUser;
  let instructorUser;
  let studentUser;

  beforeEach(async () => {
    app = createTestApp();

    // Create test users
    adminUser = await User.create('admin@test.com', 'password123', 'Admin User', USER_ROLES.ADMIN);
    instructorUser = await User.create('instructor@test.com', 'password123', 'Instructor User', USER_ROLES.INSTRUCTOR);
    studentUser = await User.create('student@test.com', 'password123', 'Student User', USER_ROLES.STUDENT);

    // Generate tokens
    adminToken = generateToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    });

    instructorToken = generateToken({
      userId: instructorUser.id,
      email: instructorUser.email,
      role: instructorUser.role,
    });

    studentToken = generateToken({
      userId: studentUser.id,
      email: studentUser.email,
      role: studentUser.role,
    });
  });

  describe('GET /api/classes', () => {
    it('should list all classes', async () => {
      // Create test classes
      const class1 = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);
      const class2 = await Class.create('Physics 101', 'Introduction to Physics', instructorUser.id);

      const response = await request(app)
        .get('/api/classes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].name).toBe('Physics 101'); // Most recent first (DESC order)
      expect(response.body.data[1].name).toBe('Math 101');
      expect(response.body.data[0].instructor_name).toBe('Instructor User');
    });

    it('should return empty list when no classes', async () => {
      const response = await request(app)
        .get('/api/classes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(response.body.data).toEqual([]);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/classes')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    test('returns paginated shape', async () => {
      await Class.create('Math', null, instructorUser.id);
      await Class.create('English', null, instructorUser.id);

      const response = await request(app)
        .get('/api/classes')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta.total).toBe(2);
    });

    test('respects limit param', async () => {
      await Class.create('Math', null, instructorUser.id);
      await Class.create('English', null, instructorUser.id);
      await Class.create('Science', null, instructorUser.id);

      const response = await request(app)
        .get('/api/classes?limit=2')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(2);
      expect(response.body.meta.total).toBe(3);
      expect(response.body.meta.totalPages).toBe(2);
    });
  });

  describe('GET /api/classes/:id', () => {
    it('should get class by ID', async () => {
      const createdClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);

      const response = await request(app)
        .get(`/api/classes/${createdClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(response.body.id).toBe(createdClass.id);
      expect(response.body.name).toBe('Math 101');
      expect(response.body.description).toBe('Basic Mathematics');
      expect(response.body.instructor_name).toBe('Instructor User');
    });

    it('should return 404 for non-existent class', async () => {
      const response = await request(app)
        .get('/api/classes/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);

      expect(response.body.error).toBe('Class not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/classes/00000000-0000-0000-0000-000000000000')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/classes', () => {
    it('should create class as instructor', async () => {
      const response = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          name: 'Math 101',
          description: 'Basic Mathematics',
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe('Math 101');
      expect(response.body.description).toBe('Basic Mathematics');
      expect(response.body.instructor_id).toBe(instructorUser.id);
      expect(response.body.instructor_name).toBe('Instructor User');
    });

    it('should create class as admin', async () => {
      const response = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Physics 101',
          description: 'Introduction to Physics',
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe('Physics 101');
      expect(response.body.instructor_id).toBe(adminUser.id);
    });

    it('should reject class creation by student', async () => {
      const response = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          name: 'Math 101',
          description: 'Basic Mathematics',
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject missing name', async () => {
      const response = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          description: 'Basic Mathematics',
        })
        .expect(400);

      expect(response.body.error).toContain('name');
    });

    it('should allow description to be optional', async () => {
      const response = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          name: 'Math 101',
        })
        .expect(201);

      expect(response.body.name).toBe('Math 101');
      expect(response.body.description).toBeNull();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/classes')
        .send({
          name: 'Math 101',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('PUT /api/classes/:id', () => {
    it('should update own class as instructor', async () => {
      const createdClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);

      const response = await request(app)
        .put(`/api/classes/${createdClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          name: 'Math 201',
          description: 'Advanced Mathematics',
        })
        .expect(200);

      expect(response.body.id).toBe(createdClass.id);
      expect(response.body.name).toBe('Math 201');
      expect(response.body.description).toBe('Advanced Mathematics');
    });

    it('should reject update of others class by instructor', async () => {
      const otherInstructorUser = await User.create('instructor2@test.com', 'password123', 'Other Instructor', USER_ROLES.INSTRUCTOR);
      const createdClass = await Class.create('Math 101', 'Basic Mathematics', otherInstructorUser.id);

      const response = await request(app)
        .put(`/api/classes/${createdClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          name: 'Math 201',
        })
        .expect(403);

      expect(response.body.error).toContain('Not authorized');
    });

    it('should allow admin to update any class', async () => {
      const createdClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);

      const response = await request(app)
        .put(`/api/classes/${createdClass.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Math 201',
        })
        .expect(200);

      expect(response.body.name).toBe('Math 201');
    });

    it('should reject student from updating class', async () => {
      const createdClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);

      const response = await request(app)
        .put(`/api/classes/${createdClass.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          name: 'Math 201',
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should return 404 for non-existent class', async () => {
      const response = await request(app)
        .put('/api/classes/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          name: 'Math 201',
        })
        .expect(404);

      expect(response.body.error).toBe('Class not found');
    });

    it('should allow partial updates', async () => {
      const createdClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);

      const response = await request(app)
        .put(`/api/classes/${createdClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          name: 'Math 201',
        })
        .expect(200);

      expect(response.body.name).toBe('Math 201');
      expect(response.body.description).toBe('Basic Mathematics'); // unchanged
    });

    it('should require authentication', async () => {
      const createdClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);

      const response = await request(app)
        .put(`/api/classes/${createdClass.id}`)
        .send({
          name: 'Math 201',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('DELETE /api/classes/:id', () => {
    it('should delete own class as instructor', async () => {
      const createdClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);

      const response = await request(app)
        .delete(`/api/classes/${createdClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(204);

      // Verify class is deleted
      const fetchResponse = await request(app)
        .get(`/api/classes/${createdClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);

      expect(fetchResponse.body.error).toBe('Class not found');
    });

    it('should reject delete of others class by instructor', async () => {
      const otherInstructorUser = await User.create('instructor2@test.com', 'password123', 'Other Instructor', USER_ROLES.INSTRUCTOR);
      const createdClass = await Class.create('Math 101', 'Basic Mathematics', otherInstructorUser.id);

      const response = await request(app)
        .delete(`/api/classes/${createdClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(403);

      expect(response.body.error).toContain('Not authorized');
    });

    it('should allow admin to delete any class', async () => {
      const createdClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);

      const response = await request(app)
        .delete(`/api/classes/${createdClass.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify class is deleted
      const fetchResponse = await request(app)
        .get(`/api/classes/${createdClass.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should reject student from deleting class', async () => {
      const createdClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);

      const response = await request(app)
        .delete(`/api/classes/${createdClass.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should return 404 for non-existent class', async () => {
      const response = await request(app)
        .delete('/api/classes/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);

      expect(response.body.error).toBe('Class not found');
    });

    it('should require authentication', async () => {
      const createdClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);

      const response = await request(app)
        .delete(`/api/classes/${createdClass.id}`)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });
});
