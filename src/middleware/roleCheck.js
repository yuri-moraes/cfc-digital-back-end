// src/middleware/roleCheck.js
/**
 * Role-based access control middleware
 * Checks that authenticated user has one of the allowed roles
 * @param {...string} allowedRoles - Roles that are permitted to access this route
 * @returns {Function} Express middleware function
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        statusCode: 401,
      });
    }

    // Check if user role is in allowed roles
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        statusCode: 403,
      });
    }

    next();
  };
};
