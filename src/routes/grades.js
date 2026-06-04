import express from 'express';
import { Grade } from '../models/Grade.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';

const router = express.Router();

// GET /api/grades?assignmentId=<id>&studentId=<id>&classId=<id>
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { assignmentId, studentId, classId } = req.query;
    const { userId, role } = req.user;

    let grades;

    if (assignmentId) {
      grades = await Grade.findByAssignment(assignmentId);
    } else if (classId) {
      grades = await Grade.findByClass(classId);
    } else if (studentId) {
      grades = await Grade.findByStudent(studentId);
    } else {
      return res.status(400).json({ error: 'At least one filter (assignmentId, studentId, classId) is required', statusCode: 400 });
    }

    // Students can only see own grades
    if (role === USER_ROLES.STUDENT) {
      grades = grades.filter((g) => g.student_id === userId);
    }

    res.status(200).json(grades);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// GET /api/grades/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const grade = await Grade.findById(req.params.id);

    // Students can only see own grades
    if (req.user.role === USER_ROLES.STUDENT && grade.student_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
    }

    res.status(200).json(grade);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// POST /api/grades
router.post('/', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { assignmentId, studentId, numericScore, feedback } = req.body;
    const grade = await Grade.create(assignmentId, studentId, numericScore, feedback);
    res.status(201).json(grade);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// PUT /api/grades/:id
router.put('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { numericScore, feedback } = req.body;
    const updates = {};
    if (numericScore !== undefined) updates.numericScore = numericScore;
    if (feedback !== undefined) updates.feedback = feedback;

    const updated = await Grade.update(req.params.id, updates, req.user.userId, req.user.role);
    res.status(200).json(updated);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// DELETE /api/grades/:id
router.delete('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  try {
    await Grade.delete(req.params.id, req.user.userId, req.user.role);
    res.status(200).json({ message: 'Grade deleted' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

export default router;
