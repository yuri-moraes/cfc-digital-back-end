import { query } from '../db/pool.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../utils/errors.js';
import { USER_ROLES } from '../constants.js';

export class Grade {
  static convertToLetterGrade(numericScore) {
    if (numericScore >= 90) return 'A';
    if (numericScore >= 80) return 'B';
    if (numericScore >= 70) return 'C';
    if (numericScore >= 60) return 'D';
    return 'F';
  }

  static async create(assignmentId, studentId, numericScore, feedback) {
    if (!assignmentId) throw new BadRequestError('Assignment ID is required');
    if (!studentId) throw new BadRequestError('Student ID is required');
    if (numericScore === undefined || numericScore === null) {
      throw new BadRequestError('Numeric score is required');
    }
    if (numericScore < 0 || numericScore > 100) {
      throw new BadRequestError('Numeric score must be between 0 and 100');
    }

    const letterGrade = Grade.convertToLetterGrade(numericScore);

    try {
      const result = await query(
        `INSERT INTO grades (assignment_id, student_id, numeric_score, letter_grade, feedback)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, assignment_id, student_id, numeric_score, letter_grade, feedback, created_at, updated_at`,
        [assignmentId, studentId, numericScore, letterGrade, feedback || null]
      );
      return result.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw new ConflictError('Grade already exists for this student and assignment');
      }
      throw err;
    }
  }

  static async findById(id) {
    const result = await query(
      `SELECT g.id, g.assignment_id, g.student_id, g.numeric_score, g.letter_grade,
              g.feedback, g.created_at, g.updated_at,
              a.title as assignment_title, a.class_id,
              u.name as student_name, c.name as class_name
       FROM grades g
       JOIN assignments a ON g.assignment_id = a.id
       JOIN users u ON g.student_id = u.id
       JOIN classes c ON a.class_id = c.id
       WHERE g.id = $1`,
      [id]
    );

    if (result.rows.length === 0) throw new NotFoundError('Grade not found');

    return result.rows[0];
  }

  static async findByAssignment(assignmentId, { limit = 20, offset = 0, studentId = null } = {}) {
    const params = [assignmentId];
    const studentFilter = studentId ? ` AND g.student_id = $${params.push(studentId)}` : '';

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT g.id, g.assignment_id, g.student_id, g.numeric_score, g.letter_grade,
                g.feedback, g.created_at, g.updated_at, u.name as student_name
         FROM grades g
         JOIN users u ON g.student_id = u.id
         WHERE g.assignment_id = $1${studentFilter}
         ORDER BY u.name
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      query(
        `SELECT COUNT(*) FROM grades g WHERE g.assignment_id = $1${studentFilter}`,
        params
      ),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  static async findByStudent(studentId, { limit = 20, offset = 0 } = {}) {
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT g.id, g.assignment_id, g.student_id, g.numeric_score, g.letter_grade,
                g.feedback, g.created_at, g.updated_at,
                a.title as assignment_title, a.class_id, c.name as class_name
         FROM grades g
         JOIN assignments a ON g.assignment_id = a.id
         JOIN classes c ON a.class_id = c.id
         WHERE g.student_id = $1
         ORDER BY g.created_at DESC
         LIMIT $2 OFFSET $3`,
        [studentId, limit, offset]
      ),
      query('SELECT COUNT(*) FROM grades WHERE student_id = $1', [studentId]),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  static async findByClass(classId, { limit = 20, offset = 0, studentId = null } = {}) {
    const params = [classId];
    const studentFilter = studentId ? ` AND g.student_id = $${params.push(studentId)}` : '';

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT g.id, g.assignment_id, g.student_id, g.numeric_score, g.letter_grade,
                g.feedback, g.created_at, g.updated_at,
                a.title as assignment_title, u.name as student_name
         FROM grades g
         JOIN assignments a ON g.assignment_id = a.id
         JOIN users u ON g.student_id = u.id
         WHERE a.class_id = $1${studentFilter}
         ORDER BY a.title, u.name
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      query(
        `SELECT COUNT(*) FROM grades g JOIN assignments a ON g.assignment_id = a.id WHERE a.class_id = $1${studentFilter}`,
        params
      ),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  static async update(id, updates, requestingUserId, requestingUserRole) {
    const gradeResult = await query(
      `SELECT g.id, c.instructor_id
       FROM grades g
       JOIN assignments a ON g.assignment_id = a.id
       JOIN classes c ON a.class_id = c.id
       WHERE g.id = $1`,
      [id]
    );

    if (gradeResult.rows.length === 0) throw new NotFoundError('Grade not found');

    const { instructor_id } = gradeResult.rows[0];

    if (requestingUserRole !== USER_ROLES.ADMIN && instructor_id !== requestingUserId) {
      throw new ForbiddenError('Not authorized to update this grade');
    }

    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.numericScore !== undefined) {
      if (updates.numericScore < 0 || updates.numericScore > 100) {
        throw new BadRequestError('Numeric score must be between 0 and 100');
      }
      updateFields.push(`numeric_score = $${paramIndex++}`);
      values.push(updates.numericScore);
      updateFields.push(`letter_grade = $${paramIndex++}`);
      values.push(Grade.convertToLetterGrade(updates.numericScore));
    }

    if (updates.feedback !== undefined) {
      updateFields.push(`feedback = $${paramIndex++}`);
      values.push(updates.feedback);
    }

    if (updateFields.length === 0) throw new BadRequestError('No valid fields to update');

    values.push(id);

    const result = await query(
      `UPDATE grades SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex}
       RETURNING id, assignment_id, student_id, numeric_score, letter_grade, feedback, created_at, updated_at`,
      values
    );

    return result.rows[0];
  }

  static async delete(id, requestingUserId, requestingUserRole) {
    if (requestingUserRole !== USER_ROLES.ADMIN) {
      throw new ForbiddenError('Only admins can delete grades');
    }

    const gradeResult = await query('SELECT id FROM grades WHERE id = $1', [id]);

    if (gradeResult.rows.length === 0) throw new NotFoundError('Grade not found');

    await query('DELETE FROM grades WHERE id = $1', [id]);
  }
}
