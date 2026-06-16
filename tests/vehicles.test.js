import request from 'supertest';
import { createTestApp, createAdmin, createInstructor, createStudent, tokenFor } from './helpers.js';
import vehiclesRouter from '../src/routes/vehicles.js';

const app = createTestApp(['/api/vehicles', vehiclesRouter]);

let admin, adminToken, instructor, instructorToken, studentToken;

beforeEach(async () => {
  admin = await createAdmin();
  adminToken = tokenFor(admin);
  instructor = await createInstructor();
  instructorToken = tokenFor(instructor);
  const student = await createStudent();
  studentToken = tokenFor(student);
});

test('POST /api/vehicles - admin creates vehicle', async () => {
  const res = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ plate: 'ABC1234', model: 'Gol', year: 2022 });
  expect(res.status).toBe(201);
  expect(res.body.plate).toBe('ABC1234');
  expect(res.body.model).toBe('Gol');
  expect(res.body.year).toBe(2022);
});

test('POST /api/vehicles - instructor cannot create', async () => {
  const res = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ plate: 'XYZ9999', model: 'Uno', year: 2020 });
  expect(res.status).toBe(403);
});

test('POST /api/vehicles - rejects duplicate plate', async () => {
  await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ plate: 'ABC1234', model: 'Gol', year: 2022 });
  const res = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ plate: 'ABC1234', model: 'Palio', year: 2021 });
  expect(res.status).toBe(409);
});

test('POST /api/vehicles - rejects missing fields', async () => {
  const res = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ plate: 'ABC1234' });
  expect(res.status).toBe(400);
});

test('GET /api/vehicles - admin lists vehicles', async () => {
  await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ plate: 'AAA1111', model: 'Gol', year: 2022 });
  const res = await request(app)
    .get('/api/vehicles')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBe(1);
});

test('GET /api/vehicles - instructor can list', async () => {
  const res = await request(app)
    .get('/api/vehicles')
    .set('Authorization', `Bearer ${instructorToken}`);
  expect(res.status).toBe(200);
});

test('GET /api/vehicles - student cannot list', async () => {
  const res = await request(app)
    .get('/api/vehicles')
    .set('Authorization', `Bearer ${studentToken}`);
  expect(res.status).toBe(403);
});

test('PUT /api/vehicles/:id - admin updates vehicle', async () => {
  const create = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ plate: 'ABC1234', model: 'Gol', year: 2022 });
  const res = await request(app)
    .put(`/api/vehicles/${create.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ model: 'Gol G6' });
  expect(res.status).toBe(200);
  expect(res.body.model).toBe('Gol G6');
});

test('DELETE /api/vehicles/:id - admin deletes vehicle', async () => {
  const create = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ plate: 'ABC1234', model: 'Gol', year: 2022 });
  const res = await request(app)
    .delete(`/api/vehicles/${create.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
});
