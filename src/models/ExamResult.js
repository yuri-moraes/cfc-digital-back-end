import { query } from '../db/pool.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';

export class ExamResult {
  static async create(studentId, instructorId, vehicleId, examDate, result, notes) {
    if (!['passed', 'failed'].includes(result)) {
      throw new BadRequestError('result must be "passed" or "failed"');
    }
    const res = await query(
      `INSERT INTO exam_results (student_id, instructor_id, vehicle_id, exam_date, result, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [studentId, instructorId, vehicleId, examDate, result, notes || null]
    );
    return res.rows[0];
  }

  static async findById(id) {
    const res = await query('SELECT * FROM exam_results WHERE id = $1', [id]);
    if (res.rows.length === 0) throw new NotFoundError('Exam result not found');
    return res.rows[0];
  }

  static async list({ studentId, instructorId, limit = 50, offset = 0 } = {}) {
    const conds = [];
    const params = [];
    let i = 1;
    if (studentId)    { conds.push(`student_id = $${i++}`);    params.push(studentId); }
    if (instructorId) { conds.push(`instructor_id = $${i++}`); params.push(instructorId); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [data, count] = await Promise.all([
      query(`SELECT * FROM exam_results ${where} ORDER BY exam_date DESC LIMIT $${i++} OFFSET $${i}`,
            [...params, limit, offset]),
      query(`SELECT COUNT(*) FROM exam_results ${where}`, params),
    ]);
    return { data: data.rows, meta: { total: parseInt(count.rows[0].count, 10), limit, offset } };
  }

  static async update(id, { result, notes, examDate, vehicleId }, requestorId, requestorRole) {
    const existing = await ExamResult.findById(id);
    if (requestorRole !== 'ADMIN' && existing.instructor_id !== requestorId) {
      throw new ForbiddenError('Cannot edit another instructor\'s exam result');
    }
    if (result && !['passed', 'failed'].includes(result)) {
      throw new BadRequestError('result must be "passed" or "failed"');
    }
    const res = await query(
      `UPDATE exam_results
       SET result     = COALESCE($1, result),
           notes      = COALESCE($2, notes),
           exam_date  = COALESCE($3, exam_date),
           vehicle_id = COALESCE($4, vehicle_id)
       WHERE id = $5 RETURNING *`,
      [result ?? null, notes ?? null, examDate ?? null, vehicleId ?? null, id]
    );
    return res.rows[0];
  }

  static async delete(id) {
    const result = await query('DELETE FROM exam_results WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new NotFoundError('Exam result not found');
  }
}
