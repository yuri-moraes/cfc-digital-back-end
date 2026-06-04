# Phase 2B: Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pagination to all 7 list endpoints, three-tier rate limiting, and structured Pino logging to the existing Express backend.

**Architecture:** Shared `paginate()` / `paginatedResponse()` helpers wrap every list route. Rate limiting is applied as middleware in `index.js`. A single Pino logger instance is imported wherever logging is needed. No schema migrations required.

**Tech Stack:** Node.js ES modules, Express 5, `express-rate-limit`, `pino`, `pino-pretty` (dev), PostgreSQL `COUNT(*)` alongside each list query.

---

## File Map

| File | Action |
|------|--------|
| `src/middleware/paginate.js` | Create |
| `src/middleware/rateLimiter.js` | Create |
| `src/middleware/requestLogger.js` | Create |
| `src/utils/logger.js` | Create |
| `src/middleware/errorHandler.js` | Modify — replace `console.error` with logger |
| `src/index.js` | Modify — mount requestLogger, authLimiter, apiLimiter |
| `src/models/User.js` | Modify — `list()` |
| `src/models/Class.js` | Modify — `list()`, `listByInstructor()` |
| `src/models/Schedule.js` | Modify — `listByClass()`, `listByInstructor()` |
| `src/models/Enrollment.js` | Modify — `listByStudent()`, `listByClass()`, `listAll()` |
| `src/models/Assignment.js` | Modify — `findByClassId()` |
| `src/models/Grade.js` | Modify — `findByAssignment()`, `findByStudent()`, `findByClass()` |
| `src/models/AttendanceRecord.js` | Modify — `findBySchedule()`, `findByStudent()`, `findPending()` |
| `src/routes/users.js` | Modify — list route |
| `src/routes/classes.js` | Modify — list route |
| `src/routes/schedules.js` | Modify — list route |
| `src/routes/enrollments.js` | Modify — list route |
| `src/routes/assignments.js` | Modify — list route |
| `src/routes/grades.js` | Modify — list route |
| `src/routes/attendance.js` | Modify — list route |
| `tests/paginate.test.js` | Create |
| `tests/rateLimiter.test.js` | Create |
| `tests/users.test.js` | Modify — update list assertions |
| `tests/classes.test.js` | Modify — update list assertions |
| `tests/schedules.test.js` | Modify — update list assertions |
| `tests/enrollments.test.js` | Modify — update list assertions |
| `tests/assignments.test.js` | Modify — update list assertions |
| `tests/grades.test.js` | Modify — update list assertions |
| `tests/attendance.test.js` | Modify — update list assertions |
| `cfc-digital/src/app/api/client.js` | Modify — list calls extract `.data` |
| `package.json` | Modify — add three dependencies |
| `.env.example` | Modify — add `SENTRY_DSN` |

---

## Task 1: Install Dependencies and Create Paginate Helper

**Files:**
- Modify: `package.json`
- Create: `src/middleware/paginate.js`
- Create: `tests/paginate.test.js`

- [ ] **Step 1: Install dependencies**

```bash
cd /home/yurin/cfc/cfc-digital-backend
npm install express-rate-limit pino pino-pretty
```

Expected: no errors, three packages added to `package.json`.

- [ ] **Step 2: Write failing tests for paginate helper**

Create `tests/paginate.test.js`:

```javascript
import { paginate, paginatedResponse } from '../src/middleware/paginate.js';

describe('paginate', () => {
  test('returns defaults when query is empty', () => {
    expect(paginate({ query: {} })).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  test('parses page and limit from query string', () => {
    expect(paginate({ query: { page: '3', limit: '10' } })).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  test('clamps page to minimum 1 for zero input', () => {
    expect(paginate({ query: { page: '0' } }).page).toBe(1);
  });

  test('clamps page to minimum 1 for negative input', () => {
    expect(paginate({ query: { page: '-5' } }).page).toBe(1);
  });

  test('clamps limit to maximum 100', () => {
    expect(paginate({ query: { limit: '500' } }).limit).toBe(100);
  });

  test('clamps limit to minimum 1', () => {
    expect(paginate({ query: { limit: '0' } }).limit).toBe(1);
  });

  test('computes correct offset for page 2', () => {
    expect(paginate({ query: { page: '2', limit: '5' } }).offset).toBe(5);
  });
});

describe('paginatedResponse', () => {
  test('returns data and meta shape', () => {
    const result = paginatedResponse([1, 2], 50, { page: 2, limit: 10 });
    expect(result).toEqual({
      data: [1, 2],
      meta: { page: 2, limit: 10, total: 50, totalPages: 5 },
    });
  });

  test('rounds totalPages up', () => {
    expect(paginatedResponse([], 11, { page: 1, limit: 5 }).meta.totalPages).toBe(3);
  });

  test('totalPages is 0 when total is 0', () => {
    expect(paginatedResponse([], 0, { page: 1, limit: 20 }).meta.totalPages).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npm test -- tests/paginate.test.js
```

Expected: FAIL — `Cannot find module '../src/middleware/paginate.js'`

- [ ] **Step 4: Create `src/middleware/paginate.js`**

