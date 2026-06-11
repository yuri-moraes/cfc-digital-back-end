import { query } from '../db/pool.js';
import { BadRequestError } from '../utils/errors.js';

const SLOT_MINUTES = 50;

export class AvailableSlot {
  static async list({ dateFrom, dateTo, instructorId = null }) {
    if (!dateFrom || !dateTo) throw new BadRequestError('date_from and date_to are required');

    const availParams = instructorId ? [instructorId] : [];
    const availSQL = `
      SELECT ia.instructor_id, ia.vehicle_id, ia.day_of_week,
             ia.start_time, ia.end_time,
             u.name AS instructor_name, v.plate, v.model
      FROM instructor_availability ia
      JOIN users u    ON u.id = ia.instructor_id
      JOIN vehicles v ON v.id = ia.vehicle_id
      ${instructorId ? 'WHERE ia.instructor_id = $1' : ''}
    `;
    const availability = await query(availSQL, availParams);

    const occupiedParams = instructorId ? [dateFrom, dateTo, instructorId] : [dateFrom, dateTo];
    const occupiedSQL = `
      SELECT instructor_id, vehicle_id,
             scheduled_date::TEXT AS scheduled_date,
             start_time::TEXT AS start_time
      FROM lesson_slots
      WHERE scheduled_date BETWEEN $1 AND $2
        AND status IN ('scheduled', 'completed')
        ${instructorId ? 'AND instructor_id = $3' : ''}
    `;
    const occupied = await query(occupiedSQL, occupiedParams);

    const occupiedSet = new Set(
      occupied.rows.map(r =>
        `${r.instructor_id}|${r.vehicle_id}|${r.scheduled_date}|${r.start_time.slice(0, 5)}`
      )
    );

    const slots = [];
    const start = new Date(`${dateFrom}T00:00:00Z`);
    const end   = new Date(`${dateTo}T23:59:59Z`);

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dayOfWeek = d.getUTCDay();
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dayNum = String(d.getUTCDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${dayNum}`;

      for (const w of availability.rows) {
        if (w.day_of_week !== dayOfWeek) continue;
        const [sh, sm] = w.start_time.slice(0, 5).split(':').map(Number);
        const [eh, em] = w.end_time.slice(0, 5).split(':').map(Number);
        const windowEnd = eh * 60 + em;
        let cur = sh * 60 + sm;

        while (cur + SLOT_MINUTES <= windowEnd) {
          const hh  = String(Math.floor(cur / 60)).padStart(2, '0');
          const mm  = String(cur % 60).padStart(2, '0');
          const key = `${w.instructor_id}|${w.vehicle_id}|${dateStr}|${hh}:${mm}`;

          if (!occupiedSet.has(key)) {
            slots.push({
              instructor_id:   w.instructor_id,
              instructor_name: w.instructor_name,
              vehicle_id:      w.vehicle_id,
              plate:           w.plate,
              model:           w.model,
              date:            dateStr,
              start_time:      `${hh}:${mm}`,
            });
          }
          cur += SLOT_MINUTES;
        }
      }
    }

    return slots.sort((a, b) =>
      a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)
    );
  }
}
