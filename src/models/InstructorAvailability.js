import { query } from '../db/pool.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { InstructorVehicle } from './InstructorVehicle.js';

export class InstructorAvailability {
  static async create(instructorId, vehicleId, dayOfWeek, startTime, endTime) {
    if (dayOfWeek < 0 || dayOfWeek > 6) throw new BadRequestError('day_of_week must be 0–6');
    if (startTime >= endTime) throw new BadRequestError('start_time must be before end_time');
    const authorized = await InstructorVehicle.isAuthorized(instructorId, vehicleId);
    if (!authorized) throw new BadRequestError('Instructor is not authorized for this vehicle');
    const result = await query(
      `INSERT INTO instructor_availability (instructor_id, vehicle_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, instructor_id, vehicle_id, day_of_week, start_time, end_time, created_at`,
      [instructorId, vehicleId, dayOfWeek, startTime, endTime]
    );
    return result.rows[0];
  }

  static async listByInstructor(instructorId) {
    const result = await query(
      `SELECT ia.id, ia.vehicle_id, ia.day_of_week, ia.start_time, ia.end_time, ia.created_at,
              v.plate, v.model
       FROM instructor_availability ia
       JOIN vehicles v ON v.id = ia.vehicle_id
       WHERE ia.instructor_id = $1
       ORDER BY ia.day_of_week, ia.start_time`,
      [instructorId]
    );
    return result.rows;
  }

  static async delete(id, instructorId) {
    const result = await query(
      'DELETE FROM instructor_availability WHERE id = $1 AND instructor_id = $2',
      [id, instructorId]
    );
    if (result.rowCount === 0) throw new NotFoundError('Availability window not found');
  }
}
