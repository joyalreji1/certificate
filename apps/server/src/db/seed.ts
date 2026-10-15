import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './database';
import { config } from '../config';

export function seedAdminUser() {
  const loginName = config.adminLoginName;
  const initialPassword = config.adminInitialPassword;

  if (!loginName || !initialPassword) {
    throw new Error('ADMIN_LOGIN_NAME and ADMIN_INITIAL_PASSWORD must be configured in environment');
  }

  // Cost factor >= 12
  const salt = bcrypt.genSaltSync(12);
  const passwordHash = bcrypt.hashSync(initialPassword, salt);
  const now = new Date().toISOString();

  // In non-development, force password change on first login
  const mustChangePassword = config.nodeEnv !== 'development' ? 1 : 0;

  const existing = db.prepare('SELECT id FROM users WHERE login_name = ?').get(loginName) as { id: string } | undefined;

  if (!existing) {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (id, login_name, password_hash, must_change_password, failed_attempts, locked_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, NULL, ?, ?)
    `).run(id, loginName, passwordHash, mustChangePassword, now, now);
    console.log(`[Seed] Admin user seeded successfully for account: ${loginName}`);
  } else {
    // Update hash if seed runs again
    db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?
    `).run(passwordHash, now, existing.id);
    console.log(`[Seed] Admin user credentials refreshed for account: ${loginName}`);
  }
}

if (require.main === module) {
  try {
    seedAdminUser();
    process.exit(0);
  } catch (err) {
    console.error('[Seed Error]', err);
    process.exit(1);
  }
}
