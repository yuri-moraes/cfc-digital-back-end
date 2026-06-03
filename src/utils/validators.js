// src/utils/validators.js
import { BadRequestError } from './errors.js';

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new BadRequestError('Invalid email format', { field: 'email' });
  }
};

export const validatePassword = (password) => {
  if (!password || password.length < 6) {
    throw new BadRequestError('Password must be at least 6 characters', { field: 'password' });
  }
};

export const validateRequired = (value, fieldName) => {
  if (!value || (typeof value === 'string' && !value.trim())) {
    throw new BadRequestError(`${fieldName} is required`, { field: fieldName });
  }
};

export const validateTime = (startTime, endTime) => {
  if (startTime >= endTime) {
    throw new BadRequestError('End time must be after start time', { field: 'time' });
  }
};

export const validateDayOfWeek = (day) => {
  const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (!validDays.includes(day)) {
    throw new BadRequestError(`Day must be one of: ${validDays.join(', ')}`, { field: 'day_of_week' });
  }
};

export const validateRole = (role) => {
  const validRoles = ['ADMIN', 'STUDENT', 'INSTRUCTOR'];
  if (!validRoles.includes(role)) {
    throw new BadRequestError(`Role must be one of: ${validRoles.join(', ')}`, { field: 'role' });
  }
};
