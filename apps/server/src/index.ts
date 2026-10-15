import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
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
      // Allow requests with no origin (e.g., mobile apps, curl, server-to-server)
      if (!requestOrigin) return callback(null, true);
      if (
        allowedOrigins.includes(requestOrigin) ||
        /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(requestOrigin) ||
        config.nodeEnv === 'development'
      ) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${requestOrigin}`));
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

// Mount API routes
app.use('/api/auth', authRouter);
app.use('/api/templates', templateRouter);
app.use('/api/spreadsheets', spreadsheetRouter);
app.use('/api/batches', batchRouter);

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

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
