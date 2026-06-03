// tests/enrollments.test.js
import express from 'express';
import request from 'supertest';
import { User } from '../src/models/User.js';
import { Class } from '../src/models/Class.js';
import { Enrollment } from '../src/models/Enrollment.js';
import enrollmentsRouter from '../src/routes/enrollments.js';
import { USER_ROLES } from '../src/constants.js';
import { generateToken } from '../src/utils/jwt.js';

// Create test app with necessary middleware
function createTestApp() {
  const app = express();

  app.use(express.json());
  app.use('/api/enrollments', enrollmentsRouter);

  return app;
}

describe('Enrollment Routes', () => {
  let app;
  let adminToken;
  let instructorToken;
  let instructorToken2;
  let studentToken;
  let studentToken2;
  let adminUser;
  let instructorUser;
  let instructorUser2;
  let studentUser;
  let studentUser2;
  let testClass;
  let testClass2;

  beforeEach(async () => {
    app = createTestApp();

    // Create test users
    adminUser = await User.create('admin@test.com', 'password123', 'Admin User', USER_ROLES.ADMIN);
    instructorUser = await User.create('instructor@test.com', 'password123', 'Instructor User', USER_ROLES.INSTRUCTOR);
    instructorUser2 = await User.create('instructor2@test.com', 'password123', 'Instructor User 2', USER_ROLES.INSTRUCTOR);
    studentUser = await User.create('student@test.com', 'password123', 'Student User', USER_ROLES.STUDENT);
    studentUser2 = await User.create('student2@test.com', 'password123', 'Student User 2', USER_ROLES.STUDENT);

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

    instructorToken2 = generateToken({
      userId: instructorUser2.id,
      email: instructorUser2.email,
      role: instructorUser2.role,
    });

    studentToken = generateToken({
      userId: studentUser.id,
      email: studentUser.email,
      role: studentUser.role,
    });

    studentToken2 = generateToken({
      userId: studentUser2.id,
      email: studentUser2.email,
      role: studentUser2.role,
    });

    // Create test classes
    testClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);
    testClass2 = await Class.create('Physics 101', 'Introduction to Physics', instructorUser2.id);
  });

  describe('POST /api/enrollments', () => {
    it('should enroll student as self', async () => {
      const response = await request(app)
        .post('/api/enrollments')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          studentId: studentUser.id,
          classId: testClass.id,
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.student_id).toBe(studentUser.id);
      expect(response.body.class_id).toBe(testClass.id);
      expect(response.body.status).toBe('ACTIVE');

      // Verify in database
      const enrollment = await Enrollment.findById(response.body.id);
      expect(enrollment.student_id).toBe(studentUser.id);
    });

    it('should reject duplicate enrollment', async () => {
      // First enrollment
      await Enrollment.create(studentUser.id, testClass.id);

      // Try duplicate
      const response = await request(app)
        .post('/api/enrollments')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          studentId: studentUser.id,
          classId: testClass.id,
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already enrolled');
    });

    it('should reject student enrolling others', async () => {
      const response = await request(app)
        .post('/api/enrollments')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          studentId: studentUser2.id,
          classId: testClass.id,
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('only enroll themselves');
    });

    it('should allow admin to enroll any student', async () => {
      const response = await request(app)
        .post('/api/enrollments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          studentId: studentUser.id,
          classId: testClass.id,
        })
        .expect(201);

      expect(response.body.student_id).toBe(studentUser.id);
      expect(response.body.class_id).toBe(testClass.id);
    });

    it('should reject missing studentId', async () => {
      const response = await request(app)
        .post('/api/enrollments')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          classId: testClass.id,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Student ID');
    });

    it('should reject missing classId', async () => {
      const response = await request(app)
        .post('/api/enrollments')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          studentId: studentUser.id,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Class ID');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/enrollments')
        .send({
          studentId: studentUser.id,
          classId: testClass.id,
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should reject unauthenticated POST with instructor role required', async () => {
      // Instructors are not allowed to enroll students via this endpoint
      const response = await request(app)
        .post('/api/enrollments')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          studentId: studentUser.id,
          classId: testClass.id,
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/enrollments?studentId=:id', () => {
    it('should list own enrollments as student', async () => {
      // Create enrollments
      await Enrollment.create(studentUser.id, testClass.id);
      await Enrollment.create(studentUser.id, testClass2.id);

      const response = await request(app)
        .get(`/api/enrollments?studentId=${studentUser.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].student_id).toBe(studentUser.id);
      expect(response.body[0].class_name).toBeDefined();
      expect(response.body[0].instructor_name).toBeDefined();
    });

    it('should reject viewing other students enrollments as student', async () => {
      // Create enrollments for student 2
      await Enrollment.create(studentUser2.id, testClass.id);

      const response = await request(app)
        .get(`/api/enrollments?studentId=${studentUser2.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should allow admin to view any student enrollments', async () => {
      // Create enrollments for student 1
      await Enrollment.create(studentUser.id, testClass.id);

      const response = await request(app)
        .get(`/api/enrollments?studentId=${studentUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].student_id).toBe(studentUser.id);
    });

    it('should return empty list when student has no enrollments', async () => {
      const response = await request(app)
        .get(`/api/enrollments?studentId=${studentUser.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/enrollments?studentId=${studentUser.id}`);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/enrollments?classId=:id', () => {
    it('should list class enrollments', async () => {
      // Create enrollments
      await Enrollment.create(studentUser.id, testClass.id);
      await Enrollment.create(studentUser2.id, testClass.id);

      const response = await request(app)
        .get(`/api/enrollments?classId=${testClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].class_id).toBe(testClass.id);
      expect(response.body[0].student_name).toBeDefined();
      expect(response.body[0].student_email).toBeDefined();
    });

    it('should return empty list when no enrollments', async () => {
      const response = await request(app)
        .get(`/api/enrollments?classId=${testClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/enrollments (no filter)', () => {
    it('should allow admin to view all enrollments', async () => {
      // Create enrollments
      await Enrollment.create(studentUser.id, testClass.id);
      await Enrollment.create(studentUser2.id, testClass2.id);

      const response = await request(app)
        .get('/api/enrollments')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].class_name).toBeDefined();
      expect(response.body[0].student_name).toBeDefined();
      expect(response.body[0].instructor_name).toBeDefined();
    });

    it('should reject non-admin viewing all enrollments', async () => {
      const response = await request(app)
        .get('/api/enrollments')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject instructor viewing all enrollments', async () => {
      const response = await request(app)
        .get('/api/enrollments')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/enrollments');

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/enrollments/:id', () => {
    it('should drop own enrollment as student', async () => {
      // Create enrollment
      const enrollment = await Enrollment.create(studentUser.id, testClass.id);

      const response = await request(app)
        .delete(`/api/enrollments/${enrollment.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(response.body.message).toContain('deleted successfully');

      // Verify deleted
      try {
        await Enrollment.findById(enrollment.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toBe('Enrollment not found');
      }
    });

    it('should reject drop of others enrollment by student', async () => {
      // Create enrollment for student 1
      const enrollment = await Enrollment.create(studentUser.id, testClass.id);

      // Try to delete as student 2
      const response = await request(app)
        .delete(`/api/enrollments/${enrollment.id}`)
        .set('Authorization', `Bearer ${studentToken2}`)
        .expect(403);

      expect(response.body.error).toContain('only drop their own');
    });

    it('should allow instructor to drop student from own class', async () => {
      // Create enrollment in instructor's class
      const enrollment = await Enrollment.create(studentUser.id, testClass.id);

      const response = await request(app)
        .delete(`/api/enrollments/${enrollment.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(response.body.message).toContain('deleted successfully');
    });

    it('should reject instructor dropping from other class', async () => {
      // Create enrollment in instructor 1's class
      const enrollment = await Enrollment.create(studentUser.id, testClass.id);

      // Try to delete as instructor 2
      const response = await request(app)
        .delete(`/api/enrollments/${enrollment.id}`)
        .set('Authorization', `Bearer ${instructorToken2}`)
        .expect(403);

      expect(response.body.error).toContain('own classes');
    });

    it('should allow admin to drop any enrollment', async () => {
      // Create enrollment
      const enrollment = await Enrollment.create(studentUser.id, testClass.id);

      const response = await request(app)
        .delete(`/api/enrollments/${enrollment.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.message).toContain('deleted successfully');
    });

    it('should return 404 for non-existent enrollment', async () => {
      const response = await request(app)
        .delete('/api/enrollments/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Enrollment not found');
    });

    it('should require authentication', async () => {
      const enrollment = await Enrollment.create(studentUser.id, testClass.id);

      const response = await request(app)
        .delete(`/api/enrollments/${enrollment.id}`);

      expect(response.status).toBe(401);
    });
  });
});
