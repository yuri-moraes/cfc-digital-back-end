import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.node_env === 'production' ? 'info' : 'debug',
  transport: config.node_env !== 'production' ? { target: 'pino-pretty' } : undefined,
});
