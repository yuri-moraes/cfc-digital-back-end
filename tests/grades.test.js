import express from 'express';
import request from 'supertest';
import { User } from '../src/models/User.js';
import { Class } from '../src/models/Class.js';
import { Assignment } from '../src/models/Assignment.js';
import { Grade } from '../src/models/Grade.js';
import gradesRouter from '../src/routes/grades.js';
import { USER_ROLES } from '../src/constants.js';
import { generateToken } from '../src/utils/jwt.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/grades', gradesRouter);
  return app;
}

describe('Grades Routes', () => {
  let app;
  let adminToken, instructorToken, instructor2Token, studentToken, student2Token;
  let adminUser, instructorUser, instructor2User, studentUser, student2User;
  let testClass, testAssignment;

  beforeEach(async () => {
    app = createTestApp();

    adminUser = await User.create('admin@test.com', 'password123', 'Admin User', USER_ROLES.ADMIN);
    instructorUser = await User.create('instructor@test.com', 'password123', 'Instructor User', USER_ROLES.INSTRUCTOR);
    instructor2User = await User.create('instructor2@test.com', 'password123', 'Instructor Two', USER_ROLES.INSTRUCTOR);
    studentUser = await User.create('student@test.com', 'password123', 'Student User', USER_ROLES.STUDENT);
    student2User = await User.create('student2@test.com', 'password123', 'Student Two', USER_ROLES.STUDENT);

    adminToken = generateToken({ userId: adminUser.id, email: adminUser.email, role: adminUser.role });
    instructorToken = generateToken({ userId: instructorUser.id, email: instructorUser.email, role: instructorUser.role });
    instructor2Token = generateToken({ userId: instructor2User.id, email: instructor2User.email, role: instructor2User.role });
    studentToken = generateToken({ userId: studentUser.id, email: studentUser.email, role: studentUser.role });
    student2Token = generateToken({ userId: student2User.id, email: student2User.email, role: student2User.role });

    testClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);
    testAssignment = await Assignment.create(testClass.id, 'Homework 1', null, null, 100);
  });

  describe('Grade.convertToLetterGrade', () => {
    it('should return A for 90-100', () => {
      expect(Grade.convertToLetterGrade(100)).toBe('A');
      expect(Grade.convertToLetterGrade(95)).toBe('A');
      expect(Grade.convertToLetterGrade(90)).toBe('A');
    });

    it('should return B for 80-89', () => {
      expect(Grade.convertToLetterGrade(89)).toBe('B');
      expect(Grade.convertToLetterGrade(85)).toBe('B');
      expect(Grade.convertToLetterGrade(80)).toBe('B');
    });

    it('should return C for 70-79', () => {
      expect(Grade.convertToLetterGrade(79)).toBe('C');
      expect(Grade.convertToLetterGrade(75)).toBe('C');
      expect(Grade.convertToLetterGrade(70)).toBe('C');
    });

    it('should return D for 60-69', () => {
      expect(Grade.convertToLetterGrade(69)).toBe('D');
      expect(Grade.convertToLetterGrade(65)).toBe('D');
      expect(Grade.convertToLetterGrade(60)).toBe('D');
    });

    it('should return F for 0-59', () => {
      expect(Grade.convertToLetterGrade(59)).toBe('F');
      expect(Grade.convertToLetterGrade(30)).toBe('F');
      expect(Grade.convertToLetterGrade(0)).toBe('F');
    });
  });

  describe('POST /api/grades', () => {
    it('should create grade as instructor and return letter_grade', async () => {
      const res = await request(app)
        .post('/api/grades')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ assignmentId: testAssignment.id, studentId: studentUser.id, numericScore: 85 })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.numeric_score).toBe(85);
      expect(res.body.letter_grade).toBe('B');
    });

    it('should create grade with score 100 returning A', async () => {
      const res = await request(app)
        .post('/api/grades')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ assignmentId: testAssignment.id, studentId: studentUser.id, numericScore: 100 })
        .expect(201);

      expect(res.body.letter_grade).toBe('A');
    });

    it('should create grade with score 0 returning F', async () => {
      const res = await request(app)
        .post('/api/grades')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ assignmentId: testAssignment.id, studentId: studentUser.id, numericScore: 0 })
        .expect(201);

      expect(res.body.letter_grade).toBe('F');
    });

    it('should create grade as admin', async () => {
      const res = await request(app)
        .post('/api/grades')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignmentId: testAssignment.id, studentId: studentUser.id, numericScore: 75 })
        .expect(201);

      expect(res.body.letter_grade).toBe('C');
    });

    it('should reject grade creation by student', async () => {
      const res = await request(app)
        .post('/api/grades')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ assignmentId: testAssignment.id, studentId: studentUser.id, numericScore: 100 })
        .expect(403);

      expect(res.body.error).toBe('Forbidden');
    });

    it('should reject score below 0', async () => {
      const res = await request(app)
        .post('/api/grades')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ assignmentId: testAssignment.id, studentId: studentUser.id, numericScore: -1 })
        .expect(400);

      expect(res.body.error).toContain('between 0 and 100');
    });

    it('should reject score above 100', async () => {
      const res = await request(app)
        .post('/api/grades')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ assignmentId: testAssignment.id, studentId: studentUser.id, numericScore: 101 })
        .expect(400);

      expect(res.body.error).toContain('between 0 and 100');
    });

    it('should reject duplicate grade for same student and assignment', async () => {
      await Grade.create(testAssignment.id, studentUser.id, 80, null);

      const res = await request(app)
        .post('/api/grades')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ assignmentId: testAssignment.id, studentId: studentUser.id, numericScore: 90 })
        .expect(409);

      expect(res.body.error).toContain('already exists');
    });

    it('should include optional feedback', async () => {
      const res = await request(app)
        .post('/api/grades')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ assignmentId: testAssignment.id, studentId: studentUser.id, numericScore: 90, feedback: 'Great work!' })
        .expect(201);

      expect(res.body.feedback).toBe('Great work!');
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/grades')
        .send({ assignmentId: testAssignment.id, studentId: studentUser.id, numericScore: 85 })
        .expect(401);
    });
  });

  describe('GET /api/grades/:id', () => {
    it('should get grade by ID as instructor', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);

      const res = await request(app)
        .get(`/api/grades/${grade.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(res.body.id).toBe(grade.id);
      expect(res.body.numeric_score).toBe(85);
      expect(res.body.letter_grade).toBe('B');
      expect(res.body.student_name).toBe('Student User');
      expect(res.body.assignment_title).toBe('Homework 1');
    });

    it('should allow student to see own grade', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);

      const res = await request(app)
        .get(`/api/grades/${grade.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.id).toBe(grade.id);
    });

    it('should deny student from seeing another students grade', async () => {
      const grade = await Grade.create(testAssignment.id, student2User.id, 85, null);

      await request(app)
        .get(`/api/grades/${grade.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent grade', async () => {
      const res = await request(app)
        .get('/api/grades/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);

      expect(res.body.error).toBe('Grade not found');
    });

    it('should require authentication', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);
      await request(app).get(`/api/grades/${grade.id}`).expect(401);
    });
  });

  describe('GET /api/grades (list)', () => {
    it('should list grades by assignment', async () => {
      await Grade.create(testAssignment.id, studentUser.id, 85, null);
      await Grade.create(testAssignment.id, student2User.id, 70, null);

      const res = await request(app)
        .get(`/api/grades?assignmentId=${testAssignment.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('should list grades by student', async () => {
      await Grade.create(testAssignment.id, studentUser.id, 85, null);

      const res = await request(app)
        .get(`/api/grades?studentId=${studentUser.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
    });

    it('should list grades by class', async () => {
      await Grade.create(testAssignment.id, studentUser.id, 85, null);
      await Grade.create(testAssignment.id, student2User.id, 70, null);

      const res = await request(app)
        .get(`/api/grades?classId=${testClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('should filter grades to own for student', async () => {
      await Grade.create(testAssignment.id, studentUser.id, 85, null);
      await Grade.create(testAssignment.id, student2User.id, 70, null);

      const res = await request(app)
        .get(`/api/grades?assignmentId=${testAssignment.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].student_id).toBe(studentUser.id);
    });

    it('should return 400 without any filter', async () => {
      await request(app)
        .get('/api/grades')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(400);
    });

    it('should require authentication', async () => {
      await request(app).get(`/api/grades?assignmentId=${testAssignment.id}`).expect(401);
    });
  });

  describe('PUT /api/grades/:id', () => {
    it('should update grade and recalculate letter_grade', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);

      const res = await request(app)
        .put(`/api/grades/${grade.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ numericScore: 92 })
        .expect(200);

      expect(res.body.numeric_score).toBe(92);
      expect(res.body.letter_grade).toBe('A');
    });

    it('should update feedback only', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);

      const res = await request(app)
        .put(`/api/grades/${grade.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ feedback: 'Needs improvement' })
        .expect(200);

      expect(res.body.feedback).toBe('Needs improvement');
      expect(res.body.numeric_score).toBe(85);
    });

    it('should allow admin to update any grade', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);

      const res = await request(app)
        .put(`/api/grades/${grade.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ numericScore: 60 })
        .expect(200);

      expect(res.body.letter_grade).toBe('D');
    });

    it('should reject update by another instructor', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);

      await request(app)
        .put(`/api/grades/${grade.id}`)
        .set('Authorization', `Bearer ${instructor2Token}`)
        .send({ numericScore: 50 })
        .expect(403);
    });

    it('should reject student from updating grade', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);

      await request(app)
        .put(`/api/grades/${grade.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ numericScore: 100 })
        .expect(403);
    });

    it('should reject invalid score on update', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);

      await request(app)
        .put(`/api/grades/${grade.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ numericScore: 150 })
        .expect(400);
    });

    it('should require authentication', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);
      await request(app).put(`/api/grades/${grade.id}`).send({ numericScore: 90 }).expect(401);
    });
  });

  describe('DELETE /api/grades/:id', () => {
    it('should allow admin to delete grade', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);

      const res = await request(app)
        .delete(`/api/grades/${grade.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.message).toBe('Grade deleted');
    });

    it('should reject instructor from deleting grade', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);

      await request(app)
        .delete(`/api/grades/${grade.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(403);
    });

    it('should reject student from deleting grade', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);

      await request(app)
        .delete(`/api/grades/${grade.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent grade', async () => {
      const res = await request(app)
        .delete('/api/grades/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.error).toBe('Grade not found');
    });

    it('should require authentication', async () => {
      const grade = await Grade.create(testAssignment.id, studentUser.id, 85, null);
      await request(app).delete(`/api/grades/${grade.id}`).expect(401);
    });
  });
});
