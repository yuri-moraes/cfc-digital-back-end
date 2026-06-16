import request from 'supertest';
import {
  createTestApp, createAdmin, createInstructor,
  createVehicle, linkVehicle, tokenFor
} from './helpers.js';
import instructorsRouter from '../src/routes/instructors.js';

const app = createTestApp(['/api/instructors', instructorsRouter]);

let admin, adminToken, instructor, instructorToken, vehicle;

beforeEach(async () => {
  admin      = await createAdmin();
  adminToken = tokenFor(admin);
  instructor = await createInstructor();
  instructorToken = tokenFor(instructor);
  vehicle    = await createVehicle();
  await linkVehicle(instructor.id, vehicle.id);
});

test('POST /api/instructors/:id/availability - admin adds window', async () => {
  const res = await request(app)
    .post(`/api/instructors/${instructor.id}/availability`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ vehicle_id: vehicle.id, day_of_week: 1, start_time: '08:00', end_time: '20:00' });
  expect(res.status).toBe(201);
  expect(res.body.day_of_week).toBe(1);
});

test('POST /api/instructors/:id/availability - rejects if vehicle not linked', async () => {
  const other = await createVehicle({ plate: 'XYZ9999', model: 'Uno', year: 2020 });
  const res = await request(app)
    .post(`/api/instructors/${instructor.id}/availability`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ vehicle_id: other.id, day_of_week: 1, start_time: '08:00', end_time: '20:00' });
  expect(res.status).toBe(400);
});

test('POST /api/instructors/:id/availability - rejects if start >= end', async () => {
  const res = await request(app)
    .post(`/api/instructors/${instructor.id}/availability`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ vehicle_id: vehicle.id, day_of_week: 1, start_time: '20:00', end_time: '08:00' });
  expect(res.status).toBe(400);
});

test('POST /api/instructors/:id/availability - rejects invalid day_of_week', async () => {
  const res = await request(app)
    .post(`/api/instructors/${instructor.id}/availability`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ vehicle_id: vehicle.id, day_of_week: 7, start_time: '08:00', end_time: '20:00' });
  expect(res.status).toBe(400);
});

test('GET /api/instructors/:id/availability - lists windows', async () => {
  await request(app)
    .post(`/api/instructors/${instructor.id}/availability`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ vehicle_id: vehicle.id, day_of_week: 1, start_time: '08:00', end_time: '20:00' });
  const res = await request(app)
    .get(`/api/instructors/${instructor.id}/availability`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(1);
});

test('DELETE /api/instructors/:id/availability/:aid - admin removes window', async () => {
  const create = await request(app)
    .post(`/api/instructors/${instructor.id}/availability`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ vehicle_id: vehicle.id, day_of_week: 1, start_time: '08:00', end_time: '20:00' });
  const res = await request(app)
    .delete(`/api/instructors/${instructor.id}/availability/${create.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
});
