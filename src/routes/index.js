import authRouter from './auth.js';
import userRouter from './users.js';
import vehiclesRouter from './vehicles.js';
import notificationsRouter from './notifications.js';
import cronRouter from './cron.js';

export const mountRoutes = (app) => {
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/vehicles', vehiclesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/cron', cronRouter);
};
