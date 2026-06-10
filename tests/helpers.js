import express from 'express';
import request from 'supertest';
import { User } from '../src/models/User.js';
import { generateToken } from '../src/utils/jwt.js';
import authRouter from '../src/routes/auth.js';

export const createTestApp = (...routers) => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  for (const [path, router] of routers) {
    app.use(path, router);
  }
  return app;
};

export const createAdmin = (overrides = {}) =>
  User.create(
    overrides.email    ?? 'admin@test.com',
    overrides.password ?? 'Pass123!',
    overrides.name     ?? 'Admin',
    'ADMIN',
    overrides.phone    ?? null
  );

export const createInstructor = (overrides = {}) =>
  User.create(
    overrides.email    ?? 'instructor@test.com',
    overrides.password ?? 'Pass123!',
    overrides.name     ?? 'Instructor',
    'INSTRUCTOR',
    overrides.phone    ?? null
  );

export const createStudent = (overrides = {}) =>
  User.create(
    overrides.email             ?? 'student@test.com',
    overrides.password          ?? 'Pass123!',
    overrides.name              ?? 'Student',
    'STUDENT',
    overrides.phone             ?? null,
    overrides.purchasedLessons  ?? 10,
    overrides.category          ?? 'B'
  );

export const createVehicle = async (overrides = {}) => {
  const { Vehicle } = await import('../src/models/Vehicle.js');
  return Vehicle.create(
    overrides.plate ?? 'ABC1234',
    overrides.model ?? 'Gol',
    overrides.year  ?? 2022
  );
};

export const linkVehicle = async (instructorId, vehicleId) => {
  const { InstructorVehicle } = await import('../src/models/InstructorVehicle.js');
  return InstructorVehicle.link(instructorId, vehicleId);
};

export const addAvailability = async (instructorId, vehicleId, overrides = {}) => {
  const { InstructorAvailability } = await import('../src/models/InstructorAvailability.js');
  return InstructorAvailability.create(
    instructorId,
    vehicleId,
    overrides.dayOfWeek  ?? 1,
    overrides.startTime  ?? '08:00',
    overrides.endTime    ?? '20:00'
  );
};

export const tokenFor = (user) =>
  generateToken({ userId: user.id, email: user.email, role: user.role });

export const requestWithAuth = (app, method, path, token) => {
  const req = request(app)[method.toLowerCase()](path);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
};
