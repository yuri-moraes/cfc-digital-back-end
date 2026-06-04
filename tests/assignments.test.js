import express from 'express';
import request from 'supertest';
import { User } from '../src/models/User.js';
import { Class } from '../src/models/Class.js';
import { Assignment } from '../src/models/Assignment.js';
import assignmentsRouter from '../src/routes/assignments.js';
import { USER_ROLES } from '../src/constants.js';
import { generateToken } from '../src/utils/jwt.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/assignments', assignmentsRouter);
  return app;
}

describe('Assignments Routes', () => {
  let app;
  let adminToken, instructorToken, instructor2Token, studentToken;
  let adminUser, instructorUser, instructor2User, studentUser;
  let testClass;

  beforeEach(async () => {
    app = createTestApp();

    adminUser = await User.create('admin@test.com', 'password123', 'Admin User', USER_ROLES.ADMIN);
    instructorUser = await User.create('instructor@test.com', 'password123', 'Instructor User', USER_ROLES.INSTRUCTOR);
    instructor2User = await User.create('instructor2@test.com', 'password123', 'Instructor Two', USER_ROLES.INSTRUCTOR);
    studentUser = await User.create('student@test.com', 'password123', 'Student User', USER_ROLES.STUDENT);

    adminToken = generateToken({ userId: adminUser.id, email: adminUser.email, role: adminUser.role });
    instructorToken = generateToken({ userId: instructorUser.id, email: instructorUser.email, role: instructorUser.role });
    instructor2Token = generateToken({ userId: instructor2User.id, email: instructor2User.email, role: instructor2User.role });
    studentToken = generateToken({ userId: studentUser.id, email: studentUser.email, role: studentUser.role });

    testClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);
  });

  describe('GET /api/assignments', () => {
    it('should list assignments for a class', async () => {
      await Assignment.create(testClass.id, 'Homework 1', 'First homework', null, 100);
      await Assignment.create(testClass.id, 'Homework 2', 'Second homework', null, 50);

      const res = await request(app)
        .get(`/api/assignments?classId=${testClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('should return empty array when no assignments', async () => {
      const res = await request(app)
        .get(`/api/assignments?classId=${testClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return 400 when classId not provided', async () => {
      const res = await request(app)
        .get('/api/assignments')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('should require authentication', async () => {
      await request(app)
        .get(`/api/assignments?classId=${testClass.id}`)
        .expect(401);
    });

    it('should allow student to list assignments', async () => {
      await Assignment.create(testClass.id, 'Homework 1', null, null, 100);

      const res = await request(app)
        .get(`/api/assignments?classId=${testClass.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
    });
  });

  describe('GET /api/assignments/:id', () => {
    it('should get assignment by ID', async () => {
      const assignment = await Assignment.create(testClass.id, 'Homework 1', 'First homework', null, 100);

      const res = await request(app)
        .get(`/api/assignments/${assignment.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(res.body.id).toBe(assignment.id);
      expect(res.body.title).toBe('Homework 1');
      expect(res.body.class_name).toBe('Math 101');
    });

    it('should return 404 for non-existent assignment', async () => {
      const res = await request(app)
        .get('/api/assignments/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);

      expect(res.body.error).toBe('Assignment not found');
    });

    it('should require authentication', async () => {
      const assignment = await Assignment.create(testClass.id, 'Homework 1', null, null, 100);

      await request(app)
        .get(`/api/assignments/${assignment.id}`)
        .expect(401);
    });
  });

  describe('POST /api/assignments', () => {
    it('should create assignment as instructor', async () => {
      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ classId: testClass.id, title: 'Homework 1', description: 'Do chapter 1', maxScore: 100 })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Homework 1');
      expect(res.body.class_id).toBe(testClass.id);
      expect(res.body.max_score).toBe(100);
    });

    it('should create assignment as admin', async () => {
      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass.id, title: 'Homework 1' })
        .expect(201);

      expect(res.body.id).toBeDefined();
    });

    it('should reject creation by student', async () => {
      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ classId: testClass.id, title: 'Homework 1' })
        .expect(403);

      expect(res.body.error).toBe('Forbidden');
    });

    it('should require classId', async () => {
      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ title: 'Homework 1' })
        .expect(400);

      expect(res.body.error).toContain('Class ID');
    });

    it('should require title', async () => {
      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ classId: testClass.id })
        .expect(400);

      expect(res.body.error).toContain('Title');
    });

    it('should default max_score to 100', async () => {
      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ classId: testClass.id, title: 'Homework 1' })
        .expect(201);

      expect(res.body.max_score).toBe(100);
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/assignments')
        .send({ classId: testClass.id, title: 'Homework 1' })
        .expect(401);
    });
  });

  describe('PUT /api/assignments/:id', () => {
    it('should update own assignment as instructor', async () => {
      const assignment = await Assignment.create(testClass.id, 'Homework 1', null, null, 100);

      const res = await request(app)
        .put(`/api/assignments/${assignment.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ title: 'Homework 1 Updated', maxScore: 50 })
        .expect(200);

      expect(res.body.title).toBe('Homework 1 Updated');
      expect(res.body.max_score).toBe(50);
    });

    it('should allow admin to update any assignment', async () => {
      const assignment = await Assignment.create(testClass.id, 'Homework 1', null, null, 100);

      const res = await request(app)
        .put(`/api/assignments/${assignment.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Admin Updated' })
        .expect(200);

      expect(res.body.title).toBe('Admin Updated');
    });

    it('should reject update of another instructors assignment', async () => {
      const assignment = await Assignment.create(testClass.id, 'Homework 1', null, null, 100);

      const res = await request(app)
        .put(`/api/assignments/${assignment.id}`)
        .set('Authorization', `Bearer ${instructor2Token}`)
        .send({ title: 'Stolen Update' })
        .expect(403);

      expect(res.body.error).toContain('Not authorized');
    });

    it('should reject student from updating assignment', async () => {
      const assignment = await Assignment.create(testClass.id, 'Homework 1', null, null, 100);

      const res = await request(app)
        .put(`/api/assignments/${assignment.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Student Update' })
        .expect(403);

      expect(res.body.error).toBe('Forbidden');
    });

    it('should return 404 for non-existent assignment', async () => {
      const res = await request(app)
        .put('/api/assignments/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ title: 'Updated' })
        .expect(404);

      expect(res.body.error).toBe('Assignment not found');
    });

    it('should require authentication', async () => {
      const assignment = await Assignment.create(testClass.id, 'Homework 1', null, null, 100);

      await request(app)
        .put(`/api/assignments/${assignment.id}`)
        .send({ title: 'Updated' })
        .expect(401);
    });
  });

  describe('DELETE /api/assignments/:id', () => {
    it('should delete own assignment as instructor', async () => {
      const assignment = await Assignment.create(testClass.id, 'Homework 1', null, null, 100);

      await request(app)
        .delete(`/api/assignments/${assignment.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      await request(app)
        .get(`/api/assignments/${assignment.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);
    });

    it('should allow admin to delete any assignment', async () => {
      const assignment = await Assignment.create(testClass.id, 'Homework 1', null, null, 100);

      const res = await request(app)
        .delete(`/api/assignments/${assignment.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.message).toBe('Assignment deleted');
    });

    it('should reject delete of another instructors assignment', async () => {
      const assignment = await Assignment.create(testClass.id, 'Homework 1', null, null, 100);

      await request(app)
        .delete(`/api/assignments/${assignment.id}`)
        .set('Authorization', `Bearer ${instructor2Token}`)
        .expect(403);
    });

    it('should reject student from deleting assignment', async () => {
      const assignment = await Assignment.create(testClass.id, 'Homework 1', null, null, 100);

      await request(app)
        .delete(`/api/assignments/${assignment.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent assignment', async () => {
      const res = await request(app)
        .delete('/api/assignments/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);

      expect(res.body.error).toBe('Assignment not found');
    });

    it('should require authentication', async () => {
      const assignment = await Assignment.create(testClass.id, 'Homework 1', null, null, 100);

      await request(app)
        .delete(`/api/assignments/${assignment.id}`)
        .expect(401);
    });
  });
});
