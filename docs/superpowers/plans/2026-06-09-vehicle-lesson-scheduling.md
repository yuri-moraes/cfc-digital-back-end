# Vehicle & Lesson Scheduling — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the class/turma scheduling model with individual 50-min lesson slots (1 student + 1 instructor + 1 vehicle), adding vehicles, instructor-vehicle authorization, instructor availability windows, and all lesson lifecycle actions.

**Architecture:** Surgical replacement — remove 8 tables and 8 model/route pairs that depend on the class concept; keep notifications, auth, cron infrastructure. All new scheduling logic lives in 5 new models (Vehicle, InstructorVehicle, InstructorAvailability, LessonSlot, ExamResult) with corresponding routes. LessonSlot is the central entity absorbing attendance, absence, and cancellation.

**Tech Stack:** Node.js ES modules, Express 5, PostgreSQL via node-pg, Jest + Supertest, Pino logging, existing middleware (auth, roleCheck, rateLimiter, paginate)

**Spec:** `docs/superpowers/specs/2026-06-09-vehicle-lesson-scheduling-design.md`

**Scope note:** This plan covers backend only. A separate frontend plan will be written after all backend tests pass.

---

## File Map

### Delete
- `src/models/Class.js`, `Schedule.js`, `Enrollment.js`, `AttendanceRecord.js`, `Grade.js`, `Assignment.js`, `ScheduleCancellation.js`, `StudentAbsence.js`
- `src/routes/classes.js`, `schedules.js`, `enrollments.js`, `attendance.js`, `grades.js`, `assignments.js`
- `tests/classes.test.js`, `schedules.test.js`, `enrollments.test.js`, `attendance.test.js`, `grades.test.js`, `assignments.test.js`, `schedule-cancellations.test.js`, `student-absences.test.js`

### Create
- `src/db/migrations/014_prepare_notifications_drop_old_tables.sql`
- `src/db/migrations/015_create_vehicles.sql`
- `src/db/migrations/016_create_instructor_vehicles.sql`
- `src/db/migrations/017_create_instructor_availability.sql`
- `src/db/migrations/018_create_lesson_slots.sql`
- `src/db/migrations/019_create_exam_results.sql`
- `src/db/migrations/020_alter_users_add_student_fields.sql`
- `src/models/Vehicle.js`
- `src/models/InstructorVehicle.js`
- `src/models/InstructorAvailability.js`
- `src/models/AvailableSlot.js`
- `src/models/LessonSlot.js`
- `src/models/ExamResult.js`
- `src/routes/vehicles.js`
- `src/routes/instructors.js`
- `src/routes/slots.js`
- `src/routes/lessonSlots.js`
- `src/routes/examResults.js`
- `tests/vehicles.test.js`
- `tests/instructor-vehicles.test.js`
- `tests/instructor-availability.test.js`
- `tests/slots.test.js`
- `tests/lesson-slots.test.js`
- `tests/exam-results.test.js`

### Modify
- `src/routes/index.js` — remove old imports/mounts, add new ones
- `src/routes/cron.js` — rewrite SQL query + update Notification calls
- `src/models/User.js` — add `purchased_lessons`, `category` to create/update/list/findById
- `src/models/Notification.js` — replace `schedule_id`/`class_date` with `lesson_slot_id`
- `tests/setup.js` — update `afterEach` cleanup for new table set
- `tests/helpers.js` — add factory helpers for vehicles, instructors, availability, lesson slots
- `tests/users.test.js` — cover new student fields
- `tests/cron.test.js` — rewrite fixtures to use lesson_slots

---

## Task 1: Delete obsolete files and stub routes/index.js

**Files:**
- Delete: all 8 model files listed above
- Delete: 6 route files listed above
- Delete: 8 test files listed above
- Modify: `src/routes/index.js`

- [ ] **Step 1: Delete obsolete models**

```bash
cd cfc-digital-backend
rm src/models/Class.js src/models/Schedule.js src/models/Enrollment.js \
   src/models/AttendanceRecord.js src/models/Grade.js src/models/Assignment.js \
   src/models/ScheduleCancellation.js src/models/StudentAbsence.js
```

- [ ] **Step 2: Delete obsolete routes**

```bash
rm src/routes/classes.js src/routes/schedules.js src/routes/enrollments.js \
   src/routes/attendance.js src/routes/grades.js src/routes/assignments.js
```

- [ ] **Step 3: Delete obsolete tests**

```bash
rm tests/classes.test.js tests/schedules.test.js tests/enrollments.test.js \
   tests/attendance.test.js tests/grades.test.js tests/assignments.test.js \
   tests/schedule-cancellations.test.js tests/student-absences.test.js
```

- [ ] **Step 4: Replace routes/index.js with stub (new routes added per task)**

```js
// src/routes/index.js
import authRouter from './auth.js';
import userRouter from './users.js';
import notificationsRouter from './notifications.js';
import cronRouter from './cron.js';

export const mountRoutes = (app) => {
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/cron', cronRouter);
};
```

- [ ] **Step 5: Run tests to confirm remaining tests still pass (auth, users, notifications, cron, paginate, rateLimiter, whatsapp)**

```bash
npm test
```

Expected: only the 8 deleted test suites gone; remaining suites pass (cron may fail — that is expected, it will be fixed in Task 12).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove class/schedule/enrollment/attendance/grade/assignment modules"
```

---

## Task 2: Write and run migrations 014–020

**Files:**
- Create: `src/db/migrations/014_prepare_notifications_drop_old_tables.sql`
- Create: `src/db/migrations/015_create_vehicles.sql`
- Create: `src/db/migrations/016_create_instructor_vehicles.sql`
- Create: `src/db/migrations/017_create_instructor_availability.sql`
- Create: `src/db/migrations/018_create_lesson_slots.sql`
- Create: `src/db/migrations/019_create_exam_results.sql`
- Create: `src/db/migrations/020_alter_users_add_student_fields.sql`

- [ ] **Step 1: Write migration 014**

```sql
-- src/db/migrations/014_prepare_notifications_drop_old_tables.sql

-- 1. Remove schedule_id FK and class_date from notifications; add lesson_slot_id (FK added in 018)
ALTER TABLE notifications DROP COLUMN IF EXISTS schedule_id;
ALTER TABLE notifications DROP COLUMN IF EXISTS class_date;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS lesson_slot_id UUID;

-- Drop the old type check constraint (PostgreSQL auto-names it)
DO $$
DECLARE v_name TEXT;
BEGIN
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'notifications'::regclass
    AND contype = 'c'
    AND conname LIKE '%type%';
  IF v_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT ' || v_name;
  END IF;
END $$;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('class_reminder', 'class_cancelled', 'class_rescheduled'));

-- 2. Drop obsolete tables in dependency order
DROP TABLE IF EXISTS schedule_cancellations;
DROP TABLE IF EXISTS student_absences;
DROP TABLE IF EXISTS attendance_records;
DROP TABLE IF EXISTS grades;
DROP TABLE IF EXISTS assignments;
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS classes;
```

- [ ] **Step 2: Write migration 015**

```sql
-- src/db/migrations/015_create_vehicles.sql
CREATE TABLE IF NOT EXISTS vehicles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate      VARCHAR(10)  UNIQUE NOT NULL,
  model      VARCHAR(100) NOT NULL,
  year       INT          NOT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 3: Write migration 016**

```sql
-- src/db/migrations/016_create_instructor_vehicles.sql
CREATE TABLE IF NOT EXISTS instructor_vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(instructor_id, vehicle_id)
);
CREATE INDEX IF NOT EXISTS idx_instructor_vehicles_instructor ON instructor_vehicles(instructor_id);
```

- [ ] **Step 4: Write migration 017**

```sql
-- src/db/migrations/017_create_instructor_availability.sql
CREATE TABLE IF NOT EXISTS instructor_availability (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  day_of_week   INT  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_instructor_availability_instructor ON instructor_availability(instructor_id);
```

- [ ] **Step 5: Write migration 018**

```sql
-- src/db/migrations/018_create_lesson_slots.sql
CREATE TABLE IF NOT EXISTS lesson_slots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instructor_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id          UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  scheduled_date      DATE NOT NULL,
  start_time          TIME NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN (
                          'scheduled','completed','cancelled',
                          'no_show','absent_valid','absent_charged'
                        )),
  plate_at_checkin    VARCHAR(10),
  validated_by        UUID REFERENCES users(id),
  validated_at        TIMESTAMP,
  absence_declared_at TIMESTAMP,
  cancellation_reason TEXT,
  cancelled_by        UUID REFERENCES users(id),
  cancelled_at        TIMESTAMP,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lesson_slots_student    ON lesson_slots(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_slots_instructor ON lesson_slots(instructor_id);
CREATE INDEX IF NOT EXISTS idx_lesson_slots_date       ON lesson_slots(scheduled_date);

ALTER TABLE notifications
  ADD CONSTRAINT notifications_lesson_slot_fk
  FOREIGN KEY (lesson_slot_id) REFERENCES lesson_slots(id) ON DELETE SET NULL;
```

- [ ] **Step 6: Write migration 019**

```sql
-- src/db/migrations/019_create_exam_results.sql
CREATE TABLE IF NOT EXISTS exam_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users(id),
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id),
  exam_date     DATE NOT NULL,
  result        VARCHAR(10) NOT NULL CHECK (result IN ('passed', 'failed')),
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_exam_results_student ON exam_results(student_id);
```

