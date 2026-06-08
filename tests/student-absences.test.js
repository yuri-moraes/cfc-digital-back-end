import express from 'express';
import request from 'supertest';
import { createTestUser, getAuthToken } from './helpers.js';
import schedulesRouter from '../src/routes/schedules.js';
import attendanceRouter from '../src/routes/attendance.js';
import { Class } from '../src/models/Class.js';
import { Schedule } from '../src/models/Schedule.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { USER_ROLES } from '../src/constants.js';
import { query } from '../src/db/pool.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/schedules', schedulesRouter);
  app.use('/api/attendance', attendanceRouter);
  return app;
};

function getSaoPauloTime(offsetMinutes) {
  const now = new Date();
  const sp = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  sp.setMinutes(sp.getMinutes() + offsetMinutes);
  return `${String(sp.getHours()).padStart(2, '0')}:${String(sp.getMinutes()).padStart(2, '0')}`;
}

function todayDayOfWeek() {
  return new Date().toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
}

function todayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

describe('Student Absences', () => {
  let app;
  let admin;
  let instructor;
  let student;
  let otherStudent;
  let adminToken;
  let instructorToken;
  let studentToken;
  let otherToken;
  let cls;
  let scheduleWithFutureClass;
  let scheduleWithImmediateClass;

  beforeEach(async () => {
    app = createTestApp();
    admin = await createTestUser('admin@example.com', 'password123', 'Admin', USER_ROLES.ADMIN);
    instructor = await createTestUser('instructor@example.com', 'password123', 'Instructor', USER_ROLES.INSTRUCTOR);
    student = await createTestUser('student@example.com', 'password123', 'Student', USER_ROLES.STUDENT);
    otherStudent = await createTestUser('other@example.com', 'password123', 'Other', USER_ROLES.STUDENT);
    adminToken = getAuthToken(admin.id, admin.email, USER_ROLES.ADMIN);
    instructorToken = getAuthToken(instructor.id, instructor.email, USER_ROLES.INSTRUCTOR);
    studentToken = getAuthToken(student.id, student.email, USER_ROLES.STUDENT);
    otherToken = getAuthToken(otherStudent.id, otherStudent.email, USER_ROLES.STUDENT);
    cls = await Class.create('Math', null, instructor.id);
    scheduleWithFutureClass = await Schedule.create(cls.id, todayDayOfWeek(), getSaoPauloTime(120), getSaoPauloTime(180));
    scheduleWithImmediateClass = await Schedule.create(cls.id, todayDayOfWeek(), getSaoPauloTime(10), getSaoPauloTime(70));
    await Enrollment.create(student.id, cls.id);
  });

  test('student declares absence >= 1h before class → status valid, charged false', async () => {
    const res = await request(app)
      .post(`/api/schedules/${scheduleWithFutureClass.id}/absence`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ date: todayDate() });

    expect(res.status).toBe(201);
    expect(res.body.absence.status).toBe('valid');
    expect(res.body.charged).toBe(false);
  });

  test('student declares absence < 1h before class → status late, charged true', async () => {
    const res = await request(app)
      .post(`/api/schedules/${scheduleWithImmediateClass.id}/absence`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ date: todayDate() });

    expect(res.status).toBe(201);
    expect(res.body.absence.status).toBe('late');
    expect(res.body.charged).toBe(true);
  });

  test('duplicate absence returns 409', async () => {
    await request(app)
      .post(`/api/schedules/${scheduleWithFutureClass.id}/absence`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ date: todayDate() });

    const res = await request(app)
      .post(`/api/schedules/${scheduleWithFutureClass.id}/absence`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ date: todayDate() });

    expect(res.status).toBe(409);
  });

  test('student cannot declare absence for a class they are not enrolled in', async () => {
    const res = await request(app)
      .post(`/api/schedules/${scheduleWithFutureClass.id}/absence`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ date: todayDate() });

    expect(res.status).toBe(403);
  });

  test('instructor cannot declare absence (only students can)', async () => {
    const res = await request(app)
      .post(`/api/schedules/${scheduleWithFutureClass.id}/absence`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: todayDate() });

    expect(res.status).toBe(403);
  });

  test('instructor can view absences for a schedule', async () => {
    await request(app)
      .post(`/api/schedules/${scheduleWithFutureClass.id}/absence`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ date: todayDate() });

    const res = await request(app)
      .get(`/api/schedules/${scheduleWithFutureClass.id}/absences?date=${todayDate()}`)
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].student_id).toBe(student.id);
  });
});
