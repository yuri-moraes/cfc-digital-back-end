import { del } from '@vercel/blob';
import { query } from '../db/pool.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../utils/errors.js';

const EXPIRATION_HOURS = 48;

export class AttendanceRecord {
  static async create(scheduleId, studentId, attendanceDate, photoUrl) {
    if (!scheduleId) throw new BadRequestError('Schedule ID is required');
    if (!studentId) throw new BadRequestError('Student ID is required');
    if (!attendanceDate) throw new BadRequestError('Attendance date is required');
    if (!photoUrl) throw new BadRequestError('Photo URL is required');

    try {
      const result = await query(
        `INSERT INTO attendance_records (schedule_id, student_id, attendance_date, photo_url, photo_uploaded_at, status)
         VALUES ($1, $2, $3, $4, NOW(), 'pending')
         RETURNING id, schedule_id, student_id, attendance_date, status, photo_url, photo_uploaded_at, validated_by, validated_at, created_at`,
        [scheduleId, studentId, attendanceDate, photoUrl]
      );
      return result.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw new ConflictError('Attendance already marked for this student on this date');
      }
      throw err;
    }
  }

  static async findById(id) {
    await AttendanceRecord.deleteExpired();

    const result = await query(
      `SELECT ar.id, ar.schedule_id, ar.student_id, ar.attendance_date, ar.status,
              ar.photo_url, ar.photo_uploaded_at, ar.validated_by, ar.validated_at, ar.created_at,
              u.name as student_name, s.class_id, c.name as class_name
       FROM attendance_records ar
       JOIN users u ON ar.student_id = u.id
       JOIN schedules s ON ar.schedule_id = s.id
       JOIN classes c ON s.class_id = c.id
       WHERE ar.id = $1`,
      [id]
    );

    if (result.rows.length === 0) throw new NotFoundError('Attendance record not found');

    return result.rows[0];
  }

  static async findBySchedule(scheduleId, attendanceDate, { limit = 20, offset = 0, studentId = null } = {}) {
    await AttendanceRecord.deleteExpired();

    const params = [scheduleId, attendanceDate];
    const studentFilter = studentId ? ` AND ar.student_id = $${params.push(studentId)}` : '';

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT ar.id, ar.schedule_id, ar.student_id, ar.attendance_date, ar.status,
                ar.photo_url, ar.photo_uploaded_at, ar.validated_by, ar.validated_at, ar.created_at,
                u.name as student_name
         FROM attendance_records ar
         JOIN users u ON ar.student_id = u.id
         WHERE ar.schedule_id = $1 AND ar.attendance_date = $2${studentFilter}
         ORDER BY u.name
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      query(
        `SELECT COUNT(*) FROM attendance_records ar WHERE ar.schedule_id = $1 AND ar.attendance_date = $2${studentFilter}`,
        params
      ),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  static async findByStudent(studentId, classId, { limit = 20, offset = 0 } = {}) {
    await AttendanceRecord.deleteExpired();

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT ar.id, ar.schedule_id, ar.student_id, ar.attendance_date, ar.status,
                ar.photo_url, ar.photo_uploaded_at, ar.validated_by, ar.validated_at, ar.created_at,
                c.name as class_name
         FROM attendance_records ar
         JOIN schedules s ON ar.schedule_id = s.id
         JOIN classes c ON s.class_id = c.id
         WHERE ar.student_id = $1 AND s.class_id = $2
         ORDER BY ar.attendance_date DESC
         LIMIT $3 OFFSET $4`,
        [studentId, classId, limit, offset]
      ),
      query(
        `SELECT COUNT(*) FROM attendance_records ar
         JOIN schedules s ON ar.schedule_id = s.id
         WHERE ar.student_id = $1 AND s.class_id = $2`,
        [studentId, classId]
      ),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  static async findPending({ limit = 20, offset = 0, studentId = null } = {}) {
    await AttendanceRecord.deleteExpired();

    const params = [];
    const studentFilter = studentId ? ` AND ar.student_id = $${params.push(studentId)}` : '';

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT ar.id, ar.schedule_id, ar.student_id, ar.attendance_date, ar.status,
                ar.photo_url, ar.photo_uploaded_at, ar.validated_by, ar.validated_at, ar.created_at,
                u.name as student_name
         FROM attendance_records ar
         JOIN users u ON ar.student_id = u.id
         WHERE ar.status = 'pending' ${studentFilter}
         ORDER BY ar.photo_uploaded_at ASC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      query(
        `SELECT COUNT(*) FROM attendance_records ar WHERE ar.status = 'pending' ${studentFilter}`,
        params
      ),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  static async validate(id, adminId) {
    const recordResult = await query(
      'SELECT id, status FROM attendance_records WHERE id = $1',
      [id]
    );

    if (recordResult.rows.length === 0) throw new NotFoundError('Attendance record not found');

    const record = recordResult.rows[0];

    if (record.status !== 'pending') {
      throw new BadRequestError(`Cannot validate attendance with status '${record.status}'`);
    }

    const result = await query(
      `UPDATE attendance_records
       SET status = 'validated', validated_by = $1, validated_at = NOW()
       WHERE id = $2
       RETURNING id, schedule_id, student_id, attendance_date, status, photo_url, photo_uploaded_at, validated_by, validated_at, created_at`,
      [adminId, id]
    );

    return result.rows[0];
  }

  static async reject(id, adminId) {
    const recordResult = await query(
      'SELECT id, status, photo_url FROM attendance_records WHERE id = $1',
      [id]
    );

    if (recordResult.rows.length === 0) throw new NotFoundError('Attendance record not found');

    const record = recordResult.rows[0];

    if (record.status !== 'pending') {
      throw new BadRequestError(`Cannot reject attendance with status '${record.status}'`);
    }

    // Delete photo from Vercel Blob
    if (record.photo_url) {
      try {
        await del(record.photo_url);
      } catch (err) {
        console.error('Failed to delete photo from Vercel Blob:', err.message);
      }
    }

    const result = await query(
      `UPDATE attendance_records
       SET status = 'rejected', photo_url = NULL, validated_by = $1, validated_at = NOW()
       WHERE id = $2
       RETURNING id, schedule_id, student_id, attendance_date, status, photo_url, photo_uploaded_at, validated_by, validated_at, created_at`,
      [adminId, id]
    );

    return result.rows[0];
  }

  static async deleteExpired() {
    const expiredResult = await query(
      `SELECT id, photo_url FROM attendance_records
       WHERE status = 'pending' AND photo_uploaded_at < NOW() - INTERVAL '${EXPIRATION_HOURS} hours'`
    );

    for (const record of expiredResult.rows) {
      if (record.photo_url) {
        try {
          await del(record.photo_url);
        } catch (err) {
          console.error('Failed to delete expired photo from Vercel Blob:', err.message);
        }
      }
      await query('DELETE FROM attendance_records WHERE id = $1', [record.id]);
    }

    return expiredResult.rows.length;
  }

  static async delete(id) {
    const recordResult = await query(
      'SELECT id, photo_url FROM attendance_records WHERE id = $1',
      [id]
    );

    if (recordResult.rows.length === 0) throw new NotFoundError('Attendance record not found');

    const record = recordResult.rows[0];

    if (record.photo_url) {
      try {
        await del(record.photo_url);
      } catch (err) {
        console.error('Failed to delete photo from Vercel Blob:', err.message);
      }
    }

    await query('DELETE FROM attendance_records WHERE id = $1', [id]);
  }
}
