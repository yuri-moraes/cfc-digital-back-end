# Phase 2C: Smart Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automated class reminders (Vercel Cron + in-app + optional WhatsApp), student absence declarations with the 1-hour rule, and instructor class cancellations with instant notifications.

**Architecture:** Five new migrations (008–012) add `phone_number` to users and four new tables. Four new models encapsulate all DB logic. A notifications router handles in-app delivery. Two new endpoints hang off the existing schedules router for cancellations and absences. A cron router handles Vercel Cron calls. WhatsApp delivery is a fire-and-forget utility that silently no-ops when `ZAPI_INSTANCE_ID` is unset.

**Tech Stack:** Node.js ES modules, Express 5, PostgreSQL, Z-API (WhatsApp), Vercel Cron, existing Jest + Supertest test suite.

---

## File Map

| File | Action |
|------|--------|
| `src/db/migrations/008_alter_users_add_phone.sql` | Create |
| `src/db/migrations/009_create_notification_preferences.sql` | Create |
| `src/db/migrations/010_create_notifications.sql` | Create |
| `src/db/migrations/011_create_schedule_cancellations.sql` | Create |
| `src/db/migrations/012_create_student_absences.sql` | Create |
| `src/models/User.js` | Modify — `create()` + `findById()` + `list()` + `update()` include `phone_number` |
| `src/routes/users.js` | Modify — POST `/users` accepts `phone_number` |
| `src/utils/whatsapp.js` | Create |
| `src/models/NotificationPreference.js` | Create |
| `src/models/Notification.js` | Create |
| `src/models/ScheduleCancellation.js` | Create |
| `src/models/StudentAbsence.js` | Create |
| `src/routes/notifications.js` | Create |
| `src/routes/cron.js` | Create |
| `src/routes/schedules.js` | Modify — add cancel + absence endpoints |
| `src/routes/attendance.js` | Modify — validate endpoint calls `StudentAbsence.setNoShow` |
| `src/routes/index.js` | Modify — mount notifications + cron routers |
| `vercel.json` | Modify — add cron schedule |
| `.env.example` | Modify — add `CRON_SECRET`, `ZAPI_*` vars |
| `tests/users.test.js` | Modify — add 3 phone_number tests |
| `tests/notifications.test.js` | Create |
| `tests/schedule-cancellations.test.js` | Create |
| `tests/student-absences.test.js` | Create |
| `tests/cron.test.js` | Create |

---

## Task 1: Migration 008 + User Model phone_number Support

**Files:**
- Create: `src/db/migrations/008_alter_users_add_phone.sql`
- Modify: `src/models/User.js`
- Modify: `src/routes/users.js`
- Modify: `tests/users.test.js`

- [ ] **Step 1: Write the failing tests**

Add these three tests inside `tests/users.test.js`, in the `describe('User CRUD Routes')` block, inside a new `describe('phone_number')` nested block after the existing describes:

```javascript
describe('phone_number', () => {
  test('admin creates user with phone_number and it is returned', async () => {
    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'phone@example.com', password: 'Password1!', name: 'Phone User', role: USER_ROLES.STUDENT, phone_number: '+5511999998888' });

    expect(response.status).toBe(201);
    expect(response.body.phone_number).toBe('+5511999998888');
  });

  test('admin creates user without phone_number and it is null', async () => {
    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'nophone@example.com', password: 'Password1!', name: 'No Phone', role: USER_ROLES.STUDENT });

    expect(response.status).toBe(201);
    expect(response.body.phone_number).toBeNull();
  });

  test('admin updates phone_number via PUT', async () => {
    const response = await request(app)
      .put(`/api/users/${studentUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone_number: '+5511777776666' });

    expect(response.status).toBe(200);
    expect(response.body.phone_number).toBe('+5511777776666');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /home/yurin/cfc/cfc-digital-backend
npm test -- tests/users.test.js
```

Expected: FAIL — `phone_number` is undefined in the response.

- [ ] **Step 3: Create migration 008**

Create `src/db/migrations/008_alter_users_add_phone.sql`:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
```

- [ ] **Step 4: Update `User.create()` in `src/models/User.js`**

Replace the `create` method signature and INSERT query:

```javascript
static async create(email, password, name, role, phoneNumber = null) {
  const validRoles = Object.values(USER_ROLES);
  if (!validRoles.includes(role)) {
    throw new BadRequestError(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  const existingUser = await query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );

  if (existingUser.rows.length > 0) {
    throw new ConflictError('Email already exists');
  }

  const passwordHash = await hashPassword(password);

  const result = await query(
    `INSERT INTO users (email, password_hash, name, role, phone_number)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, name, role, phone_number, created_at, updated_at`,
    [email, passwordHash, name, role, phoneNumber]
  );

  return result.rows[0];
}
```

- [ ] **Step 5: Add `phone_number` to all SELECT queries in `src/models/User.js`**

Replace `findById`:

```javascript
static async findById(id) {
  const result = await query(
    'SELECT id, email, name, role, phone_number, created_at, updated_at FROM users WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('User not found');
  }

  return result.rows[0];
}
```

Replace the UPDATE query in `update()` — change the RETURNING clause:

```javascript
const result = await query(
  `UPDATE users SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
   WHERE id = $${updateFields.length + 1}
   RETURNING id, email, name, role, phone_number, created_at, updated_at`,
  values
);
```

Also add `'phone_number'` to `allowedFields` in `update()`:

```javascript
const allowedFields = ['name', 'email', 'phone_number'];
```

Replace the SELECT in `list()`:

