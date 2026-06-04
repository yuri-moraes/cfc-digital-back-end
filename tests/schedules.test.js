// tests/schedules.test.js
import express from 'express';
import request from 'supertest';
import { User } from '../src/models/User.js';
import { Class } from '../src/models/Class.js';
import { Schedule } from '../src/models/Schedule.js';
import schedulesRouter from '../src/routes/schedules.js';
import { USER_ROLES } from '../src/constants.js';
import { generateToken } from '../src/utils/jwt.js';

// Create test app with necessary middleware
function createTestApp() {
  const app = express();

  app.use(express.json());
  app.use('/api/schedules', schedulesRouter);

  return app;
}

describe('Schedules Routes', () => {
  let app;
  let adminToken;
  let instructorToken;
  let studentToken;
  let adminUser;
  let instructorUser;
  let studentUser;
  let testClass;

  beforeEach(async () => {
    app = createTestApp();

    // Create test users
    adminUser = await User.create('admin@test.com', 'password123', 'Admin User', USER_ROLES.ADMIN);
    instructorUser = await User.create('instructor@test.com', 'password123', 'Instructor User', USER_ROLES.INSTRUCTOR);
    studentUser = await User.create('student@test.com', 'password123', 'Student User', USER_ROLES.STUDENT);

    // Generate tokens
    adminToken = generateToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    });

    instructorToken = generateToken({
      userId: instructorUser.id,
      email: instructorUser.email,
      role: instructorUser.role,
    });

    studentToken = generateToken({
      userId: studentUser.id,
      email: studentUser.email,
      role: studentUser.role,
    });

    // Create a test class
    testClass = await Class.create('Math 101', 'Basic Mathematics', instructorUser.id);
  });

  describe('POST /api/schedules', () => {
    it('should create schedule as instructor', async () => {
      const response = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          classId: testClass.id,
          dayOfWeek: 'Monday',
          startTime: '09:00',
          endTime: '10:30',
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.class_id).toBe(testClass.id);
      expect(response.body.day_of_week).toBe('Monday');
      expect(response.body.start_time).toBeDefined();
      expect(response.body.end_time).toBeDefined();
    });

    it('should create schedule as admin', async () => {
      const response = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          classId: testClass.id,
          dayOfWeek: 'Wednesday',
          startTime: '14:00',
          endTime: '15:30',
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.day_of_week).toBe('Wednesday');
    });

    it('should reject invalid day of week', async () => {
      const response = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          classId: testClass.id,
          dayOfWeek: 'Funday',
          startTime: '09:00',
          endTime: '10:30',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/Invalid day of week/);
    });

    it('should reject end time before start time', async () => {
      const response = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          classId: testClass.id,
          dayOfWeek: 'Tuesday',
          startTime: '10:30',
          endTime: '09:00',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/End time must be after start time/);
    });

    it('should reject end time equal to start time', async () => {
      const response = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          classId: testClass.id,
          dayOfWeek: 'Tuesday',
          startTime: '09:00',
          endTime: '09:00',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/End time must be after start time/);
    });

    it('should reject student creating schedule', async () => {
      const response = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          classId: testClass.id,
          dayOfWeek: 'Monday',
          startTime: '09:00',
          endTime: '10:30',
        })
        .expect(403);

      expect(response.body.error).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/schedules')
        .send({
          classId: testClass.id,
          dayOfWeek: 'Monday',
          startTime: '09:00',
          endTime: '10:30',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should reject missing classId', async () => {
      const response = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          dayOfWeek: 'Monday',
          startTime: '09:00',
          endTime: '10:30',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/Class ID is required/);
    });

    it('should reject missing dayOfWeek', async () => {
      const response = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          classId: testClass.id,
          startTime: '09:00',
          endTime: '10:30',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/Day of week is required/);
    });

    it('should reject missing startTime', async () => {
      const response = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          classId: testClass.id,
          dayOfWeek: 'Monday',
          endTime: '10:30',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/Start time is required/);
    });

    it('should reject missing endTime', async () => {
      const response = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          classId: testClass.id,
          dayOfWeek: 'Monday',
          startTime: '09:00',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/End time is required/);
    });
  });

  describe('GET /api/schedules?classId=:id', () => {
    it('should list schedules for a class', async () => {
      // Create test schedules
      const schedule1 = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');
      const schedule2 = await Schedule.create(testClass.id, 'Wednesday', '14:00', '15:30');

      const response = await request(app)
        .get(`/api/schedules?classId=${testClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].id).toBe(schedule1.id);
      expect(response.body.data[1].id).toBe(schedule2.id);
    });

    it('should return empty list when class has no schedules', async () => {
      const response = await request(app)
        .get(`/api/schedules?classId=${testClass.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(response.body.data).toEqual([]);
    });

    it('should return empty list when no query params provided', async () => {
      // Create a schedule but don't query for it
      await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      const response = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      // Should return empty since no classId or instructorId provided
      expect(response.body.data).toEqual([]);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/schedules?classId=${testClass.id}`)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    test('returns paginated shape for classId filter', async () => {
      await Schedule.create(testClass.id, 'Monday', '09:00', '10:00');
      await Schedule.create(testClass.id, 'Wednesday', '09:00', '10:00');

      const response = await request(app)
        .get(`/api/schedules?classId=${testClass.id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta.total).toBe(2);
    });

    test('respects limit param', async () => {
      await Schedule.create(testClass.id, 'Monday', '09:00', '10:00');
      await Schedule.create(testClass.id, 'Wednesday', '09:00', '10:00');
      await Schedule.create(testClass.id, 'Friday', '09:00', '10:00');

      const response = await request(app)
        .get(`/api/schedules?classId=${testClass.id}&limit=2`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.body.data.length).toBe(2);
      expect(response.body.meta.total).toBe(3);
      expect(response.body.meta.totalPages).toBe(2);
    });
  });

  describe('GET /api/schedules?instructorId=:id', () => {
    it('should list schedules for instructor', async () => {
      // Create another class for the same instructor
      const class2 = await Class.create('Physics 101', 'Introduction to Physics', instructorUser.id);

      const schedule1 = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');
      const schedule2 = await Schedule.create(class2.id, 'Wednesday', '14:00', '15:30');

      const response = await request(app)
        .get(`/api/schedules?instructorId=${instructorUser.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.some(s => s.id === schedule1.id)).toBe(true);
      expect(response.body.data.some(s => s.id === schedule2.id)).toBe(true);
    });

    it('should return empty list when instructor has no schedules', async () => {
      const response = await request(app)
        .get(`/api/schedules?instructorId=${instructorUser.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(response.body.data).toEqual([]);
    });
  });

  describe('GET /api/schedules/:id', () => {
    it('should get schedule by ID', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(response.body.id).toBe(schedule.id);
      expect(response.body.class_id).toBe(testClass.id);
      expect(response.body.day_of_week).toBe('Monday');
    });

    it('should return 404 for non-existent schedule', async () => {
      const response = await request(app)
        .get('/api/schedules/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/Schedule not found/);
    });

    it('should require authentication', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}`)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('PUT /api/schedules/:id', () => {
    it('should update schedule day_of_week as owner instructor', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          dayOfWeek: 'Friday',
        })
        .expect(200);

      expect(response.body.id).toBe(schedule.id);
      expect(response.body.day_of_week).toBe('Friday');
      expect(response.body.start_time).toBe(schedule.start_time);
      expect(response.body.end_time).toBe(schedule.end_time);
    });

    it('should update schedule start_time and end_time', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          startTime: '10:00',
          endTime: '11:00',
        })
        .expect(200);

      expect(response.body.id).toBe(schedule.id);
      expect(response.body.start_time).toBeDefined();
      expect(response.body.end_time).toBeDefined();
    });

    it('should update schedule as admin', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          dayOfWeek: 'Thursday',
        })
        .expect(200);

      expect(response.body.day_of_week).toBe('Thursday');
    });

    it('should reject update by non-owner instructor', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');
      const otherInstructor = await User.create('other@test.com', 'password123', 'Other Instructor', USER_ROLES.INSTRUCTOR);
      const otherInstructorToken = generateToken({
        userId: otherInstructor.id,
        email: otherInstructor.email,
        role: otherInstructor.role,
      });

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${otherInstructorToken}`)
        .send({
          dayOfWeek: 'Friday',
        })
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/Not authorized/);
    });

    it('should reject invalid day_of_week in update', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          dayOfWeek: 'InvalidDay',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/Invalid day of week/);
    });

    it('should reject invalid time range in update', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          startTime: '11:00',
          endTime: '10:00',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/End time must be after start time/);
    });

    it('should reject student updating schedule', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          dayOfWeek: 'Friday',
        })
        .expect(403);

      expect(response.body.error).toBeDefined();
    });

    it('should require authentication', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      const response = await request(app)
        .put(`/api/schedules/${schedule.id}`)
        .send({
          dayOfWeek: 'Friday',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 404 for non-existent schedule', async () => {
      const response = await request(app)
        .put('/api/schedules/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          dayOfWeek: 'Friday',
        })
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/Schedule not found/);
    });
  });

  describe('DELETE /api/schedules/:id', () => {
    it('should delete schedule as owner instructor', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      await request(app)
        .delete(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(204);

      // Verify it's deleted
      const response = await request(app)
        .get(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should delete schedule as admin', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      await request(app)
        .delete(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify it's deleted
      const response = await request(app)
        .get(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should reject delete by non-owner instructor', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');
      const otherInstructor = await User.create('other2@test.com', 'password123', 'Other Instructor 2', USER_ROLES.INSTRUCTOR);
      const otherInstructorToken = generateToken({
        userId: otherInstructor.id,
        email: otherInstructor.email,
        role: otherInstructor.role,
      });

      const response = await request(app)
        .delete(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${otherInstructorToken}`)
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/Not authorized/);

      // Verify it's NOT deleted
      await request(app)
        .get(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);
    });

    it('should reject student deleting schedule', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      const response = await request(app)
        .delete(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(response.body.error).toBeDefined();

      // Verify it's NOT deleted
      await request(app)
        .get(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);
    });

    it('should require authentication', async () => {
      const schedule = await Schedule.create(testClass.id, 'Monday', '09:00', '10:30');

      const response = await request(app)
        .delete(`/api/schedules/${schedule.id}`)
        .expect(401);

      expect(response.body.error).toBeDefined();

      // Verify it's NOT deleted
      await request(app)
        .get(`/api/schedules/${schedule.id}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);
    });

    it('should return 404 for non-existent schedule', async () => {
      const response = await request(app)
        .delete('/api/schedules/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toMatch(/Schedule not found/);
    });
  });
});
