import { logger } from '../utils/logger.js';

const reportToSentry = process.env.SENTRY_DSN
  ? (async () => {
      const { default: Sentry } = await import('@sentry/node');
      Sentry.init({ dsn: process.env.SENTRY_DSN });
      return (err) => Sentry.captureException(err);
    })()
  : Promise.resolve(() => {});

export const errorHandler = (err, req, res, next) => {
  logger.error({ path: req.path, userId: req.user?.id, err });

  if (!err.statusCode || err.statusCode >= 500) {
    reportToSentry.then((report) => report(err)).catch(() => {});
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
