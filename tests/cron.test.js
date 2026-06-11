import request from 'supertest';
import {
  createTestApp, createInstructor, createStudent,
  createVehicle, linkVehicle,
} from './helpers.js';
import { query } from '../src/db/pool.js';
import { Notification } from '../src/models/Notification.js';
import cronRouter from '../src/routes/cron.js';

const CRON_SECRET = 'test-cron-secret';
process.env.CRON_SECRET = CRON_SECRET;

const app = createTestApp(['/api/cron', cronRouter]);

const insertSlotDueInMinutes = async (studentId, instructorId, vehicleId, minutesFromNow) => {
  const dt = new Date(Date.now() + minutesFromNow * 60 * 1000);
  const date = dt.toISOString().split('T')[0];
  const hours = String(dt.getUTCHours()).padStart(2, '0');
  const mins = String(dt.getUTCMinutes()).padStart(2, '0');
  const time = `${hours}:${mins}`;
  const res = await query(
    `INSERT INTO lesson_slots (student_id, instructor_id, vehicle_id, scheduled_date, start_time, status)
     VALUES ($1, $2, $3, $4, $5, 'scheduled') RETURNING id`,
    [studentId, instructorId, vehicleId, date, time]
  );
  return res.rows[0].id;
};

const setPreferences = (userId, minutesBefore = 60) =>
  query(
    `INSERT INTO notification_preferences (user_id, in_app_enabled, minutes_before, whatsapp_enabled)
     VALUES ($1, true, $2, false)
     ON CONFLICT (user_id) DO UPDATE SET in_app_enabled = true, minutes_before = $2`,
    [userId, minutesBefore]
  );

describe('Cron: send-reminders', () => {
  test('rejects without CRON_SECRET', async () => {
    const res = await request(app).post('/api/cron/send-reminders');
    expect(res.status).toBe(401);
  });

  test('rejects with wrong secret', async () => {
    const res = await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', 'Bearer wrong-secret');
    expect(res.status).toBe(401);
  });

  test('sends reminder to student within window', async () => {
    const instructor = await createInstructor({ email: 'inst1@test.com' });
    const student = await createStudent({ email: 'stu1@test.com' });
    const vehicle = await createVehicle({ plate: 'CRN0001' });
    await linkVehicle(instructor.id, vehicle.id);

    const slotId = await insertSlotDueInMinutes(student.id, instructor.id, vehicle.id, 30);
    await setPreferences(student.id, 60);

    const res = await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    expect(res.status).toBe(200);
    expect(res.body.sent).toBeGreaterThanOrEqual(1);

    const count = await Notification.countUnread(student.id);
    expect(count).toBe(1);
  });

  test('does not send duplicate on second call', async () => {
    const instructor = await createInstructor({ email: 'inst2@test.com' });
    const student = await createStudent({ email: 'stu2@test.com' });
    const vehicle = await createVehicle({ plate: 'CRN0002' });
    await linkVehicle(instructor.id, vehicle.id);

    await insertSlotDueInMinutes(student.id, instructor.id, vehicle.id, 30);
    await setPreferences(student.id, 60);

    await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    const count = await Notification.countUnread(student.id);
    expect(count).toBe(1);
  });

  test('does not send when slot is outside window', async () => {
    const instructor = await createInstructor({ email: 'inst3@test.com' });
    const student = await createStudent({ email: 'stu3@test.com' });
    const vehicle = await createVehicle({ plate: 'CRN0003' });
    await linkVehicle(instructor.id, vehicle.id);

    await insertSlotDueInMinutes(student.id, instructor.id, vehicle.id, 120);
    await setPreferences(student.id, 30);

    const res = await request(app)
      .post('/api/cron/send-reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(0);
  });
});
