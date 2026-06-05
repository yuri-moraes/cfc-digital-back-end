import { query } from '../db/pool.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ScheduleCancellation {
  static async create(scheduleId, date, reason, createdBy) {
    if (!uuidRegex.test(scheduleId)) {
      throw new NotFoundError('Schedule not found');
    }

    const duplicate = await query(
      'SELECT 1 FROM schedule_cancellations WHERE schedule_id = $1 AND cancelled_date = $2',
      [scheduleId, date]
    );
    if (duplicate.rows.length > 0) throw new ConflictError('Class already cancelled on this date');

    const result = await query(
      `INSERT INTO schedule_cancellations (schedule_id, cancelled_date, reason, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, schedule_id, cancelled_date, reason, created_by, created_at`,
      [scheduleId, date, reason ?? null, createdBy]
    );
    
    const row = result.rows[0];
    if (row) {
      if (row.cancelled_date instanceof Date) {
        row.cancelled_date = row.cancelled_date.toISOString().split('T')[0];
      } else if (typeof row.cancelled_date === 'string') {
        row.cancelled_date = row.cancelled_date.split('T')[0];
      }
    }
    return row;
  }

  static async delete(scheduleId, date) {
    if (!uuidRegex.test(scheduleId)) {
      throw new NotFoundError('Cancellation not found');
    }

    const result = await query(
      'DELETE FROM schedule_cancellations WHERE schedule_id = $1 AND cancelled_date = $2',
      [scheduleId, date]
    );
    if (result.rowCount === 0) throw new NotFoundError('Cancellation not found');
  }

  static async findBySchedule(scheduleId) {
    if (!uuidRegex.test(scheduleId)) {
      throw new NotFoundError('Schedule not found');
    }

    const result = await query(
      `SELECT id, schedule_id, cancelled_date, reason, created_by, created_at
       FROM schedule_cancellations
       WHERE schedule_id = $1
       ORDER BY cancelled_date DESC`,
      [scheduleId]
    );
    return result.rows.map(row => {
      if (row.cancelled_date instanceof Date) {
        row.cancelled_date = row.cancelled_date.toISOString().split('T')[0];
      } else if (typeof row.cancelled_date === 'string') {
        row.cancelled_date = row.cancelled_date.split('T')[0];
      }
      return row;
    });
  }

  static async existsForDate(scheduleId, date) {
    if (!uuidRegex.test(scheduleId)) {
      return false;
    }

    const result = await query(
      'SELECT 1 FROM schedule_cancellations WHERE schedule_id = $1 AND cancelled_date = $2',
      [scheduleId, date]
    );
    return result.rows.length > 0;
  }
}
