# Phase 2C: Smart Notifications — Design Spec

**Date**: June 4, 2026
**Status**: Design approved, ready for implementation planning
**Timeline**: ~4–6 weeks
**Depends on**: Phase 2B complete

---

## Overview

Phase 2C adds automated class notifications and a student absence declaration system. There is no general messaging — this is purely event-driven and outbound.

**Two subsystems:**
1. **Smart Reminders** — notify students and instructors before a class starts (configurable timing, default 15 min). Delivered in-app + optionally via WhatsApp.
2. **Student Absence System** — students declare they cannot attend a session. The 1-hour rule determines whether the absence is valid (not charged) or late (charged regardless).

---

## Technology Stack

**New dependencies:**
- `node-cron` or Vercel Cron (built-in) — scheduled job runner
- Z-API — WhatsApp Business API provider (Brazilian market)
- No new frontend libraries

---

## Architecture

```
Vercel Cron (every 1 min)
  └─▶ POST /api/cron/send-reminders  (protected by CRON_SECRET)
        │
        ├─ SQL: find (user, schedule) pairs where
        │       class starts in exactly user.minutes_before minutes today
        │       AND no reminder already sent (notifications table)
        │       AND class not cancelled today (schedule_cancellations)
        │
        ├─▶ INSERT INTO notifications  (in-app delivery)
        └─▶ if user.phone_number AND prefs.whatsapp_enabled
              └─▶ Z-API HTTP POST  (WhatsApp delivery)

Instructor/Admin cancels class
  └─▶ POST /api/schedules/:id/cancel  { date, reason }
        ├─▶ INSERT INTO schedule_cancellations
        └─▶ immediately notify all enrolled students + instructor
              ├─▶ INSERT INTO notifications (type: 'class_cancelled')
              └─▶ WhatsApp if enabled

Student declares absence
  └─▶ POST /api/schedules/:id/absence  { date }
        ├─ check: class_start_time - NOW() > 1 hour ?
        ├─ YES → status='valid'   → not charged  ✅
        └─ NO  → status='late'    → charged anyway ❌
              └─▶ WhatsApp confirmation sent (both cases)
```

---

## Database Schema (5 migrations: 008–012)

### Migration 008 — alter_users_add_phone

```sql
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
```

Phone numbers stored in E.164 format (e.g., `+5511999998888`). Nullable — WhatsApp is opt-in.

### Migration 009 — create_notification_preferences

```sql
CREATE TABLE notification_preferences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minutes_before    INT NOT NULL DEFAULT 15,
  whatsapp_enabled  BOOLEAN NOT NULL DEFAULT false,
  in_app_enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);
```

Preferences are created lazily (first time user accesses `/api/notifications/preferences`) with defaults. Never deleted — always one row per user.

### Migration 010 — create_notifications

```sql
CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          VARCHAR(50) NOT NULL CHECK (type IN ('class_reminder', 'class_cancelled', 'absence_confirmed')),
  title         VARCHAR(255) NOT NULL,
  body          TEXT NOT NULL,
  schedule_id   UUID REFERENCES schedules(id) ON DELETE SET NULL,
  class_date    DATE,
  read_at       TIMESTAMP,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read_at ON notifications(read_at) WHERE read_at IS NULL;
```

`read_at IS NULL` partial index makes "unread count" queries fast.

**Deduplication**: before inserting a `class_reminder`, check `WHERE user_id = $1 AND schedule_id = $2 AND class_date = $3 AND type = 'class_reminder'`. If exists, skip.

### Migration 011 — create_schedule_cancellations

```sql
CREATE TABLE schedule_cancellations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id     UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  cancelled_date  DATE NOT NULL,
  reason          TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, cancelled_date)
);

CREATE INDEX idx_schedule_cancellations_schedule_id ON schedule_cancellations(schedule_id);
```

### Migration 012 — create_student_absences

```sql
CREATE TABLE student_absences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id   UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  absence_date  DATE NOT NULL,
  status        VARCHAR(20) NOT NULL CHECK (status IN ('valid', 'late', 'no_show')),
  declared_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, schedule_id, absence_date)
);

CREATE INDEX idx_student_absences_student_id ON student_absences(student_id);
CREATE INDEX idx_student_absences_schedule_id ON student_absences(schedule_id);
```

**Status values:**
- `valid` — declared ≥1 hour before class; not charged
- `late` — declared <1 hour before class; charged regardless
- `no_show` — not declared and didn't attend (set when instructor marks attendance in Phase 2A flow); charged

---

## Models (4 new)

### NotificationPreference

```javascript
class NotificationPreference {
  static async findOrCreate(userId)       // returns prefs, creates with defaults if absent
  static async update(userId, updates)    // { minutesBefore, whatsappEnabled, inAppEnabled }
}
```

### Notification