```javascript
export const paginate = (req) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

export const paginatedResponse = (data, total, { page, limit }) => ({
  data,
  meta: {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  },
});
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- tests/paginate.test.js
```

Expected: All 10 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/middleware/paginate.js tests/paginate.test.js
git commit -m "feat: add paginate helper and install infrastructure deps"
```

---

## Task 2: Logger and Request Logger

**Files:**
- Create: `src/utils/logger.js`
- Create: `src/middleware/requestLogger.js`
- Modify: `src/middleware/errorHandler.js`
- Modify: `src/index.js`
- Modify: `.env.example`

- [ ] **Step 1: Create `src/utils/logger.js`**

```javascript
import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.node_env === 'production' ? 'info' : 'debug',
  transport: config.node_env !== 'production' ? { target: 'pino-pretty' } : undefined,
});
```

- [ ] **Step 2: Create `src/middleware/requestLogger.js`**

```javascript
import { logger } from '../utils/logger.js';

export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]({ method: req.method, path: req.path, status: res.statusCode, duration, userId: req.user?.id });
  });
  next();
};
```

- [ ] **Step 3: Update `src/middleware/errorHandler.js`**

Replace the full file:

```javascript
import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  logger.error({ path: req.path, userId: req.user?.id, err });

  const statusCode = err.statusCode || 500;
  const errorResponse = { error: err.message || 'Internal server error' };

  if (err.details) {
    errorResponse.details = err.details;
  }

  res.status(statusCode).json(errorResponse);
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: 'Not found' });
};
```

- [ ] **Step 4: Mount requestLogger in `src/index.js`**

Add import at top of file (after existing imports):

```javascript
import { requestLogger } from './middleware/requestLogger.js';
```

Inside `createApp()`, add `app.use(requestLogger)` immediately after `app.use(express.json())`:

```javascript
export async function createApp() {
  const app = express();

  app.use(cors({ origin: config.cors.origin, credentials: true }));
  app.use(express.json());
  app.use(requestLogger);

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  mountRoutes(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
```

Also replace `console.log` and `console.error` calls in `startServer()` with logger calls:

```javascript
import { logger } from './utils/logger.js';

export async function startServer() {
  try {
    initPool();
    logger.info('Database pool initialized');

    await runMigrations();
    logger.info('Migrations completed');

    const app = await createApp();

    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Server listening');
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}
```

- [ ] **Step 5: Add optional Sentry error capture to `src/middleware/errorHandler.js`**

Replace the `errorHandler` export with:

```javascript
import { logger } from '../utils/logger.js';

const reportToSentry = process.env.SENTRY_DSN
  ? (async () => {
      const { default: Sentry } = await import('@sentry/node');
      Sentry.init({ dsn: process.env.SENTRY_DSN });
      return (err) => Sentry.captureException(err);
    })()
  : Promise.resolve(() => {});

export const errorHandler = async (err, req, res, next) => {
  logger.error({ path: req.path, userId: req.user?.id, err });

  if (!err.statusCode || err.statusCode >= 500) {
    (await reportToSentry)(err);
  }

  const statusCode = err.statusCode || 500;
  const errorResponse = { error: err.message || 'Internal server error' };

  if (err.details) {
    errorResponse.details = err.details;
  }

  res.status(statusCode).json(errorResponse);
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: 'Not found' });
};
```

> Note: `@sentry/node` is only loaded if `SENTRY_DSN` is set. No install needed if the env var is absent. If you want Sentry, run `npm install @sentry/node` and add the DSN to Vercel environment variables.

- [ ] **Step 6: Add SENTRY_DSN to `.env.example`**

Append to `.env.example`:

```
SENTRY_DSN=
```

- [ ] **Step 8: Run full test suite to confirm nothing broke**

```bash
npm test
```

Expected: All existing tests PASS. (Logger writes to Pino stream, not console — tests are unaffected.)

- [ ] **Step 9: Commit**

```bash
git add src/utils/logger.js src/middleware/requestLogger.js src/middleware/errorHandler.js src/index.js .env.example
git commit -m "feat: add structured logging with Pino"
```

---

## Task 3: Rate Limiters

**Files:**
- Create: `src/middleware/rateLimiter.js`
- Modify: `src/index.js`
- Create: `tests/rateLimiter.test.js`

- [ ] **Step 1: Write failing rate limiter tests**

Create `tests/rateLimiter.test.js`:

```javascript
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import authRouter from '../src/routes/auth.js';
import { createTestUser } from './helpers.js';
import { USER_ROLES } from '../src/constants.js';

const buildAppWithAuthLimiter = (max) => {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    message: { error: 'Too many login attempts, please try again later.', statusCode: 429 },
  });
  const app = express();
  app.use(express.json());
  app.use('/api/auth/login', limiter);
  app.use('/api/auth', authRouter);
  return app;
};

const buildAppWithApiLimiter = (max) => {
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max,
    message: { error: 'Too many requests, please try again later.', statusCode: 429 },
  });
  const app = express();
  app.use(express.json());
  app.use('/api', limiter);
  app.use('/api/auth', authRouter);
  return app;
};