```javascript
static async list({ limit = 20, offset = 0 } = {}) {
  const [dataResult, countResult] = await Promise.all([
    query(
      'SELECT id, email, name, role, phone_number, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    ),
    query('SELECT COUNT(*) FROM users'),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

- [ ] **Step 6: Update `POST /` in `src/routes/users.js`**

Replace the handler:

```javascript
router.post('/', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  try {
    const { email, password, name, role, phone_number } = req.body;

    validateRequired(email, 'email');
    validateRequired(password, 'password');
    validateRequired(name, 'name');
    validateRequired(role, 'role');

    validateEmail(email);
    validatePassword(password);
    validateRole(role);

    const user = await User.create(email, password, name, role, phone_number ?? null);

    res.status(201).json(user);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message, statusCode });
  }
});
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
npm test -- tests/users.test.js
```

Expected: All tests PASS (including the 3 new phone_number tests).

- [ ] **Step 8: Commit**

```bash
git add src/db/migrations/008_alter_users_add_phone.sql src/models/User.js src/routes/users.js tests/users.test.js
git commit -m "feat: add phone_number to users — migration 008, model, route, tests"
```

---

## Task 2: Migrations 009–012

**Files:**
- Create: `src/db/migrations/009_create_notification_preferences.sql`
- Create: `src/db/migrations/010_create_notifications.sql`
- Create: `src/db/migrations/011_create_schedule_cancellations.sql`
- Create: `src/db/migrations/012_create_student_absences.sql`

Migrations run automatically on server startup via `src/db/init.js`. No code changes needed beyond creating the SQL files.

- [ ] **Step 1: Create migration 009**

Create `src/db/migrations/009_create_notification_preferences.sql`:

```sql
CREATE TABLE IF NOT EXISTS notification_preferences (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minutes_before   INT NOT NULL DEFAULT 15,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  in_app_enabled   BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);
```

- [ ] **Step 2: Create migration 010**

Create `src/db/migrations/010_create_notifications.sql`:

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL CHECK (type IN ('class_reminder', 'class_cancelled', 'absence_confirmed')),
  title       VARCHAR(255) NOT NULL,
  body        TEXT NOT NULL,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  class_date  DATE,
  read_at     TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(read_at) WHERE read_at IS NULL;
```

- [ ] **Step 3: Create migration 011**

Create `src/db/migrations/011_create_schedule_cancellations.sql`:

```sql
CREATE TABLE IF NOT EXISTS schedule_cancellations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id    UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  cancelled_date DATE NOT NULL,
  reason         TEXT,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, cancelled_date)
);

CREATE INDEX IF NOT EXISTS idx_schedule_cancellations_schedule_id ON schedule_cancellations(schedule_id);
```

- [ ] **Step 4: Create migration 012**

Create `src/db/migrations/012_create_student_absences.sql`:

```sql
CREATE TABLE IF NOT EXISTS student_absences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id  UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  absence_date DATE NOT NULL,
  status       VARCHAR(20) NOT NULL CHECK (status IN ('valid', 'late', 'no_show')),
  declared_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, schedule_id, absence_date)
);

CREATE INDEX IF NOT EXISTS idx_student_absences_student_id ON student_absences(student_id);
CREATE INDEX IF NOT EXISTS idx_student_absences_schedule_id ON student_absences(schedule_id);
```

- [ ] **Step 5: Verify migrations apply cleanly**

```bash
npm run dev
```

Expected: Server starts, logs show migrations 008–012 applied without errors.

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations/009_create_notification_preferences.sql src/db/migrations/010_create_notifications.sql src/db/migrations/011_create_schedule_cancellations.sql src/db/migrations/012_create_student_absences.sql
git commit -m "feat: add migrations 009-012 for notifications, cancellations, absences"
```

---

## Task 3: WhatsApp Utility

**Files:**
- Create: `src/utils/whatsapp.js`

- [ ] **Step 1: Create `src/utils/whatsapp.js`**

```javascript
import { logger } from './logger.js';

export async function sendWhatsApp(phoneNumber, message) {
  if (!process.env.ZAPI_INSTANCE_ID) return;

  const url = `${process.env.ZAPI_BASE_URL}/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-text`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneNumber, message }),
    });

    if (!response.ok) {
      logger.warn({ phone: phoneNumber, status: response.status }, 'WhatsApp send failed');
    }
  } catch (err) {
    logger.warn({ phone: phoneNumber, err }, 'WhatsApp send error');
  }
}
```

`ZAPI_INSTANCE_ID` unset → the function returns immediately. No HTTP call. No test stub needed — the tests never set this env var.

- [ ] **Step 2: Commit**

```bash
git add src/utils/whatsapp.js
git commit -m "feat: add WhatsApp utility (Z-API, no-op when ZAPI_INSTANCE_ID unset)"
```

---

## Task 4: NotificationPreference Model + Preferences Routes + Tests

**Files:**
- Create: `src/models/NotificationPreference.js`
- Create: `src/routes/notifications.js` (preferences endpoints only for now)
- Create: `tests/notifications.test.js` (preferences section only)

- [ ] **Step 1: Write the failing tests**

Create `tests/notifications.test.js`:

```javascript
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/notifications.test.js
```

Expected: FAIL — `Cannot find module '../src/routes/notifications.js'`

- [ ] **Step 3: Create `src/models/NotificationPreference.js`**

```javascript
import { query } from '../db/pool.js';
import { BadRequestError } from '../utils/errors.js';

export class NotificationPreference {
  static async findOrCreate(userId) {
    const existing = await query(
      'SELECT id, user_id, minutes_before, whatsapp_enabled, in_app_enabled, created_at, updated_at FROM notification_preferences WHERE user_id = $1',
      [userId]
    );

    if (existing.rows.length > 0) return existing.rows[0];

    const result = await query(
      `INSERT INTO notification_preferences (user_id)
       VALUES ($1)
       RETURNING id, user_id, minutes_before, whatsapp_enabled, in_app_enabled, created_at, updated_at`,
      [userId]
    );

    return result.rows[0];
  }

