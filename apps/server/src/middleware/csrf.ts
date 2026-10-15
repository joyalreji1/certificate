import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  // Ensure csrf token cookie exists
  let token = req.cookies?.csrf_token;
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie('csrf_token', token, {
      httpOnly: false, // Accessible by JavaScript client to send in header
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });
  }

  // Exempt safe HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Exempt auth login/register if initial session doesn't exist yet, but enforce on all authenticated actions
  // Actually, let's verify csrf token if provided or on state changes
  const headerToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
  
  // If the user has a session, require CSRF matching
  if (req.cookies?.sid) {
    if (!headerToken || headerToken !== token) {
      res.status(403).json({ error: 'Invalid or missing CSRF token.' });
      return;
    }
  }

  next();
}
