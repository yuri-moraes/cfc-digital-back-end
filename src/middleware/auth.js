// src/middleware/auth.js
import { extractTokenFromHeader, verifyToken } from '../utils/jwt.js';
import { UnauthorizedError } from '../utils/errors.js';

/**
 * Authentication middleware - validates JWT token from Authorization header
 * Attaches decoded user info to req.user
 * Returns 401 if token is missing or invalid
 */
export const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.get('Authorization');
    const token = extractTokenFromHeader(authHeader);
    const decoded = verifyToken(token);

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({
        error: error.message,
        statusCode: 401,
      });
    }
    res.status(401).json({
      error: 'Unauthorized',
      statusCode: 401,
    });
  }
};

/**
 * Optional authentication middleware - same as authMiddleware but doesn't fail if token missing
 * Silently skips authentication and allows next() to proceed
 */
export const optionalAuthMiddleware = (req, res, next) => {
  try {
    const authHeader = req.get('Authorization');
    if (authHeader) {
      const token = extractTokenFromHeader(authHeader);
      const decoded = verifyToken(token);
      req.user = decoded;
    }
  } catch (error) {
    // Silently ignore auth errors for optional auth
  }
  next();
};
