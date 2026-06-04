// src/routes/users.js
import express from 'express';
import { User } from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { validateEmail, validatePassword, validateRequired, validateRole } from '../utils/validators.js';
import { USER_ROLES } from '../constants.js';
import { paginate, paginatedResponse } from '../utils/paginate.js';

const router = express.Router();

/**
 * GET /
 * List all users - admin only
 * Returns array of all users without password_hash
 */
router.get('/', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  try {
    const { page, limit, offset } = paginate(req);
    const { rows, total } = await User.list({ limit, offset });
    res.status(200).json(paginatedResponse(rows, total, { page, limit }));
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message, statusCode });
  }
});

/**
 * GET /:id
 * Get user details by ID
 * Users can only get own profile unless admin
 * If non-admin tries to get other user, return 403
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.user;

    // Check if user is trying to access someone else's profile (non-admin)
    if (role !== USER_ROLES.ADMIN && userId !== id) {
      return res.status(403).json({
        error: 'Forbidden',
        statusCode: 403,
      });
    }

    // Get user by ID
    const user = await User.findById(id);

    res.status(200).json(user);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * POST /
 * Create new user - admin only
 * Body: { email, password, name, role }
 * Validates all required fields, email format, password strength, and role validity
 */
router.post('/', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  try {
    const { email, password, name, role, phone_number } = req.body;

    validateRequired(email, 'email');
    validateRequired(password, 'password');
    validateRequired(name, 'name');
    validateRequired(role, 'role');

    validateEmail(email);
    validatePassword(password);
    validateRole(role);

    const user = await User.create(email, password, name, role, phone_number ?? null);

    res.status(201).json(user);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message, statusCode });
  }
});

/**
 * PUT /:id
 * Update user by ID
 * Users can only update own profile unless admin
 * If non-admin tries to update other user, return 403
 * Body: { name, email } (only these fields are updatable)
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.user;
    const updates = req.body;

    // Check if user is trying to update someone else's profile (non-admin)
    if (role !== USER_ROLES.ADMIN && userId !== id) {
      return res.status(403).json({
        error: 'Forbidden',
        statusCode: 403,
      });
    }

    // Validate email format if email is being updated
    if (updates.email) {
      validateEmail(updates.email);
    }

    // Update user
    const user = await User.update(id, updates);

    res.status(200).json(user);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * DELETE /:id
 * Delete user by ID - admin only
 * Returns 200 on success
 */
router.delete('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;

    // Delete user
    await User.delete(id);

    res.status(200).json({
      message: 'User deleted successfully',
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
