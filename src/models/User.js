// src/models/User.js
import { query } from '../db/pool.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../utils/errors.js';
import { hashPassword, verifyPassword } from '../utils/passwordHash.js';
import { USER_ROLES } from '../constants.js';

export class User {
  /**
   * Create a new user
   * @param {string} email - User email
   * @param {string} password - User password (will be hashed)
   * @param {string} name - User name
   * @param {string} role - User role (ADMIN, STUDENT, INSTRUCTOR)
   * @returns {Promise<Object>} Created user without password_hash
   * @throws {BadRequestError} If role is invalid
   * @throws {ConflictError} If email already exists
   */
  static async create(email, password, name, role, phoneNumber = null) {
    const validRoles = Object.values(USER_ROLES);
    if (!validRoles.includes(role)) {
      throw new BadRequestError(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    const existingUser = await query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new ConflictError('Email already exists');
    }

    const passwordHash = await hashPassword(password);

    const result = await query(
      `INSERT INTO users (email, password_hash, name, role, phone_number)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, phone_number, created_at, updated_at`,
      [email, passwordHash, name, role, phoneNumber]
    );

    return result.rows[0];
  }

  /**
   * Find user by ID
   * @param {string} id - User ID
   * @returns {Promise<Object>} User without password_hash
   * @throws {NotFoundError} If user not found
   */
  static async findById(id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new NotFoundError('User not found');
    }

    const result = await query(
      'SELECT id, email, name, role, phone_number, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    return result.rows[0];
  }

  /**
   * Find user by email (internal use - includes password_hash)
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User WITH password_hash, or null if not found
   */
  static async findByEmail(email) {
    const result = await query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Authenticate user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} Authenticated user without password_hash
   * @throws {BadRequestError} If email not found or password is invalid
   */
  static async authenticate(email, password) {
    // Find user by email
    const user = await this.findByEmail(email);

    if (!user) {
      throw new BadRequestError('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      throw new BadRequestError('Invalid email or password');
    }

    // Return user without password_hash
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Update user
   * @param {string} id - User ID
   * @param {Object} updates - Fields to update (only 'name' and 'email' allowed)
   * @returns {Promise<Object>} Updated user without password_hash
   * @throws {NotFoundError} If user not found
   */
  static async update(id, updates) {
    const allowedFields = ['name', 'email', 'phone_number'];
    const updateFields = Object.keys(updates).filter((key) =>
      allowedFields.includes(key)
    );

    if (updateFields.length === 0) {
      throw new BadRequestError('No valid fields to update');
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new NotFoundError('User not found');
    }

    // Check if user exists
    const existingUser = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    // Build dynamic query
    const setClauses = updateFields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');

    const values = [
      ...updateFields.map((field) => updates[field]),
      id,
    ];

    const result = await query(
      `UPDATE users SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${updateFields.length + 1}
       RETURNING id, email, name, role, phone_number, created_at, updated_at`,
      values
    );

    return result.rows[0];
  }

  /**
   * Delete user
   * @param {string} id - User ID
   * @throws {NotFoundError} If user not found
   */
  static async delete(id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new NotFoundError('User not found');
    }

    const result = await query('DELETE FROM users WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      throw new NotFoundError('User not found');
    }
  }

  /**
   * List all users
   * @returns {Promise<Array>} All users without password_hash, ordered by created_at DESC
   */
  static async list({ limit = 20, offset = 0 } = {}) {
    const [dataResult, countResult] = await Promise.all([
      query(
        'SELECT id, email, name, role, phone_number, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      ),
      query('SELECT COUNT(*) FROM users'),
    ]);
    return { rows: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }
}
