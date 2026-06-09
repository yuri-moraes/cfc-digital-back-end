import { jest } from '@jest/globals';

// ESM-compatible mock for @vercel/blob (must declare before dynamic imports)
const mockDel = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('@vercel/blob', () => ({
  del: mockDel,
}));

// Dynamic imports required after unstable_mockModule in ESM
const { User } = await import('../src/models/User.js');
const { Class } = await import('../src/models/Class.js');
const { Schedule } = await import('../src/models/Schedule.js');
const { AttendanceRecord } = await import('../src/models/AttendanceRecord.js');
const { query } = await import('../src/db/pool.js');
const { default: attendanceRouter } = await import('../src/routes/attendance.js');
const { USER_ROLES } = await import('../src/constants.js');
const { generateToken } = await import('../src/utils/jwt.js');

import express from 'express';
import request from 'supertest';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/attendance', attendanceRouter);
  return app;
}

describe('Attendance Routes', () => {
  let app;
  let adminToken, instructorToken, instructor2Token, studentToken, student2Token;
  let adminUser, instructorUser, instructor2User, studentUser, student2User;
  let testClass, testSchedule;

  beforeEach(async () => {
    app = createTestApp();

    jest.clearAllMocks();
    mockDel.mockResolvedValue(undefined);

    adminUser = await User.create('admin@test.com', 'password123', 'Admin User', USER_ROLES.ADMIN);
    instructorUser = await User.create('instructor@test.com', 'password123', 'Instructor User', USER_ROLES.INSTRUCTOR);
    instructor2User = await User.create('instructor2@test.com', 'password123', 'Instructor Two', USER_ROLES.INSTRUCTOR);
    studentUser = await User.create('student@test.com', 'password123', 'Student User', USER_ROLES.STUDENT);
    student2User = await User.create('student2@test.com', 'password123', 'Student Two', USER_ROLES.STUDENT);

    adminToken = generateToken({ userId: adminUser.id, email: adminUser.email, role: adminUser.role });
    instructorToken = generateToken({ userId: instructorUser.id, email: instructorUser.email, role: instructorUser.role });
    instructor2Token = generateToken({ userId: instructor2User.id, email: instructor2User.email, role: instructor2User.role });
    studentToken = generateToken({ userId: studentUser.id, email: studentUser.email, role: studentUser.role });
    student2Token = generateToken({ userId: student2User.id, email: student2User.email, role: student2User.role });

    testClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);
    testSchedule = await Schedule.create(testClass.id, 'Monday', '09:00', '11:00');
  });

  describe('POST /api/attendance', () => {
    it('should mark attendance with plate as instructor', async () => {
      const res = await request(app)
        .post('/api/attendance')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ scheduleId: testSchedule.id, studentId: studentUser.id, attendanceDate: '2026-06-04', plate: 'ABC-1234' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('pending');
      expect(res.body.plate).toBe('ABC-1234');
    });

    it('should mark attendance without plate', async () => {
      const res = await request(app)
        .post('/api/attendance')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ scheduleId: testSchedule.id, studentId: studentUser.id, attendanceDate: '2026-06-04' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.plate).toBeNull();
    });

    it('should reject attendance marking by student', async () => {
      await request(app)
        .post('/api/attendance')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ scheduleId: testSchedule.id, studentId: studentUser.id, attendanceDate: '2026-06-04' })
        .expect(403);
    });

    it('should reject attendance marking by admin', async () => {
      await request(app)
        .post('/api/attendance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scheduleId: testSchedule.id, studentId: studentUser.id, attendanceDate: '2026-06-04' })
        .expect(403);
    });

    it('should reject duplicate attendance for same student and date', async () => {
      await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');

      const res = await request(app)
        .post('/api/attendance')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ scheduleId: testSchedule.id, studentId: studentUser.id, attendanceDate: '2026-06-04' })
        .expect(409);

      expect(res.body.error).toContain('already marked');
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/attendance')
        .send({ scheduleId: testSchedule.id, studentId: studentUser.id, attendanceDate: '2026-06-04' })
        .expect(401);
    });
  });

  describe('GET /api/attendance/:id', () => {
    it('should get attendance record by ID as instructor', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');

      const res = await request(app)
        .get(`/api/attendance/${record.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(res.body.id).toBe(record.id);
      expect(res.body.status).toBe('pending');
      expect(res.body.student_name).toBe('Student User');
    });

    it('should allow student to see own attendance record', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');

      const res = await request(app)
        .get(`/api/attendance/${record.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.id).toBe(record.id);
    });

    it('should deny student from seeing another students record', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, student2User.id, '2026-06-04');

      await request(app)
        .get(`/api/attendance/${record.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent record', async () => {
      const res = await request(app)
        .get('/api/attendance/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);

      expect(res.body.error).toBe('Attendance record not found');
    });

    it('should require authentication', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');
      await request(app).get(`/api/attendance/${record.id}`).expect(401);
    });
  });

  describe('GET /api/attendance (list)', () => {
    it('should list pending attendance records for admin', async () => {
      await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');
      await AttendanceRecord.create(testSchedule.id, student2User.id, '2026-06-04');

      const res = await request(app)
        .get('/api/attendance?status=pending')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].status).toBe('pending');
    });

    it('should list attendance by schedule and date', async () => {
      await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');

      const res = await request(app)
        .get(`/api/attendance?scheduleId=${testSchedule.id}&date=2026-06-04`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
    });

    it('should list attendance by student and class', async () => {
      await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');

      const res = await request(app)
        .get(`/api/attendance?studentId=${studentUser.id}&classId=${testClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
    });

    it('should filter results to own records for student', async () => {
      await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');
      await AttendanceRecord.create(testSchedule.id, student2User.id, '2026-06-04');

      const res = await request(app)
        .get('/api/attendance?status=pending')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].student_id).toBe(studentUser.id);
    });

    it('should return 400 without required query params', async () => {
      await request(app)
        .get('/api/attendance')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(400);
    });

    it('should require authentication', async () => {
      await request(app).get('/api/attendance?status=pending').expect(401);
    });

    test('returns paginated shape for scheduleId+date filter', async () => {
      const response = await request(app)
        .get(`/api/attendance?scheduleId=${testSchedule.id}&date=2026-06-10`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });
  });

  describe('PUT /api/attendance/:id/validate', () => {
    it('should validate pending attendance as admin', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');

      const res = await request(app)
        .put(`/api/attendance/${record.id}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.status).toBe('validated');
      expect(res.body.validated_by).toBe(adminUser.id);
      expect(res.body.validated_at).toBeDefined();
    });

    it('should allow instructor to validate attendance', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');
      const res = await request(app)
        .put(`/api/attendance/${record.id}/validate`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);
      expect(res.body.status).toBe('validated');
    });

    it('should reject validating already validated attendance', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');
      await AttendanceRecord.validate(record.id, adminUser.id);

      const res = await request(app)
        .put(`/api/attendance/${record.id}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.error).toContain("status 'validated'");
    });

    it('should return 404 for non-existent record', async () => {
      await request(app)
        .put('/api/attendance/00000000-0000-0000-0000-000000000000/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');
      await request(app).put(`/api/attendance/${record.id}/validate`).expect(401);
    });
  });

  describe('PUT /api/attendance/:id/reject', () => {
    it('should reject pending attendance as admin and delete photo', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');

      const res = await request(app)
        .put(`/api/attendance/${record.id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.status).toBe('rejected');
      expect(res.body.photo_url).toBeNull();
    });

    it('should reject instructor from rejecting attendance', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');

      await request(app)
        .put(`/api/attendance/${record.id}/reject`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(403);
    });

    it('should reject rejecting already rejected attendance', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');
      await AttendanceRecord.reject(record.id, adminUser.id);

      const res = await request(app)
        .put(`/api/attendance/${record.id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.error).toContain("status 'rejected'");
    });

    it('should return 404 for non-existent record', async () => {
      await request(app)
        .put('/api/attendance/00000000-0000-0000-0000-000000000000/reject')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');
      await request(app).put(`/api/attendance/${record.id}/reject`).expect(401);
    });
  });

  describe('DELETE /api/attendance/:id', () => {
    it('should delete attendance record as admin', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');

      const res = await request(app)
        .delete(`/api/attendance/${record.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.message).toBe('Attendance record deleted');
    });

    it('should reject instructor from deleting attendance', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');

      await request(app)
        .delete(`/api/attendance/${record.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(403);
    });

    it('should reject student from deleting attendance', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');

      await request(app)
        .delete(`/api/attendance/${record.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent record', async () => {
      await request(app)
        .delete('/api/attendance/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');
      await request(app).delete(`/api/attendance/${record.id}`).expect(401);
    });
  });

  describe('Expiration logic (48-hour cleanup)', () => {
    it('should delete expired pending records on access', async () => {
      // Insert expired record directly (49 hours ago)
      const expiredTime = new Date(Date.now() - 49 * 60 * 60 * 1000);
      await query(
        `INSERT INTO attendance_records (schedule_id, student_id, attendance_date, status, photo_url, photo_uploaded_at, created_at)
         VALUES ($1, $2, $3, 'pending', $4, $5, $5)`,
        [testSchedule.id, studentUser.id, '2026-06-01', 'https://blob.vercel.com/expired.jpg', expiredTime]
      );

      // Fresh record
      const fresh = await AttendanceRecord.create(testSchedule.id, student2User.id, '2026-06-04');

      // Accessing findPending triggers cleanup
      const { rows: pending } = await AttendanceRecord.findPending();

      // Only fresh record remains
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(fresh.id);
      expect(mockDel).toHaveBeenCalledWith('https://blob.vercel.com/expired.jpg');
    });

    it('should not delete non-expired pending records', async () => {
      const record = await AttendanceRecord.create(testSchedule.id, studentUser.id, '2026-06-04');

      const { rows: pending } = await AttendanceRecord.findPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(record.id);
      expect(mockDel).not.toHaveBeenCalled();
    });

    it('should not delete validated records even if old', async () => {
      const expiredTime = new Date(Date.now() - 49 * 60 * 60 * 1000);
      const insertResult = await query(
        `INSERT INTO attendance_records (schedule_id, student_id, attendance_date, status, photo_url, photo_uploaded_at, created_at)
         VALUES ($1, $2, $3, 'validated', $4, $5, $5)
         RETURNING id`,
        [testSchedule.id, studentUser.id, '2026-06-01', 'https://blob.vercel.com/old.jpg', expiredTime]
      );

      await AttendanceRecord.findPending();

      // Validated record should still exist
      const result = await query('SELECT id FROM attendance_records WHERE id = $1', [insertResult.rows[0].id]);
      expect(result.rows).toHaveLength(1);
      expect(mockDel).not.toHaveBeenCalled();
    });
  });
});
