// src/routes/index.js
import authRouter from './auth.js';
import userRouter from './users.js';
import classRouter from './classes.js';
import scheduleRouter from './schedules.js';
import enrollmentRouter from './enrollments.js';

/**
 * Mount all API routes on the app
 * Routes are prefixed with /api/{resource}
 */
export const mountRoutes = (app) => {
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/classes', classRouter);
  app.use('/api/schedules', scheduleRouter);
  app.use('/api/enrollments', enrollmentRouter);
};
