// src/routes/classes.js
import express from 'express';
import { Class } from '../models/Class.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';

const router = express.Router();

/**
 * GET /api/classes
 * List all classes
 * Requires authentication
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const classes = await Class.list();
    res.status(200).json(classes);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * GET /api/classes/:id
 * Get class by ID
 * Requires authentication
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const classData = await Class.findById(id);
    res.status(200).json(classData);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * POST /api/classes
 * Create new class
 * Requires authentication and ADMIN or INSTRUCTOR role
 */
router.post('/', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { name, description } = req.body;

    // Create class with current user as instructor
    const newClass = await Class.create(name, description, req.user.userId);

    res.status(201).json(newClass);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * PUT /api/classes/:id
 * Update class
 * Requires authentication and ADMIN or INSTRUCTOR role
 * Only instructor owner or admin can update
 */
router.put('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    const updatedClass = await Class.update(id, updates, req.user.userId, req.user.role);

    res.status(200).json(updatedClass);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * DELETE /api/classes/:id
 * Delete class
 * Requires authentication and ADMIN or INSTRUCTOR role
 * Only instructor owner or admin can delete
 */
router.delete('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  try {
    const { id } = req.params;

    await Class.delete(id, req.user.userId, req.user.role);

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
