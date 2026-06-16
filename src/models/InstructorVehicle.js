import { query } from '../db/pool.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

export class InstructorVehicle {
  static async link(instructorId, vehicleId) {
    const dup = await query(
      'SELECT id FROM instructor_vehicles WHERE instructor_id = $1 AND vehicle_id = $2',
      [instructorId, vehicleId]
    );
    if (dup.rows.length > 0) throw new ConflictError('Vehicle already linked to instructor');
    const result = await query(
      `INSERT INTO instructor_vehicles (instructor_id, vehicle_id)
       VALUES ($1, $2)
       RETURNING id, instructor_id, vehicle_id, created_at`,
      [instructorId, vehicleId]
    );
    return result.rows[0];
  }

  static async unlink(instructorId, vehicleId) {
    await query(
      'DELETE FROM instructor_availability WHERE instructor_id = $1 AND vehicle_id = $2',
      [instructorId, vehicleId]
    );
    const result = await query(
      'DELETE FROM instructor_vehicles WHERE instructor_id = $1 AND vehicle_id = $2',
      [instructorId, vehicleId]
    );
    if (result.rowCount === 0) throw new NotFoundError('Link not found');
  }

  static async listByInstructor(instructorId) {
    const result = await query(
      `SELECT iv.id, iv.vehicle_id, iv.created_at, v.plate, v.model, v.year
       FROM instructor_vehicles iv
       JOIN vehicles v ON v.id = iv.vehicle_id
       WHERE iv.instructor_id = $1
       ORDER BY v.plate`,
      [instructorId]
    );
    return result.rows;
  }

  static async isAuthorized(instructorId, vehicleId) {
    const result = await query(
      'SELECT 1 FROM instructor_vehicles WHERE instructor_id = $1 AND vehicle_id = $2',
      [instructorId, vehicleId]
    );
    return result.rows.length > 0;
  }
}
