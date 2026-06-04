# Phase 2A: Grades & Photo-Based Attendance - Design Spec

**Date**: June 4, 2026  
**Status**: Design approved, ready for implementation planning  
**Timeline**: Phase 2A: 6-8 weeks  
**Team**: Single developer (or small team sharing responsibility)

---

## Overview

Phase 2A extends the CFC Digital backend (Phase 1: 25 endpoints, JWT auth, 4 models) with two new subsystems: **Grades** (per-assignment grading with auto letter-grade conversion) and **Attendance** (photo-based attendance with 48-hour admin validation window).

**Core principle**: Follow Phase 1 patterns (models → routes → tests) with 95%+ test coverage.

---

## Technology Stack

**New Dependencies:**
- **Vercel Blob Storage** — Photo upload/storage (built-in, serverless)
- **multer** (or Node.js built-in FormData) — File handling for photo uploads
- **All others**: Same as Phase 1 (Express, PostgreSQL, Jest, Supertest)

---

## Architecture

### Deployment Model

```
Frontend (Next.js)
       ↓
Backend API (Express) ← Phase 2A additions:
├── /api/assignments (5 endpoints)
├── /api/grades (5 endpoints)
└── /api/attendance (6 endpoints, photo uploads via Vercel Blob)
       ↓
PostgreSQL + Vercel Blob Storage
```

### Data Flow

**Grade Creation:**
1. Instructor (or Admin) creates assignment in a class
2. Instructor submits scores (0-100) for each student assignment
3. Backend auto-converts numeric → letter grade (US scale)
4. Grade stored in database with numeric_score + letter_grade

**Attendance Workflow:**
1. Instructor marks attendance by uploading student photo
2. Photo uploaded to Vercel Blob, URL stored in database
3. Attendance record created with status='pending', photo_uploaded_at=NOW()
4. Admin reviews pending attendance records (displays photo)
5. Admin validates or rejects:
   - Validate → status='validated', attendance confirmed
   - Reject → status='rejected', attendance denied
6. Lazy cleanup: When accessing attendance records, check if expired (48h old + pending status) and delete

---

## Database Schema

### New Tables (3 migrations)

#### Migration 005: Create assignments table

```sql
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date TIMESTAMP,
  max_score INT DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assignments_class_id ON assignments(class_id);
```

**Relationships:**
- One-to-many with Class (one class → many assignments)
- One-to-many with Grade (one assignment → many student grades)

#### Migration 006: Create grades table

```sql
CREATE TABLE grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  numeric_score INT NOT NULL CHECK (numeric_score >= 0 AND numeric_score <= 100),
  letter_grade VARCHAR(1) NOT NULL,
  feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(assignment_id, student_id)
);

CREATE INDEX idx_grades_assignment_id ON grades(assignment_id);
CREATE INDEX idx_grades_student_id ON grades(student_id);
```

**Constraints:**
- Numeric score: 0-100 (enforced at database + app level)
- Unique per student per assignment (no duplicate grades)
- Letter grade auto-derived from numeric_score (stored for performance)

**Letter Grade Conversion (US Scale):**
- 90-100 → A
- 80-89 → B
- 70-79 → C
- 60-69 → D
- 0-59 → F

#### Migration 007: Create attendance_records table

```sql
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected')),
  photo_url VARCHAR(500),
  photo_uploaded_at TIMESTAMP,
  validated_by UUID REFERENCES users(id),
  validated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, student_id, attendance_date)
);

CREATE INDEX idx_attendance_schedule_id ON attendance_records(schedule_id);
CREATE INDEX idx_attendance_student_id ON attendance_records(student_id);
CREATE INDEX idx_attendance_status ON attendance_records(status);
CREATE INDEX idx_attendance_date ON attendance_records(attendance_date);
```

**Fields:**
- `status` — Workflow state: pending → (validated OR rejected)
- `photo_url` — Vercel Blob storage URL (deleted with cleanup)
- `photo_uploaded_at` — Timestamp for 48-hour expiration check
- `validated_by` — Admin who validated (nullable until validated)
- `validated_at` — When validation occurred
- Unique constraint on (schedule_id, student_id, attendance_date) — One record per student per class session per day

---

## Models

### Assignment Model