  static async update(userId, { minutes_before, whatsapp_enabled, in_app_enabled }) {
    if (minutes_before !== undefined && (minutes_before < 1 || minutes_before > 120)) {
      throw new BadRequestError('minutes_before must be between 1 and 120');
    }

    await NotificationPreference.findOrCreate(userId);

    const fields = [];
    const values = [];
    let idx = 1;

    if (minutes_before !== undefined) { fields.push(`minutes_before = $${idx++}`); values.push(minutes_before); }
    if (whatsapp_enabled !== undefined) { fields.push(`whatsapp_enabled = $${idx++}`); values.push(whatsapp_enabled); }
    if (in_app_enabled !== undefined) { fields.push(`in_app_enabled = $${idx++}`); values.push(in_app_enabled); }

    if (fields.length === 0) throw new BadRequestError('No valid fields to update');

    values.push(userId);
    const result = await query(
      `UPDATE notification_preferences SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $${idx}
       RETURNING id, user_id, minutes_before, whatsapp_enabled, in_app_enabled, created_at, updated_at`,
      values
    );

    return result.rows[0];
  }
}
```

- [ ] **Step 4: Create `src/routes/notifications.js`** (preferences endpoints only — notification list endpoints added in Task 5)

```javascript
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { NotificationPreference } from '../models/NotificationPreference.js';

const router = express.Router();

router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const prefs = await NotificationPreference.findOrCreate(req.user.userId);
    res.status(200).json(prefs);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

router.put('/preferences', authMiddleware, async (req, res) => {
  try {
    const { minutes_before, whatsapp_enabled, in_app_enabled } = req.body;
    const prefs = await NotificationPreference.update(req.user.userId, { minutes_before, whatsapp_enabled, in_app_enabled });
    res.status(200).json(prefs);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

export default router;
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- tests/notifications.test.js
```

Expected: All 6 preference tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/NotificationPreference.js src/routes/notifications.js tests/notifications.test.js
git commit -m "feat: add NotificationPreference model + GET/PUT /notifications/preferences"
```

---

## Task 5: Notification Model + List/Read Routes + Tests

**Files:**
- Create: `src/models/Notification.js`
- Modify: `src/routes/notifications.js` (add list + read endpoints)
- Modify: `tests/notifications.test.js` (add notification list + read tests)

- [ ] **Step 1: Write the failing tests**

Append these tests to `tests/notifications.test.js`:

```javascript
describe('Notification List and Read', () => {
  let app;
  let student;
  let otherStudent;
  let studentToken;
  let otherToken;

  beforeEach(async () => {
    app = createTestApp();
    student = await createTestUser('ns@example.com', 'password123', 'NS Student', USER_ROLES.STUDENT);
    otherStudent = await createTestUser('other@example.com', 'password123', 'Other', USER_ROLES.STUDENT);
    studentToken = getAuthToken(student.id, student.email, USER_ROLES.STUDENT);
    otherToken = getAuthToken(otherStudent.id, otherStudent.email, USER_ROLES.STUDENT);
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
    await Notification.create(student.id, 'class_reminder', 'Lembrete', 'Sua aula começa em 15 min', null, null);
    await Notification.create(student.id, 'class_cancelled', 'Cancelada', 'Aula cancelada', null, null);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.meta.total).toBe(2);
  });

  test('GET /notifications does not return other users notifications', async () => {
    const { Notification } = await import('../src/models/Notification.js');
    await Notification.create(otherStudent.id, 'class_reminder', 'Lembrete', 'Não é seu', null, null);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  test('GET /notifications/unread-count returns correct count', async () => {
    const { Notification } = await import('../src/models/Notification.js');
    await Notification.create(student.id, 'class_reminder', 'T1', 'B1', null, null);
    await Notification.create(student.id, 'class_reminder', 'T2', 'B2', null, null);

    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  test('PUT /notifications/:id/read marks notification as read', async () => {
    const { Notification } = await import('../src/models/Notification.js');
    const notif = await Notification.create(student.id, 'class_reminder', 'T', 'B', null, null);

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
    const notif = await Notification.create(otherStudent.id, 'class_reminder', 'T', 'B', null, null);

    const res = await request(app)
      .put(`/api/notifications/${notif.id}/read`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  test('PUT /notifications/read-all marks all as read', async () => {
    const { Notification } = await import('../src/models/Notification.js');
    await Notification.create(student.id, 'class_reminder', 'T1', 'B1', null, null);
    await Notification.create(student.id, 'class_cancelled', 'T2', 'B2', null, null);

    await request(app)
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${studentToken}`);

    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.body.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/notifications.test.js
```

Expected: FAIL — `Cannot find module '../src/models/Notification.js'`

- [ ] **Step 3: Create `src/models/Notification.js`**

```javascript
import { query } from '../db/pool.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export class Notification {
  static async create(userId, type, title, body, scheduleId, classDate) {
    const result = await query(
      `INSERT INTO notifications (user_id, type, title, body, schedule_id, class_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, type, title, body, schedule_id, class_date, read_at, created_at`,
      [userId, type, title, body, scheduleId, classDate]
    );
    return result.rows[0];
  }

  static async findByUser(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT id, user_id, type, title, body, schedule_id, class_date, read_at, created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      query('SELECT COUNT(*) FROM notifications WHERE user_id = $1', [userId]),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  static async markRead(id, userId) {
    const existing = await query(
      'SELECT id, user_id FROM notifications WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) throw new NotFoundError('Notification not found');
    if (existing.rows[0].user_id !== userId) throw new ForbiddenError('Forbidden');

    const result = await query(
      `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, user_id, type, title, body, schedule_id, class_date, read_at, created_at`,
      [id]
    );
    return result.rows[0];
  }

  static async markAllRead(userId) {
    await query(
      'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    );
  }

  static async countUnread(userId) {
    const result = await query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  static async dedupeExists(userId, scheduleId, classDate, type) {
    const result = await query(
      'SELECT 1 FROM notifications WHERE user_id = $1 AND schedule_id = $2 AND class_date = $3 AND type = $4',
      [userId, scheduleId, classDate, type]
    );
    return result.rows.length > 0;
  }
}
```

> **Note:** `ForbiddenError` may not exist in `src/utils/errors.js` yet. Check it and add if missing (see step below).

- [ ] **Step 4: Verify or add `ForbiddenError` to `src/utils/errors.js`**

```bash
grep -n "ForbiddenError" /home/yurin/cfc/cfc-digital-backend/src/utils/errors.js
```

If not found, open `src/utils/errors.js` and append:

```javascript
export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.statusCode = 403;
  }
}
```

- [ ] **Step 5: Add notification list + read endpoints to `src/routes/notifications.js`**

Add these routes BEFORE `export default router` (note: `read-all` must be before `/:id/read` to avoid the wildcard capturing it):

```javascript
import { Notification } from '../models/Notification.js';
import { paginate, paginatedResponse } from '../utils/paginate.js';
```

Add at the top of the file (alongside the existing import of `NotificationPreference`):

```javascript
import { Notification } from '../models/Notification.js';
import { paginate, paginatedResponse } from '../utils/paginate.js';
```

Add routes before `export default router`:

```javascript
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = await Notification.countUnread(req.user.userId);
    res.status(200).json({ count });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page, limit } = paginate(req);
    const { rows, total } = await Notification.findByUser(req.user.userId, { page, limit });
    res.status(200).json(paginatedResponse(rows, total, { page, limit }));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    await Notification.markAllRead(req.user.userId);
    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notif = await Notification.markRead(req.params.id, req.user.userId);
    res.status(200).json(notif);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});
