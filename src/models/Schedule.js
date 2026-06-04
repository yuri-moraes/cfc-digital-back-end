// src/models/Schedule.js
import { query } from '../db/pool.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../utils/errors.js';
import { USER_ROLES, DAYS_OF_WEEK } from '../constants.js';

export class Schedule {
  /**
   * Validate day of week
   * @param {string} dayOfWeek - Day of week to validate
   * @throws {BadRequestError} If day of week is invalid
   */
  static validateDayOfWeek(dayOfWeek) {
    if (!DAYS_OF_WEEK.includes(dayOfWeek)) {
      throw new BadRequestError(`Invalid day of week. Must be one of: ${DAYS_OF_WEEK.join(', ')}`);
    }
  }

  /**
   * Validate times
   * @param {string} startTime - Start time (HH:MM format)
   * @param {string} endTime - End time (HH:MM format)
   * @throws {BadRequestError} If endTime is not greater than startTime
   */
  static validateTime(startTime, endTime) {
    if (endTime <= startTime) {
      throw new BadRequestError('End time must be after start time');
    }
  }

  /**
   * Create a new schedule
   * @param {string} classId - Class ID
   * @param {string} dayOfWeek - Day of week (Monday-Friday)
   * @param {string} startTime - Start time (HH:MM format)
   * @param {string} endTime - End time (HH:MM format)
   * @returns {Promise<Object>} Created schedule
   * @throws {BadRequestError} If required fields not provided or validation fails
   */
  static async create(classId, dayOfWeek, startTime, endTime) {
    // Validate required fields
    if (!classId) {
      throw new BadRequestError('Class ID is required');
    }

    if (!dayOfWeek) {
      throw new BadRequestError('Day of week is required');
    }

    if (!startTime) {
      throw new BadRequestError('Start time is required');
    }

    if (!endTime) {
      throw new BadRequestError('End time is required');
    }

    // Validate day of week
    this.validateDayOfWeek(dayOfWeek);

    // Validate times
    this.validateTime(startTime, endTime);

    // Insert into database
    const result = await query(
      `INSERT INTO schedules (class_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4)
       RETURNING id, class_id, day_of_week, start_time, end_time, created_at, updated_at`,
      [classId, dayOfWeek, startTime, endTime]
    );

    return result.rows[0];
  }

  /**
   * Find schedule by ID
   * @param {string} id - Schedule ID
   * @returns {Promise<Object>} Schedule
   * @throws {NotFoundError} If schedule not found
   */
  static async findById(id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new NotFoundError('Schedule not found');
    }

