// src/models/Enrollment.js
import { query } from '../db/pool.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from '../utils/errors.js';
import { USER_ROLES } from '../constants.js';

export class Enrollment {
  /**
   * Enroll student in class
   * @param {string} studentId - Student ID
   * @param {string} classId - Class ID
   * @returns {Promise<Object>} Created enrollment
   * @throws {BadRequestError} If studentId or classId not provided
   * @throws {ConflictError} If already enrolled
   */
  static async create(studentId, classId) {
    // Validate required fields
    if (!studentId) {
      throw new BadRequestError('Student ID is required');
    }

    if (!classId) {
      throw new BadRequestError('Class ID is required');
    }

    // Check for duplicate enrollment
    const existingEnrollment = await query(
      'SELECT id FROM enrollments WHERE student_id = $1 AND class_id = $2',
      [studentId, classId]
    );

    if (existingEnrollment.rows.length > 0) {
      throw new ConflictError('Student is already enrolled in this class');
    }

    // Insert into database
    const result = await query(
      `INSERT INTO enrollments (student_id, class_id, status)
       VALUES ($1, $2, 'ACTIVE')
       RETURNING id, student_id, class_id, status, enrolled_at`,
      [studentId, classId]
    );

    return result.rows[0];
  }

  /**
   * Find enrollment by ID
   * @param {string} id - Enrollment ID
   * @returns {Promise<Object>} Enrollment
   * @throws {NotFoundError} If enrollment not found
   */
  static async findById(id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new NotFoundError('Enrollment not found');
    }

    const result = await query(
      'SELECT id, student_id, class_id, status, enrolled_at FROM enrollments WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Enrollment not found');
    }

    return result.rows[0];
  }

  /**
   * List enrollments for a student
   * @param {string} studentId - Student ID
   * @returns {Promise<Array>} Enrollments with class and instructor info
   */
  static async listByStudent(studentId, { limit = 20, offset = 0 } = {}) {
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT e.id, e.student_id, e.class_id, e.status, e.enrolled_at,
                c.name as class_name, c.description, u.name as instructor_name
         FROM enrollments e
         JOIN classes c ON e.class_id = c.id
         LEFT JOIN users u ON c.instructor_id = u.id
         WHERE e.student_id = $1
         ORDER BY e.enrolled_at DESC
         LIMIT $2 OFFSET $3`,
        [studentId, limit, offset]
      ),
      query('SELECT COUNT(*) FROM enrollments WHERE student_id = $1', [studentId]),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  /**
   * List enrollments for a class
   * @param {string} classId - Class ID
   * @returns {Promise<Array>} Enrollments with student info
   */
  static async listByClass(classId, { limit = 20, offset = 0 } = {}) {
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT e.id, e.student_id, e.class_id, e.status, e.enrolled_at,
                u.name as student_name, u.email as student_email
         FROM enrollments e
         JOIN users u ON e.student_id = u.id
         WHERE e.class_id = $1
         ORDER BY e.enrolled_at DESC
         LIMIT $2 OFFSET $3`,
        [classId, limit, offset]
      ),
      query('SELECT COUNT(*) FROM enrollments WHERE class_id = $1', [classId]),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  /**
   * List all enrollments (admin only)
   * @returns {Promise<Array>} All enrollments with class and student info
   */
  static async listAll({ limit = 20, offset = 0 } = {}) {
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT e.id, e.student_id, e.class_id, e.status, e.enrolled_at,
                c.name as class_name, u.name as student_name, u.email as student_email,
                i.name as instructor_name
         FROM enrollments e
         JOIN classes c ON e.class_id = c.id
         JOIN users u ON e.student_id = u.id
         LEFT JOIN users i ON c.instructor_id = i.id
         ORDER BY e.enrolled_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query('SELECT COUNT(*) FROM enrollments'),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  /**
   * Delete enrollment (drop)
   * @param {string} id - Enrollment ID
   * @param {string} requestingUserId - ID of user making the request
   * @param {string} requestingUserRole - Role of user making the request
   * @throws {NotFoundError} If enrollment not found
   * @throws {ForbiddenError} If user not authorized to delete
   */
  static async delete(id, requestingUserId, requestingUserRole) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new NotFoundError('Enrollment not found');
    }

    // Check if enrollment exists
    const enrollmentResult = await query(
      `SELECT e.id, e.student_id, e.class_id, c.instructor_id
       FROM enrollments e
       JOIN classes c ON e.class_id = c.id
       WHERE e.id = $1`,
      [id]
    );

    if (enrollmentResult.rows.length === 0) {
      throw new NotFoundError('Enrollment not found');
    }

    const enrollmentData = enrollmentResult.rows[0];

    // Check authorization:
    // - Student can only drop own enrollment
    // - Instructor can only drop from own classes
    // - Admin can drop any
    if (requestingUserRole === USER_ROLES.STUDENT) {
      if (enrollmentData.student_id !== requestingUserId) {
        throw new ForbiddenError('Students can only drop their own enrollments');
      }
    } else if (requestingUserRole === USER_ROLES.INSTRUCTOR) {
      if (enrollmentData.instructor_id !== requestingUserId) {
        throw new ForbiddenError('Instructors can only drop students from their own classes');
      }
    } else if (requestingUserRole !== USER_ROLES.ADMIN) {
      throw new ForbiddenError('Not authorized to drop enrollment');
    }

    // Delete the enrollment
    await query('DELETE FROM enrollments WHERE id = $1', [id]);
  }
}
