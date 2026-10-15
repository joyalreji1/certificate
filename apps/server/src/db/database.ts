import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

// Ensure storage directories exist
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(config.jobsDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);

// Enable WAL mode for concurrent performance and foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login_name TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      success INTEGER NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      page_count INTEGER NOT NULL,
      page_width_pts REAL NOT NULL,
      page_height_pts REAL NOT NULL,
      page_width_mm REAL NOT NULL,
      page_height_mm REAL NOT NULL,
      rotation INTEGER NOT NULL,
      embedded_fonts TEXT NOT NULL,
      is_encrypted INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS spreadsheets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      sheets TEXT NOT NULL,
      active_sheet TEXT NOT NULL,
      headers TEXT NOT NULL,
      total_rows INTEGER NOT NULL,
      preview_rows TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      template_id TEXT,
      spreadsheet_id TEXT,
      active_sheet TEXT,
      selected_page INTEGER DEFAULT 1,
      field_mappings TEXT,
      overlay_fields TEXT,
      excluded_rows TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      total_rows INTEGER NOT NULL,
      processed_rows INTEGER NOT NULL,
      succeeded_rows INTEGER NOT NULL,
      failed_rows INTEGER NOT NULL,
      current_row INTEGER NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      elapsed_seconds REAL DEFAULT 0,
      estimated_remaining_seconds REAL DEFAULT 0,
      combined_pdf_path TEXT,
      zip_path TEXT,
      drive_uploads TEXT,
      row_results TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup ON login_attempts(identifier, ip_address, timestamp);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_batches_user_id ON batches(user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_batch_id ON jobs(batch_id);
  `);
}

// Initialize tables on import
initDatabase();
