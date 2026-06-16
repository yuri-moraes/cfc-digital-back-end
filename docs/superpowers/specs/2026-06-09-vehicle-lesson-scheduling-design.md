# Design Spec: Vehicle & Lesson Scheduling Redesign

**Date:** 2026-06-09
**Status:** Approved

---

## Context

The current backend was built around a **class/turma model**: an instructor teaches a class, multiple students enroll, and recurring schedules are attached to classes. This model does not match the actual CFC business logic.

In a driving school, every lesson is an individual session: **1 student + 1 instructor + 1 vehicle, 50 minutes**. There are no shared classes. This spec redesigns the core scheduling layer to reflect reality while keeping the notification infrastructure, authentication, and cron system intact (Approach B — surgical replacement).

---

## Goals

- Introduce vehicles as a first-class entity, admin-managed
- Enforce that an instructor can only teach in vehicles explicitly assigned to them by admin
- Students carry a `purchased_lessons` count (cap) and a CNH `category`
- Admin defines instructor availability windows (day of week + time range + vehicle)
- Admin books recurring lessons for a student in N individual slots, up to purchased_lessons as cap
- Admin and student can independently reschedule any individual lesson to any free slot
- Instructor registers attendance (plate at check-in) and no-shows; has zero scheduling control
- Existing notification system, cron reminders, and auth layer remain unchanged

---

## Out of Scope

- Payments or invoicing for `purchased_lessons`
- DETRAN integration
- Group/theory classes
- Vehicle maintenance scheduling

---

## Data Model

### Tables Removed

| Table | Reason |
|---|---|
| `classes` | Replaced by direct student-instructor-vehicle bookings |
| `schedules` | Replaced by `instructor_availability` + `lesson_slots` |
| `enrollments` | No class concept; replaced by `lesson_slots` |
| `attendance_records` | Absorbed into `lesson_slots` |
| `student_absences` | Absorbed into `lesson_slots.status` |
| `schedule_cancellations` | Absorbed into `lesson_slots.status` |
| `assignments` | Replaced by `exam_results` |
| `grades` | Replaced by `exam_results` |

### Tables Added

#### `vehicles`
```sql
CREATE TABLE vehicles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate       VARCHAR(10)  UNIQUE NOT NULL,
  model       VARCHAR(100) NOT NULL,
  year        INT          NOT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
```

#### `instructor_vehicles`
Admin-controlled. An instructor may only teach in vehicles listed here.
```sql
CREATE TABLE instructor_vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(instructor_id, vehicle_id)
);
```

#### `instructor_availability`
Defines weekly recurring windows when an instructor is available in a given vehicle. Slots are computed dynamically from these windows — they are not stored.
```sql
CREATE TABLE instructor_availability (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  day_of_week   INT  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun … 6=Sat
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

> The vehicle authorization rule (instructor must be assigned to the vehicle) is enforced at the application layer when creating an availability window, not at the DB level — PostgreSQL CHECK constraints cannot reference other tables.

#### `lesson_slots`
Central entity. One row per individual 50-minute lesson. Replaces classes, schedules, enrollments, attendance_records, student_absences, and schedule_cancellations.
```sql
CREATE TABLE lesson_slots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instructor_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id            UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  scheduled_date        DATE NOT NULL,
  start_time            TIME NOT NULL,
  -- end_time is always start_time + 50 min, computed by application
  status                VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                          CHECK (status IN (
                            'scheduled',
                            'completed',
                            'cancelled',
                            'no_show',
                            'absent_valid',
                            'absent_charged'
                          )),
  plate_at_checkin      VARCHAR(10),
  validated_by          UUID REFERENCES users(id),
  validated_at          TIMESTAMP,
  absence_declared_at   TIMESTAMP,
  cancellation_reason   TEXT,
  cancelled_by          UUID REFERENCES users(id),
  cancelled_at          TIMESTAMP,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `exam_results`
Replaces assignments + grades. One row per practical exam attempt per student.
```sql
CREATE TABLE exam_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users(id),
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id),
  exam_date     DATE NOT NULL,
  result        VARCHAR(10) NOT NULL CHECK (result IN ('passed', 'failed')),
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tables Modified

#### `users`
Two columns added for students:

```sql
ALTER TABLE users ADD COLUMN purchased_lessons INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN category VARCHAR(5)
  CHECK (category IN ('A', 'B', 'AB', 'C', 'D', 'E'));
