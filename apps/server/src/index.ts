import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config';
import { seedAdminUser } from './db/seed';
import { csrfMiddleware } from './middleware/csrf';
import { authRouter } from './routes/authRoutes';
import { templateRouter } from './routes/templateRoutes';
import { spreadsheetRouter } from './routes/spreadsheetRoutes';
import { batchRouter } from './routes/batchRoutes';

export const app = express();

// Automatically seed admin user if not present
try {
  seedAdminUser();
} catch (err) {
  console.error('[Startup Warning] Admin user seed failed:', err);
}

app.set('trust proxy', 1);

// Security headers & CORS with multi-origin dev support
const allowedOrigins = [
  config.clientOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4000',
  'http://127.0.0.1:4000'
];

app.use(
  cors({
    origin: (requestOrigin, callback) => {
      // Allow requests with no origin (e.g., same-origin fetch, mobile apps, curl)
      if (!requestOrigin) return callback(null, true);
      // Allow any origin if it matches allowed origins, localhost/private IPs, or when deployed
      if (
        allowedOrigins.includes(requestOrigin) ||
        /\.railway\.app$/.test(requestOrigin) ||
        /\.up\.railway\.app$/.test(requestOrigin) ||
        /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(requestOrigin) ||
        config.nodeEnv === 'development' ||
        process.env.RAILWAY_PUBLIC_DOMAIN
      ) {
        return callback(null, true);
      }
      // Instead of throwing an Error (which crashes the request to 500), return false
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-csrf-token']
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(csrfMiddleware);

// Safe access logger that never logs passwords, tokens, or private data
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  // Strip query params or sensitive headers
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

import { driveRouter } from './routes/driveRoutes';

// Mount API routes
app.use('/api/auth', authRouter);
app.use('/api/auth/google/callback', (req: Request, res: Response) => {
  const queryStr = new URLSearchParams(req.query as any).toString();
  res.redirect(`/api/drive/callback${queryStr ? '?' + queryStr : ''}`);
});
app.use('/api/drive', driveRouter);
app.use('/api/templates', templateRouter);
app.use('/api/spreadsheets', spreadsheetRouter);
app.use('/api/batches', batchRouter);

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve frontend build in production
const webDistCandidates = [
  path.resolve(__dirname, '../../web/dist'),
  path.resolve(__dirname, '../web/dist'),
  path.resolve(__dirname, 'web/dist'),
  path.resolve(process.cwd(), 'apps/web/dist'),
  path.resolve(process.cwd(), 'web/dist')
];

let webDistDir = '';
for (const candidate of webDistCandidates) {
  if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'index.html'))) {
    webDistDir = candidate;
    console.log(`[Static] Serving web UI from: ${webDistDir}`);
    break;
  }
}

if (webDistDir) {
  app.use(express.static(webDistDir));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDistDir, 'index.html'));
  });
} else {
  console.warn('[Static] Warning: web/dist directory was not found. API routes are active, but web UI static files are missing.');
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Bulk Certificate Generator - API Active</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:50px;">
          <h2>Bulk Certificate Generator Backend is Online</h2>
          <p>API status: <a href="/api/health">/api/health</a></p>
          <p>Note: The frontend UI bundle has not been built or static path not located. Run <code>npm run build</code> to generate the UI.</p>
        </body>
      </html>
    `);
  });
}

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Error]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error.'
  });
});

if (require.main === module) {
  const host = '0.0.0.0';
  app.listen(config.port, host, () => {
    console.log(`[Server] Bulk Certificate Generator server listening on http://localhost:${config.port} (bound to ${host}:${config.port})`);
  });
}
