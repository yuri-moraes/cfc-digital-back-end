import request from 'supertest';
import {
  createTestApp, createAdmin, createInstructor, createStudent,
  createVehicle, linkVehicle, tokenFor
} from './helpers.js';
import examResultsRouter from '../src/routes/examResults.js';

const app = createTestApp(['/api/exam-results', examResultsRouter]);

let admin, adminToken, instructor, instructorToken, student, studentToken, vehicle;

beforeEach(async () => {
  admin       = await createAdmin();
  adminToken  = tokenFor(admin);
  instructor  = await createInstructor();
  instructorToken = tokenFor(instructor);
  student     = await createStudent();
  studentToken    = tokenFor(student);
  vehicle     = await createVehicle();
  await linkVehicle(instructor.id, vehicle.id);
});

test('POST /api/exam-results - instructor creates result', async () => {
  const res = await request(app)
    .post('/api/exam-results')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({
      student_id: student.id, vehicle_id: vehicle.id,
      exam_date: '2026-06-15', result: 'passed', notes: 'Great drive'
    });
  expect(res.status).toBe(201);
  expect(res.body.result).toBe('passed');
});

test('POST /api/exam-results - rejects invalid result', async () => {
  const res = await request(app)
    .post('/api/exam-results')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({
      student_id: student.id, vehicle_id: vehicle.id,
      exam_date: '2026-06-15', result: 'maybe'
    });
  expect(res.status).toBe(400);
});

test('POST /api/exam-results - student cannot create', async () => {
  const res = await request(app)
    .post('/api/exam-results')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ student_id: student.id, vehicle_id: vehicle.id, exam_date: '2026-06-15', result: 'passed' });
  expect(res.status).toBe(403);
});

test('GET /api/exam-results - student sees own', async () => {
  await request(app).post('/api/exam-results')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ student_id: student.id, vehicle_id: vehicle.id, exam_date: '2026-06-15', result: 'passed' });
  const res = await request(app)
    .get(`/api/exam-results?student_id=${student.id}`)
    .set('Authorization', `Bearer ${studentToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBe(1);
});

test('GET /api/exam-results - student cannot see other student results', async () => {
  const s2 = await createStudent({ email: 's2@test.com' });
  await request(app).post('/api/exam-results')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ student_id: s2.id, vehicle_id: vehicle.id, exam_date: '2026-06-15', result: 'failed' });
  const res = await request(app)
    .get(`/api/exam-results?student_id=${s2.id}`)
    .set('Authorization', `Bearer ${studentToken}`);
  expect(res.status).toBe(403);
});

test('PUT /api/exam-results/:id - instructor updates own result', async () => {
  const create = await request(app).post('/api/exam-results')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ student_id: student.id, vehicle_id: vehicle.id, exam_date: '2026-06-15', result: 'failed' });
  const res = await request(app)
    .put(`/api/exam-results/${create.body.id}`)
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ result: 'passed' });
  expect(res.status).toBe(200);
  expect(res.body.result).toBe('passed');
});

test('DELETE /api/exam-results/:id - only admin can delete', async () => {
  const create = await request(app).post('/api/exam-results')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ student_id: student.id, vehicle_id: vehicle.id, exam_date: '2026-06-15', result: 'passed' });
  const res = await request(app)
    .delete(`/api/exam-results/${create.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
});

test('GET /api/exam-results - admin retrieves all results (no filters)', async () => {
  const s2 = await createStudent({ email: 's2@test.com' });
  const i2 = await createInstructor({ email: 'i2@test.com' });
  const v2 = await createVehicle({ plate: 'XYZ9876' });
  await linkVehicle(i2.id, v2.id);

  await request(app).post('/api/exam-results')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ student_id: student.id, vehicle_id: vehicle.id, exam_date: '2026-06-15', result: 'passed' });
  await request(app).post('/api/exam-results')
    .set('Authorization', `Bearer ${tokenFor(i2)}`)
    .send({ student_id: s2.id, vehicle_id: v2.id, exam_date: '2026-06-16', result: 'failed' });

  const res = await request(app)
    .get('/api/exam-results')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBe(2);
});

test('GET /api/exam-results - instructor sees only own results', async () => {
  const s2 = await createStudent({ email: 's2@test.com' });
  const i2 = await createInstructor({ email: 'i2@test.com' });
  const v2 = await createVehicle({ plate: 'DEF5678' });
  await linkVehicle(i2.id, v2.id);

  await request(app).post('/api/exam-results')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ student_id: student.id, vehicle_id: vehicle.id, exam_date: '2026-06-15', result: 'passed' });
  await request(app).post('/api/exam-results')
    .set('Authorization', `Bearer ${tokenFor(i2)}`)
    .send({ student_id: s2.id, vehicle_id: v2.id, exam_date: '2026-06-16', result: 'failed' });

  const res = await request(app)
    .get('/api/exam-results')
    .set('Authorization', `Bearer ${instructorToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBe(1);
  expect(res.body.data[0].instructor_id).toBe(instructor.id);
});

test('PUT /api/exam-results/:id - admin can update any result', async () => {
  const i2 = await createInstructor({ email: 'i2@test.com' });
  const v2 = await createVehicle({ plate: 'GHI1111' });
  await linkVehicle(i2.id, v2.id);

  const create = await request(app).post('/api/exam-results')
    .set('Authorization', `Bearer ${tokenFor(i2)}`)
    .send({ student_id: student.id, vehicle_id: v2.id, exam_date: '2026-06-15', result: 'failed' });

  const res = await request(app)
    .put(`/api/exam-results/${create.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ result: 'passed' });
  expect(res.status).toBe(200);
  expect(res.body.result).toBe('passed');
});

test('PUT /api/exam-results/:id - instructor cannot update another instructor result', async () => {
  const i2 = await createInstructor({ email: 'i2@test.com' });
  const v2 = await createVehicle({ plate: 'JKL2222' });
  await linkVehicle(i2.id, v2.id);

  const create = await request(app).post('/api/exam-results')
    .set('Authorization', `Bearer ${tokenFor(i2)}`)
    .send({ student_id: student.id, vehicle_id: v2.id, exam_date: '2026-06-15', result: 'failed' });

  const res = await request(app)
    .put(`/api/exam-results/${create.body.id}`)
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ result: 'passed' });
  expect(res.status).toBe(403);
});

test('DELETE /api/exam-results/:id - student cannot delete', async () => {
  const create = await request(app).post('/api/exam-results')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ student_id: student.id, vehicle_id: vehicle.id, exam_date: '2026-06-15', result: 'passed' });
  const res = await request(app)
    .delete(`/api/exam-results/${create.body.id}`)
    .set('Authorization', `Bearer ${studentToken}`);
  expect(res.status).toBe(403);
});

test('DELETE /api/exam-results/:id - instructor cannot delete', async () => {
  const create = await request(app).post('/api/exam-results')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ student_id: student.id, vehicle_id: vehicle.id, exam_date: '2026-06-15', result: 'passed' });
  const res = await request(app)
    .delete(`/api/exam-results/${create.body.id}`)
    .set('Authorization', `Bearer ${instructorToken}`);
  expect(res.status).toBe(403);
});
