import { query } from '../db/pool.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export class Notification {
  static async create(userId, type, title, body, scheduleId, classDate) {
    const result = await query(
      `INSERT INTO notifications (user_id, type, title, body, schedule_id, class_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, type, title, body, schedule_id, class_date, read_at, created_at`,
      [userId, type, title, body, scheduleId, classDate]
    );
    return result.rows[0];
  }

  static async findByUser(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT id, user_id, type, title, body, schedule_id, class_date, read_at, created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      query('SELECT COUNT(*) FROM notifications WHERE user_id = $1', [userId]),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  static async markRead(id, userId) {
    const existing = await query(
      'SELECT id, user_id FROM notifications WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) throw new NotFoundError('Notification not found');
    if (existing.rows[0].user_id !== userId) throw new ForbiddenError('Forbidden');

    const result = await query(
      `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, user_id, type, title, body, schedule_id, class_date, read_at, created_at`,
      [id]
    );
    return result.rows[0];
  }

  static async markAllRead(userId) {
    await query(
      'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    );
  }

  static async countUnread(userId) {
    const result = await query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  static async dedupeExists(userId, scheduleId, classDate, type) {
    const result = await query(
      'SELECT 1 FROM notifications WHERE user_id = $1 AND schedule_id = $2 AND class_date = $3 AND type = $4',
      [userId, scheduleId, classDate, type]
    );
    return result.rows.length > 0;
  }
}
