import { Request, Response, NextFunction } from 'express';
import { db } from '../db/database';
import { UserDTO } from '@bulk-cert/shared';

declare global {
  namespace Express {
    interface Request {
      user?: UserDTO;
      sessionId?: string;
    }
  }
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.sid;

  if (!sessionId) {
    res.status(401).json({ error: 'Unauthorized. Please sign in.' });
    return;
  }

  const session = db.prepare(`
    SELECT s.id, s.user_id, s.expires_at, s.last_active_at, u.login_name, u.must_change_password, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(sessionId) as {
    id: string;
    user_id: string;
    expires_at: string;
    last_active_at: string;
    login_name: string;
    must_change_password: number;
    created_at: string;
  } | undefined;

  if (!session) {
    res.clearCookie('sid');
    res.status(401).json({ error: 'Unauthorized. Please sign in.' });
    return;
  }

  const now = Date.now();
  const lastActive = new Date(session.last_active_at).getTime();
  const expires = new Date(session.expires_at).getTime();

  // Check idle timeout or absolute expiry
  if (now - lastActive > IDLE_TIMEOUT_MS || now > expires) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    res.clearCookie('sid');
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  // Refresh last_active_at
  const nowIso = new Date().toISOString();
  db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(nowIso, sessionId);

  req.sessionId = session.id;
  req.user = {
    id: session.user_id,
    loginName: session.login_name,
    mustChangePassword: session.must_change_password === 1,
    createdAt: session.created_at
  };

  next();
}
