import { query } from '../db/pool.js';
import { BadRequestError } from '../utils/errors.js';

export class NotificationPreference {
  static async findOrCreate(userId) {
    const result = await query(
      `INSERT INTO notification_preferences (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING id, user_id, minutes_before, whatsapp_enabled, in_app_enabled, created_at, updated_at`,
      [userId]
    );

    return result.rows[0];
  }

  static async update(userId, { minutes_before, whatsapp_enabled, in_app_enabled }) {
    if (minutes_before !== undefined && (typeof minutes_before !== 'number' || !Number.isInteger(minutes_before) || minutes_before < 1 || minutes_before > 120)) {
      throw new BadRequestError('minutes_before must be an integer between 1 and 120');
    }

    if (whatsapp_enabled !== undefined && typeof whatsapp_enabled !== 'boolean') {
      throw new BadRequestError('whatsapp_enabled must be a boolean');
    }

    if (in_app_enabled !== undefined && typeof in_app_enabled !== 'boolean') {
      throw new BadRequestError('in_app_enabled must be a boolean');
    }

    await NotificationPreference.findOrCreate(userId);

    const fields = [];
    const values = [];
    let idx = 1;

    if (minutes_before !== undefined) { fields.push(`minutes_before = $${idx++}`); values.push(minutes_before); }
    if (whatsapp_enabled !== undefined) { fields.push(`whatsapp_enabled = $${idx++}`); values.push(whatsapp_enabled); }
    if (in_app_enabled !== undefined) { fields.push(`in_app_enabled = $${idx++}`); values.push(in_app_enabled); }

    if (fields.length === 0) throw new BadRequestError('No valid fields to update');

    values.push(userId);
    const result = await query(
      `UPDATE notification_preferences SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $${idx}
       RETURNING id, user_id, minutes_before, whatsapp_enabled, in_app_enabled, created_at, updated_at`,
      values
    );

    return result.rows[0];
  }
}
