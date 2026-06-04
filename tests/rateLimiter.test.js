import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import authRouter from '../src/routes/auth.js';
import { createTestUser } from './helpers.js';
import { USER_ROLES } from '../src/constants.js';

const buildAppWithAuthLimiter = (max) => {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    message: { error: 'Too many login attempts, please try again later.', statusCode: 429 },
  });
  const app = express();
  app.use(express.json());
  app.use('/api/auth/login', limiter);
  app.use('/api/auth', authRouter);
  return app;
};

const buildAppWithApiLimiter = (max) => {
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max,
    message: { error: 'Too many requests, please try again later.', statusCode: 429 },
  });
  const app = express();
  app.use(express.json());
  app.use('/api', limiter);
  app.use('/api/auth', authRouter);
  return app;
};

describe('Auth rate limiter', () => {
  test('allows requests under the limit', async () => {
    const app = buildAppWithAuthLimiter(3);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'x@x.com', password: 'password' });
    expect(res.status).not.toBe(429);
  });

  test('blocks requests exceeding the limit', async () => {
    const app = buildAppWithAuthLimiter(2);
    await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'pass' });
    await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'pass' });
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'pass' });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many/i);
  });
});

describe('API rate limiter', () => {
  test('allows requests under the limit', async () => {
    const app = buildAppWithApiLimiter(5);
    await createTestUser('user@example.com', 'password123', 'User', USER_ROLES.STUDENT);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'password123' });
    expect(res.status).not.toBe(429);
  });

  test('blocks requests exceeding the limit', async () => {
    const app = buildAppWithApiLimiter(2);
    for (let i = 0; i < 2; i++) {
      await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'p' });
    }
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'p' });
    expect(res.status).toBe(429);
  });
});
