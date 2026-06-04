import { logger } from '../utils/logger.js';

export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const logLevel = (status) => {
    if (status >= 500) return 'error';
    if (status >= 400) return 'warn';
    return 'info';
  };
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger[logLevel(res.statusCode)]({ method: req.method, path: req.path, status: res.statusCode, duration, userId: req.user?.id });
  });
  next();
};
