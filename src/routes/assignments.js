import express from 'express';
import { Assignment } from '../models/Assignment.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';

const router = express.Router();

// GET /api/assignments?classId=<id>
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { classId } = req.query;
    if (!classId) {
      return res.status(400).json({ error: 'classId query parameter is required', statusCode: 400 });
    }
    const assignments = await Assignment.findByClassId(classId);
    res.status(200).json(assignments);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// GET /api/assignments/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    res.status(200).json(assignment);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// POST /api/assignments
router.post('/', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { classId, title, description, dueDate, maxScore } = req.body;
    const assignment = await Assignment.create(classId, title, description, dueDate, maxScore);
    res.status(201).json(assignment);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// PUT /api/assignments/:id
router.put('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { title, description, dueDate, maxScore } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (dueDate !== undefined) updates.dueDate = dueDate;
    if (maxScore !== undefined) updates.maxScore = maxScore;

    const updated = await Assignment.update(req.params.id, updates, req.user.userId, req.user.role);
    res.status(200).json(updated);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

// DELETE /api/assignments/:id
router.delete('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    await Assignment.delete(req.params.id, req.user.userId, req.user.role);
    res.status(200).json({ message: 'Assignment deleted' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

export default router;