- [ ] **Step 7: Write migration 020**

```sql
-- src/db/migrations/020_alter_users_add_student_fields.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS purchased_lessons INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS category VARCHAR(5)
  CHECK (category IN ('A', 'B', 'AB', 'C', 'D', 'E'));
```

- [ ] **Step 8: Run migrations against the test DB to verify**

```bash
TEST_DATABASE_URL=postgresql://localhost:5433/cfc_digital_test npm test -- tests/auth.test.js
```

Expected: auth tests pass (confirms migrations ran without error).

- [ ] **Step 9: Commit migrations**

```bash
git add src/db/migrations/
git commit -m "feat: add migrations 014-020 (vehicles, lesson slots, exam results)"
```

---

## Task 3: Update test infrastructure

**Files:**
- Modify: `tests/setup.js`
- Modify: `tests/helpers.js`

- [ ] **Step 1: Replace setup.js afterEach cleanup**

```js
// tests/setup.js
import { initPool, closePool, query } from '../src/db/pool.js';
import { runMigrations } from '../src/db/init.js';

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://localhost/cfc_digital_test';
  process.env.NODE_ENV = 'test';
  initPool();
  await runMigrations();
});

afterEach(async () => {
  try {
    await query('DELETE FROM notifications');
    await query('DELETE FROM notification_preferences');
    await query('DELETE FROM exam_results');
    await query('DELETE FROM lesson_slots');
    await query('DELETE FROM instructor_availability');
    await query('DELETE FROM instructor_vehicles');
    await query('DELETE FROM vehicles');
    await query('DELETE FROM users');
  } catch (error) {
    console.error('Error cleaning up test database:', error);
  }
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: Add factory helpers to helpers.js**

```js
// tests/helpers.js
import express from 'express';
import request from 'supertest';
import { User } from '../src/models/User.js';
import { Vehicle } from '../src/models/Vehicle.js';
import { InstructorVehicle } from '../src/models/InstructorVehicle.js';
import { InstructorAvailability } from '../src/models/InstructorAvailability.js';
import { generateToken } from '../src/utils/jwt.js';
import authRouter from '../src/routes/auth.js';

export const createTestApp = (...routers) => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  for (const [path, router] of routers) {
    app.use(path, router);
  }
  return app;
};

export const createAdmin = (overrides = {}) =>
  User.create(
    overrides.email    ?? 'admin@test.com',
    overrides.password ?? 'Pass123!',
    overrides.name     ?? 'Admin',
    'admin',
    overrides.phone    ?? null
  );

export const createInstructor = (overrides = {}) =>
  User.create(
    overrides.email    ?? 'instructor@test.com',
    overrides.password ?? 'Pass123!',
    overrides.name     ?? 'Instructor',
    'instructor',
    overrides.phone    ?? null
  );

export const createStudent = (overrides = {}) =>
  User.create(
    overrides.email             ?? 'student@test.com',
    overrides.password          ?? 'Pass123!',
    overrides.name              ?? 'Student',
    'student',
    overrides.phone             ?? null,
    overrides.purchasedLessons  ?? 10,
    overrides.category          ?? 'B'
  );

export const createVehicle = (overrides = {}) =>
  Vehicle.create(
    overrides.plate ?? 'ABC1234',
    overrides.model ?? 'Gol',
    overrides.year  ?? 2022
  );

export const linkVehicle = (instructorId, vehicleId) =>
  InstructorVehicle.link(instructorId, vehicleId);

export const addAvailability = (instructorId, vehicleId, overrides = {}) =>
  InstructorAvailability.create(
    instructorId,
    vehicleId,
    overrides.dayOfWeek  ?? 1,       // Monday
    overrides.startTime  ?? '08:00',
    overrides.endTime    ?? '20:00'
  );

export const tokenFor = (user) =>
  generateToken({ userId: user.id, email: user.email, role: user.role });

export const requestWithAuth = (app, method, path, token) => {
  const req = request(app)[method.toLowerCase()](path);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
};
```

- [ ] **Step 3: Run tests to confirm setup compiles**

```bash
npm test -- tests/auth.test.js
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add tests/setup.js tests/helpers.js
git commit -m "test: update setup cleanup for new schema + add factory helpers"
```

---

## Task 4: Vehicle CRUD

**Files:**
- Create: `src/models/Vehicle.js`
- Create: `src/routes/vehicles.js`
- Create: `tests/vehicles.test.js`
- Modify: `src/routes/index.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/vehicles.test.js
import request from 'supertest';
import { createTestApp, createAdmin, createInstructor, createStudent, tokenFor } from './helpers.js';
import vehiclesRouter from '../src/routes/vehicles.js';

const app = createTestApp(['/api/vehicles', vehiclesRouter]);

let admin, adminToken, instructor, instructorToken, studentToken;

beforeEach(async () => {
  admin      = await createAdmin();
  adminToken = tokenFor(admin);
  instructor = await createInstructor();
  instructorToken = tokenFor(instructor);
  const student = await createStudent();
  studentToken  = tokenFor(student);
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
    .post('/api/vehicles').set('Authorization', `Bearer ${adminToken}`)
    .send({ plate: 'ABC1234', model: 'Gol', year: 2022 });
  const res = await request(app)
    .post('/api/vehicles').set('Authorization', `Bearer ${adminToken}`)
    .send({ plate: 'ABC1234', model: 'Palio', year: 2021 });
  expect(res.status).toBe(409);
});

test('POST /api/vehicles - rejects missing fields', async () => {
  const res = await request(app)
    .post('/api/vehicles').set('Authorization', `Bearer ${adminToken}`)
    .send({ plate: 'ABC1234' });
  expect(res.status).toBe(400);
});

test('GET /api/vehicles - admin lists vehicles', async () => {
  await request(app).post('/api/vehicles').set('Authorization', `Bearer ${adminToken}`)
    .send({ plate: 'AAA1111', model: 'Gol', year: 2022 });
  const res = await request(app).get('/api/vehicles')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBe(1);
});

test('GET /api/vehicles - instructor can list', async () => {
  const res = await request(app).get('/api/vehicles')
    .set('Authorization', `Bearer ${instructorToken}`);
  expect(res.status).toBe(200);
});

test('GET /api/vehicles - student cannot list', async () => {
  const res = await request(app).get('/api/vehicles')
    .set('Authorization', `Bearer ${studentToken}`);
  expect(res.status).toBe(403);
});

