// src/models/Class.js
import { query } from '../db/pool.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../utils/errors.js';
import { USER_ROLES } from '../constants.js';

export class Class {
  /**
   * Create a new class
   * @param {string} name - Class name
   * @param {string} description - Class description (nullable)
   * @param {string} instructorId - ID of the instructor
   * @returns {Promise<Object>} Created class with instructor_name
   * @throws {BadRequestError} If name or instructorId not provided
   */
  static async create(name, description, instructorId) {
    // Validate required fields
    if (!name) {
      throw new BadRequestError('Class name is required');
    }

    if (!instructorId) {
      throw new BadRequestError('Instructor ID is required');
    }

    // Insert into database
    const result = await query(
      `INSERT INTO classes (name, description, instructor_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, instructor_id, created_at, updated_at`,
      [name, description || null, instructorId]
    );

    const classData = result.rows[0];

    // Get instructor name for response
    const instructorResult = await query(
      'SELECT name FROM users WHERE id = $1',
      [instructorId]
    );

    if (instructorResult.rows.length > 0) {
      classData.instructor_name = instructorResult.rows[0].name;
    }

    return classData;
  }

  /**
   * Find class by ID
   * @param {string} id - Class ID
   * @returns {Promise<Object>} Class with instructor_name
   * @throws {NotFoundError} If class not found
   */
  static async findById(id) {
    const result = await query(
      `SELECT c.id, c.name, c.description, c.instructor_id, c.created_at, c.updated_at, u.name as instructor_name
       FROM classes c
       LEFT JOIN users u ON c.instructor_id = u.id
       WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Class not found');
    }

    return result.rows[0];
  }

  /**
   * List all classes
   * @returns {Promise<Array>} All classes with instructor_name, ordered by created_at DESC
   */
  static async list({ limit = 20, offset = 0 } = {}) {
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT c.id, c.name, c.description, c.instructor_id, c.created_at, c.updated_at, u.name as instructor_name
         FROM classes c
         LEFT JOIN users u ON c.instructor_id = u.id
         ORDER BY c.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query('SELECT COUNT(*) FROM classes'),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  /**
   * List classes for a specific instructor
   * @param {string} instructorId - Instructor ID
   * @returns {Promise<Array>} Classes for instructor, ordered by created_at DESC
   */
  static async listByInstructor(instructorId, { limit = 20, offset = 0 } = {}) {
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT c.id, c.name, c.description, c.instructor_id, c.created_at, c.updated_at, u.name as instructor_name
         FROM classes c
         LEFT JOIN users u ON c.instructor_id = u.id
         WHERE c.instructor_id = $1
         ORDER BY c.created_at DESC
         LIMIT $2 OFFSET $3`,
        [instructorId, limit, offset]
      ),
      query('SELECT COUNT(*) FROM classes WHERE instructor_id = $1', [instructorId]),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  /**
   * Update class
   * @param {string} id - Class ID
   * @param {Object} updates - Fields to update (only 'name' and 'description' allowed)
   * @param {string} requestingUserId - ID of user making the request
   * @param {string} requestingUserRole - Role of user making the request
   * @returns {Promise<Object>} Updated class with instructor_name
   * @throws {NotFoundError} If class not found
   * @throws {ForbiddenError} If user not authorized to update
   */
  static async update(id, updates, requestingUserId, requestingUserRole) {
    // Check if class exists
    const classResult = await query('SELECT id, instructor_id FROM classes WHERE id = $1', [id]);

    if (classResult.rows.length === 0) {
      throw new NotFoundError('Class not found');
    }

    const classData = classResult.rows[0];

    // Check authorization: only instructor owner or admin can update
    if (requestingUserRole !== USER_ROLES.ADMIN && classData.instructor_id !== requestingUserId) {
      throw new ForbiddenError('Not authorized to update this class');
    }

    // Only allow updating name and description
    const allowedFields = ['name', 'description'];
    const updateFields = Object.keys(updates).filter((key) =>
      allowedFields.includes(key)
    );

    if (updateFields.length === 0) {
      throw new BadRequestError('No valid fields to update');
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
      `UPDATE classes SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${updateFields.length + 1}
       RETURNING id, name, description, instructor_id, created_at, updated_at`,
      values
    );

    const updatedClass = result.rows[0];

    // Get instructor name for response
    const instructorResult = await query(
      'SELECT name FROM users WHERE id = $1',
      [updatedClass.instructor_id]
    );

    if (instructorResult.rows.length > 0) {
      updatedClass.instructor_name = instructorResult.rows[0].name;
    }

    return updatedClass;
  }

  /**
   * Delete class
   * @param {string} id - Class ID
   * @param {string} requestingUserId - ID of user making the request
   * @param {string} requestingUserRole - Role of user making the request
   * @throws {NotFoundError} If class not found
   * @throws {ForbiddenError} If user not authorized to delete
   */
  static async delete(id, requestingUserId, requestingUserRole) {
    // Check if class exists
    const classResult = await query('SELECT id, instructor_id FROM classes WHERE id = $1', [id]);

    if (classResult.rows.length === 0) {
      throw new NotFoundError('Class not found');
    }

    const classData = classResult.rows[0];

    // Check authorization: only instructor owner or admin can delete
    if (requestingUserRole !== USER_ROLES.ADMIN && classData.instructor_id !== requestingUserId) {
      throw new ForbiddenError('Not authorized to delete this class');
    }

    // Delete the class
    await query('DELETE FROM classes WHERE id = $1', [id]);
  }
}
