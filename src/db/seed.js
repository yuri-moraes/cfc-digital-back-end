import { initPool, query } from './pool.js';
import { hashPassword } from '../utils/passwordHash.js';
import { USER_ROLES } from '../constants.js';

const DEMO_USERS = [
  { email: 'admin@cfc.com', password: '123456', name: 'Admin', role: USER_ROLES.ADMIN },
  { email: 'instrutor@cfc.com', password: '123456', name: 'Instrutor', role: USER_ROLES.INSTRUCTOR },
  { email: 'aluno@cfc.com', password: '123456', name: 'Aluno', role: USER_ROLES.STUDENT },
];

const seed = async () => {
  initPool();

  for (const { email, password, name, role } of DEMO_USERS) {
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      console.log(`✓ ${email} already exists, skipping`);
      continue;
    }

    const passwordHash = await hashPassword(password);
    await query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)',
      [email, passwordHash, name, role]
    );
    console.log(`✓ Created ${role} user: ${email}`);
  }

  console.log('Seed complete');
};

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
