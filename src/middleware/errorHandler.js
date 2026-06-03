// src/middleware/errorHandler.js

/**
 * Global error handler middleware
 * Catches all errors thrown in route handlers and sends appropriate responses
 * Must be the last middleware registered
 */
export const errorHandler = (err, req, res, next) => {
  // Log error to console for debugging
  console.error('Error:', err);

  // If error has statusCode, use it; otherwise default to 500
  const statusCode = err.statusCode || 500;

  // Build error response
  const errorResponse = {
    error: err.message || 'Internal server error',
  };

  // Include details if available
  if (err.details) {
    errorResponse.details = err.details;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found handler
 * Catches requests to routes that don't exist
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Not found',
  });
};
