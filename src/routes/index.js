// src/routes/index.js
import authRouter from './auth.js';
import userRouter from './users.js';
import classRouter from './classes.js';
import scheduleRouter from './schedules.js';
import enrollmentRouter from './enrollments.js';
import assignmentsRouter from './assignments.js';
import gradesRouter from './grades.js';
import attendanceRouter from './attendance.js';
import notificationsRouter from './notifications.js';
import cronRouter from './cron.js';

export const mountRoutes = (app) => {
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/classes', classRouter);
  app.use('/api/schedules', scheduleRouter);
  app.use('/api/enrollments', enrollmentRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/grades', gradesRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/cron', cronRouter);
};
