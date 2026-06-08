// src/routes/schedules.js
import express from 'express';
import { Schedule } from '../models/Schedule.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';
import { paginate, paginatedResponse } from '../utils/paginate.js';
import { ScheduleCancellation } from '../models/ScheduleCancellation.js';
import { Class } from '../models/Class.js';
import { Notification } from '../models/Notification.js';
import { sendWhatsApp } from '../utils/whatsapp.js';
import { query } from '../db/pool.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { StudentAbsence } from '../models/StudentAbsence.js';

const router = express.Router();

/**
 * GET /api/schedules
 * List schedules
 * Query params: ?classId= or ?instructorId=
 * Requires authentication
 */
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

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/schedules/:id
 * Get schedule by ID
 * Requires authentication
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidRegex.test(id)) {
      throw new NotFoundError('Schedule not found');
    }
    const schedule = await Schedule.findById(id);
    res.status(200).json(schedule);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * POST /api/schedules
 * Create new schedule
 * Requires authentication and ADMIN or INSTRUCTOR role
 * Body: { classId, dayOfWeek, startTime, endTime }
 */
router.post('/', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { classId, dayOfWeek, startTime, endTime } = req.body;

    const newSchedule = await Schedule.create(classId, dayOfWeek, startTime, endTime);

    res.status(201).json(newSchedule);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * PUT /api/schedules/:id
 * Update schedule
 * Requires authentication and ADMIN or INSTRUCTOR role
 * Only instructor owner or admin can update
 * Body: { dayOfWeek?, startTime?, endTime? }
 */
router.put('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidRegex.test(id)) {
      throw new NotFoundError('Schedule not found');
    }
    const { dayOfWeek, startTime, endTime } = req.body;

    const updates = {};
    if (dayOfWeek !== undefined) updates.day_of_week = dayOfWeek;
    if (startTime !== undefined) updates.start_time = startTime;
    if (endTime !== undefined) updates.end_time = endTime;

    const updatedSchedule = await Schedule.update(id, updates, req.user.userId, req.user.role);

    res.status(200).json(updatedSchedule);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * DELETE /api/schedules/:id
 * Delete schedule
 * Requires authentication and ADMIN or INSTRUCTOR role
 * Only instructor owner or admin can delete
 */
router.delete('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidRegex.test(id)) {
      throw new NotFoundError('Schedule not found');
    }

    await Schedule.delete(id, req.user.userId, req.user.role);

    res.status(204).send();
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * POST /api/schedules/:id/cancel
 * Cancel class schedule on date
 * Requires authentication and ADMIN or INSTRUCTOR role
 * Body: { date, reason }
 */
router.post('/:id/cancel', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { id } = req.params;
    const { date, reason } = req.body;

    if (!uuidRegex.test(id)) {
      throw new NotFoundError('Schedule not found');
    }

    if (!date) {
      throw new BadRequestError('Date is required');
    }

    // Fetch the schedule
    const schedule = await Schedule.findById(id);

    // Fetch the class to check instructor ownership
    const classRow = await Class.findById(schedule.class_id);

    // Check authorization: Admin can cancel any, instructor can only cancel their own class
    if (req.user.role !== USER_ROLES.ADMIN && classRow.instructor_id !== req.user.userId) {
      throw new ForbiddenError('Not authorized to cancel this class');
    }

    // Cancel class
    const cancellation = await ScheduleCancellation.create(id, date, reason, req.user.userId);

    // Query for all enrolled students in the class, plus the instructor of the class
    const usersResult = await query(
      `SELECT u.id, u.name, u.phone_number,
              COALESCE(np.whatsapp_enabled, false) AS whatsapp_enabled
       FROM enrollments e
       JOIN users u ON e.student_id = u.id
       LEFT JOIN notification_preferences np ON np.user_id = u.id
       WHERE e.class_id = $1
       UNION
       SELECT u.id, u.name, u.phone_number,
              COALESCE(np.whatsapp_enabled, false) AS whatsapp_enabled
       FROM users u
       LEFT JOIN notification_preferences np ON np.user_id = u.id
       WHERE u.id = $2`,
      [classRow.id, classRow.instructor_id]
    );

    // Loop through these users and create a \`class_cancelled\` notification for each
    for (const user of usersResult.rows) {
      // Create notification
      await Notification.create(
        user.id,
        'class_cancelled',
        'Aula Cancelada',
        `A aula do dia ${date} foi cancelada. Motivo: ${reason || 'Não informado'}.`,
        id,
        date
      );

      // If phone_number and whatsapp_enabled are true, call sendWhatsApp
      if (user.phone_number && user.whatsapp_enabled) {
        const message = `Olá, ${user.name}! A aula do dia ${date} foi cancelada. Motivo: ${reason || 'Não informado'}.`;
        await sendWhatsApp(user.phone_number, message);
      }
    }

    res.status(201).json(cancellation);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * DELETE /api/schedules/:id/cancel/:date
 * Remove cancellation
 * Requires authentication and ADMIN or INSTRUCTOR role
 */
router.delete('/:id/cancel/:date', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { id, date } = req.params;

    if (!uuidRegex.test(id)) {
      throw new NotFoundError('Cancellation not found');
    }

    if (!date) {
      throw new BadRequestError('Date is required');
    }

    // Fetch the schedule
    const schedule = await Schedule.findById(id);

    // Fetch the class to check instructor ownership
    const classRow = await Class.findById(schedule.class_id);

    // Check authorization: Admin or instructor owner of class
    if (req.user.role !== USER_ROLES.ADMIN && classRow.instructor_id !== req.user.userId) {
      throw new ForbiddenError('Not authorized to manage cancellations for this class');
    }

    await ScheduleCancellation.delete(id, date);

    res.status(200).json({ message: 'Cancellation removed' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * GET /api/schedules/:id/cancellations
 * List cancellations for schedule
 * Requires authentication
 */
router.get('/:id/cancellations', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!uuidRegex.test(id)) {
      throw new NotFoundError('Schedule not found');
    }

    // Verify schedule exists
    await Schedule.findById(id);

    const list = await ScheduleCancellation.findBySchedule(id);
    res.status(200).json(list);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

// POST /api/schedules/:id/absence
// Student declares absence for a class session
router.post('/:id/absence', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;
    const { userId, role } = req.user;

    if (role !== USER_ROLES.STUDENT) {
      return res.status(403).json({ error: 'Only students can declare absences', statusCode: 403 });
    }

    if (!date) return res.status(400).json({ error: 'date is required', statusCode: 400 });

    const schedule = await Schedule.findById(id);
    const enrollment = await query(
      'SELECT 1 FROM enrollments WHERE student_id = $1 AND class_id = $2',
      [userId, schedule.class_id]
    );
    if (enrollment.rows.length === 0) {
      return res.status(403).json({ error: 'Not enrolled in this class', statusCode: 403 });
    }

    const result = await StudentAbsence.declare(userId, id, date);

    const classRow = await query('SELECT name FROM classes WHERE id = $1', [schedule.class_id]);
    const className = classRow.rows[0].name;

    await Notification.create(
      userId,
      'absence_confirmed',
      `Ausência registada: ${className}`,
      result.absence.status === 'valid'
        ? `Ausência registada com sucesso para ${date}.`
        : `Ausência registada para ${date}, mas a aula será cobrada (declarada com menos de 1 hora de antecedência).`,
      id,
      date
    );

    const userRow = await query('SELECT phone_number FROM users WHERE id = $1', [userId]);
    const prefsRow = await query(
      'SELECT whatsapp_enabled FROM notification_preferences WHERE user_id = $1',
      [userId]
    );
    const whatsappEnabled = prefsRow.rows[0]?.whatsapp_enabled ?? false;
    const phone = userRow.rows[0]?.phone_number;

    if (phone && whatsappEnabled) {
      const msg = result.absence.status === 'valid'
        ? `Olá! ✅\n\nA sua ausência na aula de ${className} em ${date} foi registada com sucesso.\n\nAté a próxima! 👋`
        : `Olá! ⚠️\n\nA sua ausência foi registada, mas como falta menos de 1 hora para a aula de ${className}, a aula será cobrada mesmo assim.\n\nEm caso de dúvida, contacte o seu instrutor.`;
      await sendWhatsApp(phone, msg);
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// GET /api/schedules/:id/absences
// Admin or instructor views absences for a schedule
router.get('/:id/absences', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const absences = await StudentAbsence.findBySchedule(req.params.id, req.query.date ?? null);
    res.status(200).json(absences);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

export default router;