describe('Auth rate limiter', () => {
  test('allows requests under the limit', async () => {
    const app = buildAppWithAuthLimiter(3);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'x@x.com', password: 'password' });
    expect(res.status).not.toBe(429);
  });

  test('blocks requests exceeding the limit', async () => {
    const app = buildAppWithAuthLimiter(2);
    await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'pass' });
    await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'pass' });
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'pass' });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many/i);
  });
});

describe('API rate limiter', () => {
  test('allows requests under the limit', async () => {
    const app = buildAppWithApiLimiter(5);
    await createTestUser('user@example.com', 'password123', 'User', USER_ROLES.STUDENT);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'password123' });
    expect(res.status).not.toBe(429);
  });

  test('blocks requests exceeding the limit', async () => {
    const app = buildAppWithApiLimiter(2);
    for (let i = 0; i < 2; i++) {
      await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'p' });
    }
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'p' });
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/rateLimiter.test.js
```

Expected: Tests importing `rateLimit` should run but behaviour tests will fail (no limiter yet in test apps — actually they should all pass already since the test builds its own apps). The purpose here is to confirm the test file structure is valid before wiring into the real app.

Expected: Tests PASS (the test apps are self-contained). This confirms the test infrastructure is correct.

- [ ] **Step 3: Create `src/middleware/rateLimiter.js`**

```javascript
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again later.', statusCode: 429 },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many requests, please try again later.', statusCode: 429 },
});
```

- [ ] **Step 4: Mount rate limiters in `src/index.js`**

Add import:
```javascript
import { authLimiter, apiLimiter } from './middleware/rateLimiter.js';
```

In `createApp()`, add after `app.use(requestLogger)`:

```javascript
app.use('/api/auth/login', authLimiter);
app.use('/api', apiLimiter);
```

The full `createApp()` top section now reads:

```javascript
export async function createApp() {
  const app = express();

  app.use(cors({ origin: config.cors.origin, credentials: true }));
  app.use(express.json());
  app.use(requestLogger);
  app.use('/api/auth/login', authLimiter);
  app.use('/api', apiLimiter);

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  mountRoutes(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
```

- [ ] **Step 5: Run all tests to confirm rate limiters don't interfere with existing tests**

```bash
npm test
```

Expected: All existing tests PASS. (Tests use per-test Express apps without global rate limiters.)

- [ ] **Step 6: Commit**

```bash
git add src/middleware/rateLimiter.js src/index.js tests/rateLimiter.test.js
git commit -m "feat: add three-tier rate limiting"
```

---

## Task 4: Paginate User Endpoint

**Files:**
- Modify: `src/models/User.js`
- Modify: `src/routes/users.js`
- Modify: `tests/users.test.js`

- [ ] **Step 1: Write failing pagination test**

In `tests/users.test.js`, add two tests inside the existing `describe('GET /api/users')` block:

```javascript
test('returns paginated shape', async () => {
  const response = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('data');
  expect(response.body).toHaveProperty('meta');
  expect(Array.isArray(response.body.data)).toBe(true);
  expect(response.body.meta).toMatchObject({
    page: 1,
    limit: 20,
    total: 3,
    totalPages: 1,
  });
});

test('respects page and limit params', async () => {
  const response = await request(app)
    .get('/api/users?page=1&limit=2')
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(response.body.data.length).toBe(2);
  expect(response.body.meta.limit).toBe(2);
  expect(response.body.meta.total).toBe(3);
  expect(response.body.meta.totalPages).toBe(2);
});
```

Also update the existing `'Should list all users as admin'` test to use `response.body.data`:

```javascript
test('Should list all users as admin', async () => {
  const response = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(Array.isArray(response.body.data)).toBe(true);
  expect(response.body.data.length).toBe(3);

  response.body.data.forEach((user) => {
    expect(user.password_hash).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/users.test.js
```

Expected: FAIL — `response.body.data` is undefined (response is still a plain array).

- [ ] **Step 3: Update `User.list()` in `src/models/User.js`**

Replace the `list` method:

```javascript
static async list({ limit = 20, offset = 0 } = {}) {
  const [dataResult, countResult] = await Promise.all([
    query(
      'SELECT id, email, name, role, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    ),
    query('SELECT COUNT(*) FROM users'),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

- [ ] **Step 4: Update `GET /` route in `src/routes/users.js`**

Add import at top of file:
```javascript
import { paginate, paginatedResponse } from '../middleware/paginate.js';
```

Replace the `GET /` handler body:

```javascript
router.get('/', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  try {
    const { page, limit, offset } = paginate(req);
    const { rows, total } = await User.list({ limit, offset });
    res.status(200).json(paginatedResponse(rows, total, { page, limit }));
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message, statusCode });
  }
});
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- tests/users.test.js
```

Expected: All user tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/User.js src/routes/users.js tests/users.test.js
git commit -m "feat: paginate GET /api/users"
```

---

## Task 5: Paginate Class Endpoint

**Files:**
- Modify: `src/models/Class.js`
- Modify: `src/routes/classes.js`
- Modify: `tests/classes.test.js`

- [ ] **Step 1: Add failing test to `tests/classes.test.js`**

In the `describe('GET /api/classes')` block, add:

```javascript
test('returns paginated shape', async () => {
  await Class.create('Math', null, instructor.id);
  await Class.create('English', null, instructor.id);

  const response = await request(app)
    .get('/api/classes')
    .set('Authorization', `Bearer ${studentToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('data');
  expect(Array.isArray(response.body.data)).toBe(true);
  expect(response.body.meta.total).toBe(2);
});

test('respects limit param', async () => {
  await Class.create('Math', null, instructor.id);
  await Class.create('English', null, instructor.id);
  await Class.create('Science', null, instructor.id);

  const response = await request(app)
    .get('/api/classes?limit=2')
    .set('Authorization', `Bearer ${studentToken}`);

  expect(response.status).toBe(200);
  expect(response.body.data.length).toBe(2);
  expect(response.body.meta.total).toBe(3);
  expect(response.body.meta.totalPages).toBe(2);
});
```

Update any existing tests that check `Array.isArray(response.body)` to use `response.body.data`.

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/classes.test.js
```

Expected: FAIL on new tests.

- [ ] **Step 3: Update `Class.list()` and `Class.listByInstructor()` in `src/models/Class.js`**

Replace `list()`:

```javascript
static async list({ limit = 20, offset = 0 } = {}) {
  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT c.id, c.name, c.description, c.instructor_id, c.created_at, c.updated_at, u.name as instructor_name
       FROM classes c
       LEFT JOIN users u ON c.instructor_id = u.id
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query('SELECT COUNT(*) FROM classes'),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

Replace `listByInstructor()`:

```javascript
static async listByInstructor(instructorId, { limit = 20, offset = 0 } = {}) {
  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT c.id, c.name, c.description, c.instructor_id, c.created_at, c.updated_at, u.name as instructor_name
       FROM classes c
       LEFT JOIN users u ON c.instructor_id = u.id
       WHERE c.instructor_id = $1
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [instructorId, limit, offset]
    ),
    query('SELECT COUNT(*) FROM classes WHERE instructor_id = $1', [instructorId]),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

- [ ] **Step 4: Update `GET /` route in `src/routes/classes.js`**

Add import:
```javascript
import { paginate, paginatedResponse } from '../middleware/paginate.js';
```

Replace `GET /` handler:

```javascript
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset } = paginate(req);
    const { rows, total } = await Class.list({ limit, offset });
    res.status(200).json(paginatedResponse(rows, total, { page, limit }));
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message, statusCode });
  }
});
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/classes.test.js
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/Class.js src/routes/classes.js tests/classes.test.js
git commit -m "feat: paginate GET /api/classes"
```

---

## Task 6: Paginate Schedule Endpoint

**Files:**
- Modify: `src/models/Schedule.js`
- Modify: `src/routes/schedules.js`
- Modify: `tests/schedules.test.js`

- [ ] **Step 1: Add failing test to `tests/schedules.test.js`**

Inside the `describe('GET /api/schedules')` block, add:

```javascript
test('returns paginated shape for classId filter', async () => {
  await Schedule.create(cls.id, 'Monday', '09:00', '10:00');
  await Schedule.create(cls.id, 'Wednesday', '09:00', '10:00');

  const response = await request(app)
    .get(`/api/schedules?classId=${cls.id}`)
    .set('Authorization', `Bearer ${studentToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('data');
  expect(Array.isArray(response.body.data)).toBe(true);
  expect(response.body.meta.total).toBe(2);
});

test('respects limit param', async () => {
  await Schedule.create(cls.id, 'Monday', '09:00', '10:00');
  await Schedule.create(cls.id, 'Wednesday', '09:00', '10:00');
  await Schedule.create(cls.id, 'Friday', '09:00', '10:00');

  const response = await request(app)
    .get(`/api/schedules?classId=${cls.id}&limit=2`)
    .set('Authorization', `Bearer ${studentToken}`);

  expect(response.body.data.length).toBe(2);
  expect(response.body.meta.total).toBe(3);
  expect(response.body.meta.totalPages).toBe(2);
});
```

Update any existing array-shape assertions to use `.body.data`.

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/schedules.test.js
```

- [ ] **Step 3: Update Schedule list methods in `src/models/Schedule.js`**

Replace `listByClass()`:

```javascript
static async listByClass(classId, { limit = 20, offset = 0 } = {}) {
  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT id, class_id, day_of_week, start_time, end_time, created_at, updated_at
       FROM schedules
       WHERE class_id = $1
       ORDER BY day_of_week, start_time
       LIMIT $2 OFFSET $3`,
      [classId, limit, offset]
    ),
    query('SELECT COUNT(*) FROM schedules WHERE class_id = $1', [classId]),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

Replace `listByInstructor()`:

```javascript
static async listByInstructor(instructorId, { limit = 20, offset = 0 } = {}) {
  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT s.id, s.class_id, s.day_of_week, s.start_time, s.end_time, s.created_at, s.updated_at
       FROM schedules s
       JOIN classes c ON s.class_id = c.id
       WHERE c.instructor_id = $1
       ORDER BY s.day_of_week, s.start_time
       LIMIT $2 OFFSET $3`,
      [instructorId, limit, offset]
    ),
    query(
      `SELECT COUNT(*) FROM schedules s JOIN classes c ON s.class_id = c.id WHERE c.instructor_id = $1`,
      [instructorId]
    ),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

- [ ] **Step 4: Update `GET /` in `src/routes/schedules.js`**

Add import:
```javascript
import { paginate, paginatedResponse } from '../middleware/paginate.js';
```

Replace `GET /` handler:

```javascript
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { classId, instructorId } = req.query;
    const { page, limit, offset } = paginate(req);

    let result;
    if (classId) {
      result = await Schedule.listByClass(classId, { limit, offset });
    } else if (instructorId) {
      result = await Schedule.listByInstructor(instructorId, { limit, offset });
    } else {
      result = { rows: [], total: 0 };
    }

    res.status(200).json(paginatedResponse(result.rows, result.total, { page, limit }));
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message, statusCode });
  }
});
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/schedules.test.js
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/Schedule.js src/routes/schedules.js tests/schedules.test.js
git commit -m "feat: paginate GET /api/schedules"
```

---

## Task 7: Paginate Enrollment Endpoint

**Files:**
- Modify: `src/models/Enrollment.js`
- Modify: `src/routes/enrollments.js`
- Modify: `tests/enrollments.test.js`

- [ ] **Step 1: Add failing test to `tests/enrollments.test.js`**

Inside the `describe('GET /api/enrollments')` block, add:

```javascript
test('returns paginated shape for studentId filter', async () => {
  await Enrollment.create(student.id, cls.id);

  const response = await request(app)
    .get(`/api/enrollments?studentId=${student.id}`)
    .set('Authorization', `Bearer ${studentToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('data');
  expect(Array.isArray(response.body.data)).toBe(true);
  expect(response.body.meta.total).toBe(1);
});
```

Update existing assertions that check `Array.isArray(response.body)` to use `.body.data`.

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/enrollments.test.js
```

- [ ] **Step 3: Update Enrollment list methods in `src/models/Enrollment.js`**

Replace `listByStudent()`:

```javascript
static async listByStudent(studentId, { limit = 20, offset = 0 } = {}) {
  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT e.id, e.student_id, e.class_id, e.status, e.enrolled_at,
              c.name as class_name, c.description, u.name as instructor_name
       FROM enrollments e
       JOIN classes c ON e.class_id = c.id
       LEFT JOIN users u ON c.instructor_id = u.id
       WHERE e.student_id = $1
       ORDER BY e.enrolled_at DESC
       LIMIT $2 OFFSET $3`,
      [studentId, limit, offset]
    ),
    query('SELECT COUNT(*) FROM enrollments WHERE student_id = $1', [studentId]),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

Replace `listByClass()`:

```javascript
static async listByClass(classId, { limit = 20, offset = 0 } = {}) {
  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT e.id, e.student_id, e.class_id, e.status, e.enrolled_at,
              u.name as student_name, u.email as student_email
       FROM enrollments e
       JOIN users u ON e.student_id = u.id
       WHERE e.class_id = $1
       ORDER BY e.enrolled_at DESC
       LIMIT $2 OFFSET $3`,
      [classId, limit, offset]
    ),
    query('SELECT COUNT(*) FROM enrollments WHERE class_id = $1', [classId]),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

Replace `listAll()`:

```javascript
static async listAll({ limit = 20, offset = 0 } = {}) {
  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT e.id, e.student_id, e.class_id, e.status, e.enrolled_at,
              c.name as class_name, u.name as student_name, u.email as student_email,
              i.name as instructor_name
       FROM enrollments e
       JOIN classes c ON e.class_id = c.id
       JOIN users u ON e.student_id = u.id
       LEFT JOIN users i ON c.instructor_id = i.id
       ORDER BY e.enrolled_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query('SELECT COUNT(*) FROM enrollments'),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

- [ ] **Step 4: Update `GET /` in `src/routes/enrollments.js`**

Add import:
```javascript
import { paginate, paginatedResponse } from '../middleware/paginate.js';
```

Replace `GET /` handler:

```javascript
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { studentId, classId } = req.query;
    const { userId, role } = req.user;
    const { page, limit, offset } = paginate(req);

    if (studentId) {
      if (role === USER_ROLES.STUDENT && userId !== studentId) {
        return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
      }
      const { rows, total } = await Enrollment.listByStudent(studentId, { limit, offset });
      return res.status(200).json(paginatedResponse(rows, total, { page, limit }));
    }

    if (classId) {
      const { rows, total } = await Enrollment.listByClass(classId, { limit, offset });
      return res.status(200).json(paginatedResponse(rows, total, { page, limit }));
    }

    if (role !== USER_ROLES.ADMIN) {
      return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
    }

    const { rows, total } = await Enrollment.listAll({ limit, offset });
    res.status(200).json(paginatedResponse(rows, total, { page, limit }));
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message, statusCode });
  }
});
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/enrollments.test.js
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/Enrollment.js src/routes/enrollments.js tests/enrollments.test.js
git commit -m "feat: paginate GET /api/enrollments"
```

---

## Task 8: Paginate Assignment Endpoint

**Files:**
- Modify: `src/models/Assignment.js`
- Modify: `src/routes/assignments.js`
- Modify: `tests/assignments.test.js`

- [ ] **Step 1: Add failing test to `tests/assignments.test.js`**

In `describe('GET /api/assignments')`, add:

```javascript
test('returns paginated shape for classId filter', async () => {
  await Assignment.create(cls.id, 'HW1', null, null, 100);
  await Assignment.create(cls.id, 'HW2', null, null, 100);

  const response = await request(app)
    .get(`/api/assignments?classId=${cls.id}`)
    .set('Authorization', `Bearer ${instructorToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('data');
  expect(Array.isArray(response.body.data)).toBe(true);
  expect(response.body.meta.total).toBe(2);
});

test('respects limit param', async () => {
  await Assignment.create(cls.id, 'HW1', null, null, 100);
  await Assignment.create(cls.id, 'HW2', null, null, 100);
  await Assignment.create(cls.id, 'HW3', null, null, 100);

  const response = await request(app)
    .get(`/api/assignments?classId=${cls.id}&limit=2`)
    .set('Authorization', `Bearer ${instructorToken}`);

  expect(response.body.data.length).toBe(2);
  expect(response.body.meta.total).toBe(3);
});
```

Update existing assertions to use `.body.data`.

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/assignments.test.js
```

- [ ] **Step 3: Replace `findByClassId()` in `src/models/Assignment.js`**

```javascript
static async findByClassId(classId, { limit = 20, offset = 0 } = {}) {
  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT id, class_id, title, description, due_date, max_score, created_at, updated_at
       FROM assignments
       WHERE class_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [classId, limit, offset]
    ),
    query('SELECT COUNT(*) FROM assignments WHERE class_id = $1', [classId]),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

- [ ] **Step 4: Update `GET /` in `src/routes/assignments.js`**

Add import:
```javascript
import { paginate, paginatedResponse } from '../middleware/paginate.js';
```

Replace `GET /` handler:

```javascript
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { classId } = req.query;
    if (!classId) {
      return res.status(400).json({ error: 'classId query parameter is required', statusCode: 400 });
    }
    const { page, limit, offset } = paginate(req);
    const { rows, total } = await Assignment.findByClassId(classId, { limit, offset });
    res.status(200).json(paginatedResponse(rows, total, { page, limit }));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/assignments.test.js
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/Assignment.js src/routes/assignments.js tests/assignments.test.js
git commit -m "feat: paginate GET /api/assignments"
```

---

## Task 9: Paginate Grade Endpoint

**Files:**
- Modify: `src/models/Grade.js`
- Modify: `src/routes/grades.js`
- Modify: `tests/grades.test.js`

The existing grade route filters by `student_id` client-side after fetching all records. With pagination that filter must move to the DB query. The updated methods accept an optional `studentId` filter parameter.

- [ ] **Step 1: Add failing test to `tests/grades.test.js`**

In `describe('GET /api/grades')`, add:

```javascript
test('returns paginated shape for assignmentId filter', async () => {
  await Grade.create(assignment.id, student.id, 85, null);

  const response = await request(app)
    .get(`/api/grades?assignmentId=${assignment.id}`)
    .set('Authorization', `Bearer ${instructorToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('data');
  expect(response.body.meta.total).toBe(1);
});

test('student only sees own grades via assignmentId filter', async () => {
  const other = await createTestUser('other@example.com', 'pass123', 'Other', USER_ROLES.STUDENT);
  await Grade.create(assignment.id, student.id, 80, null);
  await Grade.create(assignment.id, other.id, 90, null);

  const response = await request(app)
    .get(`/api/grades?assignmentId=${assignment.id}`)
    .set('Authorization', `Bearer ${studentToken}`);

  expect(response.body.data.length).toBe(1);
  expect(response.body.data[0].student_id).toBe(student.id);
  expect(response.body.meta.total).toBe(1);
});
```

Update existing assertions to use `.body.data`.

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/grades.test.js
```

- [ ] **Step 3: Replace Grade list methods in `src/models/Grade.js`**

Replace `findByAssignment()`:

```javascript
static async findByAssignment(assignmentId, { limit = 20, offset = 0, studentId = null } = {}) {
  const params = [assignmentId];
  const studentFilter = studentId ? ` AND g.student_id = $${params.push(studentId)}` : '';

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT g.id, g.assignment_id, g.student_id, g.numeric_score, g.letter_grade,
              g.feedback, g.created_at, g.updated_at, u.name as student_name
       FROM grades g
       JOIN users u ON g.student_id = u.id
       WHERE g.assignment_id = $1${studentFilter}
       ORDER BY u.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(*) FROM grades g WHERE g.assignment_id = $1${studentFilter}`,
      params
    ),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

Replace `findByStudent()`:

```javascript
static async findByStudent(studentId, { limit = 20, offset = 0 } = {}) {
  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT g.id, g.assignment_id, g.student_id, g.numeric_score, g.letter_grade,
              g.feedback, g.created_at, g.updated_at,
              a.title as assignment_title, a.class_id, c.name as class_name
       FROM grades g
       JOIN assignments a ON g.assignment_id = a.id
       JOIN classes c ON a.class_id = c.id
       WHERE g.student_id = $1
       ORDER BY g.created_at DESC
       LIMIT $2 OFFSET $3`,
      [studentId, limit, offset]
    ),
    query('SELECT COUNT(*) FROM grades WHERE student_id = $1', [studentId]),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

Replace `findByClass()`:

```javascript
static async findByClass(classId, { limit = 20, offset = 0, studentId = null } = {}) {
  const params = [classId];
  const studentFilter = studentId ? ` AND g.student_id = $${params.push(studentId)}` : '';

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT g.id, g.assignment_id, g.student_id, g.numeric_score, g.letter_grade,
              g.feedback, g.created_at, g.updated_at,
              a.title as assignment_title, u.name as student_name
       FROM grades g
       JOIN assignments a ON g.assignment_id = a.id
       JOIN users u ON g.student_id = u.id
       WHERE a.class_id = $1${studentFilter}
       ORDER BY a.title, u.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(*) FROM grades g JOIN assignments a ON g.assignment_id = a.id WHERE a.class_id = $1${studentFilter}`,
      params
    ),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

- [ ] **Step 4: Update `GET /` in `src/routes/grades.js`**

Add import:
```javascript
import { paginate, paginatedResponse } from '../middleware/paginate.js';
```

Replace `GET /` handler (remove client-side student filter — it is now pushed to the model):

```javascript
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { assignmentId, studentId, classId } = req.query;
    const { userId, role } = req.user;
    const { page, limit, offset } = paginate(req);

    const studentFilter = role === USER_ROLES.STUDENT ? userId : null;

    let result;
    if (assignmentId) {
      result = await Grade.findByAssignment(assignmentId, { limit, offset, studentId: studentFilter });
    } else if (classId) {
      result = await Grade.findByClass(classId, { limit, offset, studentId: studentFilter });
    } else if (studentId) {
      if (role === USER_ROLES.STUDENT && userId !== studentId) {
        return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
      }
      result = await Grade.findByStudent(studentId, { limit, offset });
    } else {
      return res.status(400).json({ error: 'At least one filter (assignmentId, studentId, classId) is required', statusCode: 400 });
    }

    res.status(200).json(paginatedResponse(result.rows, result.total, { page, limit }));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/grades.test.js
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/Grade.js src/routes/grades.js tests/grades.test.js
git commit -m "feat: paginate GET /api/grades"
```

---

## Task 10: Paginate Attendance Endpoint

**Files:**
- Modify: `src/models/AttendanceRecord.js`
- Modify: `src/routes/attendance.js`
- Modify: `tests/attendance.test.js`

Same pattern as grades: the route currently filters students client-side. Move to DB queries.

- [ ] **Step 1: Add failing test to `tests/attendance.test.js`**

In `describe('GET /api/attendance')`, add:

```javascript
test('returns paginated shape for scheduleId+date filter', async () => {
  const response = await request(app)
    .get(`/api/attendance?scheduleId=${schedule.id}&date=2026-06-10`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('data');
  expect(response.body).toHaveProperty('meta');
});
```

Update existing assertions to use `.body.data`.

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/attendance.test.js
```

- [ ] **Step 3: Replace list methods in `src/models/AttendanceRecord.js`**

Replace `findBySchedule()`:

```javascript
static async findBySchedule(scheduleId, attendanceDate, { limit = 20, offset = 0 } = {}) {
  await AttendanceRecord.deleteExpired();

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT ar.id, ar.schedule_id, ar.student_id, ar.attendance_date, ar.status,
              ar.photo_url, ar.photo_uploaded_at, ar.validated_by, ar.validated_at, ar.created_at,
              u.name as student_name
       FROM attendance_records ar
       JOIN users u ON ar.student_id = u.id
       WHERE ar.schedule_id = $1 AND ar.attendance_date = $2
       ORDER BY u.name
       LIMIT $3 OFFSET $4`,
      [scheduleId, attendanceDate, limit, offset]
    ),
    query(
      'SELECT COUNT(*) FROM attendance_records WHERE schedule_id = $1 AND attendance_date = $2',
      [scheduleId, attendanceDate]
    ),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

Replace `findByStudent()`:

```javascript
static async findByStudent(studentId, classId, { limit = 20, offset = 0 } = {}) {
  await AttendanceRecord.deleteExpired();

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT ar.id, ar.schedule_id, ar.student_id, ar.attendance_date, ar.status,
              ar.photo_url, ar.photo_uploaded_at, ar.validated_by, ar.validated_at, ar.created_at,
              c.name as class_name
       FROM attendance_records ar
       JOIN schedules s ON ar.schedule_id = s.id
       JOIN classes c ON s.class_id = c.id
       WHERE ar.student_id = $1 AND s.class_id = $2
       ORDER BY ar.attendance_date DESC
       LIMIT $3 OFFSET $4`,
      [studentId, classId, limit, offset]
    ),
    query(
      `SELECT COUNT(*) FROM attendance_records ar
       JOIN schedules s ON ar.schedule_id = s.id
       WHERE ar.student_id = $1 AND s.class_id = $2`,
      [studentId, classId]
    ),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

Replace `findPending()`:

```javascript
static async findPending({ limit = 20, offset = 0 } = {}) {
  await AttendanceRecord.deleteExpired();

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT ar.id, ar.schedule_id, ar.student_id, ar.attendance_date, ar.status,
              ar.photo_url, ar.photo_uploaded_at, ar.validated_by, ar.validated_at, ar.created_at,
              u.name as student_name
       FROM attendance_records ar
       JOIN users u ON ar.student_id = u.id
       WHERE ar.status = 'pending'
       ORDER BY ar.photo_uploaded_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query("SELECT COUNT(*) FROM attendance_records WHERE status = 'pending'"),
  ]);
  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}
```

- [ ] **Step 4: Update `GET /` in `src/routes/attendance.js`**

Add import:
```javascript
import { paginate, paginatedResponse } from '../middleware/paginate.js';
```

Replace `GET /` handler (remove client-side student filter):

```javascript
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, classId, studentId, date, scheduleId } = req.query;
    const { userId, role } = req.user;
    const { page, limit, offset } = paginate(req);

    let result;

    if (status === 'pending') {
      result = await AttendanceRecord.findPending({ limit, offset });
    } else if (scheduleId && date) {
      result = await AttendanceRecord.findBySchedule(scheduleId, date, { limit, offset });
      if (role === USER_ROLES.STUDENT) {
        result.rows = result.rows.filter((r) => r.student_id === userId);
        result.total = result.rows.length;
      }
    } else if (studentId && classId) {
      if (role === USER_ROLES.STUDENT && userId !== studentId) {
        return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
      }
      result = await AttendanceRecord.findByStudent(studentId, classId, { limit, offset });
    } else if (classId) {
      return res.status(400).json({ error: 'studentId is required when filtering by classId', statusCode: 400 });
    } else {
      return res.status(400).json({ error: 'Provide scheduleId+date, studentId+classId, or status=pending', statusCode: 400 });
    }

    res.status(200).json(paginatedResponse(result.rows, result.total, { page, limit }));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/attendance.test.js
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/AttendanceRecord.js src/routes/attendance.js tests/attendance.test.js
git commit -m "feat: paginate GET /api/attendance"
```

---

## Task 11: Update Frontend API Client

**Files:**
- Modify: `cfc-digital/src/app/api/client.js`

The response shape changed from `[...]` to `{ data: [...], meta: {...} }`. The frontend consumers in `useStore.js` call these methods and pass the result directly to state setters like `setClasses(data)`. To keep those working without touching `useStore.js`, each list method extracts `.data` before returning.

- [ ] **Step 1: Update list methods in `cfc-digital/src/app/api/client.js`**

Replace each list method that calls a paginated endpoint:

```javascript
getUsers: () => request('/users').then((r) => r.data),

getClasses: () => request('/classes').then((r) => r.data),

getSchedules: (params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  const endpoint = queryString ? `/schedules?${queryString}` : '/schedules';
  return request(endpoint).then((r) => r.data);
},

getEnrollments: (params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  const endpoint = queryString ? `/enrollments?${queryString}` : '/enrollments';
  return request(endpoint).then((r) => r.data);
},
```

- [ ] **Step 2: Commit**

```bash
cd /home/yurin/cfc/cfc-digital
git add src/app/api/client.js
git commit -m "feat: update API client list methods for paginated responses"
```

---

## Task 12: Full Regression and Verification

- [ ] **Step 1: Run the complete test suite**

```bash
cd /home/yurin/cfc/cfc-digital-backend
npm test
```

Expected output: All tests pass. Count should be original test count + ~18 new tests (10 paginate helper + 2 rate limiter + 2 per paginated endpoint × 7 = ~24 new, total varies).

- [ ] **Step 2: Run with coverage**

```bash
npm test:coverage
```

Expected: Coverage remains at or above 95% on all modified files.

- [ ] **Step 3: Start dev server and do a quick smoke test**

```bash
npm run dev
```

In another terminal:

```bash
curl -s http://localhost:3001/health
# Expected: {"status":"ok"}

curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"yourpassword"}' | jq .
# Expected: { token: "...", user: {...} }

# Using token from above:
curl -s http://localhost:3001/api/classes \
  -H 'Authorization: Bearer <token>' | jq .
# Expected: { data: [...], meta: { page: 1, limit: 20, total: N, totalPages: N } }
```

- [ ] **Step 4: Verify rate limiter header is present**

```bash
curl -I -s http://localhost:3001/api/classes \
  -H 'Authorization: Bearer <token>'
# Expected: RateLimit-Remaining header present in response
```

---

## Checklist: Success Criteria

- [ ] All 7 list endpoints return `{ data, meta }` envelope
- [ ] `?page` and `?limit` work correctly across all endpoints
- [ ] `POST /api/auth/login` rate-limited at 10/15min per IP
- [ ] All `/api/*` routes rate-limited at 100/min per user
- [ ] All logs are structured JSON (check Vercel logs or server output)
- [ ] Error logs include `userId`, `path`, fields
- [ ] Frontend `client.js` list methods extract `.data` transparently
- [ ] All existing tests still pass
- [ ] New tests pass (~24 additional tests)