```

`purchased_lessons` and `category` are ignored for `admin` and `instructor` roles — no DB constraint enforces this; the application layer rejects these fields for non-student users.

### Tables Kept Unchanged

- `notifications`
- `notification_preferences`

---

## Business Rules

### Vehicles & Instructor Authorization
- A vehicle must exist before it can be assigned to an instructor.
- An instructor may be assigned to zero or more vehicles.
- An instructor's availability window may only reference a vehicle they are assigned to.
- Removing the instructor-vehicle link also removes all `instructor_availability` rows for that instructor+vehicle combination (cascade on delete in application layer or via DB trigger).
- Existing `lesson_slots` referencing that instructor+vehicle are **not** affected — they are historical records and remain as-is.
- When admin reschedules a lesson to a new instructor+vehicle, the new combination must also be valid (instructor assigned to that vehicle).

### Purchased Lessons & Saldo
- `purchased_lessons` is the total number of lessons the student has purchased (set by admin).
- **Remaining balance** = `purchased_lessons` minus the count of `lesson_slots` with status IN (`scheduled`, `completed`, `no_show`, `absent_charged`).
- Statuses `cancelled` and `absent_valid` do **not** consume balance — the lesson is returned to the student.
- Admin cannot schedule more lessons than the remaining balance.
- A student cannot book an extra (avulsa) lesson if balance = 0.

### Recurring Booking
- Admin selects: student, instructor, vehicle, one or more days of week, start time, start date, and quantity N.
- N must satisfy: N ≤ remaining balance AND each generated slot must fall within an `instructor_availability` window AND must not conflict with an existing `lesson_slot` for that instructor+vehicle+date+start_time.
- The system creates exactly N `lesson_slots` records, distributing them across the selected days starting from the start date in chronological order.
- If any slot in the batch conflicts, the entire batch is rejected — partial creation is not allowed.

### Rescheduling
- Both admin and student may reschedule a `lesson_slot` with status `scheduled` or `absent_valid`.
- Rescheduling updates `instructor_id`, `vehicle_id`, `scheduled_date`, and `start_time` on the existing record (does not create a new one or consume balance).
- The new slot must be free (no other `lesson_slot` for that instructor+vehicle+date+start_time with status `scheduled` or `completed`).
- Admin may change instructor and vehicle freely. The student also picks from any instructor's free slots.
- Notification is sent to the student when admin reschedules their lesson.

### Attendance (Instructor)
- Instructor may mark `completed` on a `lesson_slot` for the current day only (application enforces date = today).
- `plate_at_checkin`, `validated_by`, and `validated_at` are set at this point.
- Instructor may mark `no_show` only if the student has not already declared absence (`absence_declared_at IS NULL`).

### Absence Declaration (Student)
- Student may declare absence on a `lesson_slot` with status `scheduled` and `scheduled_date >= today`.
- If declared ≥ 1 hour before `start_time` on `scheduled_date`: status → `absent_valid`. The lesson does **not** consume balance; the student may reschedule this slot to a new date/time (status returns to `scheduled`).
- If declared < 1 hour before `start_time` on `scheduled_date`: status → `absent_charged`. The lesson consumes balance and cannot be rescheduled.

### Available Slots Query
- A slot is **available** if:
  1. It falls within an `instructor_availability` window (day + time range).
  2. No `lesson_slot` exists for that instructor + vehicle + date + start_time with status IN (`scheduled`, `completed`).
- Slots are 50 minutes long; the query expands availability windows into 50-min increments and subtracts occupied ones.

---

## API Endpoints

### Vehicles
| Method | Path | Roles |
|---|---|---|
| GET | `/api/vehicles` | admin, instructor |
| POST | `/api/vehicles` | admin |
| PUT | `/api/vehicles/:id` | admin |
| DELETE | `/api/vehicles/:id` | admin |

### Instructor ↔ Vehicle
| Method | Path | Roles |
|---|---|---|
| GET | `/api/instructors/:id/vehicles` | admin; instructor (own) |
| POST | `/api/instructors/:id/vehicles` | admin |
| DELETE | `/api/instructors/:id/vehicles/:vid` | admin |

### Instructor Availability
| Method | Path | Roles |
|---|---|---|
| GET | `/api/instructors/:id/availability` | admin; instructor (own) |
| POST | `/api/instructors/:id/availability` | admin |
| DELETE | `/api/instructors/:id/availability/:aid` | admin |

### Available Slots
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/slots/available` | admin, student | Query params: `date_from`, `date_to`, `instructor_id` (optional filter) |