```javascript
class Notification {
  static async create(userId, type, title, body, scheduleId, classDate)
  static async findByUser(userId, { page, limit })  // paginated, newest first
  static async markRead(id, userId)
  static async markAllRead(userId)
  static async countUnread(userId)        // for bell badge
  static async dedupeExists(userId, scheduleId, classDate, type)  // check before insert
}
```

### ScheduleCancellation

```javascript
class ScheduleCancellation {
  static async create(scheduleId, date, reason, createdBy)
  static async delete(scheduleId, date)   // uncancel
  static async findBySchedule(scheduleId)
  static async existsForDate(scheduleId, date)  // used by cron
}
```

### StudentAbsence

```javascript
class StudentAbsence {
  static async declare(studentId, scheduleId, date)
    // 1. fetch schedule start_time + day_of_week
    // 2. compute minutes until class: (today's date + start_time) - NOW()
    // 3. status = minutesUntil > 60 ? 'valid' : 'late'
    // 4. insert
    // 5. return { absence, charged: status !== 'valid' }

  static async findBySchedule(scheduleId, date)   // admin/instructor view
  static async findByStudent(studentId)            // student's own history
  static async setNoShow(studentId, scheduleId, date)  // called from PUT /api/attendance/:id/validate when student has no valid absence declaration
}
```

---

## Cron Job Design

### Vercel Configuration (`vercel.json`)

```json
{
  "crons": [
    {
      "path": "/api/cron/send-reminders",
      "schedule": "* * * * *"
    }
  ]
}
```

### Algorithm (`src/routes/cron.js`)

```
POST /api/cron/send-reminders
  1. Verify Authorization: Bearer ${CRON_SECRET}
  2. Run SQL query (see below)
  3. For each result row:
     a. INSERT INTO notifications (deduplication check first)
     b. If whatsapp_enabled AND phone_number: call sendWhatsApp()
  4. Log: { sent: N, skipped: M, errors: K }
  5. Return { sent, skipped, errors }
```

### Core SQL Query

```sql
WITH user_prefs AS (
  SELECT
    u.id AS user_id, u.name, u.phone_number,
    COALESCE(np.minutes_before, 15) AS minutes_before,
    COALESCE(np.whatsapp_enabled, false) AS whatsapp_enabled,
    COALESCE(np.in_app_enabled, true) AS in_app_enabled
  FROM users u
  LEFT JOIN notification_preferences np ON np.user_id = u.id
)
-- Students enrolled in classes starting in their preferred window
SELECT
  up.user_id, up.name, up.phone_number,
  up.whatsapp_enabled, up.in_app_enabled,
  s.id AS schedule_id, s.start_time, s.day_of_week,
  c.name AS class_name,
  CURRENT_DATE AS class_date
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

-- Instructors teaching classes starting in their preferred window
SELECT
  up.user_id, up.name, up.phone_number,
  up.whatsapp_enabled, up.in_app_enabled,
  s.id, s.start_time, s.day_of_week,
  c.name,
  CURRENT_DATE
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
  );
```

**Timezone**: all schedule times are stored and compared in `America/Sao_Paulo`.

---

## WhatsApp Integration (Z-API)

### Environment Variables

```
ZAPI_INSTANCE_ID=your-instance-id
ZAPI_TOKEN=your-token
ZAPI_BASE_URL=https://api.z-api.io/instances
```

### Utility (`src/utils/whatsapp.js`)

```javascript
export async function sendWhatsApp(phoneNumber, message) {
  if (!process.env.ZAPI_INSTANCE_ID) return; // graceful no-op if not configured

  const url = `${process.env.ZAPI_BASE_URL}/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-text`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phoneNumber, message }),
  });

  if (!response.ok) {
    logger.warn({ phone: phoneNumber, status: response.status }, 'WhatsApp send failed');
  }
}
```

WhatsApp failures are logged as warnings but **never crash the cron** — in-app notification still succeeds.

### Message Templates (Portuguese)

**Class reminder** (`class_reminder`):
```
Olá {nome}! 👋

A sua aula de {disciplina} começa em {minutos} minutos.

Boa aula! 🎓
```

**Instructor class cancelled** (`class_cancelled`):
```
Olá {nome}! 📢

A sua aula de {disciplina} de hoje foi cancelada.

{motivo}
```

**Valid absence confirmed** (`absence_confirmed`, valid):
```
Olá {nome}! ✅

A sua ausência na aula de {disciplina} em {data} foi registada com sucesso.

Até a próxima! 👋
```

**Late cancellation warning** (`absence_confirmed`, late):
```
Olá {nome}! ⚠️

A sua ausência foi registada, mas como falta menos de 1 hora para a aula de {disciplina}, a aula será cobrada mesmo assim.

Em caso de dúvida, contacte o seu instrutor.
```

---

## Student Absence — Business Rules

| Condition | Status | Charged? |
|-----------|--------|----------|
| Declared ≥ 1 hour before class | `valid` | No |
| Declared < 1 hour before class | `late` | Yes |
| Not declared, instructor marks absent | `no_show` | Yes |
| Instructor cancels class | N/A | No (class_cancellation) |