```

The full route order in the file is: `GET /preferences`, `PUT /preferences`, `GET /unread-count`, `GET /`, `PUT /read-all`, `PUT /:id/read`.

- [ ] **Step 6: Run all notification tests**

```bash
npm test -- tests/notifications.test.js
```

Expected: All tests PASS (preferences + list/read).

- [ ] **Step 7: Commit**

```bash
git add src/models/Notification.js src/routes/notifications.js src/utils/errors.js tests/notifications.test.js
git commit -m "feat: add Notification model + list/read/unread-count endpoints"
```

---

## Task 6: ScheduleCancellation Model + Routes + Tests

**Files:**
- Create: `src/models/ScheduleCancellation.js`
- Modify: `src/routes/schedules.js`
- Create: `tests/schedule-cancellations.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/schedule-cancellations.test.js`:

```javascript
import express from 'express';
import request from 'supertest';
import { createTestUser, getAuthToken } from './helpers.js';
import schedulesRouter from '../src/routes/schedules.js';
import { Class } from '../src/models/Class.js';
import { Schedule } from '../src/models/Schedule.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { Notification } from '../src/models/Notification.js';
import { USER_ROLES } from '../src/constants.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/schedules', schedulesRouter);
  return app;
};

describe('Schedule Cancellations', () => {
  let app;
  let admin;
  let instructor;
  let student;
  let adminToken;
  let instructorToken;
  let studentToken;
  let cls;
  let schedule;

  beforeEach(async () => {
    app = createTestApp();
    admin = await createTestUser('admin@example.com', 'password123', 'Admin', USER_ROLES.ADMIN);
    instructor = await createTestUser('instructor@example.com', 'password123', 'Instructor', USER_ROLES.INSTRUCTOR);
    student = await createTestUser('student@example.com', 'password123', 'Student', USER_ROLES.STUDENT);
    adminToken = getAuthToken(admin.id, admin.email, USER_ROLES.ADMIN);
    instructorToken = getAuthToken(instructor.id, instructor.email, USER_ROLES.INSTRUCTOR);
    studentToken = getAuthToken(student.id, student.email, USER_ROLES.STUDENT);
    cls = await Class.create('Math', null, instructor.id);
    schedule = await Schedule.create(cls.id, 'Monday', '09:00', '10:00');
    await Enrollment.create(student.id, cls.id);
  });

  test('instructor can cancel own class', async () => {
    const res = await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: '2026-06-10', reason: 'Feriado' });

    expect(res.status).toBe(201);
    expect(res.body.cancelled_date).toBe('2026-06-10');
    expect(res.body.reason).toBe('Feriado');
  });

  test('admin can cancel any class', async () => {
    const res = await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: '2026-06-11', reason: 'Emergência' });

    expect(res.status).toBe(201);
  });

  test('student cannot cancel a class', async () => {
    const res = await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ date: '2026-06-10', reason: 'Test' });

    expect(res.status).toBe(403);
  });

  test('duplicate cancellation returns 409', async () => {
    await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: '2026-06-10', reason: 'First' });

    const res = await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: '2026-06-10', reason: 'Duplicate' });

    expect(res.status).toBe(409);
  });

  test('cancellation creates notification for enrolled student', async () => {
    await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: '2026-06-10', reason: 'Teste' });

    const notif = await Notification.findByUser(student.id);
    expect(notif.total).toBe(1);
    expect(notif.rows[0].type).toBe('class_cancelled');
  });

  test('cancellation creates notification for instructor', async () => {
    await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: '2026-06-10', reason: 'Admin cancel' });

    const notif = await Notification.findByUser(instructor.id);
    expect(notif.total).toBe(1);
    expect(notif.rows[0].type).toBe('class_cancelled');
  });

  test('GET /:id/cancellations lists cancelled dates', async () => {
    await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: '2026-06-10', reason: 'Test' });

    const res = await request(app)
      .get(`/api/schedules/${schedule.id}/cancellations`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].cancelled_date).toBe('2026-06-10');
  });

  test('DELETE /:id/cancel/:date removes cancellation', async () => {
    await request(app)
      .post(`/api/schedules/${schedule.id}/cancel`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: '2026-06-10', reason: 'Test' });

    const res = await request(app)
      .delete(`/api/schedules/${schedule.id}/cancel/2026-06-10`)
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(res.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/schedules/${schedule.id}/cancellations`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(listRes.body.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/schedule-cancellations.test.js
```

Expected: FAIL — cancel route does not exist yet.

- [ ] **Step 3: Create `src/models/ScheduleCancellation.js`**

```javascript
import { query } from '../db/pool.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

export class ScheduleCancellation {
  static async create(scheduleId, date, reason, createdBy) {
    const duplicate = await query(
      'SELECT 1 FROM schedule_cancellations WHERE schedule_id = $1 AND cancelled_date = $2',
      [scheduleId, date]
    );
    if (duplicate.rows.length > 0) throw new ConflictError('Class already cancelled on this date');

    const result = await query(
      `INSERT INTO schedule_cancellations (schedule_id, cancelled_date, reason, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, schedule_id, cancelled_date, reason, created_by, created_at`,
      [scheduleId, date, reason ?? null, createdBy]
    );
    return result.rows[0];
  }

  static async delete(scheduleId, date) {
    const result = await query(
      'DELETE FROM schedule_cancellations WHERE schedule_id = $1 AND cancelled_date = $2',
      [scheduleId, date]
    );
    if (result.rowCount === 0) throw new NotFoundError('Cancellation not found');
  }

  static async findBySchedule(scheduleId) {
    const result = await query(
      `SELECT id, schedule_id, cancelled_date, reason, created_by, created_at
       FROM schedule_cancellations
       WHERE schedule_id = $1
       ORDER BY cancelled_date DESC`,
      [scheduleId]
    );
    return result.rows;
  }

  static async existsForDate(scheduleId, date) {
    const result = await query(
      'SELECT 1 FROM schedule_cancellations WHERE schedule_id = $1 AND cancelled_date = $2',
      [scheduleId, date]
    );
    return result.rows.length > 0;
  }
}
```

- [ ] **Step 4: Add cancel + cancellations routes to `src/routes/schedules.js`**

Add imports at the top of the file:

```javascript
import { ScheduleCancellation } from '../models/ScheduleCancellation.js';
import { Notification } from '../models/Notification.js';
import { sendWhatsApp } from '../utils/whatsapp.js';
import { query } from '../db/pool.js';
```

Add these routes before `export default router` (after all existing routes):

```javascript
router.post('/:id/cancel', authMiddleware, requireRole(USER_ROLES.INSTRUCTOR, USER_ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const { date, reason } = req.body;
    const { userId, role } = req.user;

    if (!date) return res.status(400).json({ error: 'date is required', statusCode: 400 });

    const schedule = await Schedule.findById(id);
    const cls = await query(
      'SELECT id, name, instructor_id FROM classes WHERE id = $1',
      [schedule.class_id]
    );
    const classRow = cls.rows[0];

    if (role === USER_ROLES.INSTRUCTOR && classRow.instructor_id !== userId) {
      return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
    }

    const cancellation = await ScheduleCancellation.create(id, date, reason, userId);

    const usersResult = await query(
      `SELECT u.id, u.name, u.phone_number,
              COALESCE(np.whatsapp_enabled, false) AS whatsapp_enabled
       FROM enrollments e
       JOIN users u ON e.student_id = u.id
       LEFT JOIN notification_preferences np ON np.user_id = u.id
       WHERE e.class_id = $1
       UNION
       SELECT u.id, u.name, u.phone_number,
              COALESCE(np.whatsapp_enabled, false) AS whatsapp_enabled
       FROM users u
       LEFT JOIN notification_preferences np ON np.user_id = u.id
       WHERE u.id = $2`,
      [classRow.id, classRow.instructor_id]
    );

    for (const user of usersResult.rows) {
      await Notification.create(
        user.id,
        'class_cancelled',
        `Aula cancelada: ${classRow.name}`,
        reason ? `A aula foi cancelada. Motivo: ${reason}` : 'A aula foi cancelada.',
        id,
        date
      );
      if (user.phone_number && user.whatsapp_enabled) {
        const msg = `Olá ${user.name}! 📢\n\nA sua aula de ${classRow.name} de hoje foi cancelada.\n\n${reason ?? ''}`;
        await sendWhatsApp(user.phone_number, msg);
      }
    }

    res.status(201).json(cancellation);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

router.delete('/:id/cancel/:date', authMiddleware, requireRole(USER_ROLES.INSTRUCTOR, USER_ROLES.ADMIN), async (req, res) => {
  try {
    const { id, date } = req.params;
    const { userId, role } = req.user;

    const schedule = await Schedule.findById(id);
    const cls = await query('SELECT instructor_id FROM classes WHERE id = $1', [schedule.class_id]);

    if (role === USER_ROLES.INSTRUCTOR && cls.rows[0].instructor_id !== userId) {
      return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
    }

    await ScheduleCancellation.delete(id, date);
    res.status(200).json({ message: 'Cancellation removed' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

router.get('/:id/cancellations', authMiddleware, async (req, res) => {
  try {
    const cancellations = await ScheduleCancellation.findBySchedule(req.params.id);
    res.status(200).json(cancellations);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});
```

- [ ] **Step 5: Verify that `requireRole` accepts multiple roles**

```bash
grep -n "requireRole" /home/yurin/cfc/cfc-digital-backend/src/middleware/roleCheck.js
```

Expected: `requireRole` should accept rest params or an array. If it only accepts a single role, update it:

```javascript
export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
  }
  next();
};
```

- [ ] **Step 6: Run tests**

```bash
npm test -- tests/schedule-cancellations.test.js
```

Expected: All 8 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/models/ScheduleCancellation.js src/routes/schedules.js tests/schedule-cancellations.test.js
git commit -m "feat: add schedule cancellations with notifications"
```

---

## Task 7: StudentAbsence Model + Routes + Tests

**Files:**
- Create: `src/models/StudentAbsence.js`
- Modify: `src/routes/schedules.js` (add absence endpoints)
- Modify: `src/routes/attendance.js` (call setNoShow on validate)
- Create: `tests/student-absences.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/student-absences.test.js`:

```javascript
import express from 'express';
import request from 'supertest';
import { createTestUser, getAuthToken } from './helpers.js';
import schedulesRouter from '../src/routes/schedules.js';
import attendanceRouter from '../src/routes/attendance.js';
import { Class } from '../src/models/Class.js';
import { Schedule } from '../src/models/Schedule.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { USER_ROLES } from '../src/constants.js';
import { query } from '../src/db/pool.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/schedules', schedulesRouter);
  app.use('/api/attendance', attendanceRouter);
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

function todayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

describe('Student Absences', () => {
  let app;
  let admin;
  let instructor;
  let student;
  let otherStudent;
  let adminToken;
  let instructorToken;
  let studentToken;
  let otherToken;
  let cls;
  let scheduleWithFutureClass;
  let scheduleWithImmediateClass;

  beforeEach(async () => {
    app = createTestApp();
    admin = await createTestUser('admin@example.com', 'password123', 'Admin', USER_ROLES.ADMIN);
    instructor = await createTestUser('instructor@example.com', 'password123', 'Instructor', USER_ROLES.INSTRUCTOR);
    student = await createTestUser('student@example.com', 'password123', 'Student', USER_ROLES.STUDENT);
    otherStudent = await createTestUser('other@example.com', 'password123', 'Other', USER_ROLES.STUDENT);
    adminToken = getAuthToken(admin.id, admin.email, USER_ROLES.ADMIN);
    instructorToken = getAuthToken(instructor.id, instructor.email, USER_ROLES.INSTRUCTOR);
    studentToken = getAuthToken(student.id, student.email, USER_ROLES.STUDENT);
    otherToken = getAuthToken(otherStudent.id, otherStudent.email, USER_ROLES.STUDENT);
    cls = await Class.create('Math', null, instructor.id);
    scheduleWithFutureClass = await Schedule.create(cls.id, todayDayOfWeek(), getSaoPauloTime(120), getSaoPauloTime(180));
    scheduleWithImmediateClass = await Schedule.create(cls.id, todayDayOfWeek(), getSaoPauloTime(10), getSaoPauloTime(70));
    await Enrollment.create(student.id, cls.id);
  });

  test('student declares absence >= 1h before class → status valid, charged false', async () => {
    const res = await request(app)
      .post(`/api/schedules/${scheduleWithFutureClass.id}/absence`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ date: todayDate() });

    expect(res.status).toBe(201);
    expect(res.body.absence.status).toBe('valid');
    expect(res.body.charged).toBe(false);
  });

  test('student declares absence < 1h before class → status late, charged true', async () => {
    const res = await request(app)
      .post(`/api/schedules/${scheduleWithImmediateClass.id}/absence`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ date: todayDate() });

    expect(res.status).toBe(201);
    expect(res.body.absence.status).toBe('late');
    expect(res.body.charged).toBe(true);
  });

  test('duplicate absence returns 409', async () => {
    await request(app)
      .post(`/api/schedules/${scheduleWithFutureClass.id}/absence`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ date: todayDate() });

    const res = await request(app)
      .post(`/api/schedules/${scheduleWithFutureClass.id}/absence`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ date: todayDate() });

    expect(res.status).toBe(409);
  });

  test('student cannot declare absence for a class they are not enrolled in', async () => {
    const res = await request(app)
      .post(`/api/schedules/${scheduleWithFutureClass.id}/absence`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ date: todayDate() });

    expect(res.status).toBe(403);
  });

  test('student cannot declare absence for another student', async () => {
    const res = await request(app)
      .post(`/api/schedules/${scheduleWithFutureClass.id}/absence`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ date: todayDate(), student_id: student.id });

    expect(res.status).toBe(403);
  });

  test('instructor can view absences for a schedule', async () => {
    await request(app)
      .post(`/api/schedules/${scheduleWithFutureClass.id}/absence`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ date: todayDate() });

    const res = await request(app)
      .get(`/api/schedules/${scheduleWithFutureClass.id}/absences?date=${todayDate()}`)
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].student_id).toBe(student.id);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/student-absences.test.js
```

Expected: FAIL — absence route does not exist yet.

- [ ] **Step 3: Create `src/models/StudentAbsence.js`**

```javascript
import { query } from '../db/pool.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';

