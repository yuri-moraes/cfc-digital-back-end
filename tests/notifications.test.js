import express from 'express';
import request from 'supertest';
import { createStudent, tokenFor } from './helpers.js';
import notificationsRouter from '../src/routes/notifications.js';

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
    student = await createStudent({ email: 'student@example.com', password: 'password123', name: 'Student' });
    studentToken = tokenFor(student);
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

describe('Notification List and Read', () => {
  let app;
  let student;
  let otherStudent;
  let studentToken;
  let otherToken;

  beforeEach(async () => {
    app = createTestApp();
    student = await createStudent({ email: 'ns@example.com', password: 'password123', name: 'NS Student' });
    otherStudent = await createStudent({ email: 'other@example.com', password: 'password123', name: 'Other' });
    studentToken = tokenFor(student);
    otherToken = tokenFor(otherStudent);
  });

  test('GET /notifications returns empty list when no notifications', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  test('GET /notifications returns own notifications paginated', async () => {
    const { Notification } = await import('../src/models/Notification.js');
    await Notification.create(student.id, 'class_reminder', 'Lembrete', 'Sua aula começa em 15 min');
    await Notification.create(student.id, 'class_cancelled', 'Cancelada', 'Aula cancelada');

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.meta.total).toBe(2);
  });

  test('GET /notifications does not return other users notifications', async () => {
    const { Notification } = await import('../src/models/Notification.js');
    await Notification.create(otherStudent.id, 'class_reminder', 'Lembrete', 'Não é seu');

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  test('GET /notifications/unread-count returns correct count', async () => {
    const { Notification } = await import('../src/models/Notification.js');
    await Notification.create(student.id, 'class_reminder', 'T1', 'B1');
    await Notification.create(student.id, 'class_reminder', 'T2', 'B2');

    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  test('PUT /notifications/:id/read marks notification as read', async () => {
    const { Notification } = await import('../src/models/Notification.js');
    const notif = await Notification.create(student.id, 'class_reminder', 'T', 'B');

    const res = await request(app)
      .put(`/api/notifications/${notif.id}/read`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.read_at).not.toBeNull();

    const countRes = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(countRes.body.count).toBe(0);
  });

  test('PUT /notifications/:id/read returns 403 for other users notification', async () => {
    const { Notification } = await import('../src/models/Notification.js');
    const notif = await Notification.create(otherStudent.id, 'class_reminder', 'T', 'B');

    const res = await request(app)
      .put(`/api/notifications/${notif.id}/read`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  test('PUT /notifications/read-all marks all as read', async () => {
    const { Notification } = await import('../src/models/Notification.js');
    await Notification.create(student.id, 'class_reminder', 'T1', 'B1');
    await Notification.create(student.id, 'class_cancelled', 'T2', 'B2');

    await request(app)
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${studentToken}`);

    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.body.count).toBe(0);
  });
});

