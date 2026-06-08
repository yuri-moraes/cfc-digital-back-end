import express from 'express';
import request from 'supertest';
import { createTestUser } from './helpers.js';
import cronRouter from '../src/routes/cron.js';
import { Class } from '../src/models/Class.js';
import { Schedule } from '../src/models/Schedule.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { Notification } from '../src/models/Notification.js';
import { NotificationPreference } from '../src/models/NotificationPreference.js';
import { USER_ROLES } from '../src/constants.js';

const CRON_SECRET = 'test-cron-secret';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/cron', cronRouter);
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

describe('Cron: send-reminders', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeAll(() => { process.env.CRON_SECRET = CRON_SECRET; });
  afterAll(() => { process.env.CRON_SECRET = originalSecret; });

  let app;
  let instructor;
  let student;
  let cls;
  let schedule;

  beforeEach(async () => {
    app = createTestApp();
    instructor = await createTestUser('instructor@example.com', 'password123', 'Instructor', USER_ROLES.INSTRUCTOR);
    student = await createTestUser('student@example.com', 'password123', 'Student', USER_ROLES.STUDENT);
    cls = await Class.create('Math', null, instructor.id);
    schedule = await Schedule.create(cls.id, todayDayOfWeek(), getSaoPauloTime(15), getSaoPauloTime(75));
    await Enrollment.create(student.id, cls.id);
  });

  test('returns 401 without CRON_SECRET', async () => {
    const res = await request(app).post('/api/cron/send-reminders');
    expect(res.status).toBe(401);
  });

  test('returns 401 with wrong secret', async () => {
    const res = await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', 'Bearer wrong-secret');
    expect(res.status).toBe(401);
  });

  test('sends reminder to enrolled student with default prefs', async () => {
    const res = await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    expect(res.status).toBe(200);
    expect(res.body.sent).toBeGreaterThanOrEqual(1);

    const notifs = await Notification.findByUser(student.id);
    expect(notifs.total).toBe(1);
    expect(notifs.rows[0].type).toBe('class_reminder');
  });

  test('sends reminder to instructor teaching the class', async () => {
    await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    const notifs = await Notification.findByUser(instructor.id);
    expect(notifs.total).toBe(1);
    expect(notifs.rows[0].type).toBe('class_reminder');
  });

  test('is idempotent — does not double-send on second call', async () => {
    await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    const res = await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    expect(res.body.sent).toBe(0);
    expect(res.body.errors).toBe(0);

    const notifs = await Notification.findByUser(student.id);
    expect(notifs.total).toBe(1);
  });

  test('skips cancelled class', async () => {
    const { ScheduleCancellation } = await import('../src/models/ScheduleCancellation.js');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    await ScheduleCancellation.create(schedule.id, today, 'Test', instructor.id);

    const res = await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    const notifs = await Notification.findByUser(student.id);
    expect(notifs.total).toBe(0);
  });

  test('respects custom minutesBefore preference', async () => {
    const student2 = await createTestUser('s2@example.com', 'password123', 'S2', USER_ROLES.STUDENT);
    await Enrollment.create(student2.id, cls.id);
    const schedule30 = await Schedule.create(cls.id, todayDayOfWeek(), getSaoPauloTime(30), getSaoPauloTime(90));
    await NotificationPreference.update(student2.id, { minutes_before: 30 });
    await NotificationPreference.findOrCreate(student.id);

    const res = await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    expect(res.status).toBe(200);
    const s2Notifs = await Notification.findByUser(student2.id);
    const s2ForSchedule30 = s2Notifs.rows.filter((n) => n.schedule_id === schedule30.id);
    expect(s2ForSchedule30.length).toBe(1);
  });

  test('skips in-app notification when in_app_enabled is false', async () => {
    await NotificationPreference.update(student.id, { in_app_enabled: false });

    await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    const notifs = await Notification.findByUser(student.id);
    expect(notifs.total).toBe(0);
  });
});
