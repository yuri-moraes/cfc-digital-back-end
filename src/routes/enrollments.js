// src/routes/enrollments.js
import express from 'express';
import { Enrollment } from '../models/Enrollment.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';
import { paginate, paginatedResponse } from '../utils/paginate.js';

const router = express.Router();

/**
 * GET /api/enrollments
 * List enrollments
 * Query params: ?studentId= or ?classId=
 * Students can only view own enrollments
 * Instructors can only view their class enrollments
 * Admins can view all
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { studentId, classId } = req.query;
    const { userId, role } = req.user;
    const { page, limit, offset } = paginate(req);

    if (studentId) {
      if (role === USER_ROLES.STUDENT && userId !== studentId) {
        return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
      }
      const { rows, total } = await Enrollment.listByStudent(studentId, { limit, offset });
      return res.status(200).json(paginatedResponse(rows, total, { page, limit }));
    }

    if (classId) {
      const { rows, total } = await Enrollment.listByClass(classId, { limit, offset });
      return res.status(200).json(paginatedResponse(rows, total, { page, limit }));
    }

    if (role !== USER_ROLES.ADMIN) {
      return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
    }

    const { rows, total } = await Enrollment.listAll({ limit, offset });
    res.status(200).json(paginatedResponse(rows, total, { page, limit }));
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message, statusCode });
  }
});

/**
 * POST /api/enrollments
 * Enroll student in class
 * Requires auth and ADMIN or STUDENT role
 * Students can only enroll themselves
 * Body: { studentId, classId }
 */
router.post('/', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.STUDENT), async (req, res) => {
  try {
    const { studentId, classId } = req.body;
    const { userId, role } = req.user;

    // Validate required fields
    if (!studentId) {
      return res.status(400).json({
        error: 'Student ID is required',
        statusCode: 400,
      });
    }

    if (!classId) {
      return res.status(400).json({
        error: 'Class ID is required',
        statusCode: 400,
      });
    }

    // Students can only enroll themselves
    if (role === USER_ROLES.STUDENT && userId !== studentId) {
      return res.status(403).json({
        error: 'Students can only enroll themselves',
        statusCode: 403,
      });
    }

    // Create enrollment
    const enrollment = await Enrollment.create(studentId, classId);

    res.status(201).json(enrollment);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * DELETE /api/enrollments/:id
 * Drop enrollment
 * Requires auth and ADMIN, STUDENT, or INSTRUCTOR role
 * Student can only drop own
 * Instructor can only drop from own classes
 * Admin can drop any
 */
router.delete('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.STUDENT, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.user;

    // Delete enrollment with authorization check
    await Enrollment.delete(id, userId, role);

    res.status(200).json({
      message: 'Enrollment deleted successfully',
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

export default router;
