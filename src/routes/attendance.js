import express from 'express';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { StudentAbsence } from '../models/StudentAbsence.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';
import { paginate, paginatedResponse } from '../utils/paginate.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, classId, studentId, date, scheduleId } = req.query;
    const { userId, role } = req.user;
    const { page, limit, offset } = paginate(req);

    const studentFilter = role === USER_ROLES.STUDENT ? userId : null;
    let result;

    if (status === 'pending') {
      result = await AttendanceRecord.findPending({ limit, offset, studentId: studentFilter });
    } else if (scheduleId && date) {
      result = await AttendanceRecord.findBySchedule(scheduleId, date, { limit, offset, studentId: studentFilter });
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

// GET /api/attendance/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const record = await AttendanceRecord.findById(req.params.id);

    // Students can only see own records
    if (req.user.role === USER_ROLES.STUDENT && record.student_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
    }

    res.status(200).json(record);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// POST /api/attendance — JSON body with optional plate
router.post('/', authMiddleware, requireRole(USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { scheduleId, studentId, attendanceDate, plate } = req.body;
    const record = await AttendanceRecord.create(scheduleId, studentId, attendanceDate, plate ?? null);
    res.status(201).json(record);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// PUT /api/attendance/:id/validate
router.put('/:id/validate', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const record = await AttendanceRecord.validate(req.params.id, req.user.userId);
    await StudentAbsence.setNoShow(record.student_id, record.schedule_id, record.attendance_date);
    res.status(200).json(record);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// PUT /api/attendance/:id/reject
router.put('/:id/reject', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  try {
    const record = await AttendanceRecord.reject(req.params.id, req.user.userId);
    res.status(200).json(record);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// DELETE /api/attendance/:id
router.delete('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  try {
    await AttendanceRecord.delete(req.params.id);
    res.status(200).json({ message: 'Attendance record deleted' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

export default router;
