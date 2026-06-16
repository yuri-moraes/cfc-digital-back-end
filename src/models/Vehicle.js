import { query } from '../db/pool.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';

export class Vehicle {
  static async create(plate, model, year) {
    if (!plate || !model || !year) {
      throw new BadRequestError('plate, model and year are required');
    }

    const dup = await query(
      'SELECT id FROM vehicles WHERE LOWER(plate) = LOWER($1)',
      [plate]
    );
    if (dup.rows.length > 0) {
      throw new ConflictError('Plate already registered');
    }

    const result = await query(
      `INSERT INTO vehicles (plate, model, year) VALUES ($1, $2, $3)
       RETURNING id, plate, model, year, created_at`,
      [plate.toUpperCase(), model, year]
    );

    return result.rows[0];
  }

  static async findById(id) {
    const result = await query(
      'SELECT id, plate, model, year, created_at FROM vehicles WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Vehicle not found');
    }

    return result.rows[0];
  }

  static async list({ limit = 50, offset = 0 } = {}) {
    const [data, count] = await Promise.all([
      query(
        'SELECT id, plate, model, year, created_at FROM vehicles ORDER BY plate LIMIT $1 OFFSET $2',
        [limit, offset]
      ),
      query('SELECT COUNT(*) FROM vehicles'),
    ]);

    return {
      data: data.rows,
      meta: { total: parseInt(count.rows[0].count, 10), limit, offset },
    };
  }

  static async update(id, { plate, model, year }) {
    await Vehicle.findById(id);

    if (plate) {
      const dup = await query(
        'SELECT id FROM vehicles WHERE LOWER(plate) = LOWER($1) AND id != $2',
        [plate, id]
      );
      if (dup.rows.length > 0) {
        throw new ConflictError('Plate already registered');
      }
    }

    const result = await query(
      `UPDATE vehicles SET
         plate = COALESCE($1, plate),
         model = COALESCE($2, model),
         year  = COALESCE($3, year)
       WHERE id = $4
       RETURNING id, plate, model, year, created_at`,
      [plate ? plate.toUpperCase() : null, model ?? null, year ?? null, id]
    );

    return result.rows[0];
  }

  static async delete(id) {
    const result = await query('DELETE FROM vehicles WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      throw new NotFoundError('Vehicle not found');
    }
  }
}
