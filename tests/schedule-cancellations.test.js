import express from 'express';
import request from 'supertest';
import { createTestUser, getAuthToken } from './helpers.js';
import schedulesRouter from '../src/routes/schedules.js';
import { Class } from '../src/models/Class.js';
import { Schedule } from '../src/models/Schedule.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { Notification } from '../src/models/Notification.js';
import { USER_ROLES } from '../src/constants.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/schedules', schedulesRouter);
  return app;
};

describe('Schedule Cancellations', () => {
  let app;
  let admin;
  let instructor;
  let student;
  let adminToken;
  let instructorToken;
  let studentToken;
  let cls;
  let schedule;

  beforeEach(async () => {
    app = createTestApp();
    admin = await createTestUser('admin@example.com', 'password123', 'Admin', USER_ROLES.ADMIN);
    instructor = await createTestUser('instructor@example.com', 'password123', 'Instructor', USER_ROLES.INSTRUCTOR);
    student = await createTestUser('student@example.com', 'password123', 'Student', USER_ROLES.STUDENT);
    adminToken = getAuthToken(admin.id, admin.email, USER_ROLES.ADMIN);
    instructorToken = getAuthToken(instructor.id, instructor.email, USER_ROLES.INSTRUCTOR);
    studentToken = getAuthToken(student.id, student.email, USER_ROLES.STUDENT);
    cls = await Class.create('Math', null, instructor.id);
    schedule = await Schedule.create(cls.id, 'Monday', '09:00', '10:00');
    await Enrollment.create(student.id, cls.id);
  });

  test('instructor can cancel own class', async () => {
    const res = await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: '2026-06-10', reason: 'Feriado' });

    expect(res.status).toBe(201);
    expect(res.body.cancelled_date).toBe('2026-06-10');
    expect(res.body.reason).toBe('Feriado');
  });

  test('admin can cancel any class', async () => {
    const res = await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: '2026-06-11', reason: 'Emergência' });

    expect(res.status).toBe(201);
  });

  test('student cannot cancel a class', async () => {
    const res = await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ date: '2026-06-10', reason: 'Test' });

    expect(res.status).toBe(403);
  });

  test('duplicate cancellation returns 409', async () => {
    await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: '2026-06-10', reason: 'First' });

    const res = await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: '2026-06-10', reason: 'Duplicate' });

    expect(res.status).toBe(409);
  });

  test('cancellation creates notification for enrolled student', async () => {
    await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: '2026-06-10', reason: 'Teste' });

    const notif = await Notification.findByUser(student.id);
    expect(notif.total).toBe(1);
    expect(notif.rows[0].type).toBe('class_cancelled');
  });

  test('cancellation creates notification for instructor', async () => {
    await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: '2026-06-10', reason: 'Admin cancel' });

    const notif = await Notification.findByUser(instructor.id);
    expect(notif.total).toBe(1);
    expect(notif.rows[0].type).toBe('class_cancelled');
  });

  test('GET /:id/cancellations lists cancelled dates', async () => {
    await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: '2026-06-10', reason: 'Test' });

    const res = await request(app)
      .get(`/api/schedules/${schedule.id}/cancellations`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].cancelled_date).toBe('2026-06-10');
  });

  test('DELETE /:id/cancel/:date removes cancellation', async () => {
    await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: '2026-06-10', reason: 'Test' });

    const res = await request(app)
      .delete(`/api/schedules/${schedule.id}/cancel/2026-06-10`)
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(res.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/schedules/${schedule.id}/cancellations`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(listRes.body.length).toBe(0);
  });
});
