import express from 'express';
import request from 'supertest';
import { User } from '../src/models/User.js';
import { Vehicle } from '../src/models/Vehicle.js';
import { InstructorVehicle } from '../src/models/InstructorVehicle.js';
import { InstructorAvailability } from '../src/models/InstructorAvailability.js';
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
    'admin',
    overrides.phone    ?? null
  );

export const createInstructor = (overrides = {}) =>
  User.create(
    overrides.email    ?? 'instructor@test.com',
    overrides.password ?? 'Pass123!',
    overrides.name     ?? 'Instructor',
    'instructor',
    overrides.phone    ?? null
  );

export const createStudent = (overrides = {}) =>
  User.create(
    overrides.email             ?? 'student@test.com',
    overrides.password          ?? 'Pass123!',
    overrides.name              ?? 'Student',
    'student',
    overrides.phone             ?? null,
    overrides.purchasedLessons  ?? 10,
    overrides.category          ?? 'B'
  );

export const createVehicle = (overrides = {}) =>
  Vehicle.create(
    overrides.plate ?? 'ABC1234',
    overrides.model ?? 'Gol',
    overrides.year  ?? 2022
  );

export const linkVehicle = (instructorId, vehicleId) =>
  InstructorVehicle.link(instructorId, vehicleId);

export const addAvailability = (instructorId, vehicleId, overrides = {}) =>
  InstructorAvailability.create(
    instructorId,
    vehicleId,
    overrides.dayOfWeek  ?? 1,
    overrides.startTime  ?? '08:00',
    overrides.endTime    ?? '20:00'
  );

export const tokenFor = (user) =>
  generateToken({ userId: user.id, email: user.email, role: user.role });

export const requestWithAuth = (app, method, path, token) => {
  const req = request(app)[method.toLowerCase()](path);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
};