export class StudentAbsence {
  static async declare(studentId, scheduleId, absenceDate) {
    const schedResult = await query(
      'SELECT start_time FROM schedules WHERE id = $1',
      [scheduleId]
    );
    if (schedResult.rows.length === 0) throw new NotFoundError('Schedule not found');

    const startTime = schedResult.rows[0].start_time;

    const minutesUntil = await query(
      `SELECT EXTRACT(EPOCH FROM (
         ($1::DATE + $2::TIME) AT TIME ZONE 'America/Sao_Paulo' - NOW()
       )) / 60 AS minutes_until`,
      [absenceDate, startTime]
    );

    const minutes = parseFloat(minutesUntil.rows[0].minutes_until);
    const status = minutes > 60 ? 'valid' : 'late';

    try {
      const result = await query(
        `INSERT INTO student_absences (student_id, schedule_id, absence_date, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id, student_id, schedule_id, absence_date, status, declared_at`,
        [studentId, scheduleId, absenceDate, status]
      );
      return { absence: result.rows[0], charged: status !== 'valid' };
    } catch (err) {
      if (err.code === '23505') throw new ConflictError('Absence already declared for this date');
      throw err;
    }
  }

  static async findBySchedule(scheduleId, date = null) {
    const params = [scheduleId];
    const dateFilter = date ? ` AND sa.absence_date = $${params.push(date)}` : '';

    const result = await query(
      `SELECT sa.id, sa.student_id, sa.schedule_id, sa.absence_date, sa.status, sa.declared_at,
              u.name AS student_name
       FROM student_absences sa
       JOIN users u ON sa.student_id = u.id
       WHERE sa.schedule_id = $1${dateFilter}
       ORDER BY sa.declared_at DESC`,
      params
    );
    return result.rows;
  }