```javascript
class Assignment {
  // Create assignment
  static create(classId, title, description, dueDate, maxScore)
    // Validate: classId, title required
    // Insert into assignments table
    // Return created assignment

  // Get assignment by ID
  static findById(id)
    // Return assignment with class details
    // Throw NotFoundError if not found

  // List assignments for a class
  static findByClassId(classId)
    // Return all assignments for class, ordered by created_at DESC

  // Update assignment (instructor/admin)
  static update(id, updates, requestingUserId, requestingUserRole)
    // Check: only instructor owner or admin can update
    // Allow updating: title, description, due_date, max_score
    // Throw ForbiddenError if not authorized
    // Return updated assignment

  // Delete assignment (instructor/admin)
  static delete(id, requestingUserId, requestingUserRole)
    // Check: only instructor owner or admin can delete
    // Cascading delete: removes associated grades
    // Throw ForbiddenError if not authorized
}
```

### Grade Model

```javascript
class Grade {
  // Create grade
  static create(assignmentId, studentId, numericScore, feedback)
    // Validate: score 0-100, assignment/student exist
    // Auto-convert numericScore → letter_grade
    // Insert into grades table
    // Throw ConflictError if grade already exists for this student/assignment
    // Return created grade with letter_grade

  // Get grade by ID
  static findById(id)
    // Return grade with assignment, student, and class details
    // Throw NotFoundError if not found

  // List grades for assignment
  static findByAssignment(assignmentId)
    // Return all grades for assignment with student names
    // Order by student name

  // List grades for student
  static findByStudent(studentId)
    // Return all grades for student, grouped by class/assignment
    // Order by created_at DESC

  // List grades for class
  static findByClass(classId)
    // Return all grades for all assignments in a class
    // Useful for instructors viewing class grades

  // Update grade
  static update(id, updates, requestingUserId, requestingUserRole)
    // Check: instructor of owning class or admin can update
    // Allow updating: numeric_score, feedback
    // Auto-recalculate letter_grade if numeric_score changes
    // Return updated grade

  // Delete grade
  static delete(id, requestingUserId, requestingUserRole)
    // Check: admin only (instructors should update, not delete)
    // Throw ForbiddenError if not admin
    // Return success

  // Helper: Convert numeric score to letter grade
  static convertToLetterGrade(numericScore)
    // Return letter (A/B/C/D/F) based on US scale
    // 90+=A, 80+=B, 70+=C, 60+=D, 0-59=F
}
```

### AttendanceRecord Model

```javascript
class AttendanceRecord {
  // Create attendance record (instructor marks attendance with photo)
  static create(scheduleId, studentId, attendanceDate, photoUrl)
    // Validate: scheduleId, studentId, attendanceDate, photoUrl required
    // Insert with status='pending', photo_uploaded_at=NOW()
    // Throw ConflictError if already marked for this date
    // Return created record

  // Get attendance record by ID
  static findById(id)
    // Return full record with student, class, schedule details
    // Check if expired and trigger cleanup if needed

  // List attendance for a schedule (by date)
  static findBySchedule(scheduleId, attendanceDate)
    // Return all attendance records for a specific class session
    // Check for expired records, trigger cleanup

  // List attendance for student (by class)
  static findByStudent(studentId, classId)
    // Return attendance history for student in a class
    // Check for expired records, trigger cleanup

  // List pending attendance (for admin validation)
  static findPending()
    // Return all attendance with status='pending'
    // Check for expired records, trigger cleanup
    // Return unexpired pending records only

  // Validate attendance (admin action)
  static validate(id, adminId)
    // Check: must be pending status
    // Set status='validated', validated_by=adminId, validated_at=NOW()
    // Return updated record
    // Throw NotFoundError or error if not pending

  // Reject attendance (admin action)
  static reject(id, adminId)
    // Check: must be pending status
    // Set status='rejected'
    // Delete photo from Vercel Blob
    // Return updated record (photo_url nullified)

  // Check if record is expired
  static isExpired(recordId)
    // Calculate: NOW() - photo_uploaded_at > 48 hours
    // Return boolean true if expired

  // Delete expired records (lazy cleanup)
  static deleteExpired()
    // Query: WHERE status='pending' AND photo_uploaded_at < (NOW() - 48 hours)
    // For each expired record:
    //   - Delete photo from Vercel Blob
    //   - Delete attendance record from database
    // Log cleanup actions
}
```

---

## API Endpoints

### Assignment Endpoints (5 total)

