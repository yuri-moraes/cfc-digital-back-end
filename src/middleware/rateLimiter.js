import rateLimit from 'express-rate-limit';
import { verifyToken, extractTokenFromHeader } from '../utils/jwt.js';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again later.', statusCode: 429 },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req) => {
    try {
      const token = extractTokenFromHeader(req.headers.authorization);
      const payload = verifyToken(token);
      return payload.userId;
    } catch {
      return req.ip;
    }
  },
  message: { error: 'Too many requests, please try again later.', statusCode: 429 },
});