  static async findByStudent(studentId) {
    const result = await query(
      `SELECT sa.id, sa.student_id, sa.schedule_id, sa.absence_date, sa.status, sa.declared_at
       FROM student_absences sa
       WHERE sa.student_id = $1
       ORDER BY sa.absence_date DESC`,
      [studentId]
    );
    return result.rows;
  }

  static async setNoShow(studentId, scheduleId, absenceDate) {
    await query(
      `INSERT INTO student_absences (student_id, schedule_id, absence_date, status)
       VALUES ($1, $2, $3, 'no_show')
       ON CONFLICT (student_id, schedule_id, absence_date) DO NOTHING`,
      [studentId, scheduleId, absenceDate]
    );
  }
}
```

- [ ] **Step 4: Add absence routes to `src/routes/schedules.js`**

Add import at the top:

```javascript
import { StudentAbsence } from '../models/StudentAbsence.js';
```

Add routes before `export default router`:

```javascript
router.post('/:id/absence', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;
    const { userId, role } = req.user;

    if (role !== USER_ROLES.STUDENT) {
      return res.status(403).json({ error: 'Only students can declare absences', statusCode: 403 });
    }

    if (!date) return res.status(400).json({ error: 'date is required', statusCode: 400 });

    const schedule = await Schedule.findById(id);
    const enrollment = await query(
      'SELECT 1 FROM enrollments WHERE student_id = $1 AND class_id = $2',
      [userId, schedule.class_id]
    );
    if (enrollment.rows.length === 0) {
      return res.status(403).json({ error: 'Not enrolled in this class', statusCode: 403 });
    }

    const result = await StudentAbsence.declare(userId, id, date);

    const classRow = await query('SELECT name FROM classes WHERE id = $1', [schedule.class_id]);
    const className = classRow.rows[0].name;

    await Notification.create(
      userId,
      'absence_confirmed',
      `Ausência registada: ${className}`,
      result.absence.status === 'valid'
        ? `Ausência registada com sucesso para ${date}.`
        : `Ausência registada para ${date}, mas a aula será cobrada (declarada com menos de 1 hora de antecedência).`,
      id,
      date
    );

    const user = await query('SELECT phone_number FROM users WHERE id = $1', [userId]);
    const prefs = await query(
      'SELECT whatsapp_enabled FROM notification_preferences WHERE user_id = $1',
      [userId]
    );
    const whatsappEnabled = prefs.rows[0]?.whatsapp_enabled ?? false;
    const phone = user.rows[0]?.phone_number;

    if (phone && whatsappEnabled) {
      const msg = result.absence.status === 'valid'
        ? `Olá! ✅\n\nA sua ausência na aula de ${className} em ${date} foi registada com sucesso.\n\nAté a próxima! 👋`
        : `Olá! ⚠️\n\nA sua ausência foi registada, mas como falta menos de 1 hora para a aula de ${className}, a aula será cobrada mesmo assim.\n\nEm caso de dúvida, contacte o seu instrutor.`;
      await sendWhatsApp(phone, msg);
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

router.get('/:id/absences', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const absences = await StudentAbsence.findBySchedule(req.params.id, req.query.date ?? null);
    res.status(200).json(absences);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});
```

- [ ] **Step 5: Update `PUT /:id/validate` in `src/routes/attendance.js` to set no_show**

Add imports at the top of `src/routes/attendance.js`:

```javascript
import { StudentAbsence } from '../models/StudentAbsence.js';
```

Replace the validate handler:

```javascript
router.put('/:id/validate', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  try {
    const record = await AttendanceRecord.validate(req.params.id, req.user.userId);
    await StudentAbsence.setNoShow(record.student_id, record.schedule_id, record.attendance_date);
    res.status(200).json(record);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});
```

- [ ] **Step 6: Run tests**

```bash
npm test -- tests/student-absences.test.js
```

Expected: All 6 tests PASS.

- [ ] **Step 7: Run existing attendance tests to confirm no regression**

```bash
npm test -- tests/attendance.test.js
```

Expected: All existing attendance tests still PASS.

- [ ] **Step 8: Commit**

```bash
git add src/models/StudentAbsence.js src/routes/schedules.js src/routes/attendance.js tests/student-absences.test.js
git commit -m "feat: add student absence declarations and no_show tracking"
```

---

## Task 8: Cron Route + Tests

**Files:**
- Create: `src/routes/cron.js`
- Create: `tests/cron.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/cron.test.js`:

```javascript
import express from 'express';
import request from 'supertest';
import { createTestUser, getAuthToken } from './helpers.js';
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
    expect(res.body.skipped).toBeGreaterThanOrEqual(1);
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/cron.test.js
```

Expected: FAIL — `Cannot find module '../src/routes/cron.js'`

- [ ] **Step 3: Create `src/routes/cron.js`**

```javascript
import express from 'express';
import { query } from '../db/pool.js';
import { Notification } from '../models/Notification.js';
import { sendWhatsApp } from '../utils/whatsapp.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.post('/send-reminders', async (req, res) => {
  const secret = req.headers.authorization?.replace('Bearer ', '');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized', statusCode: 401 });
  }

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const result = await query(`
      WITH user_prefs AS (
        SELECT
          u.id AS user_id, u.name, u.phone_number,
          COALESCE(np.minutes_before, 15) AS minutes_before,
          COALESCE(np.whatsapp_enabled, false) AS whatsapp_enabled,
          COALESCE(np.in_app_enabled, true) AS in_app_enabled
        FROM users u
        LEFT JOIN notification_preferences np ON np.user_id = u.id
      )
      SELECT
        up.user_id, up.name, up.phone_number,
        up.whatsapp_enabled, up.in_app_enabled,
        s.id AS schedule_id, s.start_time,
        c.name AS class_name,
        CURRENT_DATE AS class_date,
        up.minutes_before
      FROM schedules s
      JOIN classes c ON s.class_id = c.id
      JOIN enrollments e ON e.class_id = c.id
      JOIN user_prefs up ON up.user_id = e.student_id
      WHERE
        TRIM(s.day_of_week) = TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'Day')
        AND ABS(EXTRACT(EPOCH FROM (
          s.start_time - (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME
        )) / 60 - up.minutes_before) < 1
        AND NOT EXISTS (
          SELECT 1 FROM schedule_cancellations sc
          WHERE sc.schedule_id = s.id AND sc.cancelled_date = CURRENT_DATE
        )
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = up.user_id
            AND n.schedule_id = s.id
            AND n.class_date = CURRENT_DATE
            AND n.type = 'class_reminder'
        )

      UNION ALL

      SELECT
        up.user_id, up.name, up.phone_number,
        up.whatsapp_enabled, up.in_app_enabled,
        s.id, s.start_time,
        c.name,
        CURRENT_DATE,
        up.minutes_before
      FROM schedules s
      JOIN classes c ON s.class_id = c.id
      JOIN user_prefs up ON up.user_id = c.instructor_id
      WHERE
        TRIM(s.day_of_week) = TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'Day')
        AND ABS(EXTRACT(EPOCH FROM (
          s.start_time - (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME
        )) / 60 - up.minutes_before) < 1
        AND NOT EXISTS (
          SELECT 1 FROM schedule_cancellations sc
          WHERE sc.schedule_id = s.id AND sc.cancelled_date = CURRENT_DATE
        )
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = up.user_id
            AND n.schedule_id = s.id
            AND n.class_date = CURRENT_DATE
            AND n.type = 'class_reminder'
        )
    `);

    for (const row of result.rows) {
      try {
        const alreadySent = await Notification.dedupeExists(
          row.user_id, row.schedule_id, row.class_date, 'class_reminder'
        );

        if (alreadySent) { skipped++; continue; }

        if (row.in_app_enabled) {
          const startStr = String(row.start_time).slice(0, 5);
          await Notification.create(
            row.user_id,
            'class_reminder',
            `Lembrete: ${row.class_name}`,
            `A sua aula de ${row.class_name} começa em ${row.minutes_before} minutos (${startStr}).`,
            row.schedule_id,
            row.class_date
          );
          sent++;
        } else {
          skipped++;
        }

        if (row.phone_number && row.whatsapp_enabled) {
          const msg = `Olá ${row.name}! 👋\n\nA sua aula de ${row.class_name} começa em ${row.minutes_before} minutos.\n\nBoa aula! 🎓`;
          await sendWhatsApp(row.phone_number, msg);
        }
      } catch (err) {
        logger.error({ userId: row.user_id, err }, 'Error sending reminder');
        errors++;
      }
    }

    logger.info({ sent, skipped, errors }, 'Cron send-reminders complete');
    res.status(200).json({ sent, skipped, errors });
  } catch (err) {
    logger.error({ err }, 'Cron send-reminders failed');
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/cron.test.js
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/cron.js tests/cron.test.js
git commit -m "feat: add cron send-reminders endpoint with deduplication"
```

---

## Task 9: Wire Up — Mount Routers + vercel.json + .env.example

**Files:**
- Modify: `src/routes/index.js`
- Modify: `vercel.json`
- Modify: `.env.example`

- [ ] **Step 1: Mount new routers in `src/routes/index.js`**

Replace the full file:

```javascript
import authRouter from './auth.js';
import userRouter from './users.js';
import classRouter from './classes.js';
import scheduleRouter from './schedules.js';
import enrollmentRouter from './enrollments.js';
import assignmentsRouter from './assignments.js';
import gradesRouter from './grades.js';
import attendanceRouter from './attendance.js';
import notificationsRouter from './notifications.js';
import cronRouter from './cron.js';

export const mountRoutes = (app) => {
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/classes', classRouter);
  app.use('/api/schedules', scheduleRouter);
  app.use('/api/enrollments', enrollmentRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/grades', gradesRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/cron', cronRouter);
};
```

- [ ] **Step 2: Update `vercel.json`**

Replace the full file:

```json
{
  "buildCommand": "npm install",
  "env": {
    "DATABASE_URL": "@database_url",
    "JWT_SECRET": "@jwt_secret"
  },
  "crons": [
    {
      "path": "/api/cron/send-reminders",
      "schedule": "* * * * *"
    }
  ]
}
```

- [ ] **Step 3: Update `.env.example`**

Append to `.env.example`:

```
CRON_SECRET=change-me-in-production
ZAPI_INSTANCE_ID=
ZAPI_TOKEN=
ZAPI_BASE_URL=https://api.z-api.io/instances
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/index.js vercel.json .env.example
git commit -m "feat: mount notifications + cron routers, add vercel cron config and env vars"
```

---

## Task 10: Full Regression

- [ ] **Step 1: Run the complete test suite**

```bash
cd /home/yurin/cfc/cfc-digital-backend
npm test
```

Expected: All tests pass. The new tests (~93 new: 3 users + 13 notifications + 8 cancellations + 6 absences + 7 cron) all green, zero regressions.

- [ ] **Step 2: Run with coverage**

```bash
npm test -- --coverage
```

Expected: 95%+ coverage on all new files.

- [ ] **Step 3: Start dev server and verify migrations applied**

```bash
npm run dev
```

Expected: Server starts. Logs show migrations 008–012 applied. No errors.

- [ ] **Step 4: Smoke test new endpoints**

```bash
# login first to get a token
curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"yourpassword"}' | jq .token