```
GET /api/assignments?classId=<id>
  Auth: Required (all roles)
  Returns: List of assignments for class

GET /api/assignments/:id
  Auth: Required (all roles)
  Returns: Assignment details

POST /api/assignments
  Auth: Required (instructor/admin)
  Body: { classId, title, description, dueDate, maxScore }
  Returns: 201 Created, assignment object

PUT /api/assignments/:id
  Auth: Required (instructor/admin)
  Body: { title, description, dueDate, maxScore }
  Returns: Updated assignment
  Permissions: Instructor of class or admin only

DELETE /api/assignments/:id
  Auth: Required (instructor/admin)
  Returns: { message: "Assignment deleted" }
  Permissions: Instructor of class or admin only
```

### Grade Endpoints (5 total)

```
GET /api/grades?assignmentId=<id>&studentId=<id>&classId=<id>
  Auth: Required (all roles)
  Returns: Filtered list of grades
  Permissions: 
    - Students see only own grades
    - Instructors see grades for own classes
    - Admins see all grades

GET /api/grades/:id
  Auth: Required (all roles)
  Returns: Grade details
  Permissions: Same as list

POST /api/grades
  Auth: Required (instructor/admin)
  Body: { assignmentId, studentId, numericScore, feedback }
  Returns: 201 Created, grade object with letter_grade
  Permissions: Instructor of class or admin only

PUT /api/grades/:id
  Auth: Required (instructor/admin)
  Body: { numericScore, feedback }
  Returns: Updated grade with recalculated letter_grade
  Permissions: Instructor of class or admin only

DELETE /api/grades/:id
  Auth: Required (admin)
  Returns: { message: "Grade deleted" }
  Permissions: Admin only
```

### Attendance Endpoints (6 total)

```
GET /api/attendance?status=<pending|validated|rejected>&classId=<id>&studentId=<id>&date=<YYYY-MM-DD>
  Auth: Required (all roles)
  Returns: Filtered attendance records
  Permissions:
    - Students see only own
    - Instructors see own classes
    - Admins see all
  Side effect: Lazy cleanup (delete expired records)

GET /api/attendance/:id
  Auth: Required (all roles)
  Returns: Attendance record with photo URL
  Permissions: Student sees own, instructor/admin see class/all
  Side effect: Check expiration, trigger cleanup if needed

POST /api/attendance
  Auth: Required (instructor)
  Body: multipart { scheduleId, studentId, attendanceDate, photo (file) }
  Returns: 201 Created, attendance record with photo_url
  Permissions: Instructor of class only
  File handling: Upload to Vercel Blob, store URL

PUT /api/attendance/:id/validate
  Auth: Required (admin)
  Body: {} (no body)
  Returns: Updated record with status='validated'
  Permissions: Admin only

PUT /api/attendance/:id/reject
  Auth: Required (admin)
  Body: {} (no body)
  Returns: Updated record with status='rejected'
  Side effect: Delete photo from Vercel Blob
  Permissions: Admin only

DELETE /api/attendance/:id
  Auth: Required (admin)
  Returns: { message: "Attendance record deleted" }
  Permissions: Admin only
```

---

## Authorization & Permissions

### Role-Based Access Control

```
ASSIGNMENTS:
├── Instructor: Create/read/update/delete own class assignments
├── Admin: Create/read/update/delete any assignment
└── Student: Read-only access to assignments for enrolled classes

GRADES:
├── Instructor: Create/read/update grades for own class assignments
├── Admin: Create/read/update/delete any grade
└── Student: Read own grades only

ATTENDANCE:
├── Instructor: Mark attendance (upload photos) for own classes
├── Admin: View/validate/reject/delete all attendance
└── Student: View own attendance records only
```

### Middleware Implementation

- **authMiddleware** — Validates JWT on all endpoints
- **requireRole('instructor', 'admin')** — For instructors/admin-only endpoints
- **ownershipCheck()** — For instructors verifying class/assignment ownership

---

## Testing Strategy

### Test Coverage Target: 95%+ (matching Phase 1)

**Test Files (3 new):**

#### tests/assignments.test.js (~25 tests)
- Create assignment (instructor/admin)
- Reject creation by student
- Update own/other assignments
- List assignments for class
- Delete with cascading to grades
- Authorization checks

