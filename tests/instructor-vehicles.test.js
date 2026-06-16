import request from 'supertest';
import { createTestApp, createAdmin, createInstructor, createVehicle, tokenFor } from './helpers.js';
import instructorsRouter from '../src/routes/instructors.js';

const app = createTestApp(['/api/instructors', instructorsRouter]);

let admin, adminToken, instructor, instructorToken, vehicle;

beforeEach(async () => {
  admin      = await createAdmin();
  adminToken = tokenFor(admin);
  instructor = await createInstructor();
  instructorToken = tokenFor(instructor);
  vehicle    = await createVehicle();
});

test('POST /api/instructors/:id/vehicles - admin links vehicle', async () => {
  const res = await request(app)
    .post(`/api/instructors/${instructor.id}/vehicles`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ vehicle_id: vehicle.id });
  expect(res.status).toBe(201);
  expect(res.body.instructor_id).toBe(instructor.id);
  expect(res.body.vehicle_id).toBe(vehicle.id);
});

test('POST /api/instructors/:id/vehicles - rejects duplicate link', async () => {
  await request(app)
    .post(`/api/instructors/${instructor.id}/vehicles`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ vehicle_id: vehicle.id });
  const res = await request(app)
    .post(`/api/instructors/${instructor.id}/vehicles`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ vehicle_id: vehicle.id });
  expect(res.status).toBe(409);
});

test('POST /api/instructors/:id/vehicles - instructor cannot link', async () => {
  const res = await request(app)
    .post(`/api/instructors/${instructor.id}/vehicles`)
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ vehicle_id: vehicle.id });
  expect(res.status).toBe(403);
});

test('GET /api/instructors/:id/vehicles - admin lists instructor vehicles', async () => {
  await request(app)
    .post(`/api/instructors/${instructor.id}/vehicles`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ vehicle_id: vehicle.id });
  const res = await request(app)
    .get(`/api/instructors/${instructor.id}/vehicles`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(1);
  expect(res.body[0].plate).toBe('ABC1234');
});

test('GET /api/instructors/:id/vehicles - instructor sees own vehicles', async () => {
  const res = await request(app)
    .get(`/api/instructors/${instructor.id}/vehicles`)
    .set('Authorization', `Bearer ${instructorToken}`);
  expect(res.status).toBe(200);
});

test('DELETE /api/instructors/:id/vehicles/:vid - admin unlinks', async () => {
  await request(app)
    .post(`/api/instructors/${instructor.id}/vehicles`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ vehicle_id: vehicle.id });
  const res = await request(app)
    .delete(`/api/instructors/${instructor.id}/vehicles/${vehicle.id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
});
