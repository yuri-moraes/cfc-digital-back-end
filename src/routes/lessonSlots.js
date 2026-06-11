import express from 'express';
import { LessonSlot } from '../models/LessonSlot.js';
import { Notification } from '../models/Notification.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';

const router = express.Router();
const { ADMIN, INSTRUCTOR, STUDENT } = USER_ROLES;

router.post('/batch', authMiddleware, requireRole(ADMIN), async (req, res) => {
  const { student_id, instructor_id, vehicle_id, days_of_week, start_time, start_date, quantity } = req.body;
  const slots = await LessonSlot.createBatch(
    student_id, instructor_id, vehicle_id,
    days_of_week, start_time, start_date, Number(quantity)
  );
  res.status(201).json(slots);
});

router.post('/', authMiddleware, requireRole(ADMIN, STUDENT), async (req, res) => {
  const { student_id, instructor_id, vehicle_id, scheduled_date, start_time } = req.body;
  const effectiveStudentId = req.user.role === STUDENT ? req.user.userId : student_id;
  const slot = await LessonSlot.createSingle(
    effectiveStudentId, instructor_id, vehicle_id, scheduled_date, start_time
  );
  res.status(201).json(slot);
});

router.get('/', authMiddleware, async (req, res) => {
  const filters = {};
  const { date, status, limit = 50, page = 1 } = req.query;
  const offset = (page - 1) * limit;
  if (req.user.role === INSTRUCTOR) filters.instructorId = req.user.userId;
  if (req.user.role === STUDENT)     filters.studentId    = req.user.userId;
  if (date)   filters.date   = date;
  if (status) filters.status = status;
  const result = await LessonSlot.list({ ...filters, limit: Number(limit), offset: Number(offset) });
  res.json(result);
});

router.get('/:id', authMiddleware, async (req, res) => {
  const slot = await LessonSlot.findById(req.params.id);
  if (req.user.role === INSTRUCTOR && slot.instructor_id !== req.user.userId) {
    return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
  }
  if (req.user.role === STUDENT && slot.student_id !== req.user.userId) {
    return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
  }
  res.json(slot);
});

router.put('/:id/reschedule', authMiddleware, requireRole(ADMIN, STUDENT), async (req, res) => {
  const { instructor_id, vehicle_id, scheduled_date, start_time } = req.body;
  const slot = await LessonSlot.reschedule(req.params.id, {
    instructorId: instructor_id, vehicleId: vehicle_id,
    scheduledDate: scheduled_date, startTime: start_time
  });
  if (req.user.role === ADMIN) {
    await Notification.create(
      slot.student_id, 'class_rescheduled',
      'Aula remarcada',
      `Sua aula foi remarcada para ${scheduled_date} às ${start_time}.`,
      slot.id
    );
  }
  res.json(slot);
});

router.put('/:id/checkin', authMiddleware, requireRole(ADMIN, INSTRUCTOR), async (req, res) => {
  const instructorId = req.user.role === INSTRUCTOR ? req.user.userId : req.body.instructor_id;
  const slot = await LessonSlot.checkin(req.params.id, instructorId, req.body.plate_at_checkin);
  res.json(slot);
});

router.put('/:id/no-show', authMiddleware, requireRole(ADMIN, INSTRUCTOR), async (req, res) => {
  const instructorId = req.user.role === INSTRUCTOR ? req.user.userId : req.body.instructor_id;
  const slot = await LessonSlot.noShow(req.params.id, instructorId);
  res.json(slot);
});

router.post('/:id/absence', authMiddleware, requireRole(STUDENT), async (req, res) => {
  const slot = await LessonSlot.declareAbsence(req.params.id, req.user.userId);
  res.json(slot);
});

router.delete('/:id', authMiddleware, requireRole(ADMIN), async (req, res) => {
  const slot = await LessonSlot.cancel(req.params.id, req.user.userId, req.body?.reason);
  await Notification.create(
    slot.student_id, 'class_cancelled',
    'Aula cancelada',
    `Sua aula do dia ${slot.scheduled_date} às ${slot.start_time} foi cancelada.`,
    slot.id
  );
  res.json(slot);
});

export default router;