### Lesson Slots
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/api/lesson-slots/batch` | admin | Creates N recurring slots |
| POST | `/api/lesson-slots` | admin, student | Creates single (avulsa) slot |
| GET | `/api/lesson-slots` | admin (all), instructor (own), student (own) | Filters: `date`, `status`, `student_id`, `instructor_id` |
| GET | `/api/lesson-slots/:id` | admin; instructor (own); student (own) | |
| PUT | `/api/lesson-slots/:id/reschedule` | admin, student | Body: `instructor_id`, `vehicle_id`, `scheduled_date`, `start_time` |
| PUT | `/api/lesson-slots/:id/checkin` | admin, instructor | Body: `plate_at_checkin` |
| PUT | `/api/lesson-slots/:id/no-show` | admin, instructor | Only if no absence declared |
| POST | `/api/lesson-slots/:id/absence` | student | Applies 1-hour rule automatically |
| DELETE | `/api/lesson-slots/:id` | admin | Sets status = cancelled |

### Exam Results
| Method | Path | Roles |
|---|---|---|
| GET | `/api/exam-results` | admin (all); instructor (own students); student (own) — filter by `student_id` |
| POST | `/api/exam-results` | admin, instructor |
| PUT | `/api/exam-results/:id` | admin; instructor (own) |
| DELETE | `/api/exam-results/:id` | admin |

---

## Frontend Changes

### New Screens (Admin)

| Screen | Purpose |
|---|---|
| `AdminVehicleManagement` | CRUD for vehicles; shows instructors linked to each vehicle |
| `AdminInstructorSetup` | Link instructor to vehicles; manage availability windows |
| `AdminSchedulingScreen` | Book recurring lessons (multi-day pattern, quantity, start date); preview before confirming; view and reallocate existing lesson_slots |

### Adapted Screens (Admin)

| Screen | Changes |
|---|---|
| `AdminUserManagement` | Add `purchased_lessons` and `category` fields for students; modal shows remaining lesson balance; remove class/enrollment references |
| `AdminDashboard` | Replace `expandScheduleToDates` with direct `lesson_slots WHERE date = today` query |
| `AdminReports` | Adapt query to `lesson_slots` for session counts by instructor/month |

### Adapted Screens (Instructor)

| Screen | Changes |
|---|---|
| `InstructorAgendaScreen` | Source from `lesson_slots` instead of schedules; add "Não compareceu" button per student; remove cancel-class button (admin-only action) |
| `InstructorTestResultScreen` | Source from `exam_results`; remove class/turma reference |

### Adapted Screens (Student)

| Screen | Changes |
|---|---|
| `StudentScheduleScreen` | Source from `lesson_slots`; add "Remarcar" button per lesson and "Adicionar aula" button (avulsa, only if balance > 0); both open a slot picker showing free slots across all instructors |
| `StudentProgressScreen` | Show `purchased_lessons` balance; source attendance history from `lesson_slots`; source exam result from `exam_results` |

### Removed Screens

| Screen | Reason |
|---|---|
| `StudentMyClassesScreen` | Class concept no longer exists |

### Minor Changes

- `MainLayout`: remove "Minhas Turmas" nav item; add links to new admin screens
- `ProfileScreen`: no changes required

---

## Notification Triggers

The existing notification infrastructure (in-app + optional WhatsApp) must fire on:

| Event | Recipients |
|---|---|
| Admin reschedules a student's lesson | Student |
| Admin cancels a lesson | Student |
| Cron reminder (configurable minutes before start) | Student + Instructor |

Student-initiated reschedule and absence declaration do not trigger notifications to the instructor.

---

## Cron & Notifications

The cron reminder (`POST /api/cron/send-reminders`) currently queries `schedules` expanded to dates. It must be updated to query `lesson_slots WHERE scheduled_date = today AND status = 'scheduled'` and apply the same `minutes_before` window logic. No changes to the notification tables, WhatsApp integration, or cron trigger.

---

## Migration Notes

Migrations 001–013 stay intact. New migrations (014 onward):

| # | Migration |
|---|---|
| 014 | Drop tables: `grades`, `assignments`, `schedule_cancellations`, `student_absences`, `attendance_records`, `enrollments`, `schedules`, `classes` |
| 015 | Create `vehicles` |
| 016 | Create `instructor_vehicles` |
| 017 | Create `instructor_availability` |
| 018 | Create `lesson_slots` |
| 019 | Create `exam_results` |
| 020 | `ALTER TABLE users ADD COLUMN purchased_lessons`, `ADD COLUMN category` |

> **Note:** Migration 014 must drop tables in dependency order. `grades` and `assignments` before nothing; `attendance_records`, `student_absences`, `schedule_cancellations` before `schedules`; `enrollments` and `schedules` before `classes`.

---

## Testing

All existing tests for the removed modules (classes, schedules, enrollments, attendance, absences, cancellations, assignments, grades) become invalid and must be deleted. New test files:

| File | Coverage |
|---|---|
| `tests/vehicles.test.js` | CRUD, authorization |
| `tests/instructor-vehicles.test.js` | Link/unlink, cascade on availability |
| `tests/instructor-availability.test.js` | CRUD, vehicle authorization check |
| `tests/slots.test.js` | Available slots query: expansion, conflict exclusion |
| `tests/lesson-slots.test.js` | Batch creation, balance cap, conflict validation, reschedule, checkin, no-show, absence (1h rule) |
| `tests/exam-results.test.js` | CRUD, instructor scoping |

The notification and cron tests (`tests/cron.test.js`) need to be updated to use `lesson_slots` fixtures instead of schedules.
