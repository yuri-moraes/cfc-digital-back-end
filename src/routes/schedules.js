// src/routes/schedules.js
import express from 'express';
import { Schedule } from '../models/Schedule.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';

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

    let schedules;

    if (classId) {
      schedules = await Schedule.listByClass(classId);
    } else if (instructorId) {
      schedules = await Schedule.listByInstructor(instructorId);
    } else {
      // Return empty if no query params
      schedules = [];
    }

    res.status(200).json(schedules);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * GET /api/schedules/:id
 * Get schedule by ID
 * Requires authentication
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
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

export default router;
