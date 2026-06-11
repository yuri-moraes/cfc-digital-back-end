import request from 'supertest';
import {
  createTestApp, createAdmin, createInstructor, createStudent,
  createVehicle, linkVehicle, addAvailability, tokenFor
} from './helpers.js';
import slotsRouter from '../src/routes/slots.js';

const app = createTestApp(['/api/slots', slotsRouter]);

let adminToken, studentToken, instructor, vehicle;

beforeEach(async () => {
  const admin   = await createAdmin();
  adminToken    = tokenFor(admin);
  const student = await createStudent();
  studentToken  = tokenFor(student);
  instructor    = await createInstructor();
  vehicle       = await createVehicle();
  await linkVehicle(instructor.id, vehicle.id);

  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  const mondayIso = d.toISOString().slice(0, 10);
  const mondayUtcDayOfWeek = new Date(mondayIso + 'T00:00:00Z').getUTCDay();

  await addAvailability(instructor.id, vehicle.id, { dayOfWeek: mondayUtcDayOfWeek, startTime: '08:00', endTime: '10:00' });
});

test('GET /api/slots/available - returns 2 slots for a Monday', async () => {
  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  const monday = d.toISOString().slice(0, 10);

  const res = await request(app)
    .get(`/api/slots/available?date_from=${monday}&date_to=${monday}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(2);
  expect(res.body[0].start_time).toBe('08:00');
  expect(res.body[1].start_time).toBe('08:50');
});

test('GET /api/slots/available - excludes occupied slot', async () => {
  const { query: dbQuery } = await import('../src/db/pool.js');
  const student = await createStudent({ email: 's2@test.com' });

  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  const monday = d.toISOString().slice(0, 10);

  await dbQuery(
    `INSERT INTO lesson_slots (student_id, instructor_id, vehicle_id, scheduled_date, start_time)
     VALUES ($1, $2, $3, $4, $5)`,
    [student.id, instructor.id, vehicle.id, monday, '08:00']
  );

  const res = await request(app)
    .get(`/api/slots/available?date_from=${monday}&date_to=${monday}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(1);
  expect(res.body[0].start_time).toBe('08:50');
});

test('GET /api/slots/available - student can list', async () => {
  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  const monday = d.toISOString().slice(0, 10);
  const res = await request(app)
    .get(`/api/slots/available?date_from=${monday}&date_to=${monday}`)
    .set('Authorization', `Bearer ${studentToken}`);
  expect(res.status).toBe(200);
});

test('GET /api/slots/available - requires date_from and date_to', async () => {
  const res = await request(app)
    .get('/api/slots/available')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(400);
});
