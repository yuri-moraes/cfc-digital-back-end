// src/routes/auth.js
import express from 'express';
import { User } from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import { validateEmail, validatePassword, validateRequired } from '../utils/validators.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /login
 * Login endpoint - authenticates user with email and password
 * Returns JWT token and user info
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate email and password are provided
    validateRequired(email, 'email');
    validateRequired(password, 'password');

    // Validate email format
    validateEmail(email);

    // Validate password length
    validatePassword(password);

    // Authenticate user
    const user = await User.authenticate(email, password);

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Return token and user info
    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * POST /logout
 * Logout endpoint - requires authentication
 * Note: Token invalidation is handled client-side (remove from localStorage)
 */
router.post('/logout', authMiddleware, (req, res) => {
  try {
    res.status(200).json({
      message: 'Logged out',
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

/**
 * GET /me
 * Get current user - requires authentication
 * Returns current authenticated user info
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    // Get current user from database
    const user = await User.findById(req.user.userId);

    res.status(200).json(user);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: error.message,
      statusCode,
    });
  }
});

export default router;
