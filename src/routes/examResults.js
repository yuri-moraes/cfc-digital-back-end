import express from 'express';
import { ExamResult } from '../models/ExamResult.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';
import { paginate, paginatedResponse } from '../utils/paginate.js';

const router = express.Router();
const { ADMIN, INSTRUCTOR, STUDENT } = USER_ROLES;

router.get('/', authMiddleware, async (req, res) => {
  const { student_id } = req.query;
  const { page, limit, offset } = paginate(req);

  if (req.user.role === STUDENT) {
    if (student_id && student_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
    }
    const filters = { studentId: req.user.userId, limit, offset };
    const result = await ExamResult.list(filters);
    return res.json(paginatedResponse(result.data, result.meta.total, { page, limit }));
  }

  const filters = { limit, offset };
  if (student_id) filters.studentId = student_id;
  if (req.user.role === INSTRUCTOR) filters.instructorId = req.user.userId;
  const result = await ExamResult.list(filters);
  res.json(paginatedResponse(result.data, result.meta.total, { page, limit }));
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