# use token from above
TOKEN=<paste-token>

curl -s http://localhost:3001/api/notifications/preferences \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: { minutes_before: 15, whatsapp_enabled: false, in_app_enabled: true, ... }

curl -s http://localhost:3001/api/notifications/unread-count \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: { count: 0 }

curl -s -X POST http://localhost:3001/api/cron/send-reminders \
  -H "Authorization: Bearer $CRON_SECRET"
# Expected: { sent: 0, skipped: 0, errors: 0 }  (no classes scheduled right now)
```

---

## Success Criteria

- [ ] Migrations 008–012 apply cleanly on a fresh DB
- [ ] `phone_number` accepted on POST and PUT `/api/users`, returned in responses
- [ ] GET `/api/notifications/preferences` creates defaults lazily
- [ ] PUT `/api/notifications/preferences` rejects `minutes_before` outside 1–120
- [ ] Cron fires every minute per `vercel.json`, protected by `CRON_SECRET`
- [ ] No duplicate reminders (idempotent cron — dedup on `user_id + schedule_id + class_date + type`)
- [ ] Cancelled classes suppressed from cron query AND students notified on cancellation
- [ ] Student absence 1-hour rule enforced server-side (SQL computes minutes until class)
- [ ] `no_show` inserted on attendance validation when no prior valid/late absence
- [ ] WhatsApp sends only when `phone_number` is set AND `whatsapp_enabled = true`
- [ ] WhatsApp failure (or missing `ZAPI_INSTANCE_ID`) never crashes any endpoint
- [ ] All new tests green, all existing tests unaffected
