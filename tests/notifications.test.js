import express from 'express';
import request from 'supertest';
import { createTestUser, getAuthToken } from './helpers.js';
import notificationsRouter from '../src/routes/notifications.js';
import { USER_ROLES } from '../src/constants.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationsRouter);
  return app;
};

describe('Notification Preferences', () => {
  let app;
  let student;
  let studentToken;

  beforeEach(async () => {
    app = createTestApp();
    student = await createTestUser('student@example.com', 'password123', 'Student', USER_ROLES.STUDENT);
    studentToken = getAuthToken(student.id, student.email, USER_ROLES.STUDENT);
  });

  test('GET /preferences creates defaults if absent', async () => {
    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.minutes_before).toBe(15);
    expect(res.body.whatsapp_enabled).toBe(false);
    expect(res.body.in_app_enabled).toBe(true);
    expect(res.body.user_id).toBe(student.id);
  });

  test('GET /preferences returns existing prefs on second call', async () => {
    await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${studentToken}`);

    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.minutes_before).toBe(15);
  });

  test('PUT /preferences updates minutesBefore and whatsappEnabled', async () => {
    const res = await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ minutes_before: 30, whatsapp_enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.minutes_before).toBe(30);
    expect(res.body.whatsapp_enabled).toBe(true);
    expect(res.body.in_app_enabled).toBe(true);
  });

  test('PUT /preferences rejects minutes_before outside 1-120 range', async () => {
    const res = await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ minutes_before: 200 });

    expect(res.status).toBe(400);
  });

  test('PUT /preferences rejects minutes_before of 0', async () => {
    const res = await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ minutes_before: 0 });

    expect(res.status).toBe(400);
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/notifications/preferences');
    expect(res.status).toBe(401);
  });
});
