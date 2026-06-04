import { query } from '../db/pool.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../utils/errors.js';
import { USER_ROLES } from '../constants.js';

export class Assignment {
  static async create(classId, title, description, dueDate, maxScore) {
    if (!classId) throw new BadRequestError('Class ID is required');
    if (!title) throw new BadRequestError('Title is required');

    const result = await query(
      `INSERT INTO assignments (class_id, title, description, due_date, max_score)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, class_id, title, description, due_date, max_score, created_at, updated_at`,
      [classId, title, description || null, dueDate || null, maxScore ?? 100]
    );

    return result.rows[0];
  }

  static async findById(id) {
    const result = await query(
      `SELECT a.id, a.class_id, a.title, a.description, a.due_date, a.max_score,
              a.created_at, a.updated_at, c.name as class_name, c.instructor_id
       FROM assignments a
       LEFT JOIN classes c ON a.class_id = c.id
       WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) throw new NotFoundError('Assignment not found');

    return result.rows[0];
  }

  static async findByClassId(classId) {
    const result = await query(
      `SELECT id, class_id, title, description, due_date, max_score, created_at, updated_at
       FROM assignments
       WHERE class_id = $1
       ORDER BY created_at DESC`,
      [classId]
    );

    return result.rows;
  }

  static async update(id, updates, requestingUserId, requestingUserRole) {
    const assignmentResult = await query(
      `SELECT a.id, c.instructor_id
       FROM assignments a
       JOIN classes c ON a.class_id = c.id
       WHERE a.id = $1`,
      [id]
    );

    if (assignmentResult.rows.length === 0) throw new NotFoundError('Assignment not found');

    const { instructor_id } = assignmentResult.rows[0];

    if (requestingUserRole !== USER_ROLES.ADMIN && instructor_id !== requestingUserId) {
      throw new ForbiddenError('Not authorized to update this assignment');
    }

    const allowedFields = ['title', 'description', 'due_date', 'max_score'];
    const fieldMap = { dueDate: 'due_date', maxScore: 'max_score' };

    const normalizedUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      const dbField = fieldMap[key] || key;
      if (allowedFields.includes(dbField)) {
        normalizedUpdates[dbField] = value;
      }
    }

    const updateFields = Object.keys(normalizedUpdates);
    if (updateFields.length === 0) throw new BadRequestError('No valid fields to update');

    const setClauses = updateFields.map((field, i) => `${field} = $${i + 1}`).join(', ');
    const values = [...updateFields.map((f) => normalizedUpdates[f]), id];

    const result = await query(
      `UPDATE assignments SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${updateFields.length + 1}
       RETURNING id, class_id, title, description, due_date, max_score, created_at, updated_at`,
      values
    );

    return result.rows[0];
  }

  static async delete(id, requestingUserId, requestingUserRole) {
    const assignmentResult = await query(
      `SELECT a.id, c.instructor_id
       FROM assignments a
       JOIN classes c ON a.class_id = c.id
       WHERE a.id = $1`,
      [id]
    );

    if (assignmentResult.rows.length === 0) throw new NotFoundError('Assignment not found');

    const { instructor_id } = assignmentResult.rows[0];

    if (requestingUserRole !== USER_ROLES.ADMIN && instructor_id !== requestingUserId) {
      throw new ForbiddenError('Not authorized to delete this assignment');
    }

    await query('DELETE FROM assignments WHERE id = $1', [id]);
  }
}