The `charged` flag is informational in this phase. Phase 2D reporting will aggregate it for billing reports.

---

## API Endpoints (11 new)

### Notifications

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `GET` | `/api/notifications` | Any | List own notifications (paginated) |
| `GET` | `/api/notifications/unread-count` | Any | Returns `{ count: N }` for bell badge |
| `PUT` | `/api/notifications/:id/read` | Any (own) | Mark one as read |
| `PUT` | `/api/notifications/read-all` | Any | Mark all as read |

### Notification Preferences

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `GET` | `/api/notifications/preferences` | Any | Get own preferences (creates with defaults if absent) |
| `PUT` | `/api/notifications/preferences` | Any | Update `minutesBefore`, `whatsappEnabled`, `inAppEnabled` |

### Schedule Cancellations (instructor/admin)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `POST` | `/api/schedules/:id/cancel` | Admin/Instructor | Cancel class on `{ date, reason }` — triggers notifications |
| `DELETE` | `/api/schedules/:id/cancel/:date` | Admin/Instructor | Uncancel |
| `GET` | `/api/schedules/:id/cancellations` | Any | List cancelled dates |

### Student Absences

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `POST` | `/api/schedules/:id/absence` | Student | Declare absence for `{ date }` — returns `{ status, charged }` |
| `GET` | `/api/schedules/:id/absences?date=YYYY-MM-DD` | Admin/Instructor | List absences for a schedule (optional date filter) |

### Cron (internal)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `POST` | `/api/cron/send-reminders` | `CRON_SECRET` | Fire pending reminders |

---

## New Files

```
src/models/NotificationPreference.js
src/models/Notification.js
src/models/ScheduleCancellation.js
src/models/StudentAbsence.js
src/routes/notifications.js
src/routes/cron.js
src/utils/whatsapp.js
src/db/migrations/008_alter_users_add_phone.sql
src/db/migrations/009_create_notification_preferences.sql
src/db/migrations/010_create_notifications.sql
src/db/migrations/011_create_schedule_cancellations.sql
src/db/migrations/012_create_student_absences.sql
tests/notifications.test.js
tests/schedule-cancellations.test.js
tests/student-absences.test.js
tests/cron.test.js
```

**Modified files:**
- `src/routes/schedules.js` — add cancel + absence routes
- `src/routes/index.js` — mount notifications and cron routers
- `src/routes/users.js` — allow `phone_number` in PUT `/users/:id`
- `vercel.json` — add cron schedule
- `.env.example` — add `CRON_SECRET`, `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_BASE_URL`

---

## Testing Strategy

### Mock strategy for WhatsApp

In tests, `ZAPI_INSTANCE_ID` is not set → `sendWhatsApp()` returns early. No real HTTP calls in tests.

### Test files (~90 total new tests)

**notifications.test.js** (~25 tests):
- List notifications (paginated, own only)
- Unread count updates correctly
- Mark one / mark all as read
- Preferences: get creates defaults, update persists
- Preferences: `minutesBefore` must be between 1 and 120
- Notification not visible to other users (403)

**schedule-cancellations.test.js** (~20 tests):
- Instructor can cancel own class
- Admin can cancel any class
- Student cannot cancel a class → 403
- Duplicate cancellation → 409
- Cancellation triggers notifications for all enrolled students + instructor
- Uncancel removes the record
- Cancelled class is excluded from cron query

**student-absences.test.js** (~25 tests):
- Student declares absence ≥1h before → status=valid, charged=false
- Student declares absence <1h before → status=late, charged=true
- Duplicate absence → 409
- Student cannot declare absence for a class they're not enrolled in → 403
- Student cannot declare absence for another student → 403
- Admin/instructor can view absences for a schedule
- `no_show` status set correctly when attendance marked without declaration

**cron.test.js** (~20 tests):
- Returns 401 without CRON_SECRET
- Sends reminders to students enrolled in upcoming class
- Sends reminder to instructor of upcoming class
- Does not double-send (idempotent)
- Skips cancelled classes
- Respects per-user `minutesBefore` preference
- Users with no preferences use 15-minute default
- Users with `in_app_enabled=false` skip in-app notification
- Users with no phone skip WhatsApp even if `whatsapp_enabled=true`

---

## Success Criteria

- ✅ 5 new migrations (008–012) applied cleanly
- ✅ Cron fires every minute, sends reminders to correct users
- ✅ No duplicate reminders (idempotent cron)
- ✅ Instructor-cancelled classes suppress reminders and notify all students
- ✅ Student absence 1-hour rule enforced server-side
- ✅ WhatsApp sends for users with phone + `whatsapp_enabled=true`
- ✅ WhatsApp failure never crashes the cron or HTTP request
- ✅ All message templates in Portuguese
- ✅ ~90 new tests passing, 95%+ coverage on new code

---

## Next Steps

Phase 2D: Advanced Reporting — grade reports, attendance analytics, admin dashboards.