#### tests/grades.test.js (~30 tests)
- Create grade (0-100 validation)
- Auto letter-grade conversion (all 5 grades: A/B/C/D/F)
- Update grades (recalculate letter grade)
- List grades (by assignment/student/class)
- Unique constraint enforcement
- Permissions (student/instructor/admin access)
- Delete (admin only)

#### tests/attendance.test.js (~35 tests)
- Mark attendance with photo upload
- Photo upload validation
- Admin validate workflow
- Admin reject workflow
- List pending/validated records
- Expiration logic (48-hour check with fake timestamps)
- Lazy cleanup on access
- Permissions (instructor marks, admin validates)
- Ownership checks
- Cascade delete with photo removal

**Total new tests: ~90**
**Total tests after Phase 2A: ~203**

### Testing Approach

- Mock Vercel Blob Storage for file operations in tests
- Use fake timestamps for expiration testing (e.g., `new Date(Date.now() - 49*60*60*1000)` for 49 hours ago)
- Test permission checks extensively (ownership validation)
- Integration tests for full workflows (upload → validate → cleanup)

---

## File Storage: Vercel Blob Integration

### Photo Upload Flow

1. **Instructor uploads photo:**
   ```
   POST /api/attendance with multipart/form-data
   Form: { scheduleId, studentId, attendanceDate, photo }
   ```

2. **Backend processes:**
   - Validates instructor is teaching the class
   - Uploads photo to Vercel Blob Storage
   - Gets photo URL from Vercel response
   - Creates AttendanceRecord with photo_url, status='pending'
   - Returns attendance record with photo URL

3. **Photo cleanup (lazy deletion):**
   ```javascript
   // Called when accessing attendance records
   if (record.status === 'pending' && isExpired(record)) {
     await deleteFromVercelBlob(record.photo_url);
     await deleteAttendanceRecord(record.id);
   }
   ```

### Vercel Blob Implementation

- Use Vercel's built-in file upload API
- Store reference as URL in database
- Auto-delete when cleanup runs
- No additional infrastructure needed (serverless)

---

## Error Handling

### HTTP Status Codes

| Code | Scenario |
|------|----------|
| 200 | GET success, update success |
| 201 | Create success |
| 400 | Validation error (invalid score, missing fields) |
| 401 | Unauthorized (missing token) |
| 403 | Forbidden (student trying to create grade, etc.) |
| 404 | Not found (assignment/grade/attendance not found) |
| 409 | Conflict (duplicate grade for student/assignment, duplicate attendance date) |
| 500 | Server error |

### Error Response Format

```json
{
  "error": "Numeric score must be between 0 and 100",
  "statusCode": 400,
  "details": { "field": "numeric_score" }
}
```

---

## Implementation Timeline

| Week | Task | Deliverables |
|------|------|--------------|
| 1-2 | Database setup | 3 migration files, schema verified |
| 2-3 | Assignment model + routes | CRUD working, 25+ tests passing |
| 3-4 | Grade model + letter-grade conversion | Grading workflow, 30+ tests |
| 4-5 | Attendance model + photo upload | Photo handling, Vercel integration |
| 5-6 | Attendance validation & cleanup | Admin workflow, expiration logic |
| 6-7 | Comprehensive testing | 90+ tests, 95%+ coverage |
| 7-8 | Integration, docs, deployment prep | Updated API docs, end-to-end tested |

---

## Success Criteria for Phase 2A

- ✅ 3 new models implemented (Assignment, Grade, AttendanceRecord)
- ✅ 16 new API endpoints fully functional
- ✅ 3 database migrations created and tested
- ✅ ~90 new tests passing with 95%+ coverage
- ✅ Vercel Blob photo storage integrated
- ✅ Lazy cleanup working (48-hour expiration)
- ✅ Full RBAC implemented and tested
- ✅ API documentation updated
- ✅ Can deploy to production with full functionality

---

## Next Steps: Phase 2B

After Phase 2A completion:
- **Notifications/Messaging System** — In-app messaging between instructors/students
- **Advanced Reporting** — Grade reports, attendance analytics, class performance reports

---

## Appendix: Letter Grade Conversion Reference

```
Numeric Score → Letter Grade (US Scale)
90-100 → A (Excellent)
80-89  → B (Good)
70-79  → C (Satisfactory)
60-69  → D (Passing)
0-59   → F (Failing)
```

Used in `Grade.convertToLetterGrade()` and stored in database for performance.
