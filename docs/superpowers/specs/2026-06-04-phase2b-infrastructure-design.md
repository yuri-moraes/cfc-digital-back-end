# Phase 2B: Infrastructure — Design Spec

**Date**: June 4, 2026
**Status**: Design approved, ready for implementation planning
**Timeline**: ~3–4 weeks
**Depends on**: Phase 2A complete ✅

---

## Overview

Phase 2B adds three infrastructure improvements to the existing backend. No new user-facing features — this phase makes the existing system robust before building Phase 2C (Smart Notifications) on top of it.

**What's included:**
1. Pagination on all list endpoints
2. Rate limiting (three tiers)
3. Structured logging (Pino + optional Sentry)

**No schema migrations** — Phase 2B does not change the database.

---

## Full Phase Roadmap (context)

| Phase | Name | Status |
|-------|------|--------|
| 1 | Core Backend (auth, users, classes, schedules, enrollments) | ✅ Done |
| 2A | Grades & Attendance | ✅ Done |
| **2B** | **Infrastructure (this spec)** | 🔧 Next |
| 2C | Smart Notifications (reminders, WhatsApp, student absences) | Spec ready |
| 2D | Advanced Reporting (grades, attendance analytics, dashboards) | Planned |
| 3 | Security & Polish (refresh tokens, audit logs, file uploads) | Planned |

---

## 1. Pagination

### Response Format

All list endpoints change from returning a plain array to a paginated envelope:

```json
{
  "data": [ ...items... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 143,
    "totalPages": 8
  }
}
```

### Query Parameters

All list endpoints accept:
- `?page=1` — 1-indexed page number (default: 1)
- `?limit=20` — items per page (default: 20, max: 100)

Values outside range are clamped silently (not rejected).

### Affected Endpoints

| Endpoint | Current | After |
|----------|---------|-------|
| `GET /api/users` | `[...]` | `{ data, meta }` |
| `GET /api/classes` | `[...]` | `{ data, meta }` |
| `GET /api/schedules` | `[...]` | `{ data, meta }` |
| `GET /api/enrollments` | `[...]` | `{ data, meta }` |
| `GET /api/assignments` | `[...]` | `{ data, meta }` |
| `GET /api/grades` | `[...]` | `{ data, meta }` |
| `GET /api/attendance` | `[...]` | `{ data, meta }` |

**Breaking change**: frontend `client.js` must be updated to read `.data` instead of the response directly.

### Implementation

Create `src/middleware/paginate.js`:

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
    totalPages: Math.ceil(total / limit),
  },
});
```

Each model's list method gains a `{ limit, offset }` parameter and returns `{ rows, total }` (total from a `COUNT(*)` query run alongside the main query).

---

## 2. Rate Limiting

### Tiers

Three `express-rate-limit` instances, applied as middleware:

| Tier | Applies to | Limit | Window | Key |
|------|------------|-------|--------|-----|
| `authLimiter` | `POST /api/auth/login` | 10 requests | 15 min | IP |
| `apiLimiter` | All `GET/POST/PUT/DELETE /api/*` | 100 requests | 1 min | User ID (falls back to IP) |
| `cronLimiter` | `POST /api/cron/*` | Not rate-limited — secret header check instead | — | — |

### Response on Limit Exceeded

```json
{ "error": "Too many requests, please try again later.", "statusCode": 429 }
```

Standard `Retry-After` header included.

### Cron Endpoint Protection

`/api/cron/*` endpoints are not rate-limited but require:
```
Authorization: Bearer ${CRON_SECRET}
```
Where `CRON_SECRET` is set in Vercel environment variables and matched server-side. Requests failing this check return 401.

### Implementation

Create `src/middleware/rateLimiter.js`:

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

Mount in `src/index.js`:
```javascript
app.use('/api/auth/login', authLimiter);
app.use('/api', apiLimiter);
```

**New dependency**: `npm install express-rate-limit`

---

## 3. Structured Logging

### Library: Pino

Pino is the fastest Node.js JSON logger. Small bundle, low overhead, ideal for Vercel serverless.

**New dependency**: `npm install pino pino-pretty`

### Logger Setup

Create `src/utils/logger.js`:

```javascript
import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.node_env === 'production' ? 'info' : 'debug',
  transport: config.node_env !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
});
```

### Log Levels

| Event | Level | When |
|-------|-------|------|
| Incoming request | `info` | Every request (method, path, status, duration ms) |
| 4xx response | `warn` | Validation errors, not found, forbidden |
| 5xx response | `error` | Unhandled exceptions (includes stack trace + userId) |
| Cron job run | `info` | Start + end of each cron execution, count of notifications sent |

### Request Logger Middleware

Create `src/middleware/requestLogger.js`:

```javascript
import { logger } from '../utils/logger.js';

export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userId: req.user?.id,
    });
  });
  next();
};
```

### Error Handler Update

Update `src/middleware/errorHandler.js` to use `logger.error()` instead of `console.error()`.

### Optional: Sentry Integration

If `SENTRY_DSN` environment variable is set, import `@sentry/node` and call `Sentry.captureException(err)` in the error handler for 5xx errors. This is gated on the env var — no Sentry installed if the var is absent.

**Optional dependency**: `npm install @sentry/node`

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/middleware/paginate.js` | Create |
| `src/middleware/rateLimiter.js` | Create |
| `src/middleware/requestLogger.js` | Create |
| `src/utils/logger.js` | Create |
| `src/middleware/errorHandler.js` | Update (use logger) |
| `src/index.js` | Update (mount rate limiters, request logger) |
| `src/models/*.js` (7 files) | Update list methods (add limit/offset, return total) |
| `src/routes/*.js` (7 files) | Update list routes (parse paginate, wrap response) |
| `cfc-digital/src/app/api/client.js` | Update (read `.data` from list responses) |
| `package.json` | Add: `express-rate-limit`, `pino`, `pino-pretty` |
| `.env.example` | Add: `SENTRY_DSN` (optional) |

---

## Testing Strategy

### Pagination tests (~14 tests, 2 per endpoint)
- List with default page/limit returns `{ data, meta }` shape
- List with `?page=2&limit=5` returns correct slice and correct `meta.total`

### Rate limiter tests (~4 tests)
- 11th login attempt within 15 min window → 429
- 101st API call within 1 min → 429
- Cron endpoint with wrong secret → 401
- Cron endpoint with correct secret → passes through

### Logger tests
- Not unit-tested directly; verified via integration tests checking no console output leaks (logger output goes to Pino stream)

### Total new tests: ~18

---

## Success Criteria

- ✅ All 7 list endpoints return `{ data, meta }` envelope
- ✅ Pagination params `page` and `limit` work correctly on all endpoints
- ✅ Auth endpoint rate-limited at 10/15min per IP
- ✅ API rate-limited at 100/min per user
- ✅ All request logs are structured JSON in production
- ✅ Error logs include userId, path, stack trace
- ✅ Frontend `client.js` updated to handle paginated responses
- ✅ All existing tests still pass (pagination is additive, not breaking model logic)
- ✅ ~18 new tests passing

---

## Next Steps

Phase 2C: Smart Notifications — see `2026-06-04-phase2c-smart-notifications-design.md`
