import { logger } from '../utils/logger.js';

let sentryReporter = () => {};

if (process.env.SENTRY_DSN) {
  (async () => {
    try {
      const { default: Sentry } = await import('@sentry/node');
      Sentry.init({ dsn: process.env.SENTRY_DSN });
      sentryReporter = (err) => Sentry.captureException(err);
    } catch (err) {
      logger.warn({ err }, 'Sentry init failed');
    }
  })();
}

export const errorHandler = (err, req, res, next) => {
  logger.error({ path: req.path, userId: req.user?.id, err }, 'Unhandled error');

  if (!err.statusCode || err.statusCode >= 500) {
    try {
      sentryReporter(err);
    } catch {}
  }

  const statusCode = err.statusCode || 500;
  const errorResponse = { error: err.message || 'Internal server error' };

  if (err.details) {
    errorResponse.details = err.details;
  }

  res.status(statusCode).json(errorResponse);
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: 'Not found' });
};