    const result = await query(
      `SELECT id, class_id, day_of_week, start_time, end_time, created_at, updated_at
       FROM schedules
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Schedule not found');
    }

    return result.rows[0];
  }

  /**
   * List schedules for a class
   * @param {string} classId - Class ID
   * @returns {Promise<Array>} Schedules ordered by day_of_week, start_time
   */
  static async listByClass(classId, { limit = 20, offset = 0 } = {}) {
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT id, class_id, day_of_week, start_time, end_time, created_at, updated_at
         FROM schedules
         WHERE class_id = $1
         ORDER BY day_of_week, start_time
         LIMIT $2 OFFSET $3`,
        [classId, limit, offset]
      ),
      query('SELECT COUNT(*) FROM schedules WHERE class_id = $1', [classId]),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  /**
   * List schedules for an instructor
   * @param {string} instructorId - Instructor ID
   * @returns {Promise<Array>} Schedules for all classes taught by instructor
   */
  static async listByInstructor(instructorId, { limit = 20, offset = 0 } = {}) {
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT s.id, s.class_id, s.day_of_week, s.start_time, s.end_time, s.created_at, s.updated_at
         FROM schedules s
         JOIN classes c ON s.class_id = c.id
         WHERE c.instructor_id = $1
         ORDER BY s.day_of_week, s.start_time
         LIMIT $2 OFFSET $3`,
        [instructorId, limit, offset]
      ),
      query(
        'SELECT COUNT(*) FROM schedules s JOIN classes c ON s.class_id = c.id WHERE c.instructor_id = $1',
        [instructorId]
      ),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  /**
   * Update schedule
   * @param {string} id - Schedule ID
   * @param {Object} updates - Fields to update (only day_of_week, start_time, end_time allowed)
   * @param {string} requestingUserId - ID of user making the request
   * @param {string} requestingUserRole - Role of user making the request
   * @returns {Promise<Object>} Updated schedule
   * @throws {NotFoundError} If schedule not found
   * @throws {ForbiddenError} If user not authorized to update
   * @throws {BadRequestError} If validation fails
   */
  static async update(id, updates, requestingUserId, requestingUserRole) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new NotFoundError('Schedule not found');
    }

    // Check if schedule exists and get the class instructor
    const scheduleResult = await query(
      `SELECT s.id, c.instructor_id
       FROM schedules s
       JOIN classes c ON s.class_id = c.id
       WHERE s.id = $1`,
      [id]
    );

    if (scheduleResult.rows.length === 0) {
      throw new NotFoundError('Schedule not found');
    }

    const { instructor_id } = scheduleResult.rows[0];

    // Check authorization: only instructor owner or admin can update
    if (requestingUserRole !== USER_ROLES.ADMIN && instructor_id !== requestingUserId) {
      throw new ForbiddenError('Not authorized to update this schedule');
    }

    // Only allow updating day_of_week, start_time, end_time
    const allowedFields = ['day_of_week', 'start_time', 'end_time'];
    const updateFields = Object.keys(updates).filter((key) =>
      allowedFields.includes(key)
    );

    if (updateFields.length === 0) {
      throw new BadRequestError('No valid fields to update');
    }

    // Validate updates if times are being changed
    if (updateFields.includes('day_of_week')) {
      this.validateDayOfWeek(updates.day_of_week);
    }

    if (updateFields.includes('start_time') || updateFields.includes('end_time')) {
      // Get current values
      const currentResult = await query(
        'SELECT start_time, end_time FROM schedules WHERE id = $1',
        [id]
      );
      const current = currentResult.rows[0];

      const startTime = updateFields.includes('start_time') ? updates.start_time : current.start_time;
      const endTime = updateFields.includes('end_time') ? updates.end_time : current.end_time;

      this.validateTime(startTime, endTime);
    }

    // Build dynamic query
    const setClauses = updateFields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');

    const values = [
      ...updateFields.map((field) => updates[field]),
      id,
    ];

    const result = await query(
      `UPDATE schedules SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${updateFields.length + 1}
       RETURNING id, class_id, day_of_week, start_time, end_time, created_at, updated_at`,
      values
    );

    return result.rows[0];
  }

  /**
   * Delete schedule
   * @param {string} id - Schedule ID
   * @param {string} requestingUserId - ID of user making the request
   * @param {string} requestingUserRole - Role of user making the request
   * @throws {NotFoundError} If schedule not found
   * @throws {ForbiddenError} If user not authorized to delete
   */
  static async delete(id, requestingUserId, requestingUserRole) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new NotFoundError('Schedule not found');
    }

    // Check if schedule exists and get the class instructor
    const scheduleResult = await query(
      `SELECT s.id, c.instructor_id
       FROM schedules s
       JOIN classes c ON s.class_id = c.id
       WHERE s.id = $1`,
      [id]
    );

    if (scheduleResult.rows.length === 0) {
      throw new NotFoundError('Schedule not found');
    }

    const { instructor_id } = scheduleResult.rows[0];

    // Check authorization: only instructor owner or admin can delete
    if (requestingUserRole !== USER_ROLES.ADMIN && instructor_id !== requestingUserId) {
      throw new ForbiddenError('Not authorized to delete this schedule');
    }

    // Delete the schedule
    await query('DELETE FROM schedules WHERE id = $1', [id]);
  }
}
