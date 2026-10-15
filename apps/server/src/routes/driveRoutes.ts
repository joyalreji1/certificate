import { Router, Request, Response } from 'express';
import { GoogleDriveService } from '../services/googleDriveService';
import { authMiddleware } from '../middleware/auth';
import { config } from '../config';

export const driveRouter = Router();

// Drive connection status
driveRouter.get('/status', authMiddleware, (req: Request, res: Response) => {
  const status = GoogleDriveService.getStatus(req.user!.id);
  res.json(status);
});

// Generate OAuth authorization URL
driveRouter.get('/auth-url', authMiddleware, (req: Request, res: Response) => {
  try {
    const url = GoogleDriveService.getAuthUrl(req.user!.id);
    res.json({ url });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Google Drive integration is not configured.' });
  }
});

// Disconnect Google Drive
driveRouter.post('/disconnect', authMiddleware, (req: Request, res: Response) => {
  GoogleDriveService.disconnect(req.user!.id);
  res.json({ success: true, message: 'Google Drive disconnected.' });
});

// OAuth Callback handler
driveRouter.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    res.redirect(`${config.clientOrigin}/settings?drive_error=${encodeURIComponent(String(error))}`);
    return;
  }

  if (!code || typeof code !== 'string') {
    res.redirect(`${config.clientOrigin}/settings?drive_error=${encodeURIComponent('No authorization code received from Google.')}`);
    return;
  }

  // State parameter carries the user ID
  const userId = typeof state === 'string' && state.length > 0 ? state : (req as any).user?.id;
  if (!userId) {
    res.redirect(`${config.clientOrigin}/settings?drive_error=${encodeURIComponent('User session could not be verified for OAuth callback.')}`);
    return;
  }

  try {
    await GoogleDriveService.handleOAuthCallback(code, userId);
    res.redirect(`${config.clientOrigin}/settings?drive=connected`);
  } catch (err: any) {
    res.redirect(`${config.clientOrigin}/settings?drive_error=${encodeURIComponent(err.message || 'OAuth code exchange failed.')}`);
  }
});
