import { Request, Response, NextFunction } from 'express';
import { db } from '../db/database';

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;
const LOCKOUT_MINUTES = 15;

export function checkLoginRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const loginName = (req.body?.loginName || '').trim().toLowerCase();

  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  // Check user lockedUntil in users table
  if (loginName) {
    const user = db.prepare('SELECT locked_until FROM users WHERE lower(login_name) = ?').get(loginName) as {
      locked_until: string | null;
    } | undefined;

    if (user?.locked_until) {
      const lockExpiry = new Date(user.locked_until).getTime();
      if (Date.now() < lockExpiry) {
        res.status(429).json({ error: 'Too many attempts, try again later.' });
        return;
      } else {
        // Unlock if lockout period expired
        db.prepare('UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE lower(login_name) = ?').run(loginName);
      }
    }
  }

  // Count recent failed attempts for this IP or this loginName
  const ipAttempts = db.prepare(`
    SELECT COUNT(*) as count FROM login_attempts
    WHERE ip_address = ? AND success = 0 AND timestamp >= ?
  `).get(ip, windowStart) as { count: number };

  const userAttempts = loginName
    ? (db.prepare(`
        SELECT COUNT(*) as count FROM login_attempts
        WHERE lower(identifier) = ? AND success = 0 AND timestamp >= ?
      `).get(loginName, windowStart) as { count: number })
    : { count: 0 };

  if (ipAttempts.count >= MAX_FAILURES || userAttempts.count >= MAX_FAILURES) {
    res.status(429).json({ error: 'Too many attempts, try again later.' });
    return;
  }

  next();
}

export function recordLoginAttempt(identifier: string, ip: string, success: boolean) {
  const now = new Date().toISOString();
  const id = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  db.prepare(`
    INSERT INTO login_attempts (id, identifier, ip_address, success, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, identifier.toLowerCase(), ip, success ? 1 : 0, now);

  if (success) {
    // Reset failed counter on user
    db.prepare(`
      UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE lower(login_name) = ?
    `).run(identifier.toLowerCase());
  } else {
    // Check if threshold reached to set lockout on user
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const attempts = db.prepare(`
      SELECT COUNT(*) as count FROM login_attempts
      WHERE lower(identifier) = ? AND success = 0 AND timestamp >= ?
    `).get(identifier.toLowerCase(), windowStart) as { count: number };

    if (attempts.count >= MAX_FAILURES) {
      const lockoutExpiry = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
      db.prepare(`
        UPDATE users SET failed_attempts = ?, locked_until = ? WHERE lower(login_name) = ?
      `).run(attempts.count, lockoutExpiry, identifier.toLowerCase());
    } else {
      db.prepare(`
        UPDATE users SET failed_attempts = ? WHERE lower(login_name) = ?
      `).run(attempts.count, identifier.toLowerCase());
    }
  }
}
