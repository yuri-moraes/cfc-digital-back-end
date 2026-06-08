import { query } from '../db/pool.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';

export class StudentAbsence {
  static async declare(studentId, scheduleId, absenceDate) {
    const schedResult = await query(
      'SELECT start_time FROM schedules WHERE id = $1',
      [scheduleId]
    );
    if (schedResult.rows.length === 0) throw new NotFoundError('Schedule not found');

    const startTime = schedResult.rows[0].start_time;

    const minutesUntil = await query(
      `SELECT EXTRACT(EPOCH FROM (
         ($1::DATE + $2::TIME) AT TIME ZONE 'America/Sao_Paulo' - NOW()
       )) / 60 AS minutes_until`,
      [absenceDate, startTime]
    );

    const minutes = parseFloat(minutesUntil.rows[0].minutes_until);
    const status = minutes > 60 ? 'valid' : 'late';

    try {
      const result = await query(
        `INSERT INTO student_absences (student_id, schedule_id, absence_date, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id, student_id, schedule_id, absence_date, status, declared_at`,
        [studentId, scheduleId, absenceDate, status]
      );
      return { absence: result.rows[0], charged: status !== 'valid' };
    } catch (err) {
      if (err.code === '23505') throw new ConflictError('Absence already declared for this date');
      throw err;
    }
  }

  static async findBySchedule(scheduleId, date = null) {
    const params = [scheduleId];
    const dateFilter = date ? ` AND sa.absence_date = $${params.push(date)}` : '';

    const result = await query(
      `SELECT sa.id, sa.student_id, sa.schedule_id, sa.absence_date, sa.status, sa.declared_at,
              u.name AS student_name
       FROM student_absences sa
       JOIN users u ON sa.student_id = u.id
       WHERE sa.schedule_id = $1${dateFilter}
       ORDER BY sa.declared_at DESC`,
      params
    );
    return result.rows;
  }

  static async findByStudent(studentId) {
    const result = await query(
      `SELECT sa.id, sa.student_id, sa.schedule_id, sa.absence_date, sa.status, sa.declared_at
       FROM student_absences sa
       WHERE sa.student_id = $1
       ORDER BY sa.absence_date DESC`,
      [studentId]
    );
    return result.rows;
  }

  static async setNoShow(studentId, scheduleId, absenceDate) {
    await query(
      `INSERT INTO student_absences (student_id, schedule_id, absence_date, status)
       VALUES ($1, $2, $3, 'no_show')
       ON CONFLICT (student_id, schedule_id, absence_date) DO NOTHING`,
      [studentId, scheduleId, absenceDate]
    );
  }
}
