import { query } from '../db/pool.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { InstructorVehicle } from './InstructorVehicle.js';

export class LessonSlot {
  static async getRemainingBalance(studentId) {
    const result = await query(
      `SELECT u.purchased_lessons,
         COALESCE((
           SELECT COUNT(*) FROM lesson_slots
           WHERE student_id = $1
             AND status IN ('scheduled','completed','no_show','absent_charged')
         ), 0)::INT AS used
       FROM users u WHERE u.id = $1`,
      [studentId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Student not found');
    const { purchased_lessons, used } = result.rows[0];
    return purchased_lessons - used;
  }

  static async _checkConflict(instructorId, vehicleId, scheduledDate, startTime) {
    const result = await query(
      `SELECT id FROM lesson_slots
       WHERE instructor_id = $1 AND vehicle_id = $2
         AND scheduled_date = $3 AND start_time = $4
         AND status IN ('scheduled', 'completed')`,
      [instructorId, vehicleId, scheduledDate, startTime]
    );
    return result.rows.length > 0;
  }

  static async createSingle(studentId, instructorId, vehicleId, scheduledDate, startTime, { checkBalance = true } = {}) {
    const authorized = await InstructorVehicle.isAuthorized(instructorId, vehicleId);
    if (!authorized) throw new BadRequestError('Instructor is not authorized for this vehicle');

    if (checkBalance) {
      const balance = await LessonSlot.getRemainingBalance(studentId);
      if (balance <= 0) throw new BadRequestError('No remaining lesson balance');
    }

    const conflict = await LessonSlot._checkConflict(instructorId, vehicleId, scheduledDate, startTime);
    if (conflict) throw new BadRequestError('Time slot already occupied');

    const result = await query(
      `INSERT INTO lesson_slots (student_id, instructor_id, vehicle_id, scheduled_date, start_time)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [studentId, instructorId, vehicleId, scheduledDate, startTime]
    );
    return result.rows[0];
  }

  static async createBatch(studentId, instructorId, vehicleId, daysOfWeek, startTime, startDate, quantity) {
    const authorized = await InstructorVehicle.isAuthorized(instructorId, vehicleId);
    if (!authorized) throw new BadRequestError('Instructor is not authorized for this vehicle');

    const balance = await LessonSlot.getRemainingBalance(studentId);
    if (quantity > balance) {
      throw new BadRequestError(`Quantity (${quantity}) exceeds remaining balance (${balance})`);
    }

    const dates = [];
    const d = new Date(`${startDate}T12:00:00`);
    const limit = new Date(d);
    limit.setFullYear(limit.getFullYear() + 2);

    while (dates.length < quantity) {
      if (d > limit) throw new BadRequestError('Could not find enough available slots within 2 years');
      if (daysOfWeek.includes(d.getDay())) {
        const dateStr = d.toISOString().slice(0, 10);
        const conflict = await LessonSlot._checkConflict(instructorId, vehicleId, dateStr, startTime);
        if (conflict) throw new BadRequestError(`Slot conflict on ${dateStr} at ${startTime}`);
        dates.push(dateStr);
      }
      d.setDate(d.getDate() + 1);
    }

    const created = [];
    for (const dateStr of dates) {
      const result = await query(
        `INSERT INTO lesson_slots (student_id, instructor_id, vehicle_id, scheduled_date, start_time)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [studentId, instructorId, vehicleId, dateStr, startTime]
      );
      created.push(result.rows[0]);
    }
    return created;
  }

  static async findById(id) {
    const result = await query(
      `SELECT ls.*,
              s.name AS student_name, i.name AS instructor_name,
              v.plate, v.model
       FROM lesson_slots ls
       JOIN users s    ON s.id = ls.student_id
       JOIN users i    ON i.id = ls.instructor_id
       JOIN vehicles v ON v.id = ls.vehicle_id
       WHERE ls.id = $1`,
      [id]
    );
    if (result.rows.length === 0) throw new NotFoundError('Lesson slot not found');
    return result.rows[0];
  }

  static async list({ studentId, instructorId, date, status, limit = 50, offset = 0 } = {}) {
    const conds = [];
    const params = [];
    let i = 1;
    if (studentId)    { conds.push(`ls.student_id = $${i++}`);    params.push(studentId); }
    if (instructorId) { conds.push(`ls.instructor_id = $${i++}`); params.push(instructorId); }
    if (date)         { conds.push(`ls.scheduled_date = $${i++}`); params.push(date); }
    if (status)       { conds.push(`ls.status = $${i++}`);        params.push(status); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [data, count] = await Promise.all([
      query(
        `SELECT ls.id, ls.student_id, ls.instructor_id, ls.vehicle_id,
                ls.scheduled_date, ls.start_time, ls.status,
                ls.plate_at_checkin, ls.validated_by, ls.validated_at,
                ls.absence_declared_at, ls.cancellation_reason,
                ls.cancelled_by, ls.cancelled_at, ls.created_at,
                s.name AS student_name, i.name AS instructor_name,
                v.plate, v.model
         FROM lesson_slots ls
         JOIN users s    ON s.id = ls.student_id
         JOIN users i    ON i.id = ls.instructor_id
         JOIN vehicles v ON v.id = ls.vehicle_id
         ${where}
         ORDER BY ls.scheduled_date, ls.start_time
         LIMIT $${i++} OFFSET $${i}`,
        [...params, limit, offset]
      ),
      query(`SELECT COUNT(*) FROM lesson_slots ls ${where}`, params),
    ]);
    return { data: data.rows, meta: { total: parseInt(count.rows[0].count, 10), limit, offset } };
  }

  static async reschedule(id, { instructorId, vehicleId, scheduledDate, startTime }) {
    const slot = await LessonSlot.findById(id);
    if (!['scheduled', 'absent_valid'].includes(slot.status)) {
      throw new BadRequestError('Only scheduled or absent_valid lessons can be rescheduled');
    }
    const authorized = await InstructorVehicle.isAuthorized(instructorId, vehicleId);
    if (!authorized) throw new BadRequestError('Instructor is not authorized for this vehicle');
    const conflict = await LessonSlot._checkConflict(instructorId, vehicleId, scheduledDate, startTime);
    if (conflict) throw new BadRequestError('Target slot is already occupied');

    const result = await query(
      `UPDATE lesson_slots
       SET instructor_id = $1, vehicle_id = $2, scheduled_date = $3,
           start_time = $4, status = 'scheduled'
       WHERE id = $5 RETURNING *`,
      [instructorId, vehicleId, scheduledDate, startTime, id]
    );
    return result.rows[0];
  }

  static async checkin(id, instructorId, plateAtCheckin) {
    const slot = await LessonSlot.findById(id);
    if (slot.status !== 'scheduled') throw new BadRequestError('Only scheduled lessons can be checked in');
    if (slot.instructor_id !== instructorId) throw new ForbiddenError('Not your lesson');
    if (!plateAtCheckin) throw new BadRequestError('plate_at_checkin is required');

    const result = await query(
      `UPDATE lesson_slots
       SET status = 'completed', plate_at_checkin = $1, validated_by = $2, validated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [plateAtCheckin, instructorId, id]
    );
    return result.rows[0];
  }

  static async noShow(id, instructorId) {
    const slot = await LessonSlot.findById(id);
    if (slot.status !== 'scheduled') throw new BadRequestError('Only scheduled lessons can be marked no-show');
    if (slot.instructor_id !== instructorId) throw new ForbiddenError('Not your lesson');
    if (slot.absence_declared_at) throw new BadRequestError('Student already declared absence');

    const result = await query(
      `UPDATE lesson_slots SET status = 'no_show' WHERE id = $1 RETURNING *`, [id]
    );
    return result.rows[0];
  }

  static async declareAbsence(id, studentId) {
    const slot = await LessonSlot.findById(id);
    if (slot.status !== 'scheduled') throw new BadRequestError('Only scheduled lessons can have absence declared');
    if (slot.student_id !== studentId) throw new ForbiddenError('Not your lesson');

    const now = Date.now();
    const dateStr = typeof slot.scheduled_date === 'string'
      ? slot.scheduled_date
      : slot.scheduled_date.toISOString().slice(0, 10);
    const slotDateTime = new Date(`${dateStr}T${slot.start_time.slice(0, 5)}`).getTime();
    const diffMinutes = (slotDateTime - now) / 60000;
    const newStatus = diffMinutes >= 60 ? 'absent_valid' : 'absent_charged';

    const result = await query(
      `UPDATE lesson_slots SET status = $1, absence_declared_at = NOW()
       WHERE id = $2 RETURNING *`,
      [newStatus, id]
    );
    return result.rows[0];
  }

  static async cancel(id, cancelledBy, reason) {
    const slot = await LessonSlot.findById(id);
    if (!['scheduled', 'absent_valid'].includes(slot.status)) {
      throw new BadRequestError('Only scheduled or absent_valid lessons can be cancelled');
    }
    const result = await query(
      `UPDATE lesson_slots
       SET status = 'cancelled', cancellation_reason = $1, cancelled_by = $2, cancelled_at = NOW()
       WHERE id = $3 RETURNING *`,
      [reason || null, cancelledBy, id]
    );
    return result.rows[0];
  }
}
