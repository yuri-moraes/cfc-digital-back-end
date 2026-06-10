import authRouter from './auth.js';
import userRouter from './users.js';
import notificationsRouter from './notifications.js';
import cronRouter from './cron.js';

export const mountRoutes = (app) => {
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/cron', cronRouter);
};
