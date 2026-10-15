import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { checkLoginRateLimit, recordLoginAttempt } from '../middleware/rateLimit';
import { config } from '../config';

export const authRouter = Router();

// Constant-time dummy hash to resist timing attacks on non-existent users
const DUMMY_HASH = bcrypt.hashSync('dummy_password_timing_defense', 12);

// Session lifetime: 7 days absolute, 30 mins idle
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

authRouter.get('/csrf', (req: Request, res: Response) => {
  let token = req.cookies?.csrf_token;
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie('csrf_token', token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      path: '/'
    });
  }
  res.json({ csrfToken: token });
});

authRouter.post('/login', checkLoginRateLimit, (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const { loginName, password } = req.body || {};

  if (!loginName || !password || typeof loginName !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Incorrect login name or password.' });
    return;
  }

  const normalizedLogin = loginName.trim().toLowerCase();

  const user = db.prepare(`
    SELECT id, login_name, password_hash, must_change_password, failed_attempts, locked_until, created_at
    FROM users
    WHERE lower(login_name) = ?
  `).get(normalizedLogin) as {
    id: string;
    login_name: string;
    password_hash: string;
    must_change_password: number;
    failed_attempts: number;
    locked_until: string | null;
    created_at: string;
  } | undefined;

  const hashToCompare = user ? user.password_hash : DUMMY_HASH;
  const isMatch = bcrypt.compareSync(password, hashToCompare);

  if (!user || !isMatch) {
    recordLoginAttempt(normalizedLogin, ip, false);
    // Generic error: never reveal which one was wrong
    res.status(401).json({ error: 'Incorrect login name or password.' });
    return;
  }

  // Success: record attempt and reset lockouts
  recordLoginAttempt(normalizedLogin, ip, true);

  // Invalidate any previous session for this cookie if present
  if (req.cookies?.sid) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(req.cookies.sid);
  }

  // Create new session ID
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
  const nowIso = now.toISOString();

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at, last_active_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    user.id,
    expiresAt,
    nowIso,
    nowIso,
    ip,
    req.headers['user-agent'] || 'unknown'
  );

  // Set httpOnly session cookie
  res.cookie('sid', sessionId, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: SESSION_LIFETIME_MS,
    path: '/'
  });

  res.json({
    user: {
      id: user.id,
      loginName: user.login_name,
      mustChangePassword: user.must_change_password === 1,
      createdAt: user.created_at
    }
  });
});

authRouter.post('/logout', (req: Request, res: Response) => {
  const sessionId = req.cookies?.sid;
  if (sessionId) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
  res.clearCookie('sid', { path: '/' });
  res.json({ success: true, message: 'Logged out successfully.' });
});

authRouter.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

authRouter.post('/change-password', authMiddleware, (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Both current password and new password are required.' });
    return;
  }

  if (typeof newPassword !== 'string' || newPassword.length < 12) {
    res.status(400).json({ error: 'New password must be at least 12 characters long.' });
    return;
  }

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as {
    password_hash: string;
  } | undefined;

  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  const salt = bcrypt.genSaltSync(12);
  const newHash = bcrypt.hashSync(newPassword, salt);
  const nowIso = new Date().toISOString();

  db.prepare(`
    UPDATE users
    SET password_hash = ?, must_change_password = 0, updated_at = ?
    WHERE id = ?
  `).run(newHash, nowIso, req.user!.id);

  res.json({ success: true, message: 'Password changed successfully.' });
});