test('PUT /api/vehicles/:id - admin updates vehicle', async () => {
  const create = await request(app).post('/api/vehicles')
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
  const create = await request(app).post('/api/vehicles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ plate: 'ABC1234', model: 'Gol', year: 2022 });
  const res = await request(app)
    .delete(`/api/vehicles/${create.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run — expect failures (Vehicle not found)**

```bash
npm test -- tests/vehicles.test.js
```

Expected: FAIL — `Cannot find module '../src/routes/vehicles.js'`

- [ ] **Step 3: Implement Vehicle model**

```js
// src/models/Vehicle.js
import { query } from '../db/pool.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';

export class Vehicle {
  static async create(plate, model, year) {
    if (!plate || !model || !year) throw new BadRequestError('plate, model and year are required');
    const dup = await query('SELECT id FROM vehicles WHERE LOWER(plate) = LOWER($1)', [plate]);
    if (dup.rows.length > 0) throw new ConflictError('Plate already registered');
    const result = await query(
      `INSERT INTO vehicles (plate, model, year) VALUES ($1, $2, $3)
       RETURNING id, plate, model, year, created_at`,
      [plate.toUpperCase(), model, year]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await query(
      'SELECT id, plate, model, year, created_at FROM vehicles WHERE id = $1', [id]
    );
    if (result.rows.length === 0) throw new NotFoundError('Vehicle not found');
    return result.rows[0];
  }

  static async list({ limit = 50, offset = 0 } = {}) {
    const [data, count] = await Promise.all([
      query(
        'SELECT id, plate, model, year, created_at FROM vehicles ORDER BY plate LIMIT $1 OFFSET $2',
        [limit, offset]
      ),
      query('SELECT COUNT(*) FROM vehicles'),
    ]);
    return { data: data.rows, meta: { total: parseInt(count.rows[0].count, 10), limit, offset } };
  }

  static async update(id, { plate, model, year }) {
    await Vehicle.findById(id);
    if (plate) {
      const dup = await query(
        'SELECT id FROM vehicles WHERE LOWER(plate) = LOWER($1) AND id != $2', [plate, id]
      );
      if (dup.rows.length > 0) throw new ConflictError('Plate already registered');
    }
    const result = await query(
      `UPDATE vehicles SET
         plate = COALESCE($1, plate),
         model = COALESCE($2, model),
         year  = COALESCE($3, year)
       WHERE id = $4
       RETURNING id, plate, model, year, created_at`,
      [plate ? plate.toUpperCase() : null, model ?? null, year ?? null, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    const result = await query('DELETE FROM vehicles WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new NotFoundError('Vehicle not found');
  }
}
```

- [ ] **Step 4: Implement vehicles route**

```js
// src/routes/vehicles.js
import express from 'express';
import { Vehicle } from '../models/Vehicle.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';

const router = express.Router();
const { ADMIN, INSTRUCTOR } = USER_ROLES;

router.get('/', authMiddleware, requireRole(ADMIN, INSTRUCTOR), async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  const result = await Vehicle.list({ limit: Number(limit), offset: Number(offset) });
  res.json(result);
});

router.post('/', authMiddleware, requireRole(ADMIN), async (req, res) => {
  const { plate, model, year } = req.body;
  const vehicle = await Vehicle.create(plate, model, Number(year));
  res.status(201).json(vehicle);
});

router.put('/:id', authMiddleware, requireRole(ADMIN), async (req, res) => {
  const { plate, model, year } = req.body;
  const vehicle = await Vehicle.update(req.params.id, { plate, model, year: year ? Number(year) : undefined });
  res.json(vehicle);
});

router.delete('/:id', authMiddleware, requireRole(ADMIN), async (req, res) => {
  await Vehicle.delete(req.params.id);
  res.json({ message: 'Vehicle deleted' });
});

export default router;
```

- [ ] **Step 5: Mount vehicles in routes/index.js**

```js
// src/routes/index.js
import authRouter from './auth.js';
import userRouter from './users.js';
import vehiclesRouter from './vehicles.js';
import notificationsRouter from './notifications.js';
import cronRouter from './cron.js';

export const mountRoutes = (app) => {
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/vehicles', vehiclesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/cron', cronRouter);
};
```

- [ ] **Step 6: Run tests — expect pass**

```bash
npm test -- tests/vehicles.test.js
```

Expected: all 8 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/models/Vehicle.js src/routes/vehicles.js src/routes/index.js tests/vehicles.test.js
git commit -m "feat: add vehicle CRUD (model + routes + tests)"
```

---

## Task 5: Instructor ↔ Vehicle authorization

**Files:**
- Create: `src/models/InstructorVehicle.js`
- Create: `src/routes/instructors.js`
- Create: `tests/instructor-vehicles.test.js`
- Modify: `src/routes/index.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/instructor-vehicles.test.js
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- tests/instructor-vehicles.test.js
```

- [ ] **Step 3: Implement InstructorVehicle model**

```js
// src/models/InstructorVehicle.js
import { query } from '../db/pool.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

export class InstructorVehicle {
  static async link(instructorId, vehicleId) {
    const dup = await query(
      'SELECT id FROM instructor_vehicles WHERE instructor_id = $1 AND vehicle_id = $2',
      [instructorId, vehicleId]
    );
    if (dup.rows.length > 0) throw new ConflictError('Vehicle already linked to instructor');
    const result = await query(
      `INSERT INTO instructor_vehicles (instructor_id, vehicle_id)
       VALUES ($1, $2)
       RETURNING id, instructor_id, vehicle_id, created_at`,
      [instructorId, vehicleId]
    );
    return result.rows[0];
  }

  static async unlink(instructorId, vehicleId) {
    await query(
      'DELETE FROM instructor_availability WHERE instructor_id = $1 AND vehicle_id = $2',
      [instructorId, vehicleId]
    );
    const result = await query(
      'DELETE FROM instructor_vehicles WHERE instructor_id = $1 AND vehicle_id = $2',
      [instructorId, vehicleId]
    );
    if (result.rowCount === 0) throw new NotFoundError('Link not found');
  }

  static async listByInstructor(instructorId) {
    const result = await query(
      `SELECT iv.id, iv.vehicle_id, iv.created_at, v.plate, v.model, v.year
       FROM instructor_vehicles iv
       JOIN vehicles v ON v.id = iv.vehicle_id
       WHERE iv.instructor_id = $1
       ORDER BY v.plate`,
      [instructorId]
    );
    return result.rows;
  }

  static async isAuthorized(instructorId, vehicleId) {
    const result = await query(
      'SELECT 1 FROM instructor_vehicles WHERE instructor_id = $1 AND vehicle_id = $2',
      [instructorId, vehicleId]
    );
    return result.rows.length > 0;
  }
}
```

- [ ] **Step 4: Implement instructors route (vehicles sub-resource)**

```js
// src/routes/instructors.js
import express from 'express';
import { InstructorVehicle } from '../models/InstructorVehicle.js';
import { InstructorAvailability } from '../models/InstructorAvailability.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';

const router = express.Router({ mergeParams: true });
const { ADMIN, INSTRUCTOR } = USER_ROLES;

// --- Vehicles sub-resource ---
router.get('/:id/vehicles', authMiddleware, requireRole(ADMIN, INSTRUCTOR), async (req, res) => {
  const { id } = req.params;
  if (req.user.role === INSTRUCTOR && req.user.userId !== id) {
    return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
  }
  const vehicles = await InstructorVehicle.listByInstructor(id);
  res.json(vehicles);
});

router.post('/:id/vehicles', authMiddleware, requireRole(ADMIN), async (req, res) => {
  const link = await InstructorVehicle.link(req.params.id, req.body.vehicle_id);
  res.status(201).json(link);
});

router.delete('/:id/vehicles/:vid', authMiddleware, requireRole(ADMIN), async (req, res) => {
  await InstructorVehicle.unlink(req.params.id, req.params.vid);
  res.json({ message: 'Vehicle unlinked' });
});

// --- Availability sub-resource --- (implemented in Task 6)

export default router;
```

- [ ] **Step 5: Mount instructors router**

Add to `src/routes/index.js`:
```js
import instructorsRouter from './instructors.js';
// inside mountRoutes:
app.use('/api/instructors', instructorsRouter);
```

- [ ] **Step 6: Run tests — expect pass**

```bash
npm test -- tests/instructor-vehicles.test.js
```

- [ ] **Step 7: Commit**

```bash
git add src/models/InstructorVehicle.js src/routes/instructors.js src/routes/index.js tests/instructor-vehicles.test.js
git commit -m "feat: add instructor-vehicle authorization (model + routes + tests)"
```

---

## Task 6: Instructor availability windows

**Files:**
- Create: `src/models/InstructorAvailability.js`
- Modify: `src/routes/instructors.js` (add availability routes)
- Create: `tests/instructor-availability.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/instructor-availability.test.js
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- tests/instructor-availability.test.js
```

- [ ] **Step 3: Implement InstructorAvailability model**

```js
// src/models/InstructorAvailability.js
import { query } from '../db/pool.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { InstructorVehicle } from './InstructorVehicle.js';

export class InstructorAvailability {
  static async create(instructorId, vehicleId, dayOfWeek, startTime, endTime) {
    if (dayOfWeek < 0 || dayOfWeek > 6) throw new BadRequestError('day_of_week must be 0–6');
    if (startTime >= endTime) throw new BadRequestError('start_time must be before end_time');
    const authorized = await InstructorVehicle.isAuthorized(instructorId, vehicleId);
    if (!authorized) throw new BadRequestError('Instructor is not authorized for this vehicle');
    const result = await query(
      `INSERT INTO instructor_availability (instructor_id, vehicle_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, instructor_id, vehicle_id, day_of_week, start_time, end_time, created_at`,
      [instructorId, vehicleId, dayOfWeek, startTime, endTime]
    );
    return result.rows[0];
  }

  static async listByInstructor(instructorId) {
    const result = await query(
      `SELECT ia.id, ia.vehicle_id, ia.day_of_week, ia.start_time, ia.end_time, ia.created_at,
              v.plate, v.model
       FROM instructor_availability ia
       JOIN vehicles v ON v.id = ia.vehicle_id
       WHERE ia.instructor_id = $1
       ORDER BY ia.day_of_week, ia.start_time`,
      [instructorId]
    );
    return result.rows;
  }

  static async delete(id, instructorId) {
    const result = await query(
      'DELETE FROM instructor_availability WHERE id = $1 AND instructor_id = $2',
      [id, instructorId]
    );
    if (result.rowCount === 0) throw new NotFoundError('Availability window not found');
  }
}
```

- [ ] **Step 4: Add availability routes to instructors.js**

Append to `src/routes/instructors.js` before `export default router`:

```js
// --- Availability sub-resource ---
router.get('/:id/availability', authMiddleware, requireRole(ADMIN, INSTRUCTOR), async (req, res) => {
  const { id } = req.params;
  if (req.user.role === INSTRUCTOR && req.user.userId !== id) {
    return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
  }
  const windows = await InstructorAvailability.listByInstructor(id);
  res.json(windows);
});

router.post('/:id/availability', authMiddleware, requireRole(ADMIN), async (req, res) => {
  const { vehicle_id, day_of_week, start_time, end_time } = req.body;
  const window = await InstructorAvailability.create(
    req.params.id, vehicle_id, Number(day_of_week), start_time, end_time
  );
  res.status(201).json(window);
});

router.delete('/:id/availability/:aid', authMiddleware, requireRole(ADMIN), async (req, res) => {
  await InstructorAvailability.delete(req.params.aid, req.params.id);
  res.json({ message: 'Availability window removed' });
});
```

Also add the import at the top of `instructors.js`:
```js
import { InstructorAvailability } from '../models/InstructorAvailability.js';
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm test -- tests/instructor-availability.test.js
```

- [ ] **Step 6: Commit**

```bash
git add src/models/InstructorAvailability.js src/routes/instructors.js tests/instructor-availability.test.js
git commit -m "feat: add instructor availability windows (model + routes + tests)"
```

---

## Task 7: Available slots query

**Files:**
- Create: `src/models/AvailableSlot.js`
- Create: `src/routes/slots.js`
- Create: `tests/slots.test.js`
- Modify: `src/routes/index.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/slots.test.js
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
  // Monday availability: 08:00–10:00 → slots at 08:00 and 08:50
  await addAvailability(instructor.id, vehicle.id, { dayOfWeek: 1, startTime: '08:00', endTime: '10:00' });
});

test('GET /api/slots/available - returns 2 slots for a Monday', async () => {
  // Find next Monday
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
  const { query } = await import('../src/db/pool.js');
  const student = await createStudent({ email: 's2@test.com' });

  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  const monday = d.toISOString().slice(0, 10);

  // Insert directly — LessonSlot model is built in a later task
  await query(
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- tests/slots.test.js
```

- [ ] **Step 3: Implement AvailableSlot model**

```js
// src/models/AvailableSlot.js
import { query } from '../db/pool.js';
import { BadRequestError } from '../utils/errors.js';

const SLOT_MINUTES = 50;

export class AvailableSlot {
  static async list({ dateFrom, dateTo, instructorId = null }) {
    if (!dateFrom || !dateTo) throw new BadRequestError('date_from and date_to are required');

    const availParams = instructorId ? [instructorId] : [];
    const availSQL = `
      SELECT ia.instructor_id, ia.vehicle_id, ia.day_of_week,
             ia.start_time, ia.end_time,
             u.name AS instructor_name, v.plate, v.model
      FROM instructor_availability ia
      JOIN users u    ON u.id = ia.instructor_id
      JOIN vehicles v ON v.id = ia.vehicle_id
      ${instructorId ? 'WHERE ia.instructor_id = $1' : ''}
    `;
    const availability = await query(availSQL, availParams);

    const occupiedParams = instructorId ? [dateFrom, dateTo, instructorId] : [dateFrom, dateTo];
    const occupiedSQL = `
      SELECT instructor_id, vehicle_id,
             scheduled_date::TEXT AS scheduled_date,
             start_time::TEXT AS start_time
      FROM lesson_slots
      WHERE scheduled_date BETWEEN $1 AND $2
        AND status IN ('scheduled', 'completed')
        ${instructorId ? 'AND instructor_id = $3' : ''}
    `;
    const occupied = await query(occupiedSQL, occupiedParams);

    const occupiedSet = new Set(
      occupied.rows.map(r =>
        `${r.instructor_id}|${r.vehicle_id}|${r.scheduled_date}|${r.start_time.slice(0, 5)}`
      )
    );

    const slots = [];
    const start = new Date(`${dateFrom}T12:00:00`);
    const end   = new Date(`${dateTo}T12:00:00`);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      const dateStr   = d.toISOString().slice(0, 10);

      for (const w of availability.rows) {
        if (w.day_of_week !== dayOfWeek) continue;
        const [sh, sm] = w.start_time.slice(0, 5).split(':').map(Number);
        const [eh, em] = w.end_time.slice(0, 5).split(':').map(Number);
        const windowEnd = eh * 60 + em;
        let cur = sh * 60 + sm;

        while (cur + SLOT_MINUTES <= windowEnd) {
          const hh  = String(Math.floor(cur / 60)).padStart(2, '0');
          const mm  = String(cur % 60).padStart(2, '0');
          const key = `${w.instructor_id}|${w.vehicle_id}|${dateStr}|${hh}:${mm}`;

          if (!occupiedSet.has(key)) {
            slots.push({
              instructor_id:   w.instructor_id,
              instructor_name: w.instructor_name,
              vehicle_id:      w.vehicle_id,
              plate:           w.plate,
              model:           w.model,
              date:            dateStr,
              start_time:      `${hh}:${mm}`,
            });
          }
          cur += SLOT_MINUTES;
        }
      }
    }

    return slots.sort((a, b) =>
      a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)
    );
  }
}
```

- [ ] **Step 4: Implement slots route**

```js
// src/routes/slots.js
import express from 'express';
import { AvailableSlot } from '../models/AvailableSlot.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';

const router = express.Router();
const { ADMIN, STUDENT } = USER_ROLES;

router.get('/available', authMiddleware, requireRole(ADMIN, STUDENT), async (req, res) => {
  const { date_from, date_to, instructor_id } = req.query;
  const slots = await AvailableSlot.list({
    dateFrom:     date_from,
    dateTo:       date_to,
    instructorId: instructor_id || null,
  });
  res.json(slots);
});

export default router;
```

- [ ] **Step 5: Mount slots router in routes/index.js**

```js
import slotsRouter from './slots.js';
// inside mountRoutes:
app.use('/api/slots', slotsRouter);
```

- [ ] **Step 6: Run tests — expect pass**

```bash
npm test -- tests/slots.test.js
```

- [ ] **Step 7: Commit**

```bash
git add src/models/AvailableSlot.js src/routes/slots.js src/routes/index.js tests/slots.test.js
git commit -m "feat: add available slots query (model + route + tests)"
```

---

## Task 8: LessonSlot model

**Files:**
- Create: `src/models/LessonSlot.js`
- Create: `tests/lesson-slots.test.js` (partial — model tests only; route tests added in Task 9)

- [ ] **Step 1: Write failing model-level tests**

```js
// tests/lesson-slots.test.js
import {
  createAdmin, createInstructor, createStudent,
  createVehicle, linkVehicle, addAvailability
} from './helpers.js';
import { LessonSlot } from '../src/models/LessonSlot.js';

let admin, instructor, student, vehicle;
const NEXT_MONDAY = (() => {
  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
})();

beforeEach(async () => {
  admin      = await createAdmin();
  instructor = await createInstructor();
  student    = await createStudent({ purchasedLessons: 5 });
  vehicle    = await createVehicle();
  await linkVehicle(instructor.id, vehicle.id);
  await addAvailability(instructor.id, vehicle.id);
});

// --- createSingle ---
test('createSingle - creates a lesson slot', async () => {
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00'
  );
  expect(slot.status).toBe('scheduled');
  expect(slot.student_id).toBe(student.id);
});

test('createSingle - rejects if instructor not authorized for vehicle', async () => {
  const other = await createVehicle({ plate: 'OTH1111', model: 'Celta', year: 2018 });
  await expect(
    LessonSlot.createSingle(student.id, instructor.id, other.id, NEXT_MONDAY, '08:00')
  ).rejects.toMatchObject({ statusCode: 400 });
});

test('createSingle - rejects if no balance', async () => {
  const broke = await createStudent({ email: 'broke@test.com', purchasedLessons: 0 });
  await expect(
    LessonSlot.createSingle(broke.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00')
  ).rejects.toMatchObject({ statusCode: 400 });
});

test('createSingle - rejects slot conflict', async () => {
  await LessonSlot.createSingle(student.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00');
  const s2 = await createStudent({ email: 's2@test.com', purchasedLessons: 5 });
  await expect(
    LessonSlot.createSingle(s2.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00')
  ).rejects.toMatchObject({ statusCode: 400 });
});

// --- createBatch ---
test('createBatch - creates N slots on selected days', async () => {
  // Monday = 1, add Wednesday = 3 availability too
  await addAvailability(instructor.id, vehicle.id, { dayOfWeek: 3, startTime: '08:00', endTime: '20:00' });
  const slots = await LessonSlot.createBatch(
    student.id, instructor.id, vehicle.id,
    [1, 3], '08:00', NEXT_MONDAY, 4
  );
  expect(slots.length).toBe(4);
  const days = slots.map(s => new Date(s.scheduled_date).getDay());
  expect(days.filter(d => d === 1).length).toBe(2);
  expect(days.filter(d => d === 3).length).toBe(2);
});

test('createBatch - rejects if quantity > balance', async () => {
  await expect(
    LessonSlot.createBatch(student.id, instructor.id, vehicle.id, [1], '08:00', NEXT_MONDAY, 10)
  ).rejects.toMatchObject({ statusCode: 400 });
});

// --- balance calculation ---
test('balance decreases with scheduled/completed/no_show/absent_charged but not cancelled/absent_valid', async () => {
  const s = await createStudent({ email: 'bal@test.com', purchasedLessons: 3 });
  const slot = await LessonSlot.createSingle(s.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00');
  // balance = 3 - 1 scheduled = 2
  let balance = await LessonSlot.getRemainingBalance(s.id);
  expect(balance).toBe(2);

  await LessonSlot.cancel(slot.id, admin.id, 'test');
  // cancelled → balance restored = 3
  balance = await LessonSlot.getRemainingBalance(s.id);
  expect(balance).toBe(3);
});

// --- reschedule ---
test('reschedule - moves slot to new date/time', async () => {
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00'
  );
  const nextTuesday = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((2 + 7 - d.getDay()) % 7 || 7));
    return d.toISOString().slice(0, 10);
  })();
  await addAvailability(instructor.id, vehicle.id, { dayOfWeek: 2, startTime: '08:00', endTime: '20:00' });
  const updated = await LessonSlot.reschedule(slot.id, {
    instructorId: instructor.id, vehicleId: vehicle.id,
    scheduledDate: nextTuesday, startTime: '08:00'
  });
  expect(updated.scheduled_date.toISOString?.().slice(0, 10) ?? updated.scheduled_date).toBe(nextTuesday);
  expect(updated.status).toBe('scheduled');
});

// --- checkin ---
test('checkin - marks completed with plate', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, today, '00:00', { checkBalance: false }
  );
  const updated = await LessonSlot.checkin(slot.id, instructor.id, 'ABC1234');
  expect(updated.status).toBe('completed');
  expect(updated.plate_at_checkin).toBe('ABC1234');
});

// --- no-show ---
test('noShow - marks no_show', async () => {
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, NEXT_MONDAY, '09:00', { checkBalance: false }
  );
  const updated = await LessonSlot.noShow(slot.id, instructor.id);
  expect(updated.status).toBe('no_show');
});

test('noShow - rejects if absence already declared', async () => {
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, NEXT_MONDAY, '09:00', { checkBalance: false }
  );
  await LessonSlot.declareAbsence(slot.id, student.id);
  await expect(LessonSlot.noShow(slot.id, instructor.id)).rejects.toMatchObject({ statusCode: 400 });
});

// --- absence ---
test('declareAbsence - absent_valid when >= 1h before', async () => {
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const dateStr = future.toISOString().slice(0, 10);
  const timeStr = `${String(future.getHours()).padStart(2,'0')}:${String(future.getMinutes()).padStart(2,'0')}`;
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, dateStr, timeStr, { checkBalance: false }
  );
  const updated = await LessonSlot.declareAbsence(slot.id, student.id);
  expect(updated.status).toBe('absent_valid');
});

test('declareAbsence - absent_charged when < 1h before', async () => {
  const soon = new Date(Date.now() + 30 * 60 * 1000);
  const dateStr = soon.toISOString().slice(0, 10);
  const timeStr = `${String(soon.getHours()).padStart(2,'0')}:${String(soon.getMinutes()).padStart(2,'0')}`;
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, dateStr, timeStr, { checkBalance: false }
  );
  const updated = await LessonSlot.declareAbsence(slot.id, student.id);
  expect(updated.status).toBe('absent_charged');
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- tests/lesson-slots.test.js
```

- [ ] **Step 3: Implement LessonSlot model**

```js
// src/models/LessonSlot.js
import { query } from '../db/pool.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { InstructorVehicle } from './InstructorVehicle.js';

export class LessonSlot {
  static async getRemainingBalance(studentId) {
    const result = await query(
      `SELECT u.purchased_lessons,
         COALESCE((
           SELECT COUNT(*) FROM lesson_slots
           WHERE student_id = $1
             AND status IN ('scheduled','completed','no_show','absent_charged')
         ), 0)::INT AS used
       FROM users u WHERE u.id = $1`,
      [studentId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Student not found');
    const { purchased_lessons, used } = result.rows[0];
    return purchased_lessons - used;
  }

  static async _checkConflict(instructorId, vehicleId, scheduledDate, startTime) {
    const result = await query(
      `SELECT id FROM lesson_slots
       WHERE instructor_id = $1 AND vehicle_id = $2
         AND scheduled_date = $3 AND start_time = $4
         AND status IN ('scheduled', 'completed')`,
      [instructorId, vehicleId, scheduledDate, startTime]
    );
    return result.rows.length > 0;
  }

  static async createSingle(studentId, instructorId, vehicleId, scheduledDate, startTime, { checkBalance = true } = {}) {
    const authorized = await InstructorVehicle.isAuthorized(instructorId, vehicleId);
    if (!authorized) throw new BadRequestError('Instructor is not authorized for this vehicle');

    if (checkBalance) {
      const balance = await LessonSlot.getRemainingBalance(studentId);
      if (balance <= 0) throw new BadRequestError('No remaining lesson balance');
    }

    const conflict = await LessonSlot._checkConflict(instructorId, vehicleId, scheduledDate, startTime);
    if (conflict) throw new BadRequestError('Time slot already occupied');

    const result = await query(
      `INSERT INTO lesson_slots (student_id, instructor_id, vehicle_id, scheduled_date, start_time)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [studentId, instructorId, vehicleId, scheduledDate, startTime]
    );
    return result.rows[0];
  }

  static async createBatch(studentId, instructorId, vehicleId, daysOfWeek, startTime, startDate, quantity) {
    const authorized = await InstructorVehicle.isAuthorized(instructorId, vehicleId);
    if (!authorized) throw new BadRequestError('Instructor is not authorized for this vehicle');

    const balance = await LessonSlot.getRemainingBalance(studentId);
    if (quantity > balance) {
      throw new BadRequestError(`Quantity (${quantity}) exceeds remaining balance (${balance})`);
    }

    const dates = [];
    const d = new Date(`${startDate}T12:00:00`);
    const limit = new Date(d);
    limit.setFullYear(limit.getFullYear() + 2);

    while (dates.length < quantity) {
      if (d > limit) throw new BadRequestError('Could not find enough available slots within 2 years');
      if (daysOfWeek.includes(d.getDay())) {
        const dateStr = d.toISOString().slice(0, 10);
        const conflict = await LessonSlot._checkConflict(instructorId, vehicleId, dateStr, startTime);
        if (conflict) throw new BadRequestError(`Slot conflict on ${dateStr} at ${startTime}`);
        dates.push(dateStr);
      }
      d.setDate(d.getDate() + 1);
    }

    const created = [];
    for (const dateStr of dates) {
      const result = await query(
        `INSERT INTO lesson_slots (student_id, instructor_id, vehicle_id, scheduled_date, start_time)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [studentId, instructorId, vehicleId, dateStr, startTime]
      );
      created.push(result.rows[0]);
    }
    return created;
  }

  static async findById(id) {
    const result = await query(
      `SELECT ls.*,
              s.name AS student_name, i.name AS instructor_name,
              v.plate, v.model
       FROM lesson_slots ls
       JOIN users s    ON s.id = ls.student_id
       JOIN users i    ON i.id = ls.instructor_id
       JOIN vehicles v ON v.id = ls.vehicle_id
       WHERE ls.id = $1`,
      [id]
    );
    if (result.rows.length === 0) throw new NotFoundError('Lesson slot not found');
    return result.rows[0];
  }

  static async list({ studentId, instructorId, date, status, limit = 50, offset = 0 } = {}) {
    const conds = [];
    const params = [];
    let i = 1;
    if (studentId)    { conds.push(`ls.student_id = $${i++}`);    params.push(studentId); }
    if (instructorId) { conds.push(`ls.instructor_id = $${i++}`); params.push(instructorId); }
    if (date)         { conds.push(`ls.scheduled_date = $${i++}`); params.push(date); }
    if (status)       { conds.push(`ls.status = $${i++}`);        params.push(status); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [data, count] = await Promise.all([
      query(
        `SELECT ls.id, ls.student_id, ls.instructor_id, ls.vehicle_id,
                ls.scheduled_date, ls.start_time, ls.status,
                ls.plate_at_checkin, ls.validated_by, ls.validated_at,
                ls.absence_declared_at, ls.cancellation_reason,
                ls.cancelled_by, ls.cancelled_at, ls.created_at,
                s.name AS student_name, i.name AS instructor_name,
                v.plate, v.model
         FROM lesson_slots ls
         JOIN users s    ON s.id = ls.student_id
         JOIN users i    ON i.id = ls.instructor_id
         JOIN vehicles v ON v.id = ls.vehicle_id
         ${where}
         ORDER BY ls.scheduled_date, ls.start_time
         LIMIT $${i++} OFFSET $${i}`,
        [...params, limit, offset]
      ),
      query(`SELECT COUNT(*) FROM lesson_slots ls ${where}`, params),
    ]);
    return { data: data.rows, meta: { total: parseInt(count.rows[0].count, 10), limit, offset } };
  }

  static async reschedule(id, { instructorId, vehicleId, scheduledDate, startTime }) {
    const slot = await LessonSlot.findById(id);
    if (!['scheduled', 'absent_valid'].includes(slot.status)) {
      throw new BadRequestError('Only scheduled or absent_valid lessons can be rescheduled');
    }
    const authorized = await InstructorVehicle.isAuthorized(instructorId, vehicleId);
    if (!authorized) throw new BadRequestError('Instructor is not authorized for this vehicle');
    const conflict = await LessonSlot._checkConflict(instructorId, vehicleId, scheduledDate, startTime);
    if (conflict) throw new BadRequestError('Target slot is already occupied');

    const result = await query(
      `UPDATE lesson_slots
       SET instructor_id = $1, vehicle_id = $2, scheduled_date = $3,
           start_time = $4, status = 'scheduled'
       WHERE id = $5 RETURNING *`,
      [instructorId, vehicleId, scheduledDate, startTime, id]
    );
    return result.rows[0];
  }

  static async checkin(id, instructorId, plateAtCheckin) {
    const slot = await LessonSlot.findById(id);
    if (slot.status !== 'scheduled') throw new BadRequestError('Only scheduled lessons can be checked in');
    if (slot.instructor_id !== instructorId) throw new ForbiddenError('Not your lesson');
    if (!plateAtCheckin) throw new BadRequestError('plate_at_checkin is required');

    const result = await query(
      `UPDATE lesson_slots
       SET status = 'completed', plate_at_checkin = $1, validated_by = $2, validated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [plateAtCheckin, instructorId, id]
    );
    return result.rows[0];
  }

  static async noShow(id, instructorId) {
    const slot = await LessonSlot.findById(id);
    if (slot.status !== 'scheduled') throw new BadRequestError('Only scheduled lessons can be marked no-show');
    if (slot.instructor_id !== instructorId) throw new ForbiddenError('Not your lesson');
    if (slot.absence_declared_at) throw new BadRequestError('Student already declared absence');

    const result = await query(
      `UPDATE lesson_slots SET status = 'no_show' WHERE id = $1 RETURNING *`, [id]
    );
    return result.rows[0];
  }

  static async declareAbsence(id, studentId) {
    const slot = await LessonSlot.findById(id);
    if (slot.status !== 'scheduled') throw new BadRequestError('Only scheduled lessons can have absence declared');
    if (slot.student_id !== studentId) throw new ForbiddenError('Not your lesson');

    const now = Date.now();
    const dateStr = typeof slot.scheduled_date === 'string'
      ? slot.scheduled_date
      : slot.scheduled_date.toISOString().slice(0, 10);
    const slotDateTime = new Date(`${dateStr}T${slot.start_time.slice(0, 5)}`).getTime();
    const diffMinutes = (slotDateTime - now) / 60000;
    const newStatus = diffMinutes >= 60 ? 'absent_valid' : 'absent_charged';

    const result = await query(
      `UPDATE lesson_slots SET status = $1, absence_declared_at = NOW()
       WHERE id = $2 RETURNING *`,
      [newStatus, id]
    );
    return result.rows[0];
  }

  static async cancel(id, cancelledBy, reason) {
    const slot = await LessonSlot.findById(id);
    if (!['scheduled', 'absent_valid'].includes(slot.status)) {
      throw new BadRequestError('Only scheduled or absent_valid lessons can be cancelled');
    }
    const result = await query(
      `UPDATE lesson_slots
       SET status = 'cancelled', cancellation_reason = $1, cancelled_by = $2, cancelled_at = NOW()
       WHERE id = $3 RETURNING *`,
      [reason || null, cancelledBy, id]
    );
    return result.rows[0];
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- tests/lesson-slots.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/models/LessonSlot.js tests/lesson-slots.test.js
git commit -m "feat: add LessonSlot model with full lifecycle (tests passing)"
```

---

## Task 9: LessonSlot routes

**Files:**
- Create: `src/routes/lessonSlots.js`
- Modify: `tests/lesson-slots.test.js` (add route tests)
- Modify: `src/routes/index.js`

- [ ] **Step 1: Add route tests to lesson-slots.test.js**

Append to `tests/lesson-slots.test.js`:

```js
import request from 'supertest';
import lessonSlotsRouter from '../src/routes/lessonSlots.js';

const app2 = createTestApp(['/api/lesson-slots', lessonSlotsRouter]);
// reuse admin, instructor, student, vehicle from beforeEach above

test('POST /api/lesson-slots - admin creates single slot', async () => {
  const adminToken = tokenFor(admin);
  const res = await request(app2)
    .post('/api/lesson-slots')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      student_id: student.id, instructor_id: instructor.id,
      vehicle_id: vehicle.id, scheduled_date: NEXT_MONDAY, start_time: '08:00'
    });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('scheduled');
});

test('POST /api/lesson-slots/batch - admin creates batch', async () => {
  const adminToken = tokenFor(admin);
  const res = await request(app2)
    .post('/api/lesson-slots/batch')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      student_id: student.id, instructor_id: instructor.id,
      vehicle_id: vehicle.id, days_of_week: [1], start_time: '08:00',
      start_date: NEXT_MONDAY, quantity: 2
    });
  expect(res.status).toBe(201);
  expect(res.body.length).toBe(2);
});

test('GET /api/lesson-slots - instructor sees only own', async () => {
  const instructorToken = tokenFor(instructor);
  await LessonSlot.createSingle(student.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00');
  const res = await request(app2)
    .get('/api/lesson-slots')
    .set('Authorization', `Bearer ${instructorToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBe(1);
});

test('GET /api/lesson-slots - student sees only own', async () => {
  const studentToken = tokenFor(student);
  await LessonSlot.createSingle(student.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00', { checkBalance: false });
  const s2 = await createStudent({ email: 's3@test.com', purchasedLessons: 5 });
  await LessonSlot.createSingle(s2.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:50', { checkBalance: false });
  const res = await request(app2)
    .get('/api/lesson-slots')
    .set('Authorization', `Bearer ${studentToken}`);
  expect(res.body.data.length).toBe(1);
});

test('PUT /api/lesson-slots/:id/checkin - instructor checks in', async () => {
  const instructorToken = tokenFor(instructor);
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id,
    new Date().toISOString().slice(0, 10), '00:00', { checkBalance: false }
  );
  const res = await request(app2)
    .put(`/api/lesson-slots/${slot.id}/checkin`)
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ plate_at_checkin: 'ABC1234' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('completed');
});

test('PUT /api/lesson-slots/:id/no-show - instructor marks no-show', async () => {
  const instructorToken = tokenFor(instructor);
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, NEXT_MONDAY, '09:00', { checkBalance: false }
  );
  const res = await request(app2)
    .put(`/api/lesson-slots/${slot.id}/no-show`)
    .set('Authorization', `Bearer ${instructorToken}`);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('no_show');
});

test('POST /api/lesson-slots/:id/absence - student declares absence', async () => {
  const studentToken = tokenFor(student);
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const dateStr = future.toISOString().slice(0, 10);
  const timeStr = `${String(future.getHours()).padStart(2,'0')}:${String(future.getMinutes()).padStart(2,'0')}`;
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, dateStr, timeStr, { checkBalance: false }
  );
  const res = await request(app2)
    .post(`/api/lesson-slots/${slot.id}/absence`)
    .set('Authorization', `Bearer ${studentToken}`);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('absent_valid');
});

test('DELETE /api/lesson-slots/:id - admin cancels', async () => {
  const adminToken = tokenFor(admin);
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00', { checkBalance: false }
  );
  const res = await request(app2)
    .delete(`/api/lesson-slots/${slot.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ reason: 'Holiday' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('cancelled');
});
```

Replace the top of `tests/lesson-slots.test.js` with this complete import block:

```js
import request from 'supertest';
import {
  createTestApp, createAdmin, createInstructor, createStudent,
  createVehicle, linkVehicle, addAvailability, tokenFor
} from './helpers.js';
import { LessonSlot } from '../src/models/LessonSlot.js';
import lessonSlotsRouter from '../src/routes/lessonSlots.js';

const app2 = createTestApp(['/api/lesson-slots', lessonSlotsRouter]);
```

(The `app2` line replaces the one added at the bottom of the Task 9 test block.)

- [ ] **Step 2: Run — expect FAIL (missing route)**

```bash
npm test -- tests/lesson-slots.test.js
```

- [ ] **Step 3: Implement lessonSlots route**

```js
// src/routes/lessonSlots.js
import express from 'express';
import { LessonSlot } from '../models/LessonSlot.js';
import { Notification } from '../models/Notification.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';

const router = express.Router();
const { ADMIN, INSTRUCTOR, STUDENT } = USER_ROLES;

router.post('/batch', authMiddleware, requireRole(ADMIN), async (req, res) => {
  const { student_id, instructor_id, vehicle_id, days_of_week, start_time, start_date, quantity } = req.body;
  const slots = await LessonSlot.createBatch(
    student_id, instructor_id, vehicle_id,
    days_of_week, start_time, start_date, Number(quantity)
  );
  res.status(201).json(slots);
});

router.post('/', authMiddleware, requireRole(ADMIN, STUDENT), async (req, res) => {
  const { student_id, instructor_id, vehicle_id, scheduled_date, start_time } = req.body;
  const effectiveStudentId = req.user.role === STUDENT ? req.user.userId : student_id;
  const slot = await LessonSlot.createSingle(
    effectiveStudentId, instructor_id, vehicle_id, scheduled_date, start_time
  );
  res.status(201).json(slot);
});

router.get('/', authMiddleware, async (req, res) => {
  const filters = {};
  const { date, status, limit = 50, page = 1 } = req.query;
  const offset = (page - 1) * limit;
  if (req.user.role === INSTRUCTOR) filters.instructorId = req.user.userId;
  if (req.user.role === STUDENT)     filters.studentId    = req.user.userId;
  if (date)   filters.date   = date;
  if (status) filters.status = status;
  const result = await LessonSlot.list({ ...filters, limit: Number(limit), offset: Number(offset) });
  res.json(result);
});

router.get('/:id', authMiddleware, async (req, res) => {
  const slot = await LessonSlot.findById(req.params.id);
  if (req.user.role === INSTRUCTOR && slot.instructor_id !== req.user.userId) {
    return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
  }
  if (req.user.role === STUDENT && slot.student_id !== req.user.userId) {
    return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
  }
  res.json(slot);
});

router.put('/:id/reschedule', authMiddleware, requireRole(ADMIN, STUDENT), async (req, res) => {
  const { instructor_id, vehicle_id, scheduled_date, start_time } = req.body;
  const slot = await LessonSlot.reschedule(req.params.id, {
    instructorId: instructor_id, vehicleId: vehicle_id,
    scheduledDate: scheduled_date, startTime: start_time
  });
  // Notify student if admin rescheduled
  if (req.user.role === ADMIN) {
    await Notification.create(
      slot.student_id, 'class_rescheduled',
      'Aula remarcada',
      `Sua aula foi remarcada para ${scheduled_date} às ${start_time}.`,
      slot.id
    );
  }
  res.json(slot);
});

router.put('/:id/checkin', authMiddleware, requireRole(ADMIN, INSTRUCTOR), async (req, res) => {
  const instructorId = req.user.role === INSTRUCTOR ? req.user.userId : req.body.instructor_id;
  const slot = await LessonSlot.checkin(req.params.id, instructorId, req.body.plate_at_checkin);
  res.json(slot);
});

router.put('/:id/no-show', authMiddleware, requireRole(ADMIN, INSTRUCTOR), async (req, res) => {
  const instructorId = req.user.role === INSTRUCTOR ? req.user.userId : req.body.instructor_id;
  const slot = await LessonSlot.noShow(req.params.id, instructorId);
  res.json(slot);
});

router.post('/:id/absence', authMiddleware, requireRole(STUDENT), async (req, res) => {
  const slot = await LessonSlot.declareAbsence(req.params.id, req.user.userId);
  res.json(slot);
});

router.delete('/:id', authMiddleware, requireRole(ADMIN), async (req, res) => {
  const slot = await LessonSlot.cancel(req.params.id, req.user.userId, req.body?.reason);
  await Notification.create(
    slot.student_id, 'class_cancelled',
    'Aula cancelada',
    `Sua aula do dia ${slot.scheduled_date} às ${slot.start_time} foi cancelada.`,
    slot.id
  );
  res.json(slot);
});

export default router;
```

- [ ] **Step 4: Mount lessonSlots in routes/index.js**

```js
import lessonSlotsRouter from './lessonSlots.js';
// inside mountRoutes:
app.use('/api/lesson-slots', lessonSlotsRouter);
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm test -- tests/lesson-slots.test.js
```

- [ ] **Step 6: Commit**

```bash
git add src/routes/lessonSlots.js src/routes/index.js tests/lesson-slots.test.js
git commit -m "feat: add LessonSlot routes with all actions (tests passing)"
```

---

## Task 10: ExamResult model and routes

**Files:**
- Create: `src/models/ExamResult.js`
- Create: `src/routes/examResults.js`
- Create: `tests/exam-results.test.js`
- Modify: `src/routes/index.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/exam-results.test.js
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- tests/exam-results.test.js
```

- [ ] **Step 3: Implement ExamResult model**

```js
// src/models/ExamResult.js
import { query } from '../db/pool.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';

export class ExamResult {
  static async create(studentId, instructorId, vehicleId, examDate, result, notes) {
    if (!['passed', 'failed'].includes(result)) {
      throw new BadRequestError('result must be "passed" or "failed"');
    }
    const res = await query(
      `INSERT INTO exam_results (student_id, instructor_id, vehicle_id, exam_date, result, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [studentId, instructorId, vehicleId, examDate, result, notes || null]
    );
    return res.rows[0];
  }

  static async findById(id) {
    const res = await query('SELECT * FROM exam_results WHERE id = $1', [id]);
    if (res.rows.length === 0) throw new NotFoundError('Exam result not found');
    return res.rows[0];
  }

  static async list({ studentId, instructorId, limit = 50, offset = 0 } = {}) {
    const conds = [];
    const params = [];
    let i = 1;
    if (studentId)    { conds.push(`student_id = $${i++}`);    params.push(studentId); }
    if (instructorId) { conds.push(`instructor_id = $${i++}`); params.push(instructorId); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [data, count] = await Promise.all([
      query(`SELECT * FROM exam_results ${where} ORDER BY exam_date DESC LIMIT $${i++} OFFSET $${i}`,
            [...params, limit, offset]),
      query(`SELECT COUNT(*) FROM exam_results ${where}`, params),
    ]);
    return { data: data.rows, meta: { total: parseInt(count.rows[0].count, 10), limit, offset } };
  }

  static async update(id, { result, notes, examDate, vehicleId }, requestorId, requestorRole) {
    const existing = await ExamResult.findById(id);
    if (requestorRole !== 'admin' && existing.instructor_id !== requestorId) {
      throw new ForbiddenError('Cannot edit another instructor\'s exam result');
    }
    if (result && !['passed', 'failed'].includes(result)) {
      throw new BadRequestError('result must be "passed" or "failed"');
    }
    const res = await query(
      `UPDATE exam_results
       SET result     = COALESCE($1, result),
           notes      = COALESCE($2, notes),
           exam_date  = COALESCE($3, exam_date),
           vehicle_id = COALESCE($4, vehicle_id)
       WHERE id = $5 RETURNING *`,
      [result ?? null, notes ?? null, examDate ?? null, vehicleId ?? null, id]
    );
    return res.rows[0];
  }

  static async delete(id) {
    const result = await query('DELETE FROM exam_results WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new NotFoundError('Exam result not found');
  }
}
```

- [ ] **Step 4: Implement exam results route**

```js
// src/routes/examResults.js
import express from 'express';
import { ExamResult } from '../models/ExamResult.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';

const router = express.Router();
const { ADMIN, INSTRUCTOR, STUDENT } = USER_ROLES;

router.get('/', authMiddleware, async (req, res) => {
  const { student_id, limit = 50, page = 1 } = req.query;
  const offset = (page - 1) * limit;

  if (req.user.role === STUDENT) {
    if (student_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
    }
    const result = await ExamResult.list({ studentId: student_id, limit: Number(limit), offset: Number(offset) });
    return res.json(result);
  }

  const filters = {};
  if (student_id) filters.studentId = student_id;
  if (req.user.role === INSTRUCTOR) filters.instructorId = req.user.userId;
  const result = await ExamResult.list({ ...filters, limit: Number(limit), offset: Number(offset) });
  res.json(result);
});

router.post('/', authMiddleware, requireRole(ADMIN, INSTRUCTOR), async (req, res) => {
  const { student_id, vehicle_id, exam_date, result, notes } = req.body;
  const instructorId = req.user.role === INSTRUCTOR ? req.user.userId : req.body.instructor_id;
  const exam = await ExamResult.create(student_id, instructorId, vehicle_id, exam_date, result, notes);
  res.status(201).json(exam);
});

router.put('/:id', authMiddleware, requireRole(ADMIN, INSTRUCTOR), async (req, res) => {
  const { result, notes, exam_date, vehicle_id } = req.body;
  const exam = await ExamResult.update(
    req.params.id,
    { result, notes, examDate: exam_date, vehicleId: vehicle_id },
    req.user.userId,
    req.user.role
  );
  res.json(exam);
});

router.delete('/:id', authMiddleware, requireRole(ADMIN), async (req, res) => {
  await ExamResult.delete(req.params.id);
  res.json({ message: 'Exam result deleted' });
});

export default router;
```

- [ ] **Step 5: Mount in routes/index.js**

```js
import examResultsRouter from './examResults.js';
// inside mountRoutes:
app.use('/api/exam-results', examResultsRouter);
```

- [ ] **Step 6: Run tests — expect pass**

```bash
npm test -- tests/exam-results.test.js
```

- [ ] **Step 7: Commit**

```bash
git add src/models/ExamResult.js src/routes/examResults.js src/routes/index.js tests/exam-results.test.js
git commit -m "feat: add exam results (model + routes + tests)"
```

---

## Task 11: Update User model — purchased_lessons and category

**Files:**
- Modify: `src/models/User.js`
- Modify: `tests/users.test.js`

- [ ] **Step 1: Add failing tests to users.test.js**

Find the section at the end of `tests/users.test.js` and add:

```js
test('POST /api/users - admin creates student with purchased_lessons and category', async () => {
  const res = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      email: 'student2@test.com', password: 'Pass123!',
      name: 'Student Two', role: 'student',
      purchased_lessons: 20, category: 'B'
    });
  expect(res.status).toBe(201);
  expect(res.body.purchased_lessons).toBe(20);
  expect(res.body.category).toBe('B');
});

test('POST /api/users - rejects invalid category', async () => {
  const res = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      email: 'bad@test.com', password: 'Pass123!',
      name: 'Bad Cat', role: 'student',
      purchased_lessons: 5, category: 'Z'
    });
  expect(res.status).toBe(400);
});

test('PUT /api/users/:id - admin can update purchased_lessons', async () => {
  const student = await User.create('s3@test.com', 'Pass123!', 'S3', 'student', null, 5, 'B');
  const res = await request(app)
    .put(`/api/users/${student.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ purchased_lessons: 30 });
  expect(res.status).toBe(200);
  expect(res.body.purchased_lessons).toBe(30);
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- tests/users.test.js
```

- [ ] **Step 3: Update User.create in src/models/User.js**

Replace the existing `create` method signature and INSERT query:

```js
// Find: static async create(email, password, name, role, phoneNumber = null) {
// Replace with:
static async create(email, password, name, role, phoneNumber = null, purchasedLessons = 0, category = null) {
  const validRoles = Object.values(USER_ROLES);
  if (!validRoles.includes(role)) {
    throw new BadRequestError(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }
  const validCategories = ['A', 'B', 'AB', 'C', 'D', 'E'];
  if (category && !validCategories.includes(category)) {
    throw new BadRequestError(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
  }
  const existingUser = await query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]
  );
  if (existingUser.rows.length > 0) throw new ConflictError('Email already exists');
  const passwordHash = await hashPassword(password);
  const result = await query(
    `INSERT INTO users (email, password_hash, name, role, phone_number, purchased_lessons, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, name, role, phone_number, purchased_lessons, category, created_at`,
    [email, passwordHash, name, role, phoneNumber, purchasedLessons, category]
  );
  return result.rows[0];
}
```

Also update `findById`, `list`, and the SELECT in `findByEmail`/`authenticate` to include the new columns:
- In `findById`: add `purchased_lessons, category` to the SELECT
- In `list`: add `purchased_lessons, category` to the SELECT
- In `update`: add `purchased_lessons` and `category` to `allowedFields` array

For `update`, change `allowedFields`:
```js
const allowedFields = ['name', 'email', 'phone_number', 'purchased_lessons', 'category'];
```

Also add validation for category inside `update` before the query:
```js
if (updates.category) {
  const valid = ['A', 'B', 'AB', 'C', 'D', 'E'];
  if (!valid.includes(updates.category)) throw new BadRequestError('Invalid category');
}
```

- [ ] **Step 4: Update users route to pass purchased_lessons and category**

In `src/routes/users.js`, find the POST handler and add to the `User.create` call:
```js
const { email, password, name, role, phone_number, purchased_lessons, category } = req.body;
const user = await User.create(email, password, name, role, phone_number, purchased_lessons ?? 0, category ?? null);
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm test -- tests/users.test.js
```

- [ ] **Step 6: Commit**

```bash
git add src/models/User.js src/routes/users.js tests/users.test.js
git commit -m "feat: add purchased_lessons and category to User model (tests passing)"
```

---

## Task 12: Update Notification model and rewrite cron

**Files:**
- Modify: `src/models/Notification.js`
- Modify: `src/routes/cron.js`
- Modify: `tests/cron.test.js`

- [ ] **Step 1: Update Notification model**

In `src/models/Notification.js`, make these changes:

Replace `create` method:
```js
static async create(userId, type, title, body, lessonSlotId = null) {
  const result = await query(
    `INSERT INTO notifications (user_id, type, title, body, lesson_slot_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, type, title, body, lesson_slot_id, read_at, created_at`,
    [userId, type, title, body, lessonSlotId]
  );
  return result.rows[0];
}
```

Replace `dedupeExists` method:
```js
static async dedupeExists(userId, lessonSlotId, type) {
  const result = await query(
    'SELECT 1 FROM notifications WHERE user_id = $1 AND lesson_slot_id = $2 AND type = $3',
    [userId, lessonSlotId, type]
  );
  return result.rows.length > 0;
}
```

Update all SELECT statements in `findByUser`, `findUnread`, and `markRead` to replace `schedule_id, class_date` with `lesson_slot_id`.

- [ ] **Step 2: Rewrite cron.js**

Replace the entire SQL query block in `src/routes/cron.js`:

```js
const result = await query(`
  WITH user_prefs AS (
    SELECT
      u.id AS user_id, u.name, u.phone_number,
      COALESCE(np.minutes_before, 15)      AS minutes_before,
      COALESCE(np.whatsapp_enabled, false)  AS whatsapp_enabled,
      COALESCE(np.in_app_enabled, true)     AS in_app_enabled
    FROM users u
    LEFT JOIN notification_preferences np ON np.user_id = u.id
  )
  SELECT
    up.user_id, up.name, up.phone_number,
    up.whatsapp_enabled, up.in_app_enabled, up.minutes_before,
    ls.id AS lesson_slot_id, ls.start_time,
    CONCAT(i.name, ' — placa ', v.plate) AS class_name
  FROM lesson_slots ls
  JOIN users i        ON i.id = ls.instructor_id
  JOIN vehicles v     ON v.id = ls.vehicle_id
  JOIN user_prefs up  ON up.user_id = ls.student_id
  WHERE
    ls.scheduled_date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE
    AND ls.status = 'scheduled'
    AND ABS(EXTRACT(EPOCH FROM (
      ls.start_time - (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME
    )) / 60 - up.minutes_before) < 1
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = up.user_id
        AND n.lesson_slot_id = ls.id
        AND n.type = 'class_reminder'
    )

  UNION ALL

  SELECT
    up.user_id, up.name, up.phone_number,
    up.whatsapp_enabled, up.in_app_enabled, up.minutes_before,
    ls.id AS lesson_slot_id, ls.start_time,
    CONCAT(s.name, ' — placa ', v.plate) AS class_name
  FROM lesson_slots ls
  JOIN users s        ON s.id = ls.student_id
  JOIN vehicles v     ON v.id = ls.vehicle_id
  JOIN user_prefs up  ON up.user_id = ls.instructor_id
  WHERE
    ls.scheduled_date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE
    AND ls.status = 'scheduled'
    AND ABS(EXTRACT(EPOCH FROM (
      ls.start_time - (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME
    )) / 60 - up.minutes_before) < 1
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = up.user_id
        AND n.lesson_slot_id = ls.id
        AND n.type = 'class_reminder'
    )
`);
```

Also update the loop inside to use `row.lesson_slot_id` instead of `row.schedule_id` and remove `row.class_date`:

```js
for (const row of result.rows) {
  try {
    const alreadySent = await Notification.dedupeExists(
      row.user_id, row.lesson_slot_id, 'class_reminder'
    );
    if (alreadySent) { skipped++; continue; }

    if (row.in_app_enabled) {
      const startStr = String(row.start_time).slice(0, 5);
      await Notification.create(
        row.user_id,
        'class_reminder',
        `Lembrete de aula`,
        `Sua aula começa em ${row.minutes_before} minutos (${startStr}) — ${row.class_name}.`,
        row.lesson_slot_id
      );
      sent++;
    } else {
      skipped++;
    }

    if (row.phone_number && row.whatsapp_enabled) {
      const msg = `Olá ${row.name}! 👋\n\nSua aula começa em ${row.minutes_before} minutos.\n\nBoa aula! 🎓`;
      await sendWhatsApp(row.phone_number, msg);
    }
  } catch (err) {
    logger.error({ userId: row.user_id, err }, 'Error sending reminder');
    errors++;
  }
}
```

- [ ] **Step 3: Update cron tests to use lesson_slots fixtures**

Open `tests/cron.test.js` and replace all schedule/class/enrollment-based setup with:

```js
// tests/cron.test.js
import request from 'supertest';
import { createApp } from '../src/index.js';
import { User } from '../src/models/User.js';
import { Vehicle } from '../src/models/Vehicle.js';
import { InstructorVehicle } from '../src/models/InstructorVehicle.js';
import { LessonSlot } from '../src/models/LessonSlot.js';
import { query } from '../src/db/pool.js';

let app;
beforeAll(() => { app = createApp(); });

test('POST /api/cron/send-reminders - rejects missing CRON_SECRET', async () => {
  const res = await request(app).post('/api/cron/send-reminders');
  expect(res.status).toBe(401);
});

test('POST /api/cron/send-reminders - sends reminder for lesson starting in 15min', async () => {
  process.env.CRON_SECRET = 'test-secret';
  const instructor = await User.create('cron_i@test.com','Pass123!','I','instructor');
  const student    = await User.create('cron_s@test.com','Pass123!','S','student',null, 5,'B');
  const vehicle    = await Vehicle.create('CRN1111','Gol',2022);
  await InstructorVehicle.link(instructor.id, vehicle.id);

  const now    = new Date();
  const future = new Date(now.getTime() + 15 * 60 * 1000);
  const dateStr = future.toISOString().slice(0, 10);
  const timeStr = `${String(future.getHours()).padStart(2,'0')}:${String(future.getMinutes()).padStart(2,'0')}`;

  await LessonSlot.createSingle(student.id, instructor.id, vehicle.id, dateStr, timeStr, { checkBalance: false });

  const res = await request(app)
    .post('/api/cron/send-reminders')
    .set('Authorization', `Bearer ${process.env.CRON_SECRET}`);
  expect(res.status).toBe(200);
  expect(res.body.sent).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- tests/cron.test.js tests/notifications.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/models/Notification.js src/routes/cron.js tests/cron.test.js
git commit -m "feat: update notification model and cron to use lesson_slots"
```

---

## Task 13: Final wire-up and full test run

**Files:**
- Verify: `src/routes/index.js` (all new routers mounted)

- [ ] **Step 1: Confirm routes/index.js has all routers**

```js
// src/routes/index.js — final state
import authRouter        from './auth.js';
import userRouter        from './users.js';
import vehiclesRouter    from './vehicles.js';
import instructorsRouter from './instructors.js';
import slotsRouter       from './slots.js';
import lessonSlotsRouter from './lessonSlots.js';
import examResultsRouter from './examResults.js';
import notificationsRouter from './notifications.js';
import cronRouter        from './cron.js';

export const mountRoutes = (app) => {
  app.use('/api/auth',         authRouter);
  app.use('/api/users',        userRouter);
  app.use('/api/vehicles',     vehiclesRouter);
  app.use('/api/instructors',  instructorsRouter);
  app.use('/api/slots',        slotsRouter);
  app.use('/api/lesson-slots', lessonSlotsRouter);
  app.use('/api/exam-results', examResultsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/cron',         cronRouter);
};
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests pass. Note the test count will be lower than 297 (old tests deleted).

- [ ] **Step 3: Fix any remaining failures**

If any test fails due to import errors or stale references, fix them now. Common issues:
- `tests/notifications.test.js` may reference `schedule_id` — update to `lesson_slot_id`
- Route handler may import a removed model — check for stale imports

- [ ] **Step 4: Update CLAUDE.md in cfc-digital-backend to reflect new state**

Replace the "Known Limitations" and "Future Enhancements" sections with the current state. Change the project structure listing to reflect new files. Update the "Phase" description in the top-level CLAUDE.md to note Phase 3 backend is complete.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete vehicle/lesson scheduling backend redesign — all tests passing"
```

---

## Done

The backend now implements:
- Vehicles CRUD + instructor-vehicle authorization
- Instructor availability windows (day + time + vehicle)
- Available slots query (50-min expansion, conflict exclusion)
- LessonSlot full lifecycle (batch create, reschedule, checkin, no-show, absence 1h rule, cancel)
- ExamResult CRUD with instructor scoping
- User `purchased_lessons` + `category` fields
- Cron reminders updated to query `lesson_slots`
- Notifications updated to `lesson_slot_id`

**Next step:** Write and execute the frontend implementation plan.
