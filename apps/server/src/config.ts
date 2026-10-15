import path from 'node:path';
import dotenv from 'dotenv';

// Look for .env in root or server dir
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'dev_session_secret_bulk_cert_generator_32bytes_long!',
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  adminLoginName: process.env.ADMIN_LOGIN_NAME || 'joyalregi8@gmail.com',
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback',
  dbPath: path.resolve(__dirname, '../storage/db/app.sqlite'),
  uploadDir: path.resolve(__dirname, '../storage/temp/uploads'),
  jobsDir: path.resolve(__dirname, '../storage/temp/jobs')
};
